
import { Client } from "pg";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

import { queryControl } from "@/lib/db/control";
import { normalizeAppKeys } from "@/lib/sami-apps";

/**
 * ============================================================
 * SaMi Tenant Provisioning Service
 * ============================================================
 *
 * Architecture:
 *
 *                    ┌──────────────────────┐
 *                    │     SaMi Control DB  │
 *                    │                      │
 *                    │ users                │
 *                    │ tenants              │
 *                    │ subscriptions        │
 *                    │ tenant_users         │
 *                    │ tenant_modules       │
 *                    │ tenant_databases     │
 *                    │ modules              │
 *                    └──────────┬───────────┘
 *                               │
 *                               │ provision
 *                               ▼
 *                    ┌──────────────────────┐
 *                    │  Physical Tenant DB  │
 *                    │                      │
 *                    │ public schema        │
 *                    │ ├── CORE             │
 *                    │ ├── selected app 1   │
 *                    │ ├── selected app 2   │
 *                    │ └── ...              │
 *                    └──────────────────────┘
 *
 * A tenant database is registered in the control database ONLY
 * after the physical database has been successfully created
 * and initialized.
 *
 * IMPORTANT:
 * - This file is SERVER ONLY.
 * - Never import it from a Client Component.
 * - Database credentials must never be returned to the browser.
 * ============================================================
 */

export type TenantDatabaseProvisionResult = {
  databaseId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
};

type DatabaseCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
};

type ProvisionOptions = {
  /**
   * When true, an already-registered tenant database may be
   * returned instead of creating another one.
   *
   * Default: true.
   */
  reuseExisting?: boolean;
};

/**
 * PostgreSQL identifier safety.
 *
 * Database names are generated internally, but we still validate
 * them before interpolating them into CREATE/DROP DATABASE SQL.
 */
function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * PostgreSQL connection SSL configuration.
 *
 * Neon and most managed PostgreSQL deployments require SSL.
 */
function getSslConfig() {
  return {
    rejectUnauthorized:
      process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === "true",
  };
}

/**
 * Get the control/provisioning database connection string.
 *
 * Priority:
 * 1. TENANT_PROVISIONING_DATABASE_URL
 * 2. ADMIN_DATABASE_URL
 * 3. DATABASE_URL
 * 4. POSTGRES_DATABASE_URL
 * 5. Build from POSTGRES_* environment variables
 */
function getProvisioningUrl(): string {
  const connectionString =
    process.env.TENANT_PROVISIONING_DATABASE_URL ||
    process.env.ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_DATABASE_URL;

  if (connectionString) {
    return connectionString;
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

  const database =
    process.env.POSTGRES_CONTROL_DATABASE ||
    process.env.POSTGRES_DB ||
    "sami_control";

  return (
    `postgresql://${encodeURIComponent(user)}` +
    `:${encodeURIComponent(password)}` +
    `@${host}:${port}/${database}` +
    `?sslmode=require`
  );
}

/**
 * Credentials used to connect to tenant databases.
 *
 * In the current SaMi deployment model the same PostgreSQL
 * credentials may be used for all tenant databases.
 *
 * Later, dedicated per-tenant database users can be introduced
 * without changing the provisioning API.
 */
function getTenantCredentials(): DatabaseCredentials {
  const host =
    process.env.TENANT_DATABASE_HOST ||
    process.env.POSTGRES_HOST;

  const port = Number(
    process.env.TENANT_DATABASE_PORT ||
      process.env.POSTGRES_PORT ||
      5432
  );

  const user =
    process.env.TENANT_DATABASE_USER ||
    process.env.POSTGRES_ADMIN_USER;

  const password =
    process.env.TENANT_DATABASE_PASSWORD ||
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!host) {
    throw new Error("POSTGRES_HOST is not configured.");
  }

  if (!user) {
    throw new Error("POSTGRES_ADMIN_USER is not configured.");
  }

  if (!password) {
    throw new Error("POSTGRES_ADMIN_PASSWORD is not configured.");
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("POSTGRES_PORT is invalid.");
  }

  return {
    host,
    port,
    user,
    password,
  };
}

/**
 * Generate a safe, unique tenant database name.
 *
 * Example:
 *
 * sami_acme_ltd_a81f2c91
 */
