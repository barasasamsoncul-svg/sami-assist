import bcrypt from "bcryptjs";
import { postgresAdmin } from "./postgres-admin";
import { getEnabledAppsForUser } from "./enabled-apps";

export type LoginResult = {
  userId: string;
  email: string;
  fullName: string;

  businessId: string;
  businessName: string;
  businessSlug: string;

  appKeys: string[];
};

type LoginUserInput = {
  email: string;
  password: string;
};

export async function loginUser(
  input: LoginUserInput
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!password) {
    throw new Error("Password is required.");
  }

  /*
   * 1. Find the user.
   */
  const users = await postgresAdmin.query(
    `
      SELECT
        id,
        email,
        full_name,
        password_hash,
        status
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [email]
  );

  if (!users.rowCount || users.rows.length === 0) {
    throw new Error("Invalid email or password.");
  }

  const user = users.rows[0];

  if (user.status && user.status !== "active") {
    throw new Error("Your account is not active.");
  }

  /*
   * 2. Verify the password.
   */
  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    throw new Error("Invalid email or password.");
  }

  /*
   * 3. Find the user's active business.
   *
   * A user may belong to more than one business.
   * For now, the authentication flow selects one active
   * business deterministically.
   *
   * This is NOT limiting the database system to one business.
   * It only determines which business becomes the current
   * workspace during this login.
   */
  const businesses = await postgresAdmin.query(
    `
      SELECT
        b.id AS business_id,
        b.name AS business_name,
        b.slug AS business_slug
      FROM business_users bu
      INNER JOIN businesses b
        ON b.id = bu.business_id
      WHERE bu.user_id = $1
        AND b.status = 'active'
      ORDER BY b.created_at ASC
      LIMIT 1
    `,
    [user.id]
  );

  if (!businesses.rowCount || businesses.rows.length === 0) {
    throw new Error(
      "Your account does not have an active business."
    );
  }

  const business = businesses.rows[0];

  /*
   * 4. Get the apps enabled for this business.
   *
   * enabled-apps.ts uses the business_users relationship
   * and business_apps table.
   */
  const enabledApps = await getEnabledAppsForUser(user.id);

  /*
   * 5. Make sure the enabled-app lookup agrees with the
   * business selected above.
   *
   * This protects against accidentally returning apps from
   * a different business if the user belongs to multiple
   * businesses.
   */
  if (enabledApps.businessId !== business.business_id) {
    throw new Error(
      "Business application configuration could not be verified."
    );
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,

    businessId: business.business_id,
    businessName: business.business_name,
    businessSlug: business.business_slug,

    appKeys: enabledApps.appKeys,
  };
}