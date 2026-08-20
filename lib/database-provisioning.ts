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
};

function getProvisioningUrl(): string {
  const existingUrl =
    process.env.TENANT_PROVISIONING_DATABASE_URL ||
    process.env.ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_DATABASE_URL;

  if (existingUrl) {
    return existingUrl;
  }

  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_ADMIN_USER;
  const password = process.env.POSTGRES_ADMIN_PASSWORD;

  if (!host) {
    throw new Error(
      "POSTGRES_HOST is not configured."
    );
  }

  if (!user) {
    throw new Error(
      "POSTGRES_ADMIN_USER is not configured."
    );
  }

  if (!password) {
    throw new Error(
      "POSTGRES_ADMIN_PASSWORD is not configured."
    );
  }

  /*
   * PostgreSQL CREATE DATABASE must connect to an
   * existing database on the server.
   *
   * sami_control is our control database.
   */
  return (
    `postgresql://${encodeURIComponent(user)}` +
    `:${encodeURIComponent(password)}` +
    `@${host}:${port}/sami_control` +
    `?sslmode=require`
  );
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

function getTenantCredentials() {
  /*
   * Tenant-specific credentials are optional.
   *
   * If they are not configured, SaMi uses the existing
   * PostgreSQL admin credentials.
   */
  const databaseUser =
    process.env.TENANT_DATABASE_USER ||
    process.env.POSTGRES_ADMIN_USER;

  const databasePassword =
    process.env.TENANT_DATABASE_PASSWORD ||
    process.env.POSTGRES_ADMIN_PASSWORD;

  const databaseHost =
    process.env.TENANT_DATABASE_HOST ||
    process.env.POSTGRES_HOST;

  const databasePort = Number(
    process.env.TENANT_DATABASE_PORT ||
      process.env.POSTGRES_PORT ||
      5432
  );

  if (!databaseUser) {
    throw new Error(
      "POSTGRES_ADMIN_USER is not configured."
    );
  }

  if (!databasePassword) {
    throw new Error(
      "POSTGRES_ADMIN_PASSWORD is not configured."
    );
  }

  if (!databaseHost) {
    throw new Error(
      "POSTGRES_HOST is not configured."
    );
  }

  if (!Number.isFinite(databasePort)) {
    throw new Error(
      "POSTGRES_PORT is invalid."
    );
  }

  return {
    databaseUser,
    databasePassword,
    databaseHost,
    databasePort,
  };
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

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS
    idx_database_registry_business_id
    ON database_registry(business_id)
  `);

  await postgresAdmin.query(`
    CREATE INDEX IF NOT EXISTS
    idx_database_registry_status
    ON database_registry(status)
  `);
}

export async function provisionTenantDatabase(
  businessId: string,
  businessSlug: string
): Promise<TenantDatabaseProvisionResult> {
  await ensureDatabaseRegistryTable();

  /*
   * Check whether this business already has an active
   * tenant database.
   */
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
    };
  }

  const {
    databaseUser,
    databasePassword,
    databaseHost,
    databasePort,
  } = getTenantCredentials();

  const databaseName =
    generateDatabaseName(businessSlug);

  /*
   * Connect to the PostgreSQL server using the existing
   * admin/provisioning connection.
   */
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

    /*
     * If the database already exists, continue.
     */
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
    /*
     * Register the newly-created tenant inside
     * sami_control.
     */
    const registry =
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
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'active'
          )
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
      databaseId:
        registry.rows[0].id as string,
      databaseName,
      databaseHost,
      databasePort,
      databaseUser,
      databasePassword,
    };
  } catch (error) {
    /*
     * The physical database was created but the registry
     * failed. Remove the orphaned database.
     */
    if (databaseCreated) {
      try {
        const cleanupClient = new Client({
          connectionString:
            getProvisioningUrl(),
          ssl: {
            rejectUnauthorized: false,
          },
        });

        await cleanupClient.connect();

        await cleanupClient.query(
          `
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
          `,
          [databaseName]
        );

        await cleanupClient.query(
          `DROP DATABASE IF EXISTS "${databaseName}"`
        );

        await cleanupClient.end();
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

/**
 * Deletes the tenant database belonging to a business.
 *
 * Used when registration/provisioning fails after the
 * tenant database has already been created.
 */
export async function deleteTenantDatabaseForBusiness(
  businessId: string
): Promise<void> {
  await ensureDatabaseRegistryTable();

  const result = await postgresAdmin.query(
    `
      SELECT
        database_name
      FROM database_registry
      WHERE business_id = $1
      LIMIT 1
    `,
    [businessId]
  );

  /*
   * There is no tenant database to remove.
   */
  if ((result.rowCount ?? 0) === 0) {
    return;
  }

  const databaseName =
    result.rows[0].database_name as string;

  const adminClient = new Client({
    connectionString: getProvisioningUrl(),
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await adminClient.connect();

    /*
     * PostgreSQL will not drop a database while another
     * connection is using it.
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

  /*
   * Remove the tenant registry entry from sami_control.
   */
  await postgresAdmin.query(
    `
      DELETE FROM database_registry
      WHERE business_id = $1
    `,
    [businessId]
  );
}

/**
 * Backwards-compatible alias.
 *
 * Older code may call createTenantDatabase().
 */
export const createTenantDatabase =
  provisionTenantDatabase;