function generateDatabaseName(
  businessSlug: string
): string {
  const cleanSlug =
    businessSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 45) || "tenant";

  const suffix = randomBytes(4).toString("hex");

  return `sami_${cleanSlug}_${suffix}`;
}

/**
 * Validate and normalize selected apps.
 *
 * normalizeAppKeys() is the application's central source of truth.
 */
function getValidatedApps(appKeys: unknown): string[] {
  const selectedApps = normalizeAppKeys(appKeys);

  if (selectedApps.length === 0) {
    throw new Error(
      "At least one valid SaMi app must be selected."
    );
  }

  return selectedApps;
}

/**
 * Read SaMi CORE tenant schema.
 *
 * Expected:
 *
 * lib/sami_tenant_core.sql
 */
async function readTenantCoreSchema(): Promise<string> {
  const schemaPath = path.join(
    process.cwd(),
    "lib",
    "sami_tenant_core.sql"
  );

  try {
    const sql = await fs.readFile(
      schemaPath,
      "utf8"
    );

    if (!sql.trim()) {
      throw new Error(
        "SaMi tenant CORE schema is empty."
      );
    }

    return sql;
  } catch (error) {
    throw new Error(
      `Unable to read SaMi tenant CORE schema at ${schemaPath}: ${
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
 * Expected:
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
  const safeAppKey =
    appKey.trim().toLowerCase();

  if (!/^[a-z0-9_-]+$/.test(safeAppKey)) {
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
    const sql = await fs.readFile(
      schemaPath,
      "utf8"
    );

    if (!sql.trim()) {
      throw new Error(
        `Schema for app "${safeAppKey}" is empty.`
      );
    }

    return sql;
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
 * Split SQL into statements.
 *
 * IMPORTANT:
 *
 * This intentionally supports normal migration/schema SQL,
 * but it is NOT a complete PostgreSQL SQL parser.
 *
 * For tenant schema files, avoid semicolons inside:
 * - dollar-quoted functions
 * - procedural blocks
 * - complex trigger bodies
 *
 * If SaMi later needs those, move to a proper migration runner.
 */
function splitSqlStatements(
  sql: string
): string[] {
  return sql
    .replace(/\r\n/g, "\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => {
      const withoutComments = statement
        .replace(/^\s*--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();

      return withoutComments.length > 0;
    });
}

/**
 * Execute schema SQL statement by statement.
 */
async function runSqlStatements(
  client: Client,
  sql: string,
  label: string
): Promise<void> {
  const statements =
    splitSqlStatements(sql);

  if (statements.length === 0) {
    throw new Error(
      `${label} contains no executable SQL statements.`
    );
  }

  for (
    let index = 0;
    index < statements.length;
    index++
  ) {
    const statement =
      statements[index];

    try {
      await client.query(statement);
    } catch (error) {
      throw new Error(
        `${label} failed at SQL statement ${
          index + 1
        }/${statements.length}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }
  }
}

/**
 * Create a PostgreSQL client for a tenant database.
 */
function createTenantClient(
  databaseName: string,
  credentials: DatabaseCredentials
): Client {
  return new Client({
    host: credentials.host,
    port: credentials.port,
    database: databaseName,
    user: credentials.user,
    password: credentials.password,
    ssl: getSslConfig(),
    connectionTimeoutMillis: 15_000,
    statement_timeout: 120_000,
    query_timeout: 120_000,
    application_name: "sami-tenant-provisioning",
  });
}

/**
 * Create an admin PostgreSQL client.
 */
function createAdminClient(): Client {
  return new Client({
    connectionString: getProvisioningUrl(),
    ssl: getSslConfig(),
    connectionTimeoutMillis: 15_000,
    statement_timeout: 120_000,
    query_timeout: 120_000,
    application_name: "sami-tenant-provisioning-admin",
  });
}

/**
 * Create the tenant database.
 *
 * PostgreSQL does not allow parameter placeholders for database
 * identifiers, therefore the generated identifier is validated
 * and safely quoted before interpolation.
 */
