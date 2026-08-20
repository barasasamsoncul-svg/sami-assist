import { randomBytes } from "crypto";
import { Client } from "pg";
import { postgresAdmin } from "./postgres-admin";

export type TenantDatabaseProvisionResult = {
  databaseId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
  databaseUser: string;
  databasePassword: string;
  created: boolean;
};

function getProvisioningUrl(): string {
  const url =
    process.env.TENANT_PROVISIONING_DATABASE_URL ||
    process.env.ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "No tenant database provisioning connection string is configured."
    );
  }

  return url;
}

function generateDatabaseName(
  businessSlug: string
): string {
  const cleanSlug = businessSlug
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 45);

  const suffix = randomBytes(4).toString("hex");

  return `sami_${cleanSlug}_${suffix}`;
}

export async function ensureDatabaseRegistryTable(): Promise<void> {
  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS database_registry (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL
        REFERENCES businesses(id)
        ON DELETE CASCADE,
      database_name VARCHAR(255) NOT NULL UNIQUE,
      database_host VARCHAR(255) NOT NULL,
      database_port INTEGER NOT NULL DEFAULT 5432,
      database_user VARCHAR(255) NOT NULL,
      database_password_encrypted TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id)
    )
  `);
}

export async function provisionTenantDatabase(
  businessId: string,
  businessSlug: string
): Promise<TenantDatabaseProvisionResult> {
  await ensureDatabaseRegistryTable();

  const existing = await postgresAdmin.query(
    `
      SELECT
        id,
        database_name,
        database_host,
        database_port,
        database_user,
        database_password_encrypted
      FROM database_registry
      WHERE business_id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [businessId]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const row = existing.rows[0];

    return {
      databaseId: row.id as string,
      databaseName: row.database_name as string,
      databaseHost: row.database_host as string,
      databasePort: Number(row.database_port),
      databaseUser: row.database_user as string,
      databasePassword:
        row.database_password_encrypted as string,
      created: false,
    };
  }

  const databaseName =
    generateDatabaseName(businessSlug);

  const databaseUser =
  process.env.TENANT_DATABASE_USER ||
  process.env.POSTGRES_ADMIN_USER ||
  "postgres";

const databasePassword =
  process.env.TENANT_DATABASE_PASSWORD ||
  process.env.POSTGRES_ADMIN_PASSWORD;

if (!databasePassword) {
  throw new Error(
    "No tenant database password is configured."
  );
}

const databaseHost =
  process.env.TENANT_DATABASE_HOST ||
  process.env.POSTGRES_HOST;

if (!databaseHost) {
  throw new Error(
    "No tenant database host is configured."
  );
}

const databasePort = Number(
  process.env.TENANT_DATABASE_PORT ||
  process.env.POSTGRES_PORT ||
  5432
);

  const adminClient = new Client({
    connectionString: getProvisioningUrl(),
    ssl: {
      rejectUnauthorized: false,
    },
  });

  let databaseCreated = false;

  await adminClient.connect();

  try {
    await adminClient.query(
      `CREATE DATABASE "${databaseName}"`
    );

    databaseCreated = true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      !message
        .toLowerCase()
        .includes("already exists")
    ) {
      throw error;
    }
  } finally {
    await adminClient.end();
  }

  try {
    const registry = await postgresAdmin.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
        RETURNING id
      `,
      [
        businessId,
        databaseName,
        databaseHost,
        databasePort,
        databaseUser,
        databasePassword,
      ]
    );

    if ((registry.rowCount ?? 0) === 0) {
      throw new Error(
        "Tenant database registry entry could not be created."
      );
    }

    return {
      databaseId: registry.rows[0].id as string,
      databaseName,
      databaseHost,
      databasePort,
      databaseUser,
      databasePassword,
      created: databaseCreated,
    };
  } catch (error) {
    /*
     * The database was created but its registry entry failed.
     * Remove the physical database so we don't leave an
     * orphaned tenant database behind.
     */
    if (databaseCreated) {
      try {
        await deleteTenantDatabase(databaseName);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up orphaned tenant database:",
          cleanupError
        );
      }
    }

    throw error;
  }
}

export async function deleteTenantDatabase(
  databaseName: string
): Promise<void> {
  if (!databaseName) {
    return;
  }

  /*
   * Only allow database names generated by SaMi.
   * This prevents accidental arbitrary database deletion.
   */
  if (!/^sami_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(
      "Invalid SaMi tenant database name."
    );
  }

  const adminClient = new Client({
    connectionString: getProvisioningUrl(),
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await adminClient.connect();

  try {
    /*
     * Terminate connections first so PostgreSQL can
     * drop the database.
     */
    await adminClient.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName]
    );

    await adminClient.query(
      `DROP DATABASE IF EXISTS "${databaseName}"`
    );
  } finally {
    await adminClient.end();
  }
}

export async function deleteTenantDatabaseForBusiness(
  businessId: string
): Promise<void> {
  await ensureDatabaseRegistryTable();

  const result = await postgresAdmin.query(
    `
      SELECT database_name
      FROM database_registry
      WHERE business_id = $1
      LIMIT 1
    `,
    [businessId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return;
  }

  const databaseName =
    result.rows[0].database_name as string;

  /*
   * Remove registry first.
   */
  await postgresAdmin.query(
    `
      DELETE FROM database_registry
      WHERE business_id = $1
    `,
    [businessId]
  );

  try {
    await deleteTenantDatabase(databaseName);
  } catch (error) {
    console.error(
      `Failed to delete tenant database ${databaseName}:`,
      error
    );
  }
}

/**
 * Backwards-compatible alias.
 */
export const createTenantDatabase =
  provisionTenantDatabase;