import { queryControl } from '@/lib/db/control';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

interface TenantDatabaseProvisionResult {
  databaseId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
}

interface AppInstallResult {
  appKey: string;
  success: boolean;
  error?: string;
}

interface TenantDatabaseInfo {
  databaseName: string;
  host: string;
  port: number;
}

/**
 * ================================================================
 * SaMi Tenant Database Provisioning
 * ================================================================
 *
 * ARCHITECTURE
 *
 * sami_control
 *    |
 *    +---- tenant A -> sami_company_a_xxxxxxxx
 *    |
 *    +---- tenant B -> sami_company_b_xxxxxxxx
 *    |
 *    +---- tenant C -> sami_company_c_xxxxxxxx
 *
 * Each tenant receives a PHYSICAL PostgreSQL DATABASE.
 *
 * Tenant databases use their own "public" schema.
 *
 * IMPORTANT:
 * - sami_control is NEVER used to store tenant application tables.
 * - tenant_databases in sami_control is ONLY a registry.
 * - CREATE DATABASE is executed against the PostgreSQL ADMIN database.
 * - Tenant schemas are installed after connecting directly to the
 *   newly-created tenant database.
 * ================================================================
 */

const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_ADMIN_DATABASE = 'postgres';
const DEFAULT_REGION = 'us-east-1';
const CORE_SCHEMA_VERSION = '1.0.0';

/**
 * Get PostgreSQL configuration.
 */
function getPostgresConfig() {
  const host = process.env.POSTGRES_HOST;
  const user = process.env.POSTGRES_ADMIN_USER;
  const password = process.env.POSTGRES_ADMIN_PASSWORD;

  if (!host) {
    throw new Error('POSTGRES_HOST is not configured.');
  }

  if (!user) {
    throw new Error('POSTGRES_ADMIN_USER is not configured.');
  }

  if (!password) {
    throw new Error('POSTGRES_ADMIN_PASSWORD is not configured.');
  }

  const port = Number.parseInt(
    process.env.POSTGRES_PORT || String(DEFAULT_POSTGRES_PORT),
    10,
  );

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('POSTGRES_PORT is invalid.');
  }

  /**
   * IMPORTANT:
   *
   * Do NOT use POSTGRES_DB here.
   *
   * POSTGRES_DB may point to sami_control.
   *
   * Database creation must happen from a separate administrative
   * database, normally "postgres".
   */
  const adminDatabase =
    process.env.POSTGRES_ADMIN_DATABASE ||
    DEFAULT_ADMIN_DATABASE;

  return {
    host,
    port,
    user,
    password,
    adminDatabase,
  };
}

/**
 * Quote a PostgreSQL identifier safely.
 *
 * Database names cannot be passed as normal query parameters.
 * Therefore identifiers must be safely quoted.
 */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Generate a safe physical database name.
 *
 * Example:
 *
 * Acme Corporation
 * tenant UUID: 8b9c1d23-....
 *
 * becomes:
 *
 * sami_acme_corporation_8b9c1d23
 */
function generateDatabaseName(
  tenantId: string,
  tenantName: string,
): string {
  const cleanTenantName = tenantName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  const safeName =
    cleanTenantName || 'tenant';

  const tenantSuffix = tenantId
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)
    .toLowerCase();

  return `sami_${safeName}_${tenantSuffix}`;
}

/**
 * Create a PostgreSQL client connected to the ADMIN database.
 *
 * This connection is used ONLY for:
 * - checking whether a database exists
 * - CREATE DATABASE
 * - DROP DATABASE
 * - terminating connections
 *
 * It is NOT used for tenant application data.
 */