async function createPhysicalDatabase(
  databaseName: string
): Promise<boolean> {
  const client =
    createAdminClient();

  await client.connect();

  try {
    try {
      await client.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)}`
      );

      console.log(
        `[Tenant Provisioning] Created database ${databaseName}.`
      );

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        message
          .toLowerCase()
          .includes("already exists")
      ) {
        console.warn(
          `[Tenant Provisioning] Database ${databaseName} already exists.`
        );

        return false;
      }

      throw error;
    }
  } finally {
    await client.end();
  }
}

/**
 * Drop a tenant database.
 *
 * Used only during rollback/cleanup.
 */
async function dropPhysicalDatabase(
  databaseName: string
): Promise<void> {
  const client =
    createAdminClient();

  await client.connect();

  try {
    /**
     * Terminate active connections first.
     */
    await client.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName]
    );

    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(
        databaseName
      )}`
    );

    console.log(
      `[Tenant Provisioning] Removed database ${databaseName}.`
    );
  } finally {
    await client.end();
  }
}

/**
 * Verify the tenant database exists and is accessible.
 */
async function verifyTenantConnection(
  databaseName: string,
  credentials: DatabaseCredentials
): Promise<void> {
  const client =
    createTenantClient(
      databaseName,
      credentials
    );

  await client.connect();

  try {
    await client.query(
      "SELECT 1"
    );
  } finally {
    await client.end();
  }
}

/**
 * Initialize a newly-created tenant database.
 *
 * Order:
 *
 * 1. CORE
 * 2. selected application schemas
 * 3. verify installation
 */
async function initializeTenantDatabase(
  databaseName: string,
  credentials: DatabaseCredentials,
  selectedApps: string[]
): Promise<void> {
  const client =
    createTenantClient(
      databaseName,
      credentials
    );

  await client.connect();

  try {
    /**
     * --------------------------------------------------------
     * 1. CORE
     * --------------------------------------------------------
     */
    const coreSchema =
      await readTenantCoreSchema();

    console.log(
      `[Tenant Provisioning] Installing CORE into ${databaseName}...`
    );

    await runSqlStatements(
      client,
      coreSchema,
      "SaMi CORE schema"
    );

    console.log(
      `[Tenant Provisioning] CORE installed successfully.`
    );

    /**
     * --------------------------------------------------------
     * 2. SELECTED APPLICATIONS
     * --------------------------------------------------------
     */
    for (const appKey of selectedApps) {
      const normalizedAppKey =
        appKey.trim().toLowerCase();

      const appSchema =
        await readAppSchema(
          normalizedAppKey
        );

      console.log(
        `[Tenant Provisioning] Installing ${normalizedAppKey}...`
      );

      await runSqlStatements(
        client,
        appSchema,
        `App "${normalizedAppKey}" schema`
      );

      console.log(
        `[Tenant Provisioning] ${normalizedAppKey} installed successfully.`
      );
    }

    /**
     * --------------------------------------------------------
     * 3. VERIFY
     * --------------------------------------------------------
     */
    const tableResult =
      await client.query(`
        SELECT COUNT(*)::INTEGER AS table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `);

    const tableCount =
      Number(
        tableResult.rows[0]?.table_count ?? 0
      );

    if (tableCount <= 0) {
      throw new Error(
        `Tenant database "${databaseName}" contains no public tables after provisioning.`
      );
    }

    /**
     * Verify that the database is actually queryable.
     */
    await client.query(
      "SELECT NOW() AS database_time"
    );

    console.log(
      `[Tenant Provisioning] ${databaseName} contains ${tableCount} public tables.`
    );
  } finally {
    await client.end();
  }
}

/**
 * Ensure the control database has a tenant database registry.
 *
 * This is useful during development/bootstrap.
 *
 * In a mature production deployment this should normally be
 * managed by a versioned control-db migration instead of
 * CREATE TABLE IF NOT EXISTS at runtime.
 */
export async function ensureTenantDatabaseRegistry(): Promise<void> {
  await queryControl(`
    CREATE TABLE IF NOT EXISTS tenant_databases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      tenant_id UUID NOT NULL
        REFERENCES tenants(id)
        ON DELETE CASCADE,

      provider VARCHAR(50) NOT NULL DEFAULT 'postgresql',

      region VARCHAR(100),

      database_identifier VARCHAR(255) NOT NULL,

      database_name VARCHAR(255) NOT NULL UNIQUE,

      database_host VARCHAR(255) NOT NULL,

      database_port INTEGER NOT NULL DEFAULT 5432,

      status VARCHAR(50) NOT NULL DEFAULT 'provisioning',

      provisioned_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE (tenant_id)
    )
  `);

  await queryControl(`
    CREATE INDEX IF NOT EXISTS
    idx_tenant_databases_tenant_id
    ON tenant_databases(tenant_id)
  `);

  await queryControl(`
    CREATE INDEX IF NOT EXISTS
    idx_tenant_databases_status
    ON tenant_databases(status)
  `);
}

