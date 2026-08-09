import { cookies } from "next/headers";
import { postgresAdmin } from "./postgres-admin";

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();

  const sessionToken = cookieStore.get("sami_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const result = await postgresAdmin.query(
    `
    SELECT
      users.id,
      users.email,
      users.full_name,
      users.status,
      users.created_at,
      users.last_login_at,
      users.two_factor_enabled,
      users.email_verified,
      sessions.id AS session_id,
      sessions.expires_at
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = $1
      AND sessions.expires_at > NOW()
      AND users.status = 'active'
    `,
    [sessionToken]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0];

  // Update last active time
  await postgresAdmin.query(
    `
    UPDATE sessions
    SET last_active = NOW()
    WHERE id = $1
    `,
    [user.session_id]
  );

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    status: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    twoFactorEnabled: user.two_factor_enabled,
    emailVerified: user.email_verified,
    sessionId: user.session_id,
    expiresAt: user.expires_at,
  };
}