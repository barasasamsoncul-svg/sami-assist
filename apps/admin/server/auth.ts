
import "server-only";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { query } from "@/lib/db";

const ADMIN_SESSION_COOKIE = "sami_admin_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

type AdminAccountRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string | null;
};

export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: "admin";
};

type AdminAuthResult =
  | {
      user: AdminUser;
      response: null;
    }
  | {
      user: null;
      response: NextResponse;
    };

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

function successResponse(data: Record<string, unknown>) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, private",
    },
  });
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
 * Admin mutation requests must explicitly identify this exact origin.
 * Missing, malformed, opaque and cross-origin Origin headers are rejected.
 * This is used by every state-changing Admin authentication endpoint.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function countFailedAttempts(identifierHash: string) {
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM public.auth_attempts
     WHERE identifier_hash = $1
       AND attempt_type = 'login'
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
     VALUES ($1, 'login', $2)`,
    [identifierHash, succeeded],
  );
}

/**
 * Authenticates an active Admin account and creates
 * a session exclusively in public.admin_sessions.
 */
export async function loginAdmin(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin login requests are not allowed.",
      403,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid login request.");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return errorResponse("Invalid login request.");
  }

  const input = body as Record<string, unknown>;
  const email = normalizeEmail(input.email);

  const password =
    typeof input.password === "string"
      ? input.password
      : "";

  if (!isValidEmail(email)) {
    return errorResponse("Enter a valid email address.");
  }

  if (!password || password.length > 128) {
    return errorResponse("Enter a valid password.");
  }

  // Separate Admin attempts from Website login attempts.
  const identifierHash = hashValue(
    "admin-login:" + email,
  );

  try {
    const failedAttempts =
      await countFailedAttempts(identifierHash);

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return errorResponse(
        "Too many unsuccessful login attempts. Try again in 15 minutes.",
        429,
      );
    }

    const accountResult = await query<AdminAccountRow>(
      `SELECT
         id,
         full_name,
         email,
         phone,
         password_hash
       FROM public.users
       WHERE lower(email) = $1
         AND role = 'admin'
         AND is_active = true
       LIMIT 1`,
      [email],
    );

    const account = accountResult.rows[0];

    const passwordMatches =
      Boolean(account?.password_hash) &&
      await bcrypt.compare(
        password,
        account?.password_hash || "",
      );

    if (!account || !passwordMatches) {
      await recordAttempt(identifierHash, false).catch(
        () => undefined,
      );

      return errorResponse(
        "Incorrect email or password.",
        401,
      );
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashValue(rawToken);

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MS,
    );

    // Admin sessions never enter public.user_sessions.
    await query(
      `INSERT INTO public.admin_sessions
        (admin_user_id, token_hash, expires_at)
       SELECT id, $2, $3
       FROM public.users
       WHERE id = $1
         AND role = 'admin'
         AND is_active = true`,
      [account.id, tokenHash, expiresAt],
    );

    await recordAttempt(identifierHash, true).catch(
      () => undefined,
    );

    const jar = await cookies();

    jar.set(ADMIN_SESSION_COOKIE, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return successResponse({
      ok: true,
      user: {
        id: account.id,
        full_name: account.full_name,
        email: account.email,
        phone: account.phone,
        role: "admin",
      },
    });
  } catch (cause) {
    console.error(
      "[SaMi Admin authentication] Login failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Administrator sign-in is temporarily unavailable.",
      503,
    );
  }
}

/**
 * Resolves the current Admin browser session.
 *
 * Only active administrator accounts with a valid,
 * unrevoked Admin session are accepted.
 */
export async function authenticateAdmin(
  _request?: Request,
): Promise<AdminAuthResult> {
  try {
    const jar = await cookies();
    const rawToken = jar.get(ADMIN_SESSION_COOKIE)?.value;

    if (!rawToken) {
      return {
        user: null,
        response: errorResponse(
          "Sign in as an administrator to continue.",
          401,
        ),
      };
    }

    const result = await query<AdminUser>(
      `UPDATE public.admin_sessions AS s
       SET last_seen_at = now()
       FROM public.users AS u
       WHERE s.admin_user_id = u.id
         AND s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.is_active = true
         AND u.role = 'admin'
       RETURNING
         u.id,
         u.full_name,
         u.email,
         u.phone,
         'admin'::text AS role`,
      [hashValue(rawToken)],
    );

    const user = result.rows[0];

    if (!user) {
      jar.delete(ADMIN_SESSION_COOKIE);

      return {
        user: null,
        response: errorResponse(
          "Your administrator session is invalid or expired.",
          401,
        ),
      };
    }

    return {
      user,
      response: null,
    };
  } catch (cause) {
    console.error(
      "[SaMi Admin authentication] Session check failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return {
      user: null,
      response: errorResponse(
        "Administrator authentication is temporarily unavailable.",
        503,
      ),
    };
  }
}

export async function getAdminSession(request: Request) {
  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  return successResponse({
    ok: true,
    user: auth.user,
  });
}

/**
 * Revokes only the current Admin session.
 * Website, Customer and Runner sessions are not affected.
 */
export async function logoutAdmin(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin sign-out requests are not allowed.",
      403,
    );
  }

  const jar = await cookies();
  const rawToken = jar.get(ADMIN_SESSION_COOKIE)?.value;

  try {
    if (rawToken) {
      await query(
        `UPDATE public.admin_sessions
         SET revoked_at = now()
         WHERE token_hash = $1
           AND revoked_at IS NULL`,
        [hashValue(rawToken)],
      );
    }

    jar.delete(ADMIN_SESSION_COOKIE);

    return successResponse({ ok: true });
  } catch (cause) {
    // Clear the browser credential even if server-side
    // revocation fails. The server error must not be hidden.
    jar.delete(ADMIN_SESSION_COOKIE);

    console.error(
      "[SaMi Admin authentication] Logout failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Administrator sign-out could not be fully confirmed.",
      503,
    );
  }
}
