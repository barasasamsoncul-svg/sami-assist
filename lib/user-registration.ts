import { randomUUID } from "crypto";
import { postgresAdmin } from "./postgres-admin";

export type RegisterUserInput = {
  email: string;
  password: string;
  fullName: string;
};

export type RegisteredUser = {
  userId: string;
  email: string;
  fullName: string;
};

export async function registerUser(
  input: RegisterUserInput
): Promise<RegisteredUser> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!fullName) {
    throw new Error("Full name is required.");
  }

  if (!input.password) {
    throw new Error("Password is required.");
  }

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existing = await postgresAdmin.query(
    `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  if ((existing.rowCount ?? 0) > 0) {
    throw new Error("An account with this email already exists.");
  }

  /*
   * Password hashing is handled here rather than storing
   * plain-text passwords in the database.
   */
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(input.password, 12);

  const userId = randomUUID();

  await postgresAdmin.query(
    `
      INSERT INTO users (
        id,
        email,
        password_hash,
        full_name,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NOW(),
        NOW()
      )
    `,
    [userId, email, passwordHash, fullName]
  );

  return {
    userId,
    email,
    fullName,
  };
}