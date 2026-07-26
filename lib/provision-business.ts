import { randomUUID } from "crypto";
import { postgresAdmin } from "./postgres-admin";
import {
  createTenantDatabase,
  initializeTenantDatabase,
} from "./database-provisioning";

interface ProvisionBusinessInput {
  businessName: string;
  businessSlug: string;
  ownerUserId: string;
  email?: string;
  phone?: string;
}

export async function provisionBusiness({
  businessName,
  businessSlug,
  ownerUserId,
  email,
  phone,
}: ProvisionBusinessInput) {
  const businessId = randomUUID();

  const databaseName =
    `sami_tenant_${businessId.replace(/-/g, "")}`;

  const databaseHost =
    process.env.POSTGRES_HOST || "localhost";

  const databasePort = Number(
    process.env.POSTGRES_PORT || 5432
  );

  const databaseUser =
    process.env.POSTGRES_ADMIN_USER || "postgres";

  const databasePassword =
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!databasePassword) {
    throw new Error(
      "POSTGRES_ADMIN_PASSWORD is not configured."
    );
  }

  // =====================================================
  // STEP 1: Create the business record
  // =====================================================

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

  try {
    // ===================================================
    // STEP 2: Create the tenant database
    // ===================================================

    await createTenantDatabase(
      databaseName
    );

    // ===================================================
    // STEP 3: Initialize the tenant database
    // ===================================================

    await initializeTenantDatabase(
      databaseName
    );

    // ===================================================
    // STEP 4: Register tenant database
    // ===================================================

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

    // ===================================================
    // STEP 5: Connect owner to business
    // ===================================================

    await postgresAdmin.query(
      `
      INSERT INTO business_users (
        business_id,
        user_id,
        role
      )
      VALUES ($1, $2, $3)
      `,
      [
        businessId,
        ownerUserId,
        "owner",
      ]
    );

    // ===================================================
    // STEP 6: Create default subscription
    // ===================================================

    await postgresAdmin.query(
      `
      INSERT INTO subscriptions (
        business_id,
        plan,
        status
      )
      VALUES ($1, $2, $3)
      `,
      [
        businessId,
        "free",
        "active",
      ]
    );

    // ===================================================
    // SUCCESS
    // ===================================================

    return {
      success: true,
      businessId,
      databaseName,
    };
  } catch (error) {
    console.error(
      "Business provisioning failed:",
      error
    );

    // If provisioning fails after the business record
    // was created, remove the business record.
    //
    // Because business_users, database_registry,
    // and subscriptions reference the business with
    // ON DELETE CASCADE, this cleans up those records
    // as well if they were created.
    await postgresAdmin.query(
      `
      DELETE FROM businesses
      WHERE id = $1
      `,
      [businessId]
    );

    throw error;
  }
}