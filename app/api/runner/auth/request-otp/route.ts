
import { NextResponse } from "next/server";

import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  sendEmailOtp,
} from "@/lib/otp";

import { databasePool, query } from "@/lib/runner/db";
import { errorResponse, isRecord } from "@/lib/runner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return errorResponse(
      "Runner sign-in is available through the SaMi Runner app.",
      403,
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (!isRecord(body) || typeof body.email !== "string") {
    return errorResponse("Enter your email address.");
  }

  const email = body.email.trim().toLowerCase();

  if (
    email.length > 254 ||
    !EMAIL_PATTERN.test(email)
  ) {
    return errorResponse("Enter a valid email address.");
  }

  if (!isOtpProviderConfigured("email")) {
    return errorResponse(
      "Runner email verification is not configured yet. Contact SaMi support.",
      503,
    );
  }

  try {
    // Limit requests to five per hour, with at least
    // 60 seconds between requests for the same email.
    const rateLimit = await query<{ email: string }>(
      `INSERT INTO public.runner_email_otp_rate_limits (
         email,
         window_started_at,
         request_count,
         last_requested_at
       )
       VALUES ($1, now(), 1, now())
       ON CONFLICT (email)
       DO UPDATE SET
         window_started_at = CASE
           WHEN runner_email_otp_rate_limits.window_started_at
             <= now() - interval '1 hour'
           THEN now()
           ELSE runner_email_otp_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN runner_email_otp_rate_limits.window_started_at
             <= now() - interval '1 hour'
           THEN 1
           ELSE runner_email_otp_rate_limits.request_count + 1
         END,
         last_requested_at = now()
       WHERE runner_email_otp_rate_limits.last_requested_at
           <= now() - interval '60 seconds'
         AND (
           runner_email_otp_rate_limits.window_started_at
             <= now() - interval '1 hour'
           OR runner_email_otp_rate_limits.request_count < 5
         )
       RETURNING email`,
      [email],
    );

    if (!rateLimit.rows[0]) {
      return errorResponse(
        "Please wait before requesting another code. A maximum of five codes is allowed per hour.",
        429,
      );
    }

    // Create a new challenge and invalidate any older
    // outstanding challenge for this email.
    const client = await databasePool().connect();

    let challengeId = "";

    try {
      await client.query("BEGIN");

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["sami-runner-email-otp:" + email],
      );

      await client.query(
        `UPDATE public.runner_email_otp_challenges
         SET consumed_at = now()
         WHERE email = $1
           AND purpose = 'login'
           AND consumed_at IS NULL`,
        [email],
      );

      const challenge = await client.query<{ id: string }>(
        `INSERT INTO public.runner_email_otp_challenges (
           email,
           purpose,
           expires_at
         )
         VALUES (
           $1,
           'login',
           now() + interval '10 minutes'
         )
         RETURNING id`,
        [email],
      );

      challengeId = challenge.rows[0]?.id || "";

      if (!challengeId) {
        throw new Error("RUNNER_EMAIL_CHALLENGE_CREATION_FAILED");
      }

      await client.query("COMMIT");
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw cause;
    } finally {
      client.release();
    }

    // Send the email after the challenge has been committed.
    try {
      const code = createEmailOtpCode(challengeId);

      await sendEmailOtp(email, code, {
        purpose: "login",
      });
    } catch (cause) {
      // Invalidate the challenge if email delivery fails.
      await query(
        `UPDATE public.runner_email_otp_challenges
         SET consumed_at = now()
         WHERE id = $1
           AND consumed_at IS NULL`,
        [challengeId],
      ).catch(() => undefined);

      console.error(
        "[SaMi Runner OTP request] Email delivery failed.",
        cause instanceof Error ? cause.message : "unknown error",
      );

      return errorResponse(
        "SaMi Runner could not send your verification code. Check your email details and try again.",
        503,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        challengeId,
        destination: maskOtpDestination(email, "email"),
        expiresInSeconds: 600,
        message: "A verification code has been sent to your email address.",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Runner OTP request] Challenge creation failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse(
      "Runner email verification could not be started. Confirm that the Runner email-auth database migration has been applied and try again.",
      503,
    );
  }
}
