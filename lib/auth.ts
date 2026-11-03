import "server-only";

import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

export type Role = "customer" | "provider" | "admin";

export type AppUser = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  phone: string | null;
};

type SessionClient = "web" | "mobile";

const COOKIE = "sami_errands_session";

const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function bearerToken(request?: Request): string | null {
  const header = request?.headers.get("authorization") || "";

  const match = /^Bearer\s+([A-Za-z0-9_-]{40,128})$/i.exec(
    header,
  );

  return match?.[1] ?? null;
}

function isNativeClient(request?: Request): boolean {
  return (
    request?.headers.get("x-sami-client") === "native" &&
    !request.headers.get("origin")
  );
}

/**
 * Creates a session for the specified client.
 *
 * Mobile:
 * - Customer accounts only.
 * - No automatic expiry.
 * - Uses bearer-token authentication.
 * - Does not create a browser cookie.
 *
 * Web:
 * - Retains the existing 14-day session.
 * - Uses the existing browser cookie.
 */
export async function createSession(
  userId: string,
  request?: Request,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");

  const client: SessionClient = isNativeClient(request)
    ? "mobile"
    : "web";

  if (client === "mobile") {
    await query(
      `INSERT INTO public.user_sessions
        (user_id, token_hash, client_type, expires_at)
       VALUES ($1, $2, 'mobile', NULL)`,
      [userId, tokenHash(raw)],
    );

    return raw;
  }

  const expires = new Date(
    Date.now() + 14 * 86400000,
  );

  await query(
    `INSERT INTO public.user_sessions
      (user_id, token_hash, client_type, expires_at)
     VALUES ($1, $2, 'web', $3)`,
    [userId, tokenHash(raw), expires],
  );

  const jar = await cookies();

  jar.set(COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });

  return raw;
}

/**
 * Resolves the current authenticated user.
 *
 * Native authentication is strictly customer-only.
 * Existing valid sessions are upgraded to permanent mobile sessions.
 *
 * Website authentication retains its original behaviour.
 */
export async function getCurrentUser(
  request?: Request,
): Promise<AppUser | null> {
  if (isNativeClient(request)) {
    const token = bearerToken(request);

    if (!token) return null;

    const result = await query<AppUser>(
      `UPDATE public.user_sessions AS s
       SET
         client_type = 'mobile',
         expires_at = NULL,
         last_seen_at = now()
       FROM public.users AS u
       WHERE s.user_id = u.id
         AND s.token_hash = $1
         AND u.is_active = true
         AND u.role = 'customer'
         AND (
           (
             s.client_type = 'mobile'
             AND s.expires_at IS NULL
           )
           OR (
             s.client_type = 'web'
             AND s.expires_at > now()
           )
         )
       RETURNING
         u.id,
         u.full_name,
         u.email,
         'customer'::text AS role,
         u.phone`,
      [tokenHash(token)],
    );

    return result.rows[0] ?? null;
  }

  // Existing website authentication.
  const jar = await cookies();

  const token =
    bearerToken(request) || jar.get(COOKIE)?.value;

  if (!token) return null;

  const result = await query<AppUser>(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.role,
       u.phone
     FROM public.user_sessions AS s
     JOIN public.users AS u
       ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.client_type = 'web'
       AND s.expires_at > now()
       AND u.is_active = true
     LIMIT 1`,
    [tokenHash(token)],
  );

  return result.rows[0] ?? null;
}

/**
 * Revokes the current session.
 *
 * Mobile: deletes the bearer-token session.
 * Web: deletes the session and clears the browser cookie.
 */
export async function destroySession(request?: Request) {
  const token = bearerToken(request);

  if (isNativeClient(request)) {
    if (token) {
      await query(
        "DELETE FROM public.user_sessions WHERE token_hash = $1",
        [tokenHash(token)],
      );
    }

    return;
  }

  const jar = await cookies();
  const webToken = token || jar.get(COOKIE)?.value;

  if (webToken) {
    await query(
      "DELETE FROM public.user_sessions WHERE token_hash = $1",
      [tokenHash(webToken)],
    );
  }

  jar.delete(COOKIE);
}