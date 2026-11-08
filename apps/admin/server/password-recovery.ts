
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  sendEmailOtp,
} from "@/lib/otp";

import { databasePool, query } from "@/lib/db";

const OTP_EXPIRY_SECONDS = 600;
const MAX_REQUESTS_PER_HOUR = 3;
const MINIMUM_REQUEST_INTERVAL_SECONDS = 60;

function hashValue(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().slice(0, 254)
    : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
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
    return errorResponse("Enter a valid administrator email address.");
  }

  if (!isOtpProviderConfigured("email")) {
    return errorResponse(
      "SaMi email verification is not configured. Contact the deployment administrator.",
      503,
    );
  }

  const emailHash = hashValue(
    "sami-admin-password-reset-otp:" + email,
  );

  const client = await databasePool().connect();

  let challengeId = "";
  let adminEmail = "";
  let adminName: string | null = null;
  let shouldSendCode = false;

  try {
    await client.query("BEGIN");

    // Serialize concurrent recovery requests for this email.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-admin-password-reset-otp:" + emailHash],
    );

    // Check the request history before recording this request.
    const requestHistory = await client.query<{
      request_count: string;
      last_requested_at: Date | null;
    }>(
      `SELECT
         count(*)::text AS request_count,
         max(requested_at) AS last_requested_at
       FROM public.admin_password_reset_otp_requests
       WHERE email_hash = $1
         AND requested_at > now() - interval '1 hour'`,
      [emailHash],
    );

    const requestCount = Number(
      requestHistory.rows[0]?.request_count || 0,
    );

    const lastRequestedAt =
      requestHistory.rows[0]?.last_requested_at;

    // Record every attempt, including throttled and unknown emails.
    await client.query(
      `INSERT INTO public.admin_password_reset_otp_requests (
         email_hash,
         requested_at
       )
       VALUES ($1, now())`,
      [emailHash],
    );

    const recentlyRequested =
      lastRequestedAt !== null &&
      lastRequestedAt !== undefined &&
      Date.now() - new Date(lastRequestedAt).getTime() <
        MINIMUM_REQUEST_INTERVAL_SECONDS * 1000;

    if (
      requestCount >= MAX_REQUESTS_PER_HOUR ||
      recentlyRequested
    ) {
      await client.query("COMMIT");

      return genericSuccessResponse(email, randomUUID());
    }

    // Only active Admin accounts are eligible for recovery.
    const accountResult = await client.query<{
      id: string;
      email: string;
      full_name: string | null;
    }>(
      `SELECT
         id,
         email,
         full_name
       FROM public.users
       WHERE lower(email) = $1
         AND role = 'admin'
         AND is_active = true
       LIMIT 1
       FOR UPDATE`,
      [email],
    );

    const admin = accountResult.rows[0];

    if (!admin) {
      await client.query("COMMIT");

      // A decoy challenge ID keeps the response format consistent.
      return genericSuccessResponse(email, randomUUID());
    }

    // Supersede older outstanding recovery challenges.
    await client.query(
      `UPDATE public.admin_password_reset_otp_challenges
       SET status = 'superseded'
       WHERE admin_user_id = $1
         AND status = 'pending'`,
      [admin.id],
    );

    // Create a challenge that expires after ten minutes.
    const challengeResult = await client.query<{
      id: string;
    }>(
      `INSERT INTO public.admin_password_reset_otp_challenges (
         admin_user_id,
         email,
         status,
         expires_at
       )
       VALUES (
         $1,
         $2,
         'pending',
         now() + interval '10 minutes'
       )
       RETURNING id`,
      [admin.id, admin.email],
    );

    challengeId = challengeResult.rows[0]?.id || "";

    if (!challengeId) {
      throw new Error(
        "ADMIN_PASSWORD_RECOVERY_CHALLENGE_CREATION_FAILED",
      );
    }

    adminEmail = admin.email;
    adminName = admin.full_name;
    shouldSendCode = true;

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(
      () => undefined,
    );

    console.error(
      "[SaMi Admin password recovery] Challenge creation failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Password recovery is temporarily unavailable. Please try again.",
      503,
    );
  } finally {
    client.release();
  }

  if (shouldSendCode && challengeId && adminEmail) {
    try {
      const code = createEmailOtpCode(challengeId);

      await sendEmailOtp(adminEmail, code, {
        purpose: "admin_password_reset",
        recipientName: adminName,
      });
    } catch (cause) {
      // An undelivered code must never remain usable.
      await query(
        `UPDATE public.admin_password_reset_otp_challenges
         SET status = 'failed'
         WHERE id = $1
           AND status = 'pending'`,
        [challengeId],
      ).catch(() => undefined);

      console.error(
        "[SaMi Admin password recovery] OTP email delivery failed.",
        cause instanceof Error
          ? cause.message
          : "unknown error",
      );

      // Keep the public response generic to avoid revealing
      // whether the supplied email belongs to an Admin.
      return genericSuccessResponse(email, randomUUID());
    }
  }

  return genericSuccessResponse(email, challengeId || randomUUID());
}
