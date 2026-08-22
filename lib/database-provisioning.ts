import { randomBytes } from "crypto";
import { Client } from "pg";
import fs from "fs/promises";
import path from "path";

import { postgresAdmin } from "./postgres-admin";
import { normalizeAppKeys } from "./sami-apps";

// ✅ ADD THIS FUNCTION HERE (line 10-25)
/**
 * Run multiple SQL statements one by one
 */
async function runMultipleStatements(
  client: Client, 
  sql: string
): Promise<void> {
  // Split by semicolon (;) and clean up
  const statements = sql
    .split(';')                    // Split into parts
    .map(s => s.trim())            // Remove extra spaces
    .filter(s => s.length > 0);    // Remove empty parts

  // Run each statement individually
  for (const statement of statements) {
    // Skip comments
    if (statement.startsWith('--') || statement.startsWith('/*')) {
      continue;
    }
    
    await client.query(statement);
  }
}

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
    throw new Error("POSTGRES_HOST is not configured.");
  }

  if (!user) {
    throw new Error("POSTGRES_ADMIN_USER is not configured.");
  }

  if (!password) {
    throw new Error("POSTGRES_ADMIN_PASSWORD is not configured.");
  }

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
   * We intentionally use the existing PostgreSQL credentials
   * when dedicated tenant credentials are not configured.
   *
   * This is appropriate for the current SaMi deployment model,
   * where Vercel is being used for deployment/testing.
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

/**
 * Read the SaMi tenant CORE schema.
 *
 * This schema MUST be installed in every tenant database.
 */
