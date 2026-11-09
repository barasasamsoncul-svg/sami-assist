
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  sendEmailOtp,
} from "@/lib/otp";

import { databasePool, query } from "@/apps/runner/server/db";
import { errorResponse, isRecord } from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthPurpose = "login" | "register";

type RunnerAccount = {
  id: string;
  full_name: string | null;
  account_status: string;
  verification_status: string;
};

function getTrustedClientIp(request: Request): string | null {
  // Vercel overwrites x-forwarded-for with the public client IP.
  // Accept exactly one validated address; never trust an arbitrary
  // comma-separated forwarding chain supplied by a caller.
  const candidate = request.headers
    .get("x-forwarded-for")
    ?.trim();

  if (!candidate || candidate.includes(",")) {
    return null;
  }

  return isIP(candidate) ? candidate : null;
}

function hashClientIp(clientIp: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update("sami-runner-otp-ip:" + clientIp, "utf8")
    .digest("hex");
}

function normalizeKenyanPhone(value: string): string | null {
  const trimmed = value.trim();

  if (!/^[+\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");

  let nationalNumber = digits;

  if (digits.startsWith("254")) {
    nationalNumber = digits.slice(3);
  } else if (digits.startsWith("0")) {
    nationalNumber = digits.slice(1);
  }

  if (!/^[17]\d{8}$/.test(nationalNumber)) {
    return null;
  }

  return `+254${nationalNumber}`;
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

  if (!isRecord(body)) {
    return errorResponse("Invalid authentication request.");
  }

  const purpose: AuthPurpose | null =
    body.purpose === undefined || body.purpose === "login"
      ? "login"
      : body.purpose === "register"
        ? "register"
        : null;

  if (!purpose) {
    return errorResponse("Invalid authentication purpose.");
  }

  if (typeof body.email !== "string") {
    return errorResponse("Enter your email address.");
  }

  const email = body.email.trim().toLowerCase();

  if (
    email.length > 254 ||
    !EMAIL_PATTERN.test(email)
  ) {
    return errorResponse("Enter a valid email address.");
  }

  let fullName = "";
  let phoneE164: string | null = null;

  if (purpose === "register") {
    if (typeof body.fullName !== "string") {
      return errorResponse("Enter your full name.");
    }

    fullName = body.fullName
      .trim()
      .replace(/\s+/g, " ");

    if (fullName.length < 2 || fullName.length > 120) {
      return errorResponse(
        "Your full name must contain between 2 and 120 characters.",
      );
    }

    if (typeof body.phone !== "string") {
      return errorResponse("Enter your phone number.");
    }

    phoneE164 = normalizeKenyanPhone(body.phone);

    if (!phoneE164) {
      return errorResponse(
        "Enter a valid Kenyan mobile number.",
      );
    }
  }

  if (!isOtpProviderConfigured("email")) {
    return errorResponse(
      "Runner email verification is not configured yet. Contact SaMi support.",
      503,
    );
  }

  const otpPepper = process.env.AUTH_EMAIL_OTP_PEPPER?.trim();

  if (!otpPepper) {
    return errorResponse(
      "Runner email verification is not configured yet. Contact SaMi support.",
      503,
    );
  }

  const trustedClientIp = getTrustedClientIp(request);

  if (!trustedClientIp && process.env.NODE_ENV === "production") {
    return errorResponse(
      "We could not verify the request source. Please try again later.",
      503,
    );
  }

  // Local development has no Vercel forwarding header. Keep local
  // requests in one shared development bucket instead of bypassing
  // the IP rate limiter entirely.
  const clientIp = trustedClientIp || "127.0.0.1";
  const ipHash = hashClientIp(clientIp, otpPepper);

  const client = await databasePool().connect();

  let challengeId = "";
  let recipientName: string | null = null;

  try {
    await client.query("BEGIN");

    // Serialize authentication requests for this email.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-email-otp:" + email],
    );

    // Phone numbers must also be serialized across registrations.
    // This protects the unique phone number from concurrent
    // registrations using different email addresses.
    if (purpose === "register" && phoneE164) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["sami-runner-phone:" + phoneE164],
      );
    }

    const accountResult =
      await client.query<RunnerAccount>(
        `SELECT
           id,
           full_name,
           account_status,
           verification_status
         FROM public.runner_accounts
         WHERE lower(email) = $1
         LIMIT 1
         FOR UPDATE`,
        [email],
      );

    const existingAccount = accountResult.rows[0];

    // Do not disclose whether the email or phone number
    // belongs to an existing account before email verification.
    // Duplicate-account, phone and account-status checks remain
    // in verify-otp, after the user proves control of the inbox.
    recipientName =
      purpose === "register"
        ? fullName
        : existingAccount?.full_name || null;

    // Maximum five requests per hour and one request every 60 seconds.
    const rateLimit = await client.query<{ email: string }>(
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
      await client.query("ROLLBACK");

      return errorResponse(
        "Please wait before requesting another code. A maximum of five codes is allowed per hour.",
        429,
      );
    }

    // Apply additional network-level limits across all email addresses.
    // The upsert is atomic, so concurrent requests from the same IP
    // cannot increment the counters past their configured limits.
    const ipRateLimit = await client.query<{ ip_hash: string }>(
      `INSERT INTO public.runner_email_otp_ip_rate_limits (
         ip_hash,
         window_started_at,
         request_count,
         burst_window_started_at,
         burst_request_count,
         last_requested_at,
         created_at,
         updated_at
       )
       VALUES (
         $1,
         now(),
         1,
         now(),
         1,
         now(),
         now(),
         now()
       )
       ON CONFLICT (ip_hash)
       DO UPDATE SET
         window_started_at = CASE
           WHEN runner_email_otp_ip_rate_limits.window_started_at
             <= now() - interval '1 hour'
           THEN now()
           ELSE runner_email_otp_ip_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN runner_email_otp_ip_rate_limits.window_started_at
             <= now() - interval '1 hour'
           THEN 1
           ELSE runner_email_otp_ip_rate_limits.request_count + 1
         END,
         burst_window_started_at = CASE
           WHEN runner_email_otp_ip_rate_limits.burst_window_started_at
             <= now() - interval '10 minutes'
           THEN now()
           ELSE runner_email_otp_ip_rate_limits.burst_window_started_at
         END,
         burst_request_count = CASE
           WHEN runner_email_otp_ip_rate_limits.burst_window_started_at
             <= now() - interval '10 minutes'
           THEN 1
           ELSE runner_email_otp_ip_rate_limits.burst_request_count + 1
         END,
         last_requested_at = now(),
         updated_at = now()
       WHERE (
           runner_email_otp_ip_rate_limits.window_started_at
             <= now() - interval '1 hour'
           OR runner_email_otp_ip_rate_limits.request_count < 300
         )
         AND (
           runner_email_otp_ip_rate_limits.burst_window_started_at
             <= now() - interval '10 minutes'
           OR runner_email_otp_ip_rate_limits.burst_request_count < 60
         )
       RETURNING ip_hash`,
      [ipHash],
    );

    if (!ipRateLimit.rows[0]) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Too many verification requests have come from this network. Please try again later.",
        429,
      );
    }

    // Invalidate older outstanding challenges so an old code
    // cannot be used after a new registration or login request.
    await client.query(
      `UPDATE public.runner_email_otp_challenges
       SET consumed_at = now()
       WHERE email = $1
         AND consumed_at IS NULL`,
      [email],
    );

    // Store registration details against the challenge.
    // Do not create the Runner account until email verification.
    const registrationData =
      purpose === "register"
        ? {
            fullName,
            phoneE164,
          }
        : {};

    const challengeResult = await client.query<{
      id: string;
    }>(
      `INSERT INTO public.runner_email_otp_challenges (
         email,
         purpose,
         registration_data,
         expires_at
       )
       VALUES (
         $1,
         $2,
         $3::jsonb,
         now() + interval '10 minutes'
       )
       RETURNING id`,
      [
        email,
        purpose,
        JSON.stringify(registrationData),
      ],
    );

    challengeId = challengeResult.rows[0]?.id || "";

    if (!challengeId) {
      throw new Error(
        "RUNNER_OTP_CHALLENGE_CREATION_FAILED",
      );
    }

    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "[SaMi Runner OTP request] Failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse(
      "Runner email verification could not be started. Confirm that the registration and onboarding database migration has been applied.",
      503,
    );
  } finally {
    client.release();
  }

  // Send the verification code only after the challenge
  // and registration details have been committed.
  try {
    const code = createEmailOtpCode(challengeId);

    await sendEmailOtp(email, code, {
      purpose,
      recipientName,
    });
  } catch (cause) {
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
      purpose,
      challengeId,
      destination: maskOtpDestination(email, "email"),
      expiresInSeconds: 600,
      message:
        purpose === "register"
          ? "Your registration verification code has been sent."
          : "Your Runner sign-in verification code has been sent.",
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}
