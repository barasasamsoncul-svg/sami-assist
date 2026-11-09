
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  sendEmailOtp,
} from "@/lib/otp";
import { isSameOrigin } from "@/apps/admin/server/auth";
import { databasePool } from "@/lib/db";

const OTP_EXPIRY_SECONDS = 10 * 60;
const MAX_REQUESTS_PER_HOUR = 3;
const MINIMUM_REQUEST_INTERVAL_SECONDS = 60;

type AdminRecoveryAccount = {
  id: string;
  full_name: string;
  email: string;
};

type RecoveryRequestStats = {
  request_count: number;
  last_request_at: Date | string | null;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function genericSuccessResponse(
  email: string,
  challengeId: string,
) {
  return NextResponse.json(
    {
      ok: true,
      challengeId,
      destination: maskOtpDestination(email, "email"),
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      message:
        "If this email belongs to an active SaMi administrator, a verification code has been sent.",
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function normalizeEmail(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().slice(0, 254)
    : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashValue(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

/**
 * Requests an Admin password-recovery OTP.
 *
 * Security controls:
 * - Does not reveal whether an email belongs to an Admin.
 * - Limits requests to three per hour per email.
 * - Enforces a minimum interval between requests.
 * - Supersedes older pending recovery challenges.
 * - Stores no plaintext OTP.
 * - Returns a generic response for known and unknown emails.
 */
export async function requestAdminPasswordReset(
  request: Request,
) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin password recovery requests are not allowed.",
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid password recovery request.");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return errorResponse("Invalid password recovery request.");
  }

  const input = body as Record<string, unknown>;
  const email = normalizeEmail(input.email);

  if (!isValidEmail(email)) {
    return errorResponse("Enter a valid email address.");
  }

  if (!isOtpProviderConfigured("email")) {
    console.error(
      "[SaMi Admin password recovery] Email OTP provider is not configured.",
    );

    return errorResponse(
      "Administrator password recovery is temporarily unavailable.",
      503,
    );
  }

  const emailHash = hashValue(
    "admin-password-recovery:" + email,
  );

  const client = await databasePool().connect();

  let challengeId = randomUUID();
  let accountForDelivery: AdminRecoveryAccount | null = null;

  try {
    await client.query("BEGIN");

    /*
     * Serialize requests for the same email address.
     * This prevents concurrent requests from bypassing
     * the rate limit or creating multiple active challenges.
     */
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1, 0)
       )`,
      [emailHash],
    );

    const statsResult =
      await client.query<RecoveryRequestStats>(
        `SELECT
           count(*)::int AS request_count,
           max(requested_at) AS last_request_at
         FROM public.admin_password_reset_otp_requests
         WHERE email_hash = $1
           AND requested_at > now() - interval '1 hour'`,
        [emailHash],
      );

    const stats = statsResult.rows[0];

    const requestCount = Number(
      stats?.request_count || 0,
    );

    const lastRequestTime = stats?.last_request_at
      ? new Date(stats.last_request_at).getTime()
      : 0;

    const requestedTooRecently =
      lastRequestTime > 0 &&
      Date.now() - lastRequestTime <
        MINIMUM_REQUEST_INTERVAL_SECONDS * 1000;

    const rateLimited =
      requestCount >= MAX_REQUESTS_PER_HOUR ||
      requestedTooRecently;

    /*
     * Record every request, including unknown addresses
     * and rate-limited attempts.
     */
    await client.query(
      `INSERT INTO public.admin_password_reset_otp_requests
        (email_hash, requested_at)
       VALUES ($1, now())`,
      [emailHash],
    );

    if (!rateLimited) {
      const accountResult =
        await client.query<AdminRecoveryAccount>(
          `SELECT
             id,
             full_name,
             email
           FROM public.users
           WHERE lower(email) = $1
             AND role = 'admin'
             AND is_active = true
           LIMIT 1
           FOR UPDATE`,
          [email],
        );

      const account = accountResult.rows[0];

      if (account) {
        challengeId = randomUUID();

        /*
         * Invalidate any older outstanding recovery codes
         * for this administrator.
         */
        await client.query(
          `UPDATE public.admin_password_reset_otp_challenges
           SET status = 'superseded'
           WHERE admin_user_id = $1
             AND status = 'pending'`,
          [account.id],
        );

        /*
         * Store the challenge, not the verification code.
         * The OTP is derived from the challenge ID through
         * the shared AUTH_EMAIL_OTP_PEPPER secret.
         */
        await client.query(
          `INSERT INTO public.admin_password_reset_otp_challenges
            (
              id,
              admin_user_id,
              email,
              status,
              expires_at
            )
           VALUES (
             $1,
             $2,
             $3,
             'pending',
             now() + interval '10 minutes'
           )`,
          [
            challengeId,
            account.id,
            account.email,
          ],
        );

        accountForDelivery = account;
      }
    }

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(
      () => undefined,
    );

    console.error(
      "[SaMi Admin password recovery] OTP issuance failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Administrator password recovery is temporarily unavailable.",
      503,
    );
  } finally {
    client.release();
  }

  /*
   * Send the email after committing the challenge.
   * SMTP activity must not hold a database transaction open.
   */
  if (accountForDelivery) {
    try {
      const code = createEmailOtpCode(challengeId);

      await sendEmailOtp(
        accountForDelivery.email,
        code,
        {
          purpose: "admin_password_reset",
          recipientName: accountForDelivery.full_name,
        },
      );
    } catch (cause) {
      console.error(
        "[SaMi Admin password recovery] OTP email delivery failed.",
        cause instanceof Error
          ? cause.message
          : "unknown error",
      );

      /*
       * Do not leave an unusable challenge active if
       * the email provider reports a delivery failure.
       */
      const failureClient = await databasePool().connect();

      try {
        await failureClient.query(
          `UPDATE public.admin_password_reset_otp_challenges
           SET status = 'failed'
           WHERE id = $1
             AND status = 'pending'`,
          [challengeId],
        );
      } catch (updateError) {
        console.error(
          "[SaMi Admin password recovery] Failed to invalidate undelivered OTP.",
          updateError instanceof Error
            ? updateError.message
            : "unknown error",
        );
      } finally {
        failureClient.release();
      }

      /*
       * Return the same generic response used for unknown
       * addresses. Do not reveal email delivery or account status.
       */
      return genericSuccessResponse(
        email,
        randomUUID(),
      );
    }
  }

  /*
   * Known, unknown and rate-limited addresses all receive
   * the same response structure and message.
   */
  return genericSuccessResponse(email, challengeId);
}
