
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { NextResponse } from "next/server";

import { databasePool } from "@/apps/runner/server/db";
import { resolveRunnerCompliance } from "@/apps/runner/server/compliance";

import {
  errorResponse,
  isRecord,
} from "@/apps/runner/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KENYAN_PHONE_PATTERN = /^\+254[17][0-9]{8}$/;

type RegistrationConfirmation = {
  id: string;
  email: string;
  phone_e164: string;
  full_name: string;
  matched_customer_name: string;
  matched_by: "email" | "phone";
  expires_at: Date | string;
  consumed_at: Date | string | null;
  cancelled_at: Date | string | null;
};

type RunnerAccount = {
  id: string;
  email: string;
  phone_e164: string | null;
  full_name: string | null;
  account_status: string;
  verification_status: string;
};

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

function getLegacyOnboardingStatus(
  status: string,
): "incomplete" | "pending_review" | "approved" | "changes_required" {
  switch (status) {
    case "approved":
      return "approved";

    case "pending_review":
      return "pending_review";

    case "changes_required":
    case "restricted":
      return "changes_required";

    default:
      return "incomplete";
  }
}

/**
 * This function creates a Runner's initial profile,
 * availability record and authenticated session.
 *
 * Compliance is resolved from the same backend rules used
 * by normal Runner OTP authentication and session restoration.
 *
 * All operations use the existing Runner transaction.
 */