async function readTenantCoreSchema(): Promise<string> {
  const schemaPath = path.join(
    process.cwd(),
    "lib",
    "sami_tenant_core.sql"
  );

  try {
    return await fs.readFile(
      schemaPath,
      "utf8"
    );
  } catch (error) {
    throw new Error(
      `Unable to read SaMi tenant core schema at ${schemaPath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

/**
 * Read an application's tenant schema.
 *
 * Expected structure:
 *
 * lib/
 *   apps/
 *     accounting/
 *       schema.sql
 *     invoicing/
 *       schema.sql
 *     expenses/
 *       schema.sql
 */
async function readAppSchema(
  appKey: string
): Promise<string> {
  const safeAppKey = appKey
    .trim()
    .toLowerCase();

  if (
    !/^[a-z0-9_-]+$/.test(
      safeAppKey
    )
  ) {
    throw new Error(
      `Invalid app key "${appKey}".`
    );
  }

  const schemaPath = path.join(
    process.cwd(),
    "lib",
    "apps",
    safeAppKey,
    "schema.sql"
  );

  try {
    return await fs.readFile(
      schemaPath,
      "utf8"
    );
  } catch (error) {
    throw new Error(
      `Unable to read schema for app "${safeAppKey}" at ${schemaPath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

/**
 * Connect directly to a newly-created tenant database.
 */
function createTenantClient(
  databaseName: string,
  databaseHost: string,
  databasePort: number,
  databaseUser: string,
  databasePassword: string
): Client {
  return new Client({
    host: databaseHost,
    port: databasePort,
    database: databaseName,
    user: databaseUser,
    password: databasePassword,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Install the CORE schema and all selected app schemas
 * into the newly-created tenant database.
 */
async function initializeTenantDatabase(
  databaseName: string,
  databaseHost: string,
  databasePort: number,
  databaseUser: string,
  databasePassword: string,
  appKeys: unknown
): Promise<void> {
  const selectedApps =
    normalizeAppKeys(appKeys);

  const tenantClient =
    createTenantClient(
      databaseName,
      databaseHost,
      databasePort,
      databaseUser,
      databasePassword
    );

  await tenantClient.connect();

  try {
    /*
     * ---------------------------------------------------------
     * 1. INSTALL CORE
     * ---------------------------------------------------------
     *
     * CORE is mandatory for every SaMi tenant.
     */
    const coreSchema =
      await readTenantCoreSchema();

    if (!coreSchema.trim()) {
      throw new Error(
        "SaMi tenant core schema is empty."
      );
    }

    console.log(
      `[Tenant Provisioning] Installing CORE schema into ${databaseName}...`
    );

    await runMultipleStatements(tenantClient, coreSchema);

    console.log(
      `[Tenant Provisioning] CORE schema installed successfully.`
    );

    /*
     * ---------------------------------------------------------
     * 2. INSTALL SELECTED APP SCHEMAS
     * ---------------------------------------------------------
     *
     * Each selected app gets its own schema.sql.
     *
     * Example:
     *
     * accounting → lib/apps/accounting/schema.sql
     * invoicing  → lib/apps/invoicing/schema.sql
     * expenses   → lib/apps/expenses/schema.sql
     */
    for (const appKey of selectedApps) {
      const normalizedAppKey =
        appKey.trim().toLowerCase();

      console.log(
        `[Tenant Provisioning] Installing ${normalizedAppKey} schema...`
      );

      const appSchema =
        await readAppSchema(
          normalizedAppKey
        );

      if (!appSchema.trim()) {
        throw new Error(
          `Schema for app "${normalizedAppKey}" is empty.`
        );
      }

      await runMultipleStatements(tenantClient, appSchema);

      console.log(
        `[Tenant Provisioning] ${normalizedAppKey} schema installed successfully.`
      );
    }

    /*
     * ---------------------------------------------------------
     * 3. VERIFY CORE
     * ---------------------------------------------------------
     *
     * We don't just assume the SQL worked.
     * Verify that the tenant has tables.
     */
    const tableCheck =
      await tenantClient.query(`
        SELECT COUNT(*)::INTEGER AS table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `);

    const tableCount =
      Number(
        tableCheck.rows[0]?.table_count ?? 0
      );

    if (tableCount === 0) {
      throw new Error(
        `Tenant database "${databaseName}" was created but no tables were installed.`
      );
    }

    console.log(
      `[Tenant Provisioning] ${databaseName} now contains ${tableCount} public tables.`
    );
  } finally {
    await tenantClient.end();
  }
}

/**
 * Create and initialize an isolated tenant database.
 *
 * Every tenant receives:
 *
 * 1. SaMi CORE schema
 * 2. Schema for every selected app
 *
 * The tenant database is only registered in sami_control
 * after successful schema installation.
 */
export async function provisionTenantDatabase(
  businessId: string,
  businessSlug: string,
  appKeys: unknown
): Promise<TenantDatabaseProvisionResult> {
  await ensureDatabaseRegistryTable();

  /*
   * Normalize and validate selected applications
   * before creating the physical database.
   */
  const selectedApps =
    normalizeAppKeys(appKeys);

  if (selectedApps.length === 0) {
    throw new Error(
      "At least one business app must be selected."
    );
  }

  /*
   * Check whether this business already has an active
   * tenant database.
   */
  const existing =
    await postgresAdmin.query(
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
    const row =
      existing.rows[0];

    return {
      databaseId:
        row.id as string,
      databaseName:
        row.database_name as string,
      databaseHost:
        row.database_host as string,
      databasePort:
        Number(row.database_port),
      databaseUser:
        row.database_user as string,
      databasePassword:
        row.database_password_encrypted as string,
    };
  }

  const {
    databaseUser,
    databasePassword,
    databaseHost,
    databasePort,
  } =
    getTenantCredentials();

  const databaseName =
    generateDatabaseName(
      businessSlug
    );

  /*
   * ---------------------------------------------------------
   * CREATE PHYSICAL DATABASE
   * ---------------------------------------------------------
   */
  const adminClient =
    new Client({
      connectionString:
        getProvisioningUrl(),
      ssl: {
        rejectUnauthorized: false,
      },
    });

  let databaseCreated =
    false;

  await adminClient.connect();

  try {
    await adminClient.query(
      `CREATE DATABASE "${databaseName}"`
    );

    databaseCreated = true;

    console.log(
      `[Tenant Provisioning] Created database ${databaseName}.`
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    /*
     * Normally this should not happen because the generated
     * database name contains a random suffix.
     */
    if (
      !message
        .toLowerCase()
        .includes("already exists")
    ) {
      throw error;
    }

    /*
     * If it already exists, we still continue and initialize it.
     */
    console.log(
      `[Tenant Provisioning] Database ${databaseName} already exists.`
    );
  } finally {
    await adminClient.end();
  }

  /*
   * ---------------------------------------------------------
   * INITIALIZE TENANT DATABASE
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This happens BEFORE database_registry is written.
   *
   * Therefore a database cannot be considered a valid
   * tenant until CORE + selected app schemas exist.
   */
  try {
    await initializeTenantDatabase(
      databaseName,
      databaseHost,
      databasePort,
      databaseUser,
      databasePassword,
      selectedApps
    );

    /*
     * -------------------------------------------------------
     * REGISTER TENANT DATABASE IN sami_control
     * -------------------------------------------------------
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

    if (
      (registry.rowCount ?? 0) === 0
    ) {
      throw new Error(
        "Tenant database registry entry could not be created."
      );
    }

    console.log(
      `[Tenant Provisioning] Tenant ${databaseName} registered successfully.`
    );

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
     * -------------------------------------------------------
     * CLEANUP
     * -------------------------------------------------------
     *
     * If anything fails after CREATE DATABASE:
     *
     * - schema installation
     * - connection
     * - schema SQL
     * - verification
     * - registry insertion
     *
     * remove the physical tenant database.
     */
    if (databaseCreated) {
      try {
        const cleanupClient =
          new Client({
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

        console.log(
          `[Tenant Provisioning] Removed failed tenant database ${databaseName}.`
        );
      } catch (cleanupError) {
        console.error(
          "[Tenant Provisioning] Failed to clean up tenant database:",
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
 * tenant database has already been created and registered.
 */
export async function deleteTenantDatabaseForBusiness(
  businessId: string
): Promise<void> {
  await ensureDatabaseRegistryTable();

  const result =
    await postgresAdmin.query(
      `
        SELECT
          database_name
        FROM database_registry
        WHERE business_id = $1
        LIMIT 1
      `,
      [businessId]
    );

  if (
    (result.rowCount ?? 0) === 0
  ) {
    return;
  }

  const databaseName =
    result.rows[0]
      .database_name as string;

  const adminClient =
    new Client({
      connectionString:
        getProvisioningUrl(),
      ssl: {
        rejectUnauthorized: false,
      },
    });

  try {
    await adminClient.connect();

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