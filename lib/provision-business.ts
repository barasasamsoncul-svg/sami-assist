import { postgresAdmin } from "./postgres-admin";
import { saveEnabledApps } from "./enabled-apps";
import {
  provisionTenantDatabase,
  deleteTenantDatabaseForBusiness,
} from "./database-provisioning";
import { normalizeAppKeys } from "./sami-apps";

export type ProvisionBusinessInput = {
  businessName: string;
  businessSlug?: string;
  businessType?: string;
  ownerUserId: string;
  email?: string;
  phone?: string;
  appKeys: unknown;
};

export type ProvisionBusinessResult = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessType: string | null;
  databaseId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
  databaseUser: string;
  appKeys: string[];
};

function normalizeBusinessName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createBusinessSlug(
  businessName: string
): string {
  return businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function provisionBusiness(
  input: ProvisionBusinessInput
): Promise<ProvisionBusinessResult> {
  const businessName =
    normalizeBusinessName(input.businessName);

  if (!businessName) {
    throw new Error("Business name is required.");
  }

  if (!input.ownerUserId) {
    throw new Error("Owner user ID is required.");
  }

  const businessSlug =
    input.businessSlug?.trim() ||
    createBusinessSlug(businessName);

  if (!businessSlug) {
    throw new Error(
      "Unable to generate business slug."
    );
  }

  const selectedApps =
    normalizeAppKeys(input.appKeys);

  if (selectedApps.length === 0) {
    throw new Error(
      "At least one business app must be selected."
    );
  }

  const businessType =
    typeof input.businessType === "string" &&
    input.businessType.trim()
      ? input.businessType.trim()
      : null;

  /*
   * Check whether the business slug already exists.
   */
  const existingBusiness =
    await postgresAdmin.query(
      `
        SELECT id
        FROM businesses
        WHERE slug = $1
        LIMIT 1
      `,
      [businessSlug]
    );

  if ((existingBusiness.rowCount ?? 0) > 0) {
    throw new Error(
      "A business with this slug already exists."
    );
  }

  /*
   * Create the control-plane business record.
   *
   * IMPORTANT:
   * The user has already been created by registerUser().
   * If anything below fails, the registration route must
   * also remove that user.
   */
  const businessResult =
    await postgresAdmin.query(
      `
        INSERT INTO businesses (
          name,
          slug,
          business_type,
          status,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'active',
          NOW(),
          NOW()
        )
        RETURNING
          id,
          name,
          slug,
          business_type
      `,
      [
        businessName,
        businessSlug,
        businessType,
      ]
    );

  if ((businessResult.rowCount ?? 0) === 0) {
    throw new Error(
      "Business could not be created."
    );
  }

  const business =
    businessResult.rows[0];

  const businessId =
    business.id as string;

  let tenantCreated = false;

  try {
    /*
     * Attach the registering user as the owner.
     */
    await postgresAdmin.query(
      `
        INSERT INTO business_users (
          business_id,
          user_id,
          role,
          created_at
        )
        VALUES (
          $1,
          $2,
          'owner',
          NOW()
        )
        ON CONFLICT (
          business_id,
          user_id
        )
        DO UPDATE SET
          role = 'owner'
      `,
      [
        businessId,
        input.ownerUserId,
      ]
    );

    /*
     * Save the applications selected during registration.
     *
     * Example:
     * ["accounting", "invoices", "crm"]
     */
    const savedAppKeys =
      await saveEnabledApps(
        businessId,
        selectedApps
      );

    /*
     * Create the isolated PostgreSQL database
     * belonging to this business.
     *
     * The database-provisioning module is responsible
     * for creating the physical tenant database and
     * registering it in sami_control.
     */
    const tenant =
  await provisionTenantDatabase(
    businessId,
    businessSlug,
    selectedApps
  );

    tenantCreated = true;

    /*
     * Save business contact information.
     */
    if (
      input.email?.trim() ||
      input.phone?.trim()
    ) {
      await postgresAdmin.query(
        `
          UPDATE businesses
          SET
            email = COALESCE($2, email),
            phone = COALESCE($3, phone),
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          businessId,
          input.email?.trim() || null,
          input.phone?.trim() || null,
        ]
      );
    }

    /*
     * Everything required by provisionBusiness()
     * has completed successfully.
     */
    return {
      businessId,
      businessName:
        business.name as string,
      businessSlug:
        business.slug as string,
      businessType:
        (business.business_type as string | null) ??
        businessType,
      databaseId:
        tenant.databaseId,
      databaseName:
        tenant.databaseName,
      databaseHost:
        tenant.databaseHost,
      databasePort:
        tenant.databasePort,
      databaseUser:
        tenant.databaseUser,
      appKeys:
        savedAppKeys,
    };
  } catch (error) {
    console.error(
      "Business provisioning failed:",
      error
    );

    /*
     * ---------------------------------------------------
     * ROLLBACK
     * ---------------------------------------------------
     *
     * If the tenant database was created, remove it.
     *
     * This prevents:
     *
     * sami_control
     *   business -> exists
     *
     * while the registration itself has failed.
     */
    if (tenantCreated) {
      try {
        await deleteTenantDatabaseForBusiness(
          businessId
        );
      } catch (tenantCleanupError) {
        /*
         * Do not hide the original provisioning error.
         */
        console.error(
          "Failed to delete tenant database during rollback:",
          tenantCleanupError
        );
      }
    }

    /*
     * Delete the business.
     *
     * Your database_registry, business_users and
     * enabled-app records should use foreign keys with
     * ON DELETE CASCADE, so deleting the business
     * removes those related control-plane records.
     */
    try {
      await postgresAdmin.query(
        `
          DELETE FROM businesses
          WHERE id = $1
        `,
        [businessId]
      );
    } catch (businessCleanupError) {
      console.error(
        "Failed to delete business during rollback:",
        businessCleanupError
      );
    }

    /*
     * Re-throw the original error so the register route
     * returns the real reason registration failed.
     */
    throw error;
  }
}