/**
 * Return an existing active tenant database if one exists.
 *
 * This prevents accidental creation of multiple databases for
 * the same tenant.
 */
async function getExistingTenantDatabase(
  tenantId: string
): Promise<TenantDatabaseProvisionResult | null> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          database_name,
          database_host,
          database_port
        FROM tenant_databases
        WHERE tenant_id = $1
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId]
    );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    databaseId: String(row.id),
    databaseName: String(
      row.database_name
    ),
    databaseHost: String(
      row.database_host
    ),
    databasePort: Number(
      row.database_port
    ),
  };
}

/**
 * Mark a tenant database as provisioning.
 */
async function markTenantDatabaseProvisioning(
  tenantId: string,
  databaseName: string,
  credentials: DatabaseCredentials
): Promise<void> {
  await queryControl(
    `
      INSERT INTO tenant_databases (
        tenant_id,
        provider,
        region,
        database_identifier,
        database_name,
        database_host,
        database_port,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'postgresql',
        $2,
        $3,
        $4,
        $5,
        $6,
        'provisioning',
        NOW(),
        NOW()
      )
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        provider = EXCLUDED.provider,
        region = EXCLUDED.region,
        database_identifier = EXCLUDED.database_identifier,
        database_name = EXCLUDED.database_name,
        database_host = EXCLUDED.database_host,
        database_port = EXCLUDED.database_port,
        status = 'provisioning',
        updated_at = NOW()
    `,
    [
      tenantId,
      process.env.POSTGRES_REGION ||
        process.env.NEON_REGION ||
        null,
      databaseName,
      databaseName,
      credentials.host,
      credentials.port,
    ]
  );
}

/**
 * Mark tenant database as active.
 */
async function markTenantDatabaseActive(
  tenantId: string
): Promise<string> {
  const result =
    await queryControl(
      `
        UPDATE tenant_databases
        SET
          status = 'active',
          provisioned_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
        RETURNING id
      `,
      [tenantId]
    );

  if (result.rows.length === 0) {
    throw new Error(
      `Tenant database registry entry for tenant ${tenantId} could not be activated.`
    );
  }

  return String(
    result.rows[0].id
  );
}

/**
 * Mark tenant database provisioning as failed.
 */
async function markTenantDatabaseFailed(
  tenantId: string
): Promise<void> {
  try {
    await queryControl(
      `
        UPDATE tenant_databases
        SET
          status = 'failed',
          updated_at = NOW()
        WHERE tenant_id = $1
      `,
      [tenantId]
    );
  } catch (error) {
    console.error(
      `[Tenant Provisioning] Failed to mark tenant ${tenantId} database as failed:`,
      error
    );
  }
}

/**
 * Update the control-plane tenant status.
 */
async function updateTenantStatus(
  tenantId: string,
  status: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenants
      SET
        status = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [tenantId, status]
  );
}

/**
 * Register selected modules in the control database.
 *
 * This does NOT install SQL.
 *
 * SQL installation happens inside the physical tenant database.
 */