function createAdminClient(): Client {
  const config = getPostgresConfig();

  return new Client({
    host: config.host,
    port: config.port,
    database: config.adminDatabase,
    user: config.user,
    password: config.password,

    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

/**
 * Create a client connected directly to a tenant database.
 */
function createTenantClient(databaseName: string): Client {
  const config = getPostgresConfig();

  return new Client({
    host: config.host,
    port: config.port,
    database: databaseName,
    user: config.user,
    password: config.password,

    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

/**
 * Execute SQL file against a tenant database.
 *
 * The SQL is installed into the tenant database's PUBLIC schema.
 *
 * This does NOT create a schema inside sami_control.
 */
async function executeTenantSqlFile(
  databaseName: string,
  sqlFilePath: string,
): Promise<void> {
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(
      `SQL schema file not found: ${sqlFilePath}`,
    );
  }

  let sql = fs.readFileSync(
    sqlFilePath,
    'utf8',
  );

  if (!sql.trim()) {
    throw new Error(
      `SQL schema file is empty: ${sqlFilePath}`,
    );
  }

  /**
   * Tenant schemas may use {schema}.
   *
   * Because we are connecting directly to the tenant database,
   * the tenant's application tables belong in PUBLIC.
   */
  sql = sql.replace(/\{schema\}/g, 'public');

  const tenantClient =
    createTenantClient(databaseName);

  await tenantClient.connect();

  try {
    /**
     * Execute the SQL file as one PostgreSQL command.
     *
     * This is preferable to simply splitting on semicolons,
     * because PostgreSQL functions, triggers, DO blocks, etc.
     * can themselves contain semicolons.
     */
    await tenantClient.query(sql);

    console.log(
      `[SaMi] SQL installed successfully in database "${databaseName}".`,
    );
  } finally {
    await tenantClient.end();
  }
}

/**
 * ================================================================
 * CREATE PHYSICAL TENANT DATABASE
 * ================================================================
 */
async function createTenantDatabase(
  tenantId: string,
  tenantName: string,
): Promise<TenantDatabaseInfo> {
  const config = getPostgresConfig();

  const databaseName = generateDatabaseName(
    tenantId,
    tenantName,
  );

  const adminClient =
    createAdminClient();

  await adminClient.connect();

  try {
    /**
     * Check whether the physical database already exists.
     */
    const existingDatabase =
      await adminClient.query(
        `
          SELECT
            datname
          FROM pg_database
          WHERE datname = $1
          LIMIT 1
        `,
        [databaseName],
      );

    if (existingDatabase.rows.length === 0) {
      /**
       * PostgreSQL does not allow a database name to be passed
       * through $1, so safely quote the identifier.
       */
      const quotedDatabaseName =
        quoteIdentifier(databaseName);

      await adminClient.query(
        `CREATE DATABASE ${quotedDatabaseName}`,
      );

      console.log(
        `[SaMi] ✅ Physical tenant database created: ${databaseName}`,
      );
    } else {
      console.log(
        `[SaMi] Tenant database already exists: ${databaseName}`,
      );
    }

    /**
     * Verify the database really exists after CREATE DATABASE.
     */
    const verifyResult =
      await adminClient.query(
        `
          SELECT
            datname
          FROM pg_database
          WHERE datname = $1
          LIMIT 1
        `,
        [databaseName],
      );

    if (verifyResult.rows.length === 0) {
      throw new Error(
        `Tenant database "${databaseName}" could not be verified after creation.`,
      );
    }

    return {
      databaseName,
      host: config.host,
      port: config.port,
    };
  } finally {
    await adminClient.end();
  }
}

/**
 * ================================================================
 * INSTALL CORE TENANT DATABASE
 * ================================================================
 */
async function installCoreSchema(
  databaseName: string,
): Promise<void> {
  const coreSchemaPath = path.join(
    process.cwd(),
    'lib',
    'schema',
    'tenant-core.sql',
  );

  console.log(
    `[SaMi] Installing core schema into tenant database "${databaseName}"...`,
  );

  await executeTenantSqlFile(
    databaseName,
    coreSchemaPath,
  );

  console.log(
    `[SaMi] ✅ Core schema installed in "${databaseName}".`,
  );
}

/**
 * ================================================================
 * INSTALL APP DATABASE
 * ================================================================
 */
async function installAppSchema(
  databaseName: string,
  appKey: string,
): Promise<AppInstallResult> {
  const normalizedAppKey =
    appKey.trim().toLowerCase();

  const appSchemaPath = path.join(
    process.cwd(),
    'lib',
    'apps',
    normalizedAppKey,
    'schema.sql',
  );

  try {
    if (!fs.existsSync(appSchemaPath)) {
      return {
        appKey: normalizedAppKey,
        success: false,
        error:
          `Schema file not found for app "${normalizedAppKey}" at ${appSchemaPath}`,
      };
    }

    console.log(
      `[SaMi] Installing app "${normalizedAppKey}" into "${databaseName}"...`,
    );

    await executeTenantSqlFile(
      databaseName,
      appSchemaPath,
    );

    console.log(
      `[SaMi] ✅ App "${normalizedAppKey}" installed in "${databaseName}".`,
    );

    return {
      appKey: normalizedAppKey,
      success: true,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `[SaMi] ❌ App "${normalizedAppKey}" installation failed:`,
      message,
    );

    return {
      appKey: normalizedAppKey,
      success: false,
      error: message,
    };
  }
}

/**
 * ================================================================
 * VALIDATE SELECTED APPS
 * ================================================================
 */
function getValidatedApps(
  appKeys: unknown,
): string[] {
  if (!Array.isArray(appKeys)) {
    throw new Error(
      'At least one valid SaMi app must be selected.',
    );
  }

  const selectedApps = [
    ...new Set(
      appKeys
        .filter(
          (key): key is string =>
            typeof key === 'string',
        )
        .map((key) =>
          key.trim().toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];

  if (selectedApps.length === 0) {
    throw new Error(
      'At least one valid SaMi app must be selected.',
    );
  }

  return selectedApps;
}

/**
 * ================================================================
 * REGISTER PHYSICAL DATABASE IN CONTROL DATABASE
 * ================================================================
 *
 * IMPORTANT:
 *
 * This function does NOT create a database.
 *
 * It only records where the tenant database is located.
 *
 * sami_control.tenant_databases
 *        |
 *        +--> database_name = sami_acme_xxxxx
 *        +--> database_host = ...
 *        +--> database_port = 5432
 *
 * The actual tenant tables are NOT stored here.
 */
async function registerTenantDatabase(
  tenantId: string,
  databaseName: string,
  host: string,
  port: number,
): Promise<string> {
  const region =
    process.env.POSTGRES_REGION ||
    DEFAULT_REGION;

  const result = await queryControl(
    `
      INSERT INTO tenant_databases (
        tenant_id,
        provider,
        region,
        database_identifier,
        database_name,
        database_host,
        database_port,
        schema_version,
        status,
        provisioned_at,
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
        $7,
        'active',
        NOW(),
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
        schema_version = EXCLUDED.schema_version,
        status = 'active',
        provisioned_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `,
    [
      tenantId,

      region,

      /**
       * IMPORTANT:
       *
       * The identifier is the REAL physical database name.
       */
      databaseName,

      databaseName,
      host,
      port,
      CORE_SCHEMA_VERSION,
    ],
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Failed to register tenant database for tenant ${tenantId}.`,
    );
  }

  return String(result.rows[0].id);
}

/**
 * ================================================================
 * UPDATE TENANT MODULE STATUS
 * ================================================================
 */
async function updateTenantModuleStatus(
  tenantId: string,
  appKey: string,
  success: boolean,
): Promise<void> {
  if (success) {
    await queryControl(
      `
        UPDATE tenant_modules
        SET status = 'installed', installed_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1
        AND module_id = (SELECT id FROM modules WHERE key = $2 AND deleted_at IS NULL)
      `,
      [tenantId, appKey]
    );
  } else {
    await queryControl(
      `
        UPDATE tenant_modules
        SET status = 'failed', updated_at = NOW()
        WHERE tenant_id = $1
        AND module_id = (SELECT id FROM modules WHERE key = $2 AND deleted_at IS NULL)
      `,
      [tenantId, appKey]
    );
  }
}

/**
 * ================================================================
 * PROVISION TENANT
 * ================================================================
 *
 * Creates:
 *
 *   PostgreSQL database
 *        ↓
 *   sami_<tenant>_<id>
 *        ↓
 *   public schema
 *        ↓
 *   tenant-core.sql
 *        ↓
 *   selected app schemas
 *
 * The control database is NEVER used for tenant tables.
 */
export async function provisionTenant(
  tenantId: string,
  selectedAppsInput: unknown,
): Promise<{
  success: boolean;
  tenantId: string;
  databaseId?: string;
  databaseName?: string;
  databaseHost?: string;
  databasePort?: number;
  appsInstalled: string[];
  appsFailed: AppInstallResult[];
}> {
  console.log(
    `[SaMi] ========================================`,
  );

  console.log(
    `[SaMi] Starting tenant database provisioning`,
  );

  console.log(
    `[SaMi] Tenant ID: ${tenantId}`,
  );

  console.log(
    `[SaMi] ========================================`,
  );

  let databaseName: string | undefined;

  try {
    // ============================================================
    // 1. Validate tenant in CONTROL database
    // ============================================================

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
        [tenantId],
      );

    if (tenantResult.rows.length === 0) {
      throw new Error(
        `Tenant ${tenantId} not found.`,
      );
    }

    const tenant =
      tenantResult.rows[0];

    const selectedApps =
      getValidatedApps(
        selectedAppsInput,
      );

    console.log(
      `[SaMi] Tenant: ${tenant.name}`,
    );

    console.log(
      `[SaMi] Apps requested: ${selectedApps.join(', ')}`,
    );

    // ============================================================
    // 2. CREATE PHYSICAL DATABASE
    // ============================================================

    const dbInfo =
      await createTenantDatabase(
        tenantId,
        tenant.name,
      );

    databaseName =
      dbInfo.databaseName;

    console.log(
      `[SaMi] ✅ Physical database assigned: ${databaseName}`,
    );

    console.log(
      `[SaMi] Host: ${dbInfo.host}`,
    );

    console.log(
      `[SaMi] Port: ${dbInfo.port}`,
    );

    // ============================================================
    // 3. INSTALL CORE TABLES
    // ============================================================

    await installCoreSchema(
      dbInfo.databaseName,
    );

    // ============================================================
    // 4. INSTALL SELECTED APPS
    // ============================================================

    const appResults:
      AppInstallResult[] = [];

    const successfulApps:
      string[] = [];

    for (const appKey of selectedApps) {
      const result =
        await installAppSchema(
          dbInfo.databaseName,
          appKey,
        );

      appResults.push(result);

      if (result.success) {
        successfulApps.push(
          appKey,
        );
      }
    }

    // ============================================================
    // 5. UPDATE MODULE STATUS IN CONTROL DATABASE
    // ============================================================

    for (const appKey of selectedApps) {
      const result =
        appResults.find(
          (item) =>
            item.appKey === appKey,
        );

      await updateTenantModuleStatus(
        tenantId,
        appKey,
        Boolean(result?.success),
      );
    }

    // ============================================================
    // 6. REGISTER PHYSICAL DATABASE
    // ============================================================

    const databaseId =
      await registerTenantDatabase(
        tenantId,
        dbInfo.databaseName,
        dbInfo.host,
        dbInfo.port,
      );

    // ============================================================
    // 7. ACTIVATE TENANT
    // ============================================================

    await queryControl(
      `
        UPDATE tenants
        SET
          status = 'active',
          updated_at = NOW()
        WHERE id = $1
      `,
      [tenantId],
    );

    // ============================================================
    // 8. FINAL RESULT
    // ============================================================

    const failedApps =
      appResults.filter(
        (result) =>
          !result.success,
      );

    console.log(
      `[SaMi] ========================================`,
    );

    console.log(
      `[SaMi] ✅ TENANT PROVISIONING COMPLETE`,
    );

    console.log(
      `[SaMi] Tenant: ${tenant.name}`,
    );

    console.log(
      `[SaMi] Physical database: ${dbInfo.databaseName}`,
    );

    console.log(
      `[SaMi] Apps installed: ${successfulApps.length}`,
    );

    console.log(
      `[SaMi] Apps failed: ${failedApps.length}`,
    );

    console.log(
      `[SaMi] ========================================`,
    );

    return {
      success: true,
      tenantId,
      databaseId,
      databaseName:
        dbInfo.databaseName,
      databaseHost:
        dbInfo.host,
      databasePort:
        dbInfo.port,
      appsInstalled:
        successfulApps,
      appsFailed:
        failedApps,
    };
  } catch (error) {
    console.error(
      `[SaMi] ❌ Tenant provisioning failed for ${tenantId}:`,
      error,
    );

    // ============================================================
    // Mark tenant as provisioning_failed
    // ============================================================

    try {
      await queryControl(
        `
          UPDATE tenants
          SET
            status = 'provisioning_failed',
            updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId],
      );
    } catch (statusError) {
      console.error(
        `[SaMi] Failed to update tenant failure status:`,
        statusError,
      );
    }

    throw error;
  }
}

/**
 * ================================================================
 * BACKWARD-COMPATIBLE DATABASE PROVISIONING FUNCTION
 * ================================================================
 */
export async function provisionTenantDatabase(
  tenantId: string,
  businessSlug: string,
  appKeys: unknown,
): Promise<TenantDatabaseProvisionResult> {
  /**
   * businessSlug is retained for compatibility with existing
   * callers.
   *
   * Database naming is based on the tenant's actual database
   * record/name to guarantee uniqueness.
   */
  void businessSlug;

  const result =
    await provisionTenant(
      tenantId,
      appKeys,
    );

  if (
    !result.success ||
    !result.databaseName ||
    !result.databaseHost ||
    !result.databaseId
  ) {
    throw new Error(
      `Tenant database provisioning did not complete successfully for tenant ${tenantId}.`,
    );
  }

  return {
    databaseId:
      result.databaseId,
    databaseName:
      result.databaseName,
    databaseHost:
      result.databaseHost,
    databasePort:
      result.databasePort ||
      DEFAULT_POSTGRES_PORT,
  };
}

/**
 * ================================================================
 * DELETE PHYSICAL TENANT DATABASE
 * ================================================================
 *
 * WARNING:
 *
 * This permanently deletes the tenant database and its data.
 *
 * This should only be called from a protected administrative
 * operation.
 */
export async function deleteTenantDatabase(
  tenantId: string,
): Promise<void> {
  const result =
    await queryControl(
      `
        SELECT
          database_name
        FROM tenant_databases
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId],
    );

  if (result.rows.length === 0) {
    console.log(
      `[SaMi] No tenant database registry entry found for ${tenantId}.`,
    );

    return;
  }

  const databaseName =
    result.rows[0].database_name;

  if (
    typeof databaseName !== 'string' ||
    !databaseName.trim()
  ) {
    throw new Error(
      `Invalid database name registered for tenant ${tenantId}.`,
    );
  }

  const adminClient =
    createAdminClient();

  await adminClient.connect();

  try {
    console.log(
      `[SaMi] Terminating connections to ${databaseName}...`,
    );

    await adminClient.query(
      `
        SELECT
          pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );

    console.log(
      `[SaMi] Dropping physical database ${databaseName}...`,
    );

    await adminClient.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );

    console.log(
      `[SaMi] ✅ Physical database ${databaseName} dropped.`,
    );
  } finally {
    await adminClient.end();
  }

  // ============================================================
  // Remove registry entry from CONTROL database
  // ============================================================

  await queryControl(
    `
      DELETE FROM tenant_databases
      WHERE tenant_id = $1
    `,
    [tenantId],
  );

  console.log(
    `[SaMi] Tenant database registry entry removed for ${tenantId}.`,
  );
}