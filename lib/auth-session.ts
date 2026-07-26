import crypto from "crypto";
import { cookies } from "next/headers";
import { postgresAdmin } from "./postgres-admin";

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();

  const sessionToken =
    cookieStore.get("sami_session")?.value;

  if (!sessionToken) {
    return null;
  }

  // Hash the token from the browser
  const sessionTokenHash =
    crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");

  // Find valid session and user
  const result = await postgresAdmin.query(
    `
    SELECT
      users.id,
      users.email,
      users.full_name,
      users.status,
      sessions.id AS session_id,
      sessions.expires_at
    FROM sessions
    INNER JOIN users
      ON users.id = sessions.user_id
    WHERE sessions.session_token_hash = $1
      AND sessions.expires_at > NOW()
      AND users.status = 'active'
    `,
    [sessionTokenHash]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0];

  // Update last activity
  await postgresAdmin.query(
    `
    UPDATE sessions
    SET last_used_at = NOW()
    WHERE id = $1
    `,
    [user.session_id]
  );

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    sessionId: user.session_id,
    expiresAt: user.expires_at,
  };
}