async function registerTenantModules(
  tenantId: string,
  selectedApps: string[]
): Promise<void> {
  for (const appKey of selectedApps) {
    const moduleResult =
      await queryControl(
        `
          SELECT id
          FROM modules
          WHERE key = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [appKey]
      );

    if (moduleResult.rows.length === 0) {
      throw new Error(
        `Module "${appKey}" does not exist in the control database.`
      );
    }

    await queryControl(
      `
        INSERT INTO tenant_modules (
          tenant_id,
          module_id,
          status,
          installed_at
        )
        VALUES (
          $1,
          $2,
          'installed',
          NOW()
        )
        ON CONFLICT (tenant_id, module_id)
        DO UPDATE SET
          status = 'installed',
          installed_at = NOW()
      `,
      [
        tenantId,
        moduleResult.rows[0].id,
      ]
    );
  }
}

/**
 * Remove module registrations during rollback.
 */
async function removeTenantModules(
  tenantId: string
): Promise<void> {
  try {
    await queryControl(
      `
        DELETE FROM tenant_modules
        WHERE tenant_id = $1
      `,
      [tenantId]
    );
  } catch (error) {
    console.error(
      `[Tenant Provisioning] Failed to remove module registrations for ${tenantId}:`,
      error
    );
  }
}

/**
 * ============================================================
 * MAIN PROVISIONING FUNCTION
 * ============================================================
 *
 * This is the function your registration route should call:
 *
 * await provisionTenant(tenantId, selectedApps)
 *
 * Process:
 *
 * 1. Validate tenant
 * 2. Validate selected apps
 * 3. Reuse active database if present
 * 4. Generate physical database name
 * 5. Register database as provisioning
 * 6. CREATE DATABASE
 * 7. Install CORE
 * 8. Install selected apps
 * 9. Verify database
 * 10. Register selected modules
 * 11. Mark database active
 * 12. Mark tenant active
 */
export async function provisionTenant(
  tenantId: string,
  selectedAppsInput: unknown,
  options: ProvisionOptions = {}
): Promise<{
  success: true;
  tenantId: string;
  database: TenantDatabaseProvisionResult;
  appsInstalled: string[];
}> {
  const reuseExisting =
    options.reuseExisting ?? true;

  /**
   * ----------------------------------------------------------
   * 1. Validate tenant
   * ----------------------------------------------------------
   */
  const tenantResult =
    await queryControl(
      `
        SELECT
          id,
          name,
          slug,
          status
        FROM tenants
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId]
    );

  if (tenantResult.rows.length === 0) {
    throw new Error(
      `Tenant ${tenantId} not found.`
    );
  }

  const tenant =
    tenantResult.rows[0];

  /**
   * ----------------------------------------------------------
   * 2. Validate applications
   * ----------------------------------------------------------
   */
  const selectedApps =
    getValidatedApps(
      selectedAppsInput
    );

  /**
   * ----------------------------------------------------------
   * 3. Ensure registry exists
   * ----------------------------------------------------------
   */
  await ensureTenantDatabaseRegistry();

  /**
   * ----------------------------------------------------------
   * 4. Reuse an already-active database
   * ----------------------------------------------------------
   */
  if (reuseExisting) {
    const existing =
      await getExistingTenantDatabase(
        tenantId
      );

    if (existing) {
      console.log(
        `[Tenant Provisioning] Tenant ${tenantId} already has database ${existing.databaseName}.`
      );

      return {
        success: true,
        tenantId,
        database: existing,
        appsInstalled: selectedApps,
      };
    }
  }

  const credentials =
    getTenantCredentials();

  const databaseName =
    generateDatabaseName(
      tenant.slug || tenant.name
    );

  let databaseCreated =
    false;

  try {
    /**
     * --------------------------------------------------------
     * 5. Mark tenant provisioning
     * --------------------------------------------------------
     */
    await updateTenantStatus(
      tenantId,
      "provisioning"
    );

    /**
     * --------------------------------------------------------
     * 6. Register DB as provisioning
     * --------------------------------------------------------
     */
    await markTenantDatabaseProvisioning(
      tenantId,
      databaseName,
      credentials
    );

    /**
     * --------------------------------------------------------
     * 7. Create physical PostgreSQL database
     * --------------------------------------------------------
     */
    databaseCreated =
      await createPhysicalDatabase(
        databaseName
      );

    /**
     * --------------------------------------------------------
     * 8. Verify connection
     * --------------------------------------------------------
     */
    await verifyTenantConnection(
      databaseName,
      credentials
    );

    /**
     * --------------------------------------------------------
     * 9. Install CORE + selected applications
     * --------------------------------------------------------
     */
    await initializeTenantDatabase(
      databaseName,
      credentials,
      selectedApps
    );

    /**
     * --------------------------------------------------------
     * 10. Register modules in control DB
     * --------------------------------------------------------
     */
    await registerTenantModules(
      tenantId,
      selectedApps
    );

    /**
     * --------------------------------------------------------
     * 11. Mark tenant DB active
     * --------------------------------------------------------
     */
    const databaseId =
      await markTenantDatabaseActive(
        tenantId
      );

    /**
     * --------------------------------------------------------
     * 12. Mark tenant active
     * --------------------------------------------------------
     */
    await updateTenantStatus(
      tenantId,
      "active"
    );

    const result: TenantDatabaseProvisionResult =
      {
        databaseId,
        databaseName,
        databaseHost:
          credentials.host,
        databasePort:
          credentials.port,
      };

    console.log(
      `[Tenant Provisioning] Tenant ${tenantId} provisioned successfully. Database=${databaseName}, Apps=${selectedApps.join(", ")}`
    );

    return {
      success: true,
      tenantId,
      database: result,
      appsInstalled: selectedApps,
    };
  } catch (error) {
    console.error(
      `[Tenant Provisioning] Provisioning failed for tenant ${tenantId}:`,
      error
    );

    /**
     * --------------------------------------------------------
     * Rollback control-plane module registrations
     * --------------------------------------------------------
     */
    await removeTenantModules(
      tenantId
    );

    /**
     * --------------------------------------------------------
     * Mark registry failed
     * --------------------------------------------------------
     */
    await markTenantDatabaseFailed(
      tenantId
    );

    /**
     * --------------------------------------------------------
     * Mark tenant failed
     * --------------------------------------------------------
     */
    try {
      await updateTenantStatus(
        tenantId,
        "provisioning_failed"
      );
    } catch (statusError) {
      console.error(
        `[Tenant Provisioning] Failed to update tenant ${tenantId} status:`,
        statusError
      );
    }

    /**
     * --------------------------------------------------------
     * Physical DB rollback
     * --------------------------------------------------------
     *
     * Only drop the DB if THIS invocation created it.
     *
     * If CREATE DATABASE reported "already exists", we don't
     * destroy an existing database that may belong to another
     * process or previous deployment.
     */
    if (databaseCreated) {
      try {
        await dropPhysicalDatabase(
          databaseName
        );
      } catch (cleanupError) {
        console.error(
          `[Tenant Provisioning] Failed to clean up database ${databaseName}:`,
          cleanupError
        );
      }
    }

    throw error;
  }
}

