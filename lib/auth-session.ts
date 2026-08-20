import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { postgresAdmin } from "./postgres-admin";

const SESSION_COOKIE_NAME = "sami_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
};

type SessionRow = {
  user_id: string;
  email: string;
  full_name: string;
};

export async function createAuthSession(userId: string) {
  if (!userId) {
    throw new Error("User ID is required to create an auth session.");
  }

  const sessionToken = randomBytes(32).toString("hex");

  await postgresAdmin.query(
    `
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  await postgresAdmin.query(
    `
      DELETE FROM auth_sessions
      WHERE user_id = $1
         OR expires_at <= NOW()
    `,
    [userId]
  );

  await postgresAdmin.query(
    `
      INSERT INTO auth_sessions (
        user_id,
        token,
        expires_at
      )
      VALUES (
        $1,
        $2,
        NOW() + INTERVAL '30 days'
      )
    `,
    [userId, sessionToken]
  );

  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });

  return sessionToken;
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(
    SESSION_COOKIE_NAME
  )?.value;

  if (!token) {
    return null;
  }

  await postgresAdmin.query(
    `
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  const result = await postgresAdmin.query(
    `
      SELECT user_id
      FROM auth_sessions
      WHERE token = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [token]
  );

  if (!result.rowCount || result.rows.length === 0) {
    return null;
  }

  return result.rows[0].user_id as string;
}

/**
 * Returns the complete authenticated user.
 *
 * This is intentionally built on the session rather than
 * trusting user information sent by the browser.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(
    SESSION_COOKIE_NAME
  )?.value;

  if (!token) {
    return null;
  }

  await postgresAdmin.query(
    `
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  );

  const result = await postgresAdmin.query(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.full_name
      FROM auth_sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.token = $1
        AND s.expires_at > NOW()
        AND (u.status IS NULL OR u.status = 'active')
      LIMIT 1
    `,
    [token]
  );

  if (!result.rowCount || result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as SessionRow;

  return {
    id: row.user_id,
    email: row.email,
    fullName: row.full_name,
  };
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error("Unauthorized.");
  }

  return user;
}

export async function destroyAuthSession() {
  const cookieStore = await cookies();

  const token = cookieStore.get(
    SESSION_COOKIE_NAME
  )?.value;

  if (token) {
    await postgresAdmin.query(
      `
        DELETE FROM auth_sessions
        WHERE token = $1
      `,
      [token]
    );
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function refreshAuthSession() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return null;
  }

  return createAuthSession(userId);
}