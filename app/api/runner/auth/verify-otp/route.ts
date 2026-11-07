
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
  registration_data: unknown;
};

type RunnerAccount = {
  id: string;
  email: string;
  phone_e164: string | null;
  full_name: string | null;
  account_status: string;
  verification_status: string;
};

type RunnerProfile = RunnerAccount & {
  service_area: string | null;
  vehicle_type: string | null;
};

type RegistrationData = {
  fullName: string;
  categoryKeys: string[];
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

function parseRegistrationData(value: unknown): RegistrationData | null {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const fullName =
    typeof parsed.fullName === "string"
      ? parsed.fullName.trim()
      : "";

  if (
    fullName.length < 2 ||
    fullName.length > 120 ||
    !Array.isArray(parsed.categoryKeys)
  ) {
    return null;
  }

  const categoryKeys = parsed.categoryKeys;

  if (
    categoryKeys.length < 1 ||
    categoryKeys.length > 20 ||
    !categoryKeys.every(
      (category): category is string =>
        typeof category === "string" &&
        /^[a-z0-9_]+$/.test(category),
    )
  ) {
    return null;
  }

  const uniqueCategoryKeys = [...new Set(categoryKeys)];

  if (uniqueCategoryKeys.length !== categoryKeys.length) {
    return null;
  }

  return {
    fullName,
    categoryKeys: uniqueCategoryKeys,
  };
}

function getOnboardingState(account: RunnerAccount) {
  const approved =
    account.account_status === "active" &&
    account.verification_status === "approved";

  if (approved) {
    return {
      onboardingStatus: "approved",
      nextStep: "app",
    };
  }

  if (account.verification_status === "submitted") {
    return {
      onboardingStatus: "pending_review",
      nextStep: "status",
    };
  }

  if (account.verification_status === "rejected") {
    return {
      onboardingStatus: "changes_required",
      nextStep: "onboarding",
    };
  }

  return {
    onboardingStatus: "incomplete",
    nextStep: "onboarding",
  };
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
    return errorResponse("Enter your verification code.");
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
    // Resolve the challenge owner before taking the email lock.
    const ownerResult = await query<{
      email: string;
      purpose: string;
    }>(
      `SELECT email, purpose
       FROM public.runner_email_otp_challenges
       WHERE id = $1
       LIMIT 1`,
      [challengeId],
    );

    const owner = ownerResult.rows[0];

    if (!owner) {
      return errorResponse(
        "Verification request not found. Request a new code.",
        404,
      );
    }

    const email = owner.email.trim().toLowerCase();
    const purpose = owner.purpose;

    if (!["login", "register"].includes(purpose)) {
      return errorResponse(
        "This verification request is not supported.",
        400,
      );
    }

    await client.query("BEGIN");

    // Serialize OTP requests and verification for this email.
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
           consumed_at,
           registration_data
         FROM public.runner_email_otp_challenges
         WHERE id = $1
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

    if (
      challenge.email.trim().toLowerCase() !== email ||
      challenge.purpose !== purpose
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This verification request is invalid.",
        400,
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
         SET consumed_at = now()
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

    const approvedCode = verifyEmailOtp(
      challenge.id,
      code,
    );

    if (!approvedCode) {
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
          : "The verification code is incorrect.",
        remainingAttempts <= 0 ? 429 : 401,
      );
    }

    // A challenge can only be verified once.
    await client.query(
      `UPDATE public.runner_email_otp_challenges
       SET consumed_at = now()
       WHERE id = $1
         AND consumed_at IS NULL`,
      [challengeId],
    );

    // Serialize account creation for this email.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-account-email:" + email],
    );

    let registration: RegistrationData | null = null;

    if (purpose === "register") {
      registration = parseRegistrationData(
        challenge.registration_data,
      );

      if (!registration) {
        await client.query("COMMIT");

        return errorResponse(
          "Your registration details are incomplete. Please start registration again.",
          409,
        );
      }

      // Revalidate selected categories against the active catalogue.
      const categoriesResult = await client.query<{
        category_key: string;
      }>(
        `SELECT category_key
         FROM public.runner_service_categories
         WHERE category_key = ANY($1::text[])
           AND is_active = true`,
        [registration.categoryKeys],
      );

      if (
        categoriesResult.rows.length !==
        registration.categoryKeys.length
      ) {
        await client.query("COMMIT");

        return errorResponse(
          "One or more selected task categories are no longer available. Please register again.",
          409,
        );
      }
    }

    const existingResult = await client.query<RunnerAccount>(
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

    let account = existingResult.rows[0];

    if (purpose === "register" && account) {
      await client.query("COMMIT");

      return errorResponse(
        "An account already exists for this email address. Please sign in instead.",
        409,
      );
    }

    if (purpose === "login" && !account) {
      await client.query("COMMIT");

      return errorResponse(
        "No Runner account was found for this email address. Please register first.",
        404,
      );
    }

    if (
      account &&
      ["suspended", "closed"].includes(account.account_status)
    ) {
      await client.query("COMMIT");

      return errorResponse(
        "This Runner account is unavailable. Contact SaMi support.",
        403,
      );
    }

    if (purpose === "register") {
      const createdResult =
        await client.query<RunnerAccount>(
          `INSERT INTO public.runner_accounts (
             email,
             email_verified_at,
             full_name,
             account_status,
             verification_status
           )
           VALUES (
             $1,
             now(),
             $2,
             'pending_verification',
             'pending'
           )
           RETURNING
             id,
             email,
             phone_e164,
             full_name,
             account_status,
             verification_status`,
          [email, registration!.fullName],
        );

      account = createdResult.rows[0];

      if (!account) {
        throw new Error("RUNNER_ACCOUNT_CREATION_FAILED");
      }

      await client.query(
        `INSERT INTO public.runner_account_service_categories (
           runner_id,
           category_key
         )
         SELECT $1, category_key
         FROM public.runner_service_categories
         WHERE category_key = ANY($2::text[])
           AND is_active = true
         ON CONFLICT (runner_id, category_key) DO NOTHING`,
        [account.id, registration!.categoryKeys],
      );
    } else {
      const updatedResult =
        await client.query<RunnerAccount>(
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
          [account!.id],
        );

      account = updatedResult.rows[0];
    }

    if (!account) {
      throw new Error("RUNNER_ACCOUNT_NOT_FOUND_AFTER_VERIFICATION");
    }

    // Ensure every authenticated Runner has these base records.
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
      await client.query<RunnerProfile>(
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

    const selectedCategoriesResult =
      await client.query<{ category_key: string }>(
        `SELECT category_key
         FROM public.runner_account_service_categories
         WHERE runner_id = $1
         ORDER BY category_key`,
        [runner.id],
      );

    const selectedCategories =
      selectedCategoriesResult.rows.map(
        (row) => row.category_key,
      );

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

    const state = getOnboardingState(runner);

    return NextResponse.json(
      {
        ok: true,
        sessionToken,
        expiresInDays: sessionDays,
        profileComplete,
        onboardingStatus: state.onboardingStatus,
        nextStep: state.nextStep,
        runner: {
          id: runner.id,
          email: runner.email,
          phone: runner.phone_e164,
          fullName: runner.full_name,
          accountStatus: runner.account_status,
          verificationStatus: runner.verification_status,
          serviceArea: runner.service_area,
          vehicleType: runner.vehicle_type,
          selectedCategories,
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
