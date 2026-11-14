
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

import {
  createEmailOtpCode,
  isOtpProviderConfigured,
  maskOtpDestination,
  phoneAliases,
  sendEmailOtp,
} from "@/lib/otp";

import { query as customerQuery } from "@/lib/db";

import { databasePool } from "@/apps/runner/server/db";
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

type CustomerContact = {
  id: string;
  full_name: string;
  email: string | null;
};

type RegistrationIdentity = {
  verificationEmail: string;
  matchedBy: "email" | "phone" | "none";
  customerName: string | null;
};

function getTrustedClientIp(request: Request): string | null {
  // Accept exactly one validated forwarding address.
  // Do not trust arbitrary comma-separated forwarding chains.
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

/**
 * Optional, read-only Customer recognition.
 *
 * This function NEVER blocks ordinary Runner registration.
 *
 * Email match:
 *   OTP is sent to the matching Customer email.
 *
 * Phone-only match:
 *   OTP is sent to the email currently stored on the
 *   matching Customer account.
 *
 * No match, ambiguous match, or lookup failure:
 *   OTP is sent to the email submitted in the Runner form.
 *
 * Customer information is never returned to the client here.
 */
async function resolveRegistrationIdentity(
  submittedEmail: string,
  phoneE164: string,
): Promise<RegistrationIdentity> {
  const ordinaryRegistration: RegistrationIdentity = {
    verificationEmail: submittedEmail,
    matchedBy: "none",
    customerName: null,
  };

  try {
    const aliases = phoneAliases(phoneE164);

    if (aliases.length === 0) {
      return ordinaryRegistration;
    }

    const [emailResult, phoneResult] = await Promise.all([
      customerQuery<CustomerContact>(
        `SELECT
           id,
           NULLIF(BTRIM(full_name), '') AS full_name,
           email
         FROM public.users
         WHERE role = 'customer'
           AND is_active = TRUE
           AND LOWER(BTRIM(COALESCE(email, ''))) = $1
           AND NULLIF(BTRIM(full_name), '') IS NOT NULL
         LIMIT 2`,
        [submittedEmail],
      ),

      customerQuery<CustomerContact>(
        `SELECT
           id,
           NULLIF(BTRIM(full_name), '') AS full_name,
           email
         FROM public.users
         WHERE role = 'customer'
           AND is_active = TRUE
           AND REGEXP_REPLACE(
             COALESCE(phone, ''),
             '[^0-9]',
             '',
             'g'
           ) = ANY($1::text[])
           AND NULLIF(BTRIM(full_name), '') IS NOT NULL
         LIMIT 2`,
        [aliases],
      ),
    ]);

    const emailRows = emailResult.rows;
    const phoneRows = phoneResult.rows;

    // Ambiguous records are not used for identity recognition.
    // This does not prevent ordinary registration.
    if (emailRows.length > 1 || phoneRows.length > 1) {
      return ordinaryRegistration;
    }

    const emailMatch = emailRows[0] ?? null;
    const phoneMatch = phoneRows[0] ?? null;

    // Do not combine details belonging to two different
    // Customer records.
    if (
      emailMatch &&
      phoneMatch &&
      emailMatch.id !== phoneMatch.id
    ) {
      return ordinaryRegistration;
    }

    // Email match takes priority. The OTP will be sent to
    // this same email address.
    if (emailMatch) {
      const verificationEmail =
        emailMatch.email?.trim().toLowerCase() || "";

      if (
        !verificationEmail ||
        !EMAIL_PATTERN.test(verificationEmail)
      ) {
        return ordinaryRegistration;
      }

      return {
        verificationEmail,
        matchedBy: "email",
        customerName: emailMatch.full_name.trim(),
      };
    }

    // A phone-only match uses the email stored on that
    // Customer record as the verification destination.
    //
    // Access to that email is verified by the OTP sent below.
    if (phoneMatch) {
      const verificationEmail =
        phoneMatch.email?.trim().toLowerCase() || "";

      if (
        !verificationEmail ||
        !EMAIL_PATTERN.test(verificationEmail)
      ) {
        return ordinaryRegistration;
      }

      return {
        verificationEmail,
        matchedBy: "phone",
        customerName: phoneMatch.full_name.trim(),
      };
    }

    return ordinaryRegistration;
  } catch (cause) {
    // Customer recognition is optional. A Customer database
    // outage must not stop someone from registering as a Runner.
    console.error(
      "[SaMi Runner] Optional Customer recognition failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return ordinaryRegistration;
  }
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

  const submittedEmail = body.email.trim().toLowerCase();

  if (
    submittedEmail.length > 254 ||
    !EMAIL_PATTERN.test(submittedEmail)
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

  const otpPepper =
    process.env.AUTH_EMAIL_OTP_PEPPER?.trim();

  if (!otpPepper) {
    return errorResponse(
      "Runner email verification is not configured yet. Contact SaMi support.",
      503,
    );
  }

  const trustedClientIp = getTrustedClientIp(request);

  if (
    !trustedClientIp &&
    process.env.NODE_ENV === "production"
  ) {
    return errorResponse(
      "We could not verify the request source. Please try again later.",
      503,
    );
  }

  // Local development has no Vercel forwarding header.
  const clientIp = trustedClientIp || "127.0.0.1";
  const ipHash = hashClientIp(clientIp, otpPepper);

  // Resolve the OTP recipient only for registration.
  // Login always uses the submitted email.
  let email = submittedEmail;
  let matchedBy: "email" | "phone" | "none" = "none";
  let matchedCustomerName: string | null = null;

  if (purpose === "register" && phoneE164) {
    const identity = await resolveRegistrationIdentity(
      submittedEmail,
      phoneE164,
    );

    email = identity.verificationEmail;
    matchedBy = identity.matchedBy;
    matchedCustomerName = identity.customerName;
  }

  const client = await databasePool().connect();

  let challengeId = "";
  let recipientName: string | null = null;

  try {
    await client.query("BEGIN");

    // Lock the actual OTP destination.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-email-otp:" + email],
    );

    // Phone registrations also use the same phone lock.
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
         WHERE LOWER(email) = $1
         LIMIT 1
         FOR UPDATE`,
        [email],
      );

    const existingAccount = accountResult.rows[0];

    // This is only the name used in the email greeting.
    // No Customer name is returned to the app yet.
    recipientName =
      purpose === "register"
        ? matchedCustomerName || fullName
        : existingAccount?.full_name || null;

    // Email rate limit:
    // Maximum five codes per hour and one request every 60 seconds.
    const rateLimit = await client.query<{ email: string }>(
      `INSERT INTO public.runner_email_otp_rate_limits (
         email,
         window_started_at,
         request_count,
         last_requested_at
       )
       VALUES ($1, NOW(), 1, NOW())
       ON CONFLICT (email)
       DO UPDATE SET
         window_started_at = CASE
           WHEN runner_email_otp_rate_limits.window_started_at
             <= NOW() - INTERVAL '1 hour'
           THEN NOW()
           ELSE runner_email_otp_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN runner_email_otp_rate_limits.window_started_at
             <= NOW() - INTERVAL '1 hour'
           THEN 1
           ELSE runner_email_otp_rate_limits.request_count + 1
         END,
         last_requested_at = NOW()
       WHERE runner_email_otp_rate_limits.last_requested_at
           <= NOW() - INTERVAL '60 seconds'
         AND (
           runner_email_otp_rate_limits.window_started_at
             <= NOW() - INTERVAL '1 hour'
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

    // Network-level rate limits.
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
         NOW(),
         1,
         NOW(),
         1,
         NOW(),
         NOW(),
         NOW()
       )
       ON CONFLICT (ip_hash)
       DO UPDATE SET
         window_started_at = CASE
           WHEN runner_email_otp_ip_rate_limits.window_started_at
             <= NOW() - INTERVAL '1 hour'
           THEN NOW()
           ELSE runner_email_otp_ip_rate_limits.window_started_at
         END,
         request_count = CASE
           WHEN runner_email_otp_ip_rate_limits.window_started_at
             <= NOW() - INTERVAL '1 hour'
           THEN 1
           ELSE runner_email_otp_ip_rate_limits.request_count + 1
         END,
         burst_window_started_at = CASE
           WHEN runner_email_otp_ip_rate_limits.burst_window_started_at
             <= NOW() - INTERVAL '10 minutes'
           THEN NOW()
           ELSE runner_email_otp_ip_rate_limits.burst_window_started_at
         END,
         burst_request_count = CASE
           WHEN runner_email_otp_ip_rate_limits.burst_window_started_at
             <= NOW() - INTERVAL '10 minutes'
           THEN 1
           ELSE runner_email_otp_ip_rate_limits.burst_request_count + 1
         END,
         last_requested_at = NOW(),
         updated_at = NOW()
       WHERE (
           runner_email_otp_ip_rate_limits.window_started_at
             <= NOW() - INTERVAL '1 hour'
           OR runner_email_otp_ip_rate_limits.request_count < 300
         )
         AND (
           runner_email_otp_ip_rate_limits.burst_window_started_at
             <= NOW() - INTERVAL '10 minutes'
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

    // Invalidate older outstanding challenges for this email.
    await client.query(
      `UPDATE public.runner_email_otp_challenges
       SET consumed_at = NOW()
       WHERE email = $1
         AND consumed_at IS NULL`,
      [email],
    );

    // Registration details remain in the Runner database.
    // matchedBy allows the verification API to decide whether
    // a Customer consent prompt is appropriate.
    const registrationData =
      purpose === "register"
        ? {
            fullName,
            phoneE164,
            matchedBy,
            submittedEmail,
            matchedCustomerName,
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
         NOW() + INTERVAL '10 minutes'
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
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Runner email verification could not be started. Confirm that the registration and onboarding database migration has been applied.",
      503,
    );
  } finally {
    client.release();
  }

  // Send the code after the challenge has been committed.
  try {
    const code = createEmailOtpCode(challengeId);

    await sendEmailOtp(email, code, {
      purpose,
      recipientName,
    });
  } catch (cause) {
    await databasePool()
      .query(
        `UPDATE public.runner_email_otp_challenges
         SET consumed_at = NOW()
         WHERE id = $1
           AND consumed_at IS NULL`,
        [challengeId],
      )
      .catch(() => undefined);

    console.error(
      "[SaMi Runner OTP request] Email delivery failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
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
