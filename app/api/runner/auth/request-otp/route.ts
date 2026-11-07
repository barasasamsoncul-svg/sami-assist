
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
const MAX_CATEGORIES = 20;

type AuthPurpose = "login" | "register";

type RunnerAccount = {
  id: string;
  full_name: string | null;
  account_status: string;
  verification_status: string;
};

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
  let categoryKeys: string[] = [];

  if (purpose === "register") {
    if (typeof body.fullName !== "string") {
      return errorResponse("Enter your full name.");
    }

    fullName = body.fullName.trim().replace(/\s+/g, " ");

    if (fullName.length < 2 || fullName.length > 120) {
      return errorResponse(
        "Your full name must contain between 2 and 120 characters.",
      );
    }

    if (
      !Array.isArray(body.categoryKeys) ||
      body.categoryKeys.length < 1 ||
      body.categoryKeys.length > MAX_CATEGORIES ||
      !body.categoryKeys.every(
        (value: unknown) => typeof value === "string",
      )
    ) {
      return errorResponse(
        "Select at least one type of errand you can perform.",
      );
    }

    categoryKeys = [
      ...new Set(
        body.categoryKeys.map((value: string) =>
          value.trim().toLowerCase(),
        ),
      ),
    ];

    if (
      categoryKeys.some(
        (value) =>
          !/^[a-z0-9_]{2,60}$/.test(value),
      )
    ) {
      return errorResponse("One or more selected categories are invalid.");
    }
  }

  if (!isOtpProviderConfigured("email")) {
    return errorResponse(
      "Runner email verification is not configured yet. Contact SaMi support.",
      503,
    );
  }

  const client = await databasePool().connect();

  let challengeId = "";
  let recipientName: string | null = null;

  try {
    await client.query("BEGIN");

    // Serialize all authentication requests for this email.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-email-otp:" + email],
    );

    const accountResult = await client.query<RunnerAccount>(
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

    if (purpose === "register" && existingAccount) {
      await client.query("ROLLBACK");

      return errorResponse(
        "A Runner account with this email already exists. Sign in instead.",
        409,
      );
    }

    if (purpose === "login" && !existingAccount) {
      await client.query("ROLLBACK");

      return errorResponse(
        "No Runner account was found with this email. Select Get started to register.",
        404,
      );
    }

    if (
      existingAccount &&
      ["suspended", "closed"].includes(
        existingAccount.account_status,
      )
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This Runner account is unavailable. Contact SaMi support.",
        403,
      );
    }

    if (purpose === "register") {
      // Only currently active categories can be selected.
      const categoryResult = await client.query<{
        category_key: string;
      }>(
        `SELECT category_key
         FROM public.runner_service_categories
         WHERE category_key = ANY($1::text[])
           AND is_active = true
         FOR SHARE`,
        [categoryKeys],
      );

      if (categoryResult.rows.length !== categoryKeys.length) {
        await client.query("ROLLBACK");

        return errorResponse(
          "One or more selected errand categories are unavailable. Review your selections.",
          400,
        );
      }

      recipientName = fullName;
    } else {
      recipientName = existingAccount?.full_name || null;
    }

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

    // Invalidate older outstanding challenges so a code from
    // another registration or sign-in attempt cannot be reused.
    await client.query(
      `UPDATE public.runner_email_otp_challenges
       SET consumed_at = now()
       WHERE email = $1
         AND consumed_at IS NULL`,
      [email],
    );

    const registrationData =
      purpose === "register"
        ? {
            fullName,
            categoryKeys,
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
      throw new Error("RUNNER_OTP_CHALLENGE_CREATION_FAILED");
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

  // Deliver the OTP only after the challenge has been committed.
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