async function createRunnerSession(input: {
  client: PoolClient;
  account: RunnerAccount;
}) {
  const { client, account } = input;

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
    await client.query<{
      id: string;
      email: string;
      phone_e164: string | null;
      full_name: string | null;
      account_status: string;
      verification_status: string;
      service_area: string | null;
      vehicle_type: string | null;
      vehicle_model: string | null;
      vehicle_registration: string | null;
    }>(
      `SELECT
         a.id,
         a.email,
         a.phone_e164,
         a.full_name,
         a.account_status,
         a.verification_status,
         p.service_area,
         p.vehicle_type,
         p.vehicle_model,
         p.vehicle_registration
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

  // Read the mandatory document requirements applicable
  // to the Runner's currently selected services and transport.
  const requirementsResult =
    await client.query<{ requirement_key: string }>(
      `SELECT requirement_key
       FROM public.runner_onboarding_document_requirements
       WHERE is_active = true
         AND is_required = true
         AND (
           category_key IS NULL
           OR category_key = ANY($1::text[])
         )
         AND (
           vehicle_type = 'any'
           OR vehicle_type = $2
         )
       ORDER BY
         category_key NULLS FIRST,
         display_order,
         requirement_key`,
      [
        selectedCategories,
        runner.vehicle_type,
      ],
    );

  // Read uploaded documents so the resolver evaluates
  // the latest submission for each mandatory requirement.
  const documentsResult =
    await client.query<{
      id: string;
      requirement_key: string | null;
      review_status: string;
      submitted_at: Date | string;
    }>(
      `SELECT
         id,
         requirement_key,
         review_status,
         submitted_at
       FROM public.runner_verification_documents
       WHERE runner_id = $1
       ORDER BY submitted_at DESC, id DESC`,
      [runner.id],
    );

  const compliance = resolveRunnerCompliance({
    accountStatus: runner.account_status,
    verificationStatus: runner.verification_status,
    fullName: runner.full_name,
    selectedCategories,
    serviceArea: runner.service_area,
    vehicleType: runner.vehicle_type,
    vehicleModel: runner.vehicle_model,
    vehicleRegistration: runner.vehicle_registration,

    requiredDocuments: requirementsResult.rows.map(
      (item) => ({
        key: item.requirement_key,
      }),
    ),

    uploadedDocuments: documentsResult.rows.map(
      (item) => ({
        id: item.id,
        requirementKey: item.requirement_key,
        reviewStatus: item.review_status,
        submittedAt:
          item.submitted_at instanceof Date
            ? item.submitted_at.toISOString()
            : item.submitted_at,
      }),
    ),
  });

  // Generate an independent Runner session.
  const sessionToken =
    randomBytes(32).toString("base64url");

  const tokenHash = hashToken(sessionToken);
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
      tokenHash,
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

  return {
    ok: true as const,
    sessionToken,
    expiresInDays: sessionDays,
    profileComplete,

    // Retain the older field for compatibility.
    onboardingStatus: getLegacyOnboardingStatus(
      compliance.status,
    ),

    // These are the authoritative compliance values.
    nextStep: compliance.nextStep,
    complianceStatus: compliance.status,
    canSubmit: compliance.canSubmit,
    compliance,

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
    typeof body.confirmationToken !== "string"
  ) {
    return errorResponse(
      "Your registration confirmation is missing. Please start again.",
      400,
    );
  }

  const confirmationToken = body.confirmationToken.trim();

  if (!TOKEN_PATTERN.test(confirmationToken)) {
    return errorResponse(
      "Your registration confirmation is invalid. Please start again.",
      400,
    );
  }

  const tokenHash = hashToken(confirmationToken);
  const client = await databasePool().connect();

  try {
    await client.query("BEGIN");

    // Locate and lock the one-time confirmation.
    const confirmationResult =
      await client.query<RegistrationConfirmation>(
        `SELECT
           id,
           email,
           phone_e164,
           full_name,
           matched_customer_name,
           matched_by,
           expires_at,
           consumed_at,
           cancelled_at
         FROM public.runner_registration_confirmations
         WHERE token_hash = $1
         LIMIT 1
         FOR UPDATE`,
        [tokenHash],
      );

    const confirmation = confirmationResult.rows[0];

    if (!confirmation) {
      await client.query("ROLLBACK");

      return errorResponse(
        "Your registration confirmation could not be found. Please start registration again.",
        404,
      );
    }

    if (confirmation.consumed_at) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This registration confirmation has already been used.",
        409,
      );
    }

    if (confirmation.cancelled_at) {
      await client.query("ROLLBACK");

      return errorResponse(
        "This registration confirmation was cancelled. Please start again.",
        409,
      );
    }

    if (isExpired(confirmation.expires_at)) {
      await client.query(
        `UPDATE public.runner_registration_confirmations
         SET cancelled_at = NOW()
         WHERE id = $1
           AND cancelled_at IS NULL
           AND consumed_at IS NULL`,
        [confirmation.id],
      );

      await client.query("COMMIT");

      return errorResponse(
        "Your registration confirmation has expired. Please start registration again.",
        410,
      );
    }

    const email = confirmation.email.trim().toLowerCase();
    const phoneE164 = confirmation.phone_e164.trim();
    const fullName = confirmation.full_name.trim();

    if (
      !EMAIL_PATTERN.test(email) ||
      !KENYAN_PHONE_PATTERN.test(phoneE164) ||
      fullName.length < 2 ||
      fullName.length > 120 ||
      !confirmation.matched_customer_name.trim() ||
      !["email", "phone"].includes(confirmation.matched_by)
    ) {
      await client.query("ROLLBACK");

      return errorResponse(
        "The registration details are incomplete. Please restart registration.",
        409,
      );
    }

    // Use the same account locks as the other Runner
    // registration endpoints to prevent concurrent duplicates.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-account-email:" + email],
    );

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["sami-runner-phone:" + phoneE164],
    );

    // Recheck both unique identifiers immediately before creation.
    const existingResult =
      await client.query<{
        id: string;
        email: string;
        phone_e164: string | null;
      }>(
        `SELECT id, email, phone_e164
         FROM public.runner_accounts
         WHERE LOWER(email) = $1
            OR phone_e164 = $2
         LIMIT 2
         FOR UPDATE`,
        [email, phoneE164],
      );

    if (existingResult.rows.length > 0) {
      await client.query(
        `UPDATE public.runner_registration_confirmations
         SET cancelled_at = NOW()
         WHERE id = $1
           AND consumed_at IS NULL
           AND cancelled_at IS NULL`,
        [confirmation.id],
      );

      await client.query("COMMIT");

      const emailAlreadyUsed =
        existingResult.rows.some(
          (row) => row.email.toLowerCase() === email,
        );

      return errorResponse(
        emailAlreadyUsed
          ? "A Runner account already exists for this email address. Please sign in instead."
          : "This phone number is already registered to a Runner account. Use another number or sign in.",
        409,
      );
    }

    // Create a separate Runner identity.
    // The Customer database is not accessed by this endpoint.
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
          phoneE164,
          fullName,
        ],
      );

    const account = createdResult.rows[0];

    if (!account) {
      throw new Error("RUNNER_ACCOUNT_CREATION_FAILED");
    }

    // Create Runner profile, availability and session.
    // The shared compliance resolver determines the first destination.
    const result = await createRunnerSession({
      client,
      account,
    });

    // Consume the consent token in the same transaction.
    // Account creation and confirmation consumption succeed or
    // fail together.
    const consumedResult = await client.query(
      `UPDATE public.runner_registration_confirmations
       SET consumed_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL
         AND cancelled_at IS NULL
         AND expires_at > NOW()
       RETURNING id`,
      [confirmation.id],
    );

    if (consumedResult.rowCount !== 1) {
      throw new Error(
        "RUNNER_REGISTRATION_CONFIRMATION_CONSUMPTION_FAILED",
      );
    }

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
        "These Runner registration details are already in use. Please sign in or use different details.",
        409,
      );
    }

    console.error(
      "[SaMi Runner Registration Confirmation] Failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your Runner account could not be created. Please try again.",
      503,
    );
  } finally {
    client.release();
  }
}
