
import "server-only";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  authenticateAdmin,
  isSameOrigin,
} from "@/apps/admin/server/auth";
import { databasePool, query } from "@/lib/db";

const ADMIN_SESSION_COOKIE = "sami_admin_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

function hashValue(value: string) {
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

export async function changeAdminPassword(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(
      "Cross-origin password changes are not allowed.",
      403,
    );
  }

  const auth = await authenticateAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  if (!auth.user) {
    return errorResponse(
      "Administrator authentication is required.",
      401,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid password change request.");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return errorResponse("Invalid password change request.");
  }

  const input = body as Record<string, unknown>;

  const currentPassword =
    typeof input.currentPassword === "string"
      ? input.currentPassword
      : "";

  const newPassword =
    typeof input.newPassword === "string"
      ? input.newPassword
      : "";

  if (!currentPassword || currentPassword.length > 128) {
    return errorResponse("Enter your current password.");
  }

  if (newPassword.length < 14 || newPassword.length > 128) {
    return errorResponse(
      "Your new password must contain between 14 and 128 characters.",
    );
  }

  const identifierHash = hashValue(
    "admin-password-change:" + auth.user.id,
  );

  try {
    const failedAttempts =
      await countFailedAttempts(identifierHash);

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return errorResponse(
        "Too many unsuccessful password-change attempts. Try again in 15 minutes.",
        429,
      );
    }

    const client = await databasePool().connect();

    const rawToken = randomBytes(32).toString("base64url");
    const newTokenHash = hashValue(rawToken);

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MS,
    );

    try {
      await client.query("BEGIN");

      const accountResult = await client.query<{
        password_hash: string | null;
      }>(
        `SELECT password_hash
         FROM public.users
         WHERE id = $1
           AND role = 'admin'
           AND is_active = true
         LIMIT 1
         FOR UPDATE`,
        [auth.user.id],
      );

      const account = accountResult.rows[0];

      if (!account?.password_hash) {
        await client.query("ROLLBACK");

        return errorResponse(
          "Your administrator account is unavailable.",
          403,
        );
      }

      const currentPasswordMatches = await bcrypt.compare(
        currentPassword,
        account.password_hash,
      );

      if (!currentPasswordMatches) {
        await client.query("ROLLBACK");

        await recordAttempt(identifierHash, false).catch(
          () => undefined,
        );

        return errorResponse(
          "Your current password is incorrect.",
          401,
        );
      }

      const newPasswordMatches = await bcrypt.compare(
        newPassword,
        account.password_hash,
      );

      if (newPasswordMatches) {
        await client.query("ROLLBACK");

        return errorResponse(
          "Your new password must be different from your current password.",
        );
      }

      const newPasswordHash = await bcrypt.hash(
        newPassword,
        12,
      );

      await client.query(
        `UPDATE public.users
         SET password_hash = $2,
             updated_at = now()
         WHERE id = $1
           AND role = 'admin'
           AND is_active = true`,
        [auth.user.id, newPasswordHash],
      );

      // Revoke every existing Admin session only.
      // Website and Customer sessions are not touched.
      await client.query(
        `UPDATE public.admin_sessions
         SET revoked_at = now()
         WHERE admin_user_id = $1
           AND revoked_at IS NULL`,
        [auth.user.id],
      );

      // Create a replacement Admin session in the same transaction.
      await client.query(
        `INSERT INTO public.admin_sessions
          (admin_user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [auth.user.id, newTokenHash, expiresAt],
      );

      await client.query("COMMIT");
    } catch (cause) {
      await client.query("ROLLBACK").catch(
        () => undefined,
      );

      throw cause;
    } finally {
      client.release();
    }

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

    return NextResponse.json(
      {
        ok: true,
        message:
          "Your administrator password has been changed. Other Admin sessions have been signed out.",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin credentials] Password change failed.",
      cause instanceof Error
        ? cause.message
        : "unknown error",
    );

    return errorResponse(
      "Your password could not be changed. Please try again.",
      503,
    );
  }
}