/**
 * ============================================================
 * EXPLICIT DATABASE PROVISIONING API
 * ============================================================
 *
 * Useful when you want to provision a tenant database without
 * changing tenant lifecycle state yourself.
 */
export async function provisionTenantDatabase(
  tenantId: string,
  businessSlug: string,
  appKeys: unknown
): Promise<TenantDatabaseProvisionResult> {
  /**
   * The current SaMi registration flow uses tenantId as the
   * canonical tenant identifier.
   *
   * businessSlug is retained for compatibility with older
   * provisioning callers.
   */
  void businessSlug;

  const result =
    await provisionTenant(
      tenantId,
      appKeys
    );

  return result.database;
}

/**
 * ============================================================
 * DELETE TENANT DATABASE
 * ============================================================
 *
 * This is intentionally explicit and server-side only.
 *
 * It:
 *
 * 1. Finds the physical DB
 * 2. Drops it
 * 3. Removes its registry record
 *
 * It does NOT delete the tenant itself.
 */
export async function deleteTenantDatabase(
  tenantId: string
): Promise<void> {
  await ensureTenantDatabaseRegistry();

  const result =
    await queryControl(
      `
        SELECT
          database_name
        FROM tenant_databases
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId]
    );

  if (result.rows.length === 0) {
    return;
  }

  const databaseName =
    String(
      result.rows[0].database_name
    );

  try {
    await dropPhysicalDatabase(
      databaseName
    );
  } finally {
    await queryControl(
      `
        DELETE FROM tenant_databases
        WHERE tenant_id = $1
      `,
      [tenantId]
    );
  }
}

/**
 ============================================================
 * BACKWARDS-COMPATIBILITY ALIASES
 * ============================================================
 *
 * Existing code may still import:
 *
 * createTenantDatabase
 * deleteTenantDatabaseForBusiness
 *
 * Keep these aliases temporarily so old routes don't break
 * while the application is migrated to the new service API.
 */
export async function createTenantDatabase(
  tenantId: string,
  businessName: string,
  selectedApps: unknown = []
): Promise<TenantDatabaseProvisionResult> {
  return provisionTenantDatabase(
    tenantId,
    businessName,
    selectedApps
  );
}

export async function deleteTenantDatabaseForBusiness(
  tenantId: string
): Promise<void> {
  return deleteTenantDatabase(
    tenantId
  );
}