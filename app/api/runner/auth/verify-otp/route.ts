
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  isOtpProviderConfigured,
  verifyEmailOtp,
} from "@/lib/otp";

import { databasePool, query } from "@/lib/runner/db";
import { errorResponse, isRecord } from "@/lib/runner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerEmailChallenge = {
  id: string;
  email: string;
  purpose: string;
  attempts: number;
  expires_at: Date | string;
  consumed_at: Date | string | null;
};

type RunnerAccountRow = {
  id: string;
  email: string;
  phone_e164: string | null;
  full_name: string | null;
  account_status: string;
  verification_status: string;
  service_area: string | null;
  vehicle_type: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashToken(value: string) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function isExpired(value: Date | string) {
  return new Date(value).getTime() <= Date.now();
}

function sessionLifetimeDays() {
  const configuredDays = Number(
    process.env.RUNNER_SESSION_DAYS || 30,
  );

  return Math.min(
    90,
    Math.max(
      1,
      Number.isFinite(configuredDays) ? configuredDays : 30,
    ),
  );
}

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

  if (
    !isRecord(body) ||
    typeof body.challengeId !== "string" ||
    typeof body.code !== "string"
  ) {
    return errorResponse(
      "Enter your verification code.",
    );
  }

  const challengeId = body.challengeId.trim();
  const code = body.code.trim();

  if (!UUID_PATTERN.test(challengeId)) {
    return errorResponse(
      "This verification request is invalid.",
    );
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return errorResponse(
      "Enter the six-digit verification code.",
    );
  }

  if (!isOtpProviderConfigured("email")) {
    return errorResponse(
      "Runner email verification is not configured.",
      503,
    );
  }

  const client = await databasePool().connect();

  try {
    // Read the email first so we can acquire the same advisory
    // lock used by the request endpoint before locking the row.
    const ownerResult = await query<{ email: string }>(
      `SELECT email
       FROM public.runner_email_otp_challenges
       WHERE id = $1
         AND purpose = 'login'
       LIMIT 1`,
      [challengeId],
    );

    const challengeOwner = ownerResult.rows[0];

    if (!challengeOwner) {
      return errorResponse(
        "Verification request not found. Request a new code.",
        404,
      );
    }

    const email = challengeOwner.email.trim().toLowerCase();

    await client.query("BEGIN");

    // Keep the same lock order as the request endpoint.
    // This serializes requests and verification for one email.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-email-otp:" + email],
    );

    const challengeResult =
      await client.query<RunnerEmailChallenge>(
        `SELECT
           id,
           email,
           purpose,
           attempts,
           expires_at,
           consumed_at
         FROM public.runner_email_otp_challenges
         WHERE id = $1
           AND purpose = 'login'
         LIMIT 1
         FOR UPDATE`,
        [challengeId],
      );

    const challenge = challengeResult.rows[0];

    if (!challenge) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Verification request not found. Request a new code.",
        404,
      );
    }

    if (challenge.consumed_at) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This verification code has already been used. Request a new code.",
        409,
      );
    }

    if (isExpired(challenge.expires_at)) {
      await client.query(
        `UPDATE public.runner_email_otp_challenges
         SET consumed_at = COALESCE(consumed_at, now())
         WHERE id = $1`,
        [challengeId],
      );

      await client.query("COMMIT");

      return errorResponse(
        "Your verification code has expired. Request a new code.",
        410,
      );
    }

    if (Number(challenge.attempts) >= 5) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Too many incorrect codes. Request a new verification code.",
        429,
      );
    }

    if (challenge.email.trim().toLowerCase() !== email) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This verification request is invalid.",
        400,
      );
    }

    // Verify the code derived from the challenge ID.
    const approved = verifyEmailOtp(challenge.id, code);

    if (!approved) {
      await client.query(
        `UPDATE public.runner_email_otp_challenges
         SET attempts = attempts + 1
         WHERE id = $1
           AND consumed_at IS NULL
           AND attempts < 5`,
        [challengeId],
      );

      await client.query("COMMIT");

      const remainingAttempts =
        5 - Number(challenge.attempts) - 1;

      return errorResponse(
        remainingAttempts <= 0
          ? "Too many incorrect codes. Request a new verification code."
          : "The verification code is incorrect or has expired.",
        remainingAttempts <= 0 ? 429 : 401,
      );
    }

    // Consume the challenge before creating the session.
    await client.query(
      `UPDATE public.runner_email_otp_challenges
       SET consumed_at = now()
       WHERE id = $1
         AND consumed_at IS NULL`,
      [challengeId],
    );

    // Serialize account creation for the same email address.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-account-email:" + email],
    );

    let accountResult = await client.query<{
      id: string;
      email: string;
      phone_e164: string | null;
      full_name: string | null;
      account_status: string;
      verification_status: string;
    }>(
      `SELECT
         id,
         email,
         phone_e164,
         full_name,
         account_status,
         verification_status
       FROM public.runner_accounts
       WHERE lower(email) = $1
       LIMIT 1
       FOR UPDATE`,
      [email],
    );

    let account = accountResult.rows[0];

    // A verified email can register a new Runner account.
    // Existing phone-only accounts are not automatically linked;
    // an account is reused only when its email already matches.
    if (!account) {
      accountResult = await client.query(
        `INSERT INTO public.runner_accounts (
           email,
           email_verified_at
         )
         VALUES ($1, now())
         RETURNING
           id,
           email,
           phone_e164,
           full_name,
           account_status,
           verification_status`,
        [email],
      );

      account = accountResult.rows[0];
    } else {
      accountResult = await client.query(
        `UPDATE public.runner_accounts
         SET
           email_verified_at = COALESCE(email_verified_at, now()),
           updated_at = now()
         WHERE id = $1
         RETURNING
           id,
           email,
           phone_e164,
           full_name,
           account_status,
           verification_status`,
        [account.id],
      );

      account = accountResult.rows[0];
    }

    if (
      !account ||
      ["suspended", "closed"].includes(account.account_status)
    ) {
      await client.query("COMMIT");

      return errorResponse(
        "This Runner account is unavailable. Contact SaMi support.",
        403,
      );
    }

    // Ensure every authenticated Runner has profile and
    // availability records, including newly registered accounts.
    await client.query(
      `INSERT INTO public.runner_profiles (runner_id)
       VALUES ($1)
       ON CONFLICT (runner_id) DO NOTHING`,
      [account.id],
    );

    await client.query(
      `INSERT INTO public.runner_availability (
         runner_id,
         is_online,
         updated_at
       )
       VALUES ($1, false, now())
       ON CONFLICT (runner_id) DO NOTHING`,
      [account.id],
    );

    const profileResult =
      await client.query<RunnerAccountRow>(
        `SELECT
           a.id,
           a.email,
           a.phone_e164,
           a.full_name,
           a.account_status,
           a.verification_status,
           p.service_area,
           p.vehicle_type
         FROM public.runner_accounts AS a
         LEFT JOIN public.runner_profiles AS p
           ON p.runner_id = a.id
         WHERE a.id = $1
         LIMIT 1`,
        [account.id],
      );

    const runner = profileResult.rows[0];

    if (!runner) {
      throw new Error("RUNNER_PROFILE_CREATION_FAILED");
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const tokenDigest = hashToken(sessionToken);
    const sessionDays = sessionLifetimeDays();

    await client.query(
      `INSERT INTO public.runner_sessions (
         runner_id,
         token_hash,
         expires_at
       )
       VALUES (
         $1,
         $2,
         now() + ($3::text || ' days')::interval
       )`,
      [runner.id, tokenDigest, String(sessionDays)],
    );

    await client.query("COMMIT");

    const profileComplete = Boolean(
      runner.full_name &&
      runner.full_name.trim().length >= 2 &&
      runner.service_area &&
      runner.service_area.trim().length >= 2 &&
      runner.vehicle_type,
    );

    return NextResponse.json(
      {
        ok: true,
        sessionToken,
        expiresInDays: sessionDays,
        profileComplete,
        runner: {
          id: runner.id,
          email: runner.email,
          phone: runner.phone_e164,
          fullName: runner.full_name,
          accountStatus: runner.account_status,
          verificationStatus: runner.verification_status,
        },
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
      "[SaMi Runner OTP verification] Failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return errorResponse(
      "Your email verification could not be completed. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
