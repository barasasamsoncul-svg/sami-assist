
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  checkOtp,
  isOtpProviderConfigured,
} from "@/lib/otp";

import { databasePool } from "@/apps/runner/server/db";

import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OTP_ATTEMPT_LIMIT = 5;
const CONFIRMATION_EXPIRY_MINUTES = 15;

type PhoneChallenge = {
  id: string;
  email: string;
  phone_e164: string;
  full_name: string;
  matched_customer_name: string;
  attempts: number;
  expires_at: Date | string;
  consumed_at: Date | string | null;
};

function hashToken(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function isExpired(value: Date | string): boolean {
  return new Date(value).getTime() <= Date.now();
}

export async function POST(request: Request) {
  const isNative =
    request.headers.get("x-sami-client") === "runner" &&
    !request.headers.get("origin");

  if (!isNative) {
    return errorResponse(
      "Runner authentication is available through the SaMi Runner app.",
      403,
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !isRecord(body) ||
    typeof body.challengeId !== "string" ||
    typeof body.code !== "string"
  ) {
    return errorResponse(
      "Enter your phone verification code.",
      400,
    );
  }

  const challengeId = body.challengeId.trim();
  const code = body.code.trim();

  if (!UUID_PATTERN.test(challengeId)) {
    return errorResponse(
      "This phone verification request is invalid.",
      400,
    );
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return errorResponse(
      "Enter the six-digit SMS verification code.",
      400,
    );
  }

  if (!isOtpProviderConfigured("sms")) {
    return errorResponse(
      "Phone verification is not configured.",
      503,
    );
  }

  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Lock this challenge so simultaneous requests cannot
    // verify or consume the same phone challenge twice.
    const challengeResult =
      await client.query<PhoneChallenge>(
        `SELECT
           id,
           email,
           phone_e164,
           full_name,
           matched_customer_name,
           attempts,
           expires_at,
           consumed_at
         FROM public.runner_registration_phone_challenges
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [challengeId],
      );

    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Phone verification request not found. Restart registration.",
        404,
      );
    }

    if (challenge.consumed_at) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This phone verification code has already been used. Restart registration.",
        409,
      );
    }

    if (isExpired(challenge.expires_at)) {
      await client.query(
        `UPDATE public.runner_registration_phone_challenges
         SET consumed_at = NOW()
         WHERE id = $1`,
        [challengeId],
      );

      await client.query("COMMIT");

      return errorResponse(
        "Your phone verification code has expired. Restart registration.",
        410,
      );
    }

    const attempts = Number(challenge.attempts);

    if (
      !Number.isInteger(attempts) ||
      attempts < 0 ||
      attempts >= OTP_ATTEMPT_LIMIT
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Too many incorrect phone verification codes. Restart registration.",
        429,
      );
    }

    if (
      !challenge.email ||
      !challenge.phone_e164 ||
      !challenge.full_name ||
      !challenge.matched_customer_name
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "The registration verification details are incomplete. Restart registration.",
        409,
      );
    }

    // Verify the SMS code with Twilio while the database row
    // remains locked. This prevents two simultaneous successful
    // requests from issuing separate confirmation tokens.
    const approved = await checkOtp(
      challenge.phone_e164,
      code,
    );

    if (!approved) {
      const nextAttempts = attempts + 1;

      await client.query(
        `UPDATE public.runner_registration_phone_challenges
         SET attempts = $2
         WHERE id = $1
           AND consumed_at IS NULL`,
        [challengeId, nextAttempts],
      );

      await client.query("COMMIT");

      return errorResponse(
        nextAttempts >= OTP_ATTEMPT_LIMIT
          ? "Too many incorrect phone verification codes. Restart registration."
          : "The phone verification code is incorrect.",
        nextAttempts >= OTP_ATTEMPT_LIMIT ? 429 : 401,
      );
    }

    // Both the email and phone are now verified.
    // The existing Customer name can now be disclosed.
    const confirmationToken =
      randomBytes(32).toString("base64url");

    const tokenHash = hashToken(confirmationToken);

    // Invalidate any previous unconsumed confirmation for this
    // email. This affects Runner records only.
    await client.query(
      `UPDATE public.runner_registration_confirmations
       SET cancelled_at = NOW()
       WHERE LOWER(email) = $1
         AND consumed_at IS NULL
         AND cancelled_at IS NULL`,
      [challenge.email.toLowerCase()],
    );

    // Store only the token hash. The plaintext token is returned
    // once to the Runner app.
    await client.query(
      `INSERT INTO public.runner_registration_confirmations (
         token_hash,
         email,
         phone_e164,
         full_name,
         matched_customer_name,
         matched_by,
         expires_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         'phone',
         NOW() + ($6::text || ' minutes')::interval
       )`,
      [
        tokenHash,
        challenge.email.toLowerCase(),
        challenge.phone_e164,
        challenge.full_name,
        challenge.matched_customer_name,
        String(CONFIRMATION_EXPIRY_MINUTES),
      ],
    );

    // Consume the phone challenge only after the confirmation
    // record has been created successfully.
    await client.query(
      `UPDATE public.runner_registration_phone_challenges
       SET consumed_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL`,
      [challengeId],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        nextAction: "confirm_registration",
        confirmationToken,
        customerMatch: {
          fullName: challenge.matched_customer_name,
          matchedBy: "phone",
        },
        message:
          "Your phone number is verified. We found your existing SaMi Customer account. Confirm whether you want to create a separate Runner account.",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "[SaMi Runner Phone Verification] Failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your phone verification could not be completed. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
