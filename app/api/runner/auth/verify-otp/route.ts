
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { NextResponse } from "next/server";

import {
  isOtpProviderConfigured,
  verifyEmailOtp,
} from "@/lib/otp";

import {
  databasePool,
  query,
} from "@/apps/runner/server/db";

import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

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
  phoneE164: string;
  matchedBy: "email" | "phone" | "none";
  matchedCustomerName: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KENYAN_PHONE_E164_PATTERN =
  /^\+254[17][0-9]{8}$/;

const OTP_ATTEMPT_LIMIT = 5;
const CONFIRMATION_EXPIRY_MINUTES = 15;

function hashToken(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function isExpired(value: Date | string): boolean {
  return new Date(value).getTime() <= Date.now();
}

function sessionLifetimeDays(): number {
  const configuredDays = Number(
    process.env.RUNNER_SESSION_DAYS || 30,
  );

  return Math.min(
    90,
    Math.max(
      1,
      Number.isFinite(configuredDays)
        ? configuredDays
        : 30,
    ),
  );
}

/**
 * Read registration details saved by request-otp.
 *
 * Customer recognition is optional. Missing or invalid recognition
 * metadata falls back to ordinary Runner registration.
 *
 * The email used for authentication is always the email belonging
 * to the verified OTP challenge, never an unverified submitted email.
 */
function parseRegistrationData(
  value: unknown,
): RegistrationData | null {
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
      ? parsed.fullName.trim().replace(/\s+/g, " ")
      : "";

  const phoneE164 =
    typeof parsed.phoneE164 === "string"
      ? parsed.phoneE164.trim()
      : "";

  if (
    fullName.length < 2 ||
    fullName.length > 120 ||
    !KENYAN_PHONE_E164_PATTERN.test(phoneE164)
  ) {
    return null;
  }

  const rawMatchedBy = parsed.matchedBy;

  const matchedBy: RegistrationData["matchedBy"] =
    rawMatchedBy === "email" || rawMatchedBy === "phone"
      ? rawMatchedBy
      : "none";

  const rawCustomerName =
    typeof parsed.matchedCustomerName === "string"
      ? parsed.matchedCustomerName.trim()
      : "";

  // Customer recognition must never prevent normal registration.
  // If the optional match information is incomplete, treat this
  // as an ordinary Runner registration.
  const hasValidCustomerMatch =
    matchedBy !== "none" &&
    rawCustomerName.length > 0 &&
    rawCustomerName.length <= 160;

  return {
    fullName,
    phoneE164,
    matchedBy: hasValidCustomerMatch
      ? matchedBy
      : "none",
    matchedCustomerName: hasValidCustomerMatch
      ? rawCustomerName
      : null,
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

function isUniqueConstraintViolation(
  cause: unknown,
): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "23505"
  );
}

/**
 * Creates a one-use Runner-side consent challenge.
 *
 * No Runner account or session is created here.
 * Only a hash of the confirmation token is stored.
 */
async function createRegistrationConfirmation(input: {
  client: PoolClient;
  email: string;
  phoneE164: string;
  fullName: string;
  customerName: string;
  matchedBy: "email" | "phone";
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  // Invalidate older outstanding confirmations for this email.
  await input.client.query(
    `UPDATE public.runner_registration_confirmations
     SET cancelled_at = NOW()
     WHERE LOWER(email) = $1
       AND consumed_at IS NULL
       AND cancelled_at IS NULL`,
    [input.email],
  );

  await input.client.query(
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
       $6,
       NOW() + ($7::text || ' minutes')::interval
     )`,
    [
      tokenHash,
      input.email,
      input.phoneE164,
      input.fullName,
      input.customerName,
      input.matchedBy,
      String(CONFIRMATION_EXPIRY_MINUTES),
    ],
  );

  return token;
}

/**
 * Creates Runner profile, availability and authenticated session.
 *
 * All writes are made through the Runner transaction client.
 */
async function createRunnerSession(input: {
  client: PoolClient;
  account: RunnerAccount;
  purpose: "login" | "register";
}) {
  const { client, account, purpose } = input;

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
     VALUES ($1, false, NOW())
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

  const sessionToken =
    randomBytes(32).toString("base64url");

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
       NOW() + ($3::text || ' days')::interval
     )`,
    [
      runner.id,
      tokenDigest,
      String(sessionDays),
    ],
  );

  const profileComplete = Boolean(
    runner.full_name &&
    runner.full_name.trim().length >= 2 &&
    runner.service_area &&
    runner.service_area.trim().length >= 2 &&
    runner.vehicle_type,
  );

  // A new Runner must choose task categories first.
  // Existing Runner logins continue through saved onboarding state.
  const state =
    purpose === "register"
      ? {
          onboardingStatus: "incomplete",
          nextStep: "tasks",
        }
      : getOnboardingState(runner);

  return {
    ok: true as const,
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
      400,
    );
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return errorResponse(
      "Enter the six-digit verification code.",
      400,
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
    // Resolve challenge owner before acquiring the email lock.
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

    // Serialize OTP verification for this actual email.
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
         SET consumed_at = NOW()
         WHERE id = $1`,
        [challengeId],
      );

      await client.query("COMMIT");

      return errorResponse(
        "Your verification code has expired. Request a new code.",
        410,
      );
    }

    if (Number(challenge.attempts) >= OTP_ATTEMPT_LIMIT) {
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
           AND attempts < $2`,
        [challengeId, OTP_ATTEMPT_LIMIT],
      );

      await client.query("COMMIT");

      const remainingAttempts =
        OTP_ATTEMPT_LIMIT -
        Number(challenge.attempts) -
        1;

      return errorResponse(
        remainingAttempts <= 0
          ? "Too many incorrect codes. Request a new verification code."
          : "The verification code is incorrect.",
        remainingAttempts <= 0 ? 429 : 401,
      );
    }

    // Consume the email challenge once the OTP is verified.
    await client.query(
      `UPDATE public.runner_email_otp_challenges
       SET consumed_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL`,
      [challengeId],
    );

    // Serialize Runner account creation for this email.
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

      // Use the same phone lock as request-otp.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["sami-runner-phone:" + registration.phoneE164],
      );

      const phoneResult =
        await client.query<{ id: string }>(
          `SELECT id
           FROM public.runner_accounts
           WHERE phone_e164 = $1
           LIMIT 1
           FOR UPDATE`,
          [registration.phoneE164],
        );

      if (phoneResult.rows.length > 0) {
        await client.query("COMMIT");

        return errorResponse(
          "This phone number is already registered to a Runner account. Sign in or use another number.",
          409,
        );
      }
    }

    const existingResult =
      await client.query<RunnerAccount>(
        `SELECT
           id,
           email,
           phone_e164,
           full_name,
           account_status,
           verification_status
         FROM public.runner_accounts
         WHERE LOWER(email) = $1
         LIMIT 1
         FOR UPDATE`,
        [email],
      );

    let account = existingResult.rows[0];

    if (purpose === "register" && account) {
      await client.query("COMMIT");

      return errorResponse(
        "A Runner account already exists for this email address. Please sign in instead.",
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

    // ======================================================================
    // REGISTRATION: OPTIONAL CUSTOMER RECOGNITION
    // ======================================================================

    if (purpose === "register" && registration) {
      const hasCustomerMatch =
        registration.matchedBy !== "none" &&
        Boolean(registration.matchedCustomerName);

      if (hasCustomerMatch) {
        // Do not create a Runner account until the applicant
        // explicitly confirms the separate registration.
        const confirmationToken =
          await createRegistrationConfirmation({
            client,
            email,
            phoneE164: registration.phoneE164,
            fullName: registration.fullName,
            customerName: registration.matchedCustomerName!,
            matchedBy: registration.matchedBy as "email" | "phone",
          });

        await client.query("COMMIT");

        return NextResponse.json(
          {
            ok: true,
            nextAction: "confirm_registration",
            confirmationToken,
            customerMatch: {
              fullName: registration.matchedCustomerName,
              matchedBy: registration.matchedBy,
            },
            message:
              "Your email is verified. We found an existing SaMi Customer account. Confirm whether you want to create a separate Runner account.",
          },
          {
            headers: {
              "Cache-Control": "no-store, private",
            },
          },
        );
      }

      // No Customer match: ordinary Runner registration.
      // Customer membership is not required.
      const createdResult =
        await client.query<RunnerAccount>(
          `INSERT INTO public.runner_accounts (
             email,
             phone_e164,
             email_verified_at,
             full_name,
             account_status,
             verification_status
           )
           VALUES (
             $1,
             $2,
             NOW(),
             $3,
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
          [
            email,
            registration.phoneE164,
            registration.fullName,
          ],
        );

      account = createdResult.rows[0];

      if (!account) {
        throw new Error(
          "RUNNER_ACCOUNT_CREATION_FAILED",
        );
      }
    } else {
      // Existing Runner login.
      const updatedResult =
        await client.query<RunnerAccount>(
          `UPDATE public.runner_accounts
           SET
             email_verified_at = COALESCE(email_verified_at, NOW()),
             updated_at = NOW()
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
      throw new Error(
        "RUNNER_ACCOUNT_NOT_FOUND_AFTER_VERIFICATION",
      );
    }

    // Create the Runner session and base records.
    const result = await createRunnerSession({
      client,
      account,
      purpose: purpose as "login" | "register",
    });

    await client.query("COMMIT");

    return NextResponse.json(
      result,
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (isUniqueConstraintViolation(cause)) {
      return errorResponse(
        "These Runner registration details are already in use. Check your email and phone number, then try again.",
        409,
      );
    }

    console.error(
      "[SaMi Runner OTP verification] Failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your email verification could not be completed. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
