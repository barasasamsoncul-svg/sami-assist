import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { postgresAdmin } from "./postgres-admin";

interface RegisterUserInput {
  email: string;
  password: string;
  fullName?: string;
}

export async function registerUser({
  email,
  password,
  fullName,
}: RegisterUserInput) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  if (!password || password.length < 8) {
    throw new Error(
      "Password must be at least 8 characters long."
    );
  }

  // Check whether the email already exists
  const existingUser = await postgresAdmin.query(
    `
    SELECT id
    FROM users
    WHERE email = $1
    `,
    [normalizedEmail]
  );

  if (existingUser.rowCount && existingUser.rowCount > 0) {
    throw new Error(
      "A user with this email already exists."
    );
  }

  // Hash password before storing it
  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const userId = randomUUID();

  // Create user in sami_control
  await postgresAdmin.query(
    `
    INSERT INTO users (
      id,
      email,
      password_hash,
      full_name,
      status
    )
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      userId,
      normalizedEmail,
      passwordHash,
      fullName || null,
      "active",
    ]
  );

  return {
    success: true,
    userId,
    email: normalizedEmail,
    fullName: fullName || null,
  };
}