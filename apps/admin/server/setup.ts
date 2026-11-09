
import "server-only";

import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { isSameOrigin } from "@/apps/admin/server/auth";
import { databasePool, query } from "@/lib/db";

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

function hashValue(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
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

function tokenMatches(expected: string, supplied: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");

  return (
    expectedBuffer.length >= 32 &&
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

async function countFailedAttempts(identifierHash: string) {
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM public.auth_attempts
     WHERE identifier_hash = $1
       AND attempt_type = 'bootstrap'
       AND succeeded = false
       AND attempted_at > now() - interval '15 minutes'`,
    [identifierHash],
  );

  return Number(result.rows[0]?.count || 0);
}

async function recordAttempt(
  identifierHash: string,
  succeeded: boolean,
) {
  await query(
    `INSERT INTO public.auth_attempts
      (identifier_hash, attempt_type, succeeded)
     VALUES ($1, 'bootstrap', $2)`,
    [identifierHash, succeeded],
  );
}

/**
 * Reports whether first-time administrator setup is available.
 * This endpoint does not create an account or issue a session.
 */
export async function getAdminSetupStatus() {
  try {
    const result = await query<{ admin_exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM public.users
         WHERE role = 'admin'
       ) AS admin_exists`,
    );

    const adminExists = Boolean(
      result.rows[0]?.admin_exists,
    );

    const tokenConfigured =
      (process.env.ADMIN_BOOTSTRAP_TOKEN || "").length >= 32;

    return NextResponse.json(
      {
        ok: true,
        adminExists,
        tokenConfigured,
        setupAvailable:
          !adminExists && tokenConfigured,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin setup] Status check failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Could not verify administrator setup. Check the database connection and try again.",
      503,
    );
  }
}

/**
 * Creates the first administrator account.
 *
 * This operation deliberately does not create a Website session
 * or an Admin session. The setup form must sign in through the
 * dedicated Admin login endpoint after successful account creation.
 */
export async function bootstrapAdmin(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin setup requests are not allowed.",
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid administrator setup request.");
  }

  if (!isRecord(body)) {
    return errorResponse("Invalid administrator setup request.");
  }

  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
  const supplied =
    request.headers.get("x-admin-bootstrap-token") || "";

  const identifierHash = hashValue(
    "bootstrap:" + (supplied || "missing"),
  );

  try {
    const failedAttempts =
      await countFailedAttempts(identifierHash);

    if (failedAttempts >= 5) {
      return errorResponse(
        "Too many setup attempts. Try again in 15 minutes.",
        429,
      );
    }

    if (
      expected.length < 32 ||
      supplied.length < 32 ||
      !tokenMatches(expected, supplied)
    ) {
      await recordAttempt(identifierHash, false).catch(
        () => undefined,
      );

      return errorResponse(
        expected.length < 32
          ? "Administrator setup is not configured for this deployment. Configure ADMIN_BOOTSTRAP_TOKEN and redeploy."
          : "The administrator setup token is invalid.",
        403,
      );
    }

    const fullName =
      typeof body.fullName === "string"
        ? body.fullName.trim().replace(/\s+/g, " ")
        : "";

    const email = normalizeEmail(body.email);

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (fullName.length < 2 || fullName.length > 120) {
      return errorResponse(
        "Enter a name between 2 and 120 characters.",
      );
    }

    if (!isValidEmail(email)) {
      return errorResponse("Enter a valid email address.");
    }

    if (password.length < 14 || password.length > 128) {
      return errorResponse(
        "Choose a password between 14 and 128 characters.",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const client = await databasePool().connect();

    try {
      await client.query("BEGIN");

      // Only one first-time Admin setup can run at a time.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('sami_errands_admin_bootstrap'))",
      );

      const existing = await client.query(
        `SELECT id
         FROM public.users
         WHERE role = 'admin'
         LIMIT 1`,
      );

      if (existing.rowCount) {
        await client.query("ROLLBACK");

        return errorResponse(
          "An administrator already exists. Sign in through Admin login.",
          409,
        );
      }

      await client.query(
        `INSERT INTO public.users
          (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, 'admin')`,
        [fullName, email, passwordHash],
      );

      await client.query("COMMIT");
    } catch (cause) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );

      if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        (cause as { code?: string }).code === "23505"
      ) {
        return errorResponse(
          "That email address is already registered.",
          409,
        );
      }

      throw cause;
    } finally {
      client.release();
    }

    await recordAttempt(identifierHash, true).catch(
      () => undefined,
    );

    return NextResponse.json(
      {
        ok: true,
        message:
          "Administrator account created. Sign in through Admin to continue.",
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin setup] Account creation failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    await recordAttempt(identifierHash, false).catch(
      () => undefined,
    );

    return errorResponse(
      "Administrator setup could not be completed. Check the database connection and try again.",
      503,
    );
  }
}
