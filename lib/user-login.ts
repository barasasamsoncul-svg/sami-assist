import bcrypt from "bcryptjs";
import crypto from "crypto";
import { postgresAdmin } from "./postgres-admin";

const SESSION_DURATION_DAYS = 30;

interface LoginUserInput {
  email: string;
  password: string;
}

export async function loginUser({
  email,
  password,
}: LoginUserInput) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error(
      "Email and password are required."
    );
  }

  // Find the user
  const result = await postgresAdmin.query(
    `
    SELECT
      id,
      email,
      password_hash,
      full_name,
      status
    FROM users
    WHERE email = $1
    `,
    [normalizedEmail]
  );

  if (result.rowCount === 0) {
    throw new Error(
      "Invalid email or password."
    );
  }

  const user = result.rows[0];

  // Check account status
  if (user.status !== "active") {
    throw new Error(
      "This account is not active."
    );
  }

  // Verify password
  const passwordMatches =
    await bcrypt.compare(
      password,
      user.password_hash
    );

  if (!passwordMatches) {
    throw new Error(
      "Invalid email or password."
    );
  }

  // Generate a secure random session token
  const sessionToken =
    crypto.randomBytes(32).toString("hex");

  // Store only the hash of the session token
  const sessionTokenHash =
    crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");

  // Session expires in 30 days
  const expiresAt = new Date();

  expiresAt.setDate(
    expiresAt.getDate() +
      SESSION_DURATION_DAYS
  );

  // Save session
 // Save session
await postgresAdmin.query(
  `
  INSERT INTO sessions (
    user_id,
    token,
    expires_at,
    is_current,
    created_at
  )
  VALUES ($1, $2, $3, TRUE, NOW())
  `,
  [
    user.id,
    sessionTokenHash,
    expiresAt,
  ]
);

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
    },
    sessionToken,
    expiresAt,
  };
}