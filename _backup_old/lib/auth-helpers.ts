import bcrypt from "bcryptjs";
import {
  getAuthenticatedUser,
  getAuthenticatedUserId,
} from "./auth-session";

/**
 * Get the authenticated user's ID from the server-side session.
 *
 * The request parameter is kept for compatibility with existing
 * API routes. Authentication is actually obtained from the
 * HTTP-only SaMi session cookie.
 */
export async function getUserIdFromRequest(
  _request?: Request
): Promise<string | null> {
  return getAuthenticatedUserId();
}

/**
 * Get the complete authenticated user.
 */
export async function getUserFromRequest(
  _request?: Request
) {
  return getAuthenticatedUser();
}

/**
 * Require an authenticated user ID.
 */
export async function requireUserIdFromRequest(
  _request?: Request
): Promise<string> {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    throw new Error("Unauthorized.");
  }

  return userId;
}

/**
 * Normalize a person's or business's name.
 *
 * Removes unnecessary whitespace while preserving the
 * actual capitalization supplied by the user.
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Create a URL/database-safe business slug.
 *
 * Example:
 *
 * "Samson Technologies Ltd."
 *        ↓
 * "samson-technologies-ltd"
 */
export function createBusinessSlug(
  businessName: string
): string {
  const normalized = normalizeName(businessName);

  const slug = normalized
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!slug) {
    throw new Error(
      "A valid business name is required to create a business slug."
    );
  }

  return slug;
}

/**
 * Hash a password.
 */
export async function hashPassword(
  password: string
): Promise<string> {
  if (!password) {
    throw new Error("Password is required.");
  }

  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against its stored hash.
 */
export async function validatePassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  if (!password || !passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}