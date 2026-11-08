import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authenticateAdmin } from "@/apps/admin/server/auth";
import { query } from "@/lib/db";

const ADMIN_SESSION_COOKIE_NAME = "sami_admin_session";

type AdminSessionRecord = {
  id: string;
  created_at: Date | string;
  last_seen_at: Date | string;
  expires_at: Date | string;
  is_current: boolean;
};

function error(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function requestHasAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function getCurrentAdminSessionHash() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return createHash("sha256").update(token).digest("hex");
}

export async function listAdminSessions(request: Request) {
  const auth = await authenticateAdmin(request).catch(() => null);

  if (!auth || !auth.user) {
    return error("Your Admin session is no longer valid. Sign in again.", 401);
  }

  const admin = auth.user;
  const currentTokenHash = await getCurrentAdminSessionHash();

  if (!currentTokenHash) {
    return error("Your Admin session could not be identified.", 401);
  }

  try {
    const result = await query<AdminSessionRecord>(
      `SELECT
         id,
         created_at,
         last_seen_at,
         expires_at,
         token_hash = $2 AS is_current
       FROM public.admin_sessions
       WHERE admin_user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY
         (token_hash = $2) DESC,
         last_seen_at DESC`,
      [admin.id, currentTokenHash],
    );

    return NextResponse.json(
      {
        sessions: result.rows,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin sessions] Listing failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error("Active Admin sessions could not be retrieved.", 503);
  }
}

export async function revokeOtherAdminSessions(request: Request) {
  if (!requestHasAllowedOrigin(request)) {
    return error("This request origin is not allowed.", 403);
  }

  const auth = await authenticateAdmin(request).catch(() => null);

  if (!auth || !auth.user) {
    return error("Your Admin session is no longer valid. Sign in again.", 401);
  }

  const admin = auth.user;
  const currentTokenHash = await getCurrentAdminSessionHash();

  if (!currentTokenHash) {
    return error("Your Admin session could not be identified.", 401);
  }

  try {
    const result = await query(
      `UPDATE public.admin_sessions
       SET revoked_at = now()
       WHERE admin_user_id = $1
         AND token_hash <> $2
         AND revoked_at IS NULL
         AND expires_at > now()`,
      [admin.id, currentTokenHash],
    );

    return NextResponse.json(
      {
        ok: true,
        revokedCount: result.rowCount ?? 0,
        message: "Other active Admin sessions have been signed out.",
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (cause) {
    console.error(
      "[SaMi Admin sessions] Revocation failed.",
      cause instanceof Error ? cause.message : "unknown error",
    );

    return error("Other Admin sessions could not be revoked.", 503);
  }
}