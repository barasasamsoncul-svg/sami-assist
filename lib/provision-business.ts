import { randomUUID } from "crypto";
import { postgresAdmin } from "./postgres-admin";
import { createTenantDatabase } from "./database-provisioning";

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
  const client = await postgresAdmin.connect();

  const businessId = randomUUID();

  const databaseName = `sami_tenant_${businessId.replace(/-/g, "")}`;

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

  try {
    await client.query("BEGIN");

    // 1. Create the business in sami_control
    await client.query(
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

    // 2. Create the tenant database
    await createTenantDatabase(databaseName);

    // 3. Register the tenant database
    await client.query(
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

    // 4. Connect the owner to the business
    await client.query(
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

    // 5. Create the default subscription
    await client.query(
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

    await client.query("COMMIT");

    return {
      success: true,
      businessId,
      databaseName,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}