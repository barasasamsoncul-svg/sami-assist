import { randomUUID } from "crypto";
import { postgresAdmin } from "./postgres-admin";
import {
  createTenantDatabase,
  initializeTenantDatabase,
} from "./database-provisioning";
import { saveEnabledApps } from "./enabled-apps";
import { normalizeAppKeys } from "./sami-apps";

interface ProvisionBusinessInput {
  businessName: string;
  businessSlug: string;
  ownerUserId: string;
  email?: string;
  phone?: string;
  businessType?: string;
  appKeys: unknown;
}

async function dropTenantDatabase(databaseName: string) {
  // databaseName is generated internally, but quote it as an identifier anyway.
  const safeName = databaseName.replace(/"/g, '""');

  try {
    await postgresAdmin.query(
      `DROP DATABASE IF EXISTS "${safeName}" WITH (FORCE)`
    );
  } catch (error) {
    console.error(
      `Failed to clean up tenant database "${databaseName}":`,
      error
    );
  }
}

export async function provisionBusiness({
  businessName,
  businessSlug,
  ownerUserId,
  email,
  phone,
  businessType,
  appKeys,
}: ProvisionBusinessInput) {
  const businessId = randomUUID();
  const databaseName = `sami_tenant_${businessId.replace(/-/g, "")}`;

  const databaseHost = process.env.POSTGRES_HOST || "localhost";
  const databasePort = Number(process.env.POSTGRES_PORT || 5432);
  const databaseUser =
    process.env.POSTGRES_ADMIN_USER || "postgres";
  const databasePassword =
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!databasePassword) {
    throw new Error("POSTGRES_ADMIN_PASSWORD is not configured.");
  }

  const selectedApps = normalizeAppKeys(appKeys);

  if (selectedApps.length === 0) {
    throw new Error("Please select at least one valid SaMi app.");
  }

  await postgresAdmin.query(
    `
    INSERT INTO businesses (
      id,
      name,
      slug,
      email,
      phone,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      businessId,
      businessName,
      businessSlug,
      email || null,
      phone || null,
      "active",
    ]
  );

  let tenantDatabaseCreated = false;

  try {
    // Create the isolated database for this business.
    await createTenantDatabase(databaseName);
    tenantDatabaseCreated = true;

    // Install core tables plus only the selected app schemas.
    await initializeTenantDatabase(
      databaseName,
      selectedApps
    );

    // Register the tenant database in the control database.
    await postgresAdmin.query(
      `
      INSERT INTO database_registry (
        business_id,
        database_name,
        database_host,
        database_port,
        database_user,
        database_password_encrypted,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        businessId,
        databaseName,
        databaseHost,
        databasePort,
        databaseUser,
        databasePassword,
        "active",
      ]
    );

    // Connect the authenticated owner to the business.
    await postgresAdmin.query(
      `
      INSERT INTO business_users (
        business_id,
        user_id,
        role
      )
      VALUES ($1, $2, $3)
      `,
      [businessId, ownerUserId, "owner"]
    );

    // Give every new business the free plan initially.
    await postgresAdmin.query(
      `
      INSERT INTO subscriptions (
        business_id,
        plan,
        status
      )
      VALUES ($1, $2, $3)
      `,
      [businessId, "free", "active"]
    );

    // Single source of truth for enabled apps.
    const enabledApps = await saveEnabledApps(
      businessId,
      selectedApps
    );

    return {
      success: true,
      businessId,
      databaseName,
      businessType: businessType || null,
      appKeys: enabledApps,
    };
  } catch (error) {
    console.error("Business provisioning failed:", error);

    // Remove control-plane records created during this attempt.
    await postgresAdmin.query(
      `DELETE FROM businesses WHERE id = $1`,
      [businessId]
    );

    // Prevent orphan tenant databases.
    if (tenantDatabaseCreated) {
      await dropTenantDatabase(databaseName);
    }

    throw error;
  }
}
