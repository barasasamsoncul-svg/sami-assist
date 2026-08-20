import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { postgresAdmin } from "./postgres-admin";

const SESSION_COOKIE_NAME = "sami_session";
const SESSION_DAYS = 30;

type AuthenticatedUser = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
};

type CreateAuthSessionInput =
  | string
  | {
      userId: string;
    };

function getUserId(input: CreateAuthSessionInput): string {
  if (typeof input === "string") {
    return input;
  }

  return input.userId;
}

async function ensureAuthSessionsTable() {
  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
    ON auth_sessions(token_hash)
  `);

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
    ON auth_sessions(user_id)
  `);

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
    ON auth_sessions(expires_at)
  `);
}

function hashSessionToken(token: string): string {
  const crypto = require("crypto") as typeof import("crypto");

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function createAuthSession(
  input: CreateAuthSessionInput
) {
  await ensureAuthSessionsTable();

  const userId = getUserId(input);

  if (!userId) {
    throw new Error("User ID is required to create an auth session.");
  }

  const token = randomBytes(48).toString("hex");
  const tokenHash = hashSessionToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  );

  await postgresAdmin.query(
    `
      INSERT INTO auth_sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );

  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return {
    token,
    expiresAt,
  };
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();

  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  await ensureAuthSessionsTable();

  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);

  const result = await postgresAdmin.query(
    `
      SELECT user_id
      FROM auth_sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  return result.rows[0].user_id as string;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  await ensureAuthSessionsTable();

  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);

  const result = await postgresAdmin.query(
    `
      SELECT
        u.id,
        u.id AS user_id,
        u.email,
        u.full_name,
        u.created_at,
        u.last_login_at,
        COALESCE(u.two_factor_enabled, FALSE) AS two_factor_enabled,
        COALESCE(u.email_verified, FALSE) AS email_verified
      FROM auth_sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id as string,
    userId: row.user_id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : null,
    lastLoginAt: row.last_login_at
      ? new Date(row.last_login_at).toISOString()
      : null,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    emailVerified: Boolean(row.email_verified),
  };
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function destroyAuthSession(): Promise<void> {
  await ensureAuthSessionsTable();

  const token = await getSessionToken();

  if (token) {
    const tokenHash = hashSessionToken(token);

    await postgresAdmin.query(
      `
        DELETE FROM auth_sessions
        WHERE token_hash = $1
      `,
      [tokenHash]
    );
  }

  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function clearAuthSession(): Promise<void> {
  await destroyAuthSession();
}

export async function cleanupExpiredAuthSessions(): Promise<void> {
  await ensureAuthSessionsTable();

  await postgresAdmin.query(`
    DELETE FROM auth_sessions
    WHERE expires_at <= NOW()
  `);
}