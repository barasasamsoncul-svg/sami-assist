
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  sendEmailOtp,
} from "@/lib/otp";

export const runtime = "nodejs";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNative(request: Request) {
  return (
    request.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

export async function POST(request: Request) {
  if (!isNative(request)) {
    return error("This endpoint is available through the SaMi app.", 403);
  }

  const user = await getCurrentUser(request).catch(() => null);

  if (!user) {
    return error("Sign in to continue.", 401);
  }

  if (user.role !== "customer") {
    return error("Only customer accounts can be deleted here.", 403);
  }

  if (!isOtpProviderConfigured("email")) {
    return error(
      "Email verification is not configured. Contact SaMi support.",
      503,
    );
  }

  try {
    const customer = await query<{
      id: string;
      full_name: string;
      email: string;
    }>(
      `SELECT id, full_name, email
       FROM public.users
       WHERE id = $1
         AND role = 'customer'
         AND is_active = true
       LIMIT 1`,
      [user.id],
    );

    const account = customer.rows[0];

    if (!account || !account.email) {
      return error("Your customer account could not be found.", 404);
    }

    const requests = await query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM public.auth_otp_challenges
       WHERE user_id = $1
         AND purpose = 'delete_account'
         AND created_at > now() - interval '15 minutes'`,
      [user.id],
    );

    if (Number(requests.rows[0]?.count || 0) >= 3) {
      return error(
        "Too many deletion verification requests. Try again in 15 minutes.",
        429,
      );
    }

    await query(
      `UPDATE public.auth_otp_challenges
       SET status = 'superseded'
       WHERE user_id = $1
         AND purpose = 'delete_account'
         AND status = 'pending'`,
      [user.id],
    );

    const challenge = await query<{ id: string }>(
      `INSERT INTO public.auth_otp_challenges
        (
          purpose,
          channel,
          destination,
          email,
          phone,
          full_name,
          user_id
        )
       VALUES ('delete_account', 'email', $1, $1, NULL, $2, $3)
       RETURNING id`,
      [
        account.email,
        account.full_name,
        user.id,
      ],
    );

    const challengeId = challenge.rows[0]?.id;

    if (!challengeId) {
      throw new Error("DELETION_OTP_CHALLENGE_CREATION_FAILED");
    }

    try {
      const code = createEmailOtpCode(challengeId);

      await sendEmailOtp(account.email, code, {
        purpose: "delete_account",
        recipientName: account.full_name,
      });
    } catch (cause) {
      await query(
        `UPDATE public.auth_otp_challenges
         SET status = 'failed'
         WHERE id = $1`,
        [challengeId],
      ).catch(() => undefined);

      console.error(
        "[SaMi deletion OTP] Delivery failed.",
        cause instanceof Error ? cause.message : "unknown error",
      );

      return error(
        "SaMi could not send your verification code. Try again later.",
        503,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        challengeId,
        deliveryHint: maskOtpDestination(account.email, "email"),
        message: "A deletion verification code has been sent to your registered email.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi deletion OTP] Request failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error(
      "Account deletion verification could not be started. Please retry.",
      503,
    );
  }
}
