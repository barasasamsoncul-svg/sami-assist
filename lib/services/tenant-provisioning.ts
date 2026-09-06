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

export interface AppInstallResult {
  appKey: string;
  success: boolean;
  error?: string;
}

interface TenantDatabaseInfo {
  databaseName: string;
  host: string;
  port: number;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface ExistingTenantDatabaseRow {
  id: string;
  database_name: string;
  database_host: string;
  database_port: number;
  status: string;
  schema_version: string | null;
}

/**
 * ================================================================
 * SaMi Tenant Database Provisioning
 * ================================================================
 *
 * ARCHITECTURE
 *
 * sami_control
 *     |
 *     +---- tenant A -> physical PostgreSQL database
 *     |
 *     +---- tenant B -> physical PostgreSQL database
 *     |
 *     +---- tenant C -> physical PostgreSQL database
 *
 * Each tenant receives a PHYSICAL PostgreSQL DATABASE.
 *
 * The Control DB only stores tenant metadata and the physical
 * database registry.
 *
 * Tenant application tables live inside the tenant's physical DB.
 *
 * ================================================================
 *
 * PROVISIONING STATE MACHINE
 *
 * pending/provisioning
 *        |
 *        v
 * physical database
 *        |
 *        v
 * core schema
 *        |
 *        v
 * selected app schemas
 *        |
 *        v
 * all apps successful?
 *     /       \
 *   NO         YES
 *   |           |
 *   v           v
 * failed      active
 *
 * IMPORTANT:
 *
 * A tenant MUST NOT become active when even one requested app
 * failed to install.
 *
 * ================================================================
 */

const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_ADMIN_DATABASE = 'postgres';
const DEFAULT_REGION = 'us-east-1';

const CORE_SCHEMA_VERSION = '1.0.0';

/**
 * Internal PostgreSQL advisory lock namespace.
 *
 * We derive a deterministic advisory lock from the tenant ID.
 *
 * This prevents two requests from provisioning the same tenant
 * concurrently.
 */
const PROVISIONING_LOCK_NAMESPACE = 741921;

/**
 * ================================================================
 * PostgreSQL CONFIGURATION
 * ================================================================
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
    process.env.POSTGRES_PORT ||
      String(DEFAULT_POSTGRES_PORT),
    10,
  );

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('POSTGRES_PORT is invalid.');
  }

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
 * ================================================================
 * POSTGRES SSL
 * ================================================================
 */

function getPostgresSsl() {
  if (process.env.NODE_ENV === 'production') {
    return {
      rejectUnauthorized: false,
    };
  }

  return undefined;
}

/**
 * ================================================================
 * SAFE IDENTIFIER QUOTING
 * ================================================================
 */

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * ================================================================
 * SAFE DATABASE NAME
 * ================================================================
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

  if (!tenantSuffix) {
    throw new Error(
      `Unable to generate a safe database suffix for tenant ${tenantId}.`,
    );
  }

  return `sami_${safeName}_${tenantSuffix}`;
}

/**
 * ================================================================
 * ADMIN CLIENT
 * ================================================================
 */

function createAdminClient(): Client {
  const config = getPostgresConfig();

  return new Client({
    host: config.host,
    port: config.port,
    database: config.adminDatabase,
    user: config.user,
    password: config.password,
    ssl: getPostgresSsl(),
  });
}

/**
 * ================================================================
 * TENANT CLIENT
 * ================================================================
 */

function createTenantClient(
  databaseName: string,
): Client {
  const config = getPostgresConfig();

  return new Client({
    host: config.host,
    port: config.port,
    database: databaseName,
    user: config.user,
    password: config.password,
    ssl: getPostgresSsl(),
  });
}

/**
 * ================================================================
 * TENANT SQL FILE EXECUTION
 * ================================================================
 *
 * The complete SQL file is executed in a PostgreSQL transaction.
 *
 * This is important because if a schema file contains:
 *
 *   table A
 *   table B
 *   function C
 *
 * and function C fails, the transaction rolls back instead of
 * leaving half an installed schema.
 *
 * ================================================================
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
   * Tenant schemas use {schema}.
   *
   * Tenant databases use their own public schema.
   */
  sql = sql.replace(
    /\{schema\}/g,
    'public',
  );

  const tenantClient =
    createTenantClient(databaseName);

  await tenantClient.connect();

  try {
    await tenantClient.query('BEGIN');

    try {
      await tenantClient.query(sql);

      await tenantClient.query('COMMIT');
    } catch (error) {
      try {
        await tenantClient.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          `[SaMi] Failed to rollback schema transaction for "${databaseName}":`,
          rollbackError,
        );
      }

      throw error;
    }

    console.log(
      `[SaMi] SQL installed successfully in database "${databaseName}".`,
    );
  } finally {
    await tenantClient.end();
  }
}

/**
 * ================================================================
 * TENANT DATABASE EXISTS
 * ================================================================
 */

async function tenantDatabaseExists(
  databaseName: string,
): Promise<boolean> {
  const adminClient =
    createAdminClient();

  await adminClient.connect();

  try {
    const result =
      await adminClient.query(
        `
          SELECT 1
          FROM pg_database
          WHERE datname = $1
          LIMIT 1
        `,
        [databaseName],
      );

    return result.rows.length > 0;
  } finally {
    await adminClient.end();
  }
}

/**
 * ================================================================
 * CREATE / REUSE PHYSICAL TENANT DATABASE
 * ================================================================
 */

async function createTenantDatabase(
  tenantId: string,
  tenantName: string,
): Promise<TenantDatabaseInfo> {
  const config =
    getPostgresConfig();

  const databaseName =
    generateDatabaseName(
      tenantId,
      tenantName,
    );

  const adminClient =
    createAdminClient();

  await adminClient.connect();

  try {
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

    if (
      existingDatabase.rows.length === 0
    ) {
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
        `[SaMi] ♻️ Reusing existing tenant database: ${databaseName}`,
      );
    }

    /**
     * Always verify existence after creation/reuse.
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

    if (
      verifyResult.rows.length === 0
    ) {
      throw new Error(
        `Tenant database "${databaseName}" could not be verified.`,
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
 * GET REGISTERED TENANT DATABASE
 * ================================================================
 */

async function getRegisteredTenantDatabase(
  tenantId: string,
): Promise<ExistingTenantDatabaseRow | null> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          database_name,
          database_host,
          database_port,
          status,
          schema_version
        FROM tenant_databases
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId],
    );

  return (
    result.rows[0] || null
  );
}

/**
 * ================================================================
 * INSTALL CORE SCHEMA
 * ================================================================
 */

async function installCoreSchema(
  databaseName: string,
): Promise<void> {
  const coreSchemaPath =
    path.join(
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
 * INSTALL APP SCHEMA
 * ================================================================
 */

async function installAppSchema(
  databaseName: string,
  appKey: string,
): Promise<AppInstallResult> {
  const normalizedAppKey =
    appKey.trim().toLowerCase();

  const appSchemaPath =
    path.join(
      process.cwd(),
      'lib',
      'apps',
      normalizedAppKey,
      'schema.sql',
    );

  try {
    if (
      !fs.existsSync(appSchemaPath)
    ) {
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
          (
            key,
          ): key is string =>
            typeof key === 'string',
        )
        .map((key) =>
          key.trim().toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];

  if (
    selectedApps.length === 0
  ) {
    throw new Error(
      'At least one valid SaMi app must be selected.',
    );
  }

  return selectedApps;
}

/**
 * ================================================================
 * VALIDATE APPS AGAINST CONTROL DB
 * ================================================================
 *
 * This is an important security boundary.
 *
 * The provisioning service must not install an arbitrary folder
 * supplied by a request.
 *
 * The requested app keys must exist in the Control DB modules
 * table and must not be deleted.
 * ================================================================
 */

async function validateAppsAgainstControlDatabase(
  selectedApps: string[],
): Promise<void> {
  const result =
    await queryControl(
      `
        SELECT
          key
        FROM modules
        WHERE key = ANY($1::text[])
          AND deleted_at IS NULL
      `,
      [selectedApps],
    );

  const validApps = new Set<string>(
    result.rows.map(
      (row: { key: string }) =>
        row.key.trim().toLowerCase(),
    ),
  );

  const invalidApps =
    selectedApps.filter(
      (appKey) =>
        !validApps.has(appKey),
    );

  if (
    invalidApps.length > 0
  ) {
    throw new Error(
      `The following selected apps are not valid active modules: ${invalidApps.join(', ')}`,
    );
  }
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
  error?: string,
): Promise<void> {
  if (success) {
    await queryControl(
      `
        UPDATE tenant_modules
        SET
          status = 'installed',
          installed_at = NOW(),
          updated_at = NOW()
        WHERE tenant_id = $1
          AND module_id = (
            SELECT id
            FROM modules
            WHERE key = $2
              AND deleted_at IS NULL
          )
      `,
      [
        tenantId,
        appKey,
      ],
    );

    return;
  }

  /**
   * We intentionally don't add an "error" column because the
   * existing tenant_modules schema has not been confirmed to have
   * one.
   *
   * The actual error remains available in the application logs
   * and in the provisioning result.
   */
  await queryControl(
    `
      UPDATE tenant_modules
      SET
        status = 'failed',
        updated_at = NOW()
      WHERE tenant_id = $1
        AND module_id = (
          SELECT id
          FROM modules
          WHERE key = $2
            AND deleted_at IS NULL
        )
    `,
    [
      tenantId,
      appKey,
    ],
  );

  if (error) {
    console.error(
      `[SaMi] App "${appKey}" marked failed for tenant ${tenantId}: ${error}`,
    );
  }
}

/**
 * ================================================================
 * MARK ALL REQUESTED MODULES FAILED
 * ================================================================
 */

async function markAllModulesFailed(
  tenantId: string,
  selectedApps: string[],
): Promise<void> {
  for (const appKey of selectedApps) {
    try {
      await updateTenantModuleStatus(
        tenantId,
        appKey,
        false,
      );
    } catch (error) {
      console.error(
        `[SaMi] Failed to mark module "${appKey}" as failed:`,
        error,
      );
    }
  }
}

/**
 * ================================================================
 * MARK TENANT PROVISIONING
 * ================================================================
 */

async function markTenantProvisioning(
  tenantId: string,
): Promise<void> {
  await queryControl(
    `
      UPDATE tenants
      SET
        status = 'provisioning',
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [tenantId],
  );
}

/**
 * ================================================================
 * MARK TENANT PROVISIONING FAILED
 * ================================================================
 */

async function markTenantProvisioningFailed(
  tenantId: string,
): Promise<void> {
  await queryControl(
    `
      UPDATE tenants
      SET
        status = 'provisioning_failed',
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [tenantId],
  );
}

/**
 * ================================================================
 * ACTIVATE TENANT
 * ================================================================
 *
 * This function is ONLY called after:
 *
 * 1. Core schema succeeded.
 * 2. Every requested app succeeded.
 * 3. Every module status was updated.
 * 4. Physical DB was registered.
 *
 * ================================================================
 */

async function activateTenant(
  tenantId: string,
): Promise<void> {
  await queryControl(
    `
      UPDATE tenants
      SET
        status = 'active',
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [tenantId],
  );
}

/**
 * ================================================================
 * REGISTER PHYSICAL DATABASE
 * ================================================================
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

  const result =
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
        databaseName,
        databaseName,
        host,
        port,
        CORE_SCHEMA_VERSION,
      ],
    );

  if (
    result.rows.length === 0
  ) {
    throw new Error(
      `Failed to register tenant database for tenant ${tenantId}.`,
    );
  }

  return String(
    result.rows[0].id,
  );
}

/**
 * ================================================================
 * ADVISORY LOCK
 * ================================================================
 *
 * PostgreSQL advisory locks are connection-scoped.
 *
 * We acquire the lock and hold the same admin connection for the
 * entire provisioning operation.
 *
 * This prevents concurrent requests from provisioning the same
 * tenant simultaneously.
 *
 * ================================================================
 */

function createLockKey(
  tenantId: string,
): bigint {
  const hash = cryptoHashToBigInt(
    `${PROVISIONING_LOCK_NAMESPACE}:${tenantId}`,
  );

  return hash;
}

/**
 * We intentionally use Node's built-in crypto rather than adding
 * another dependency.
 */
import crypto from 'crypto';

function cryptoHashToBigInt(
  value: string,
): bigint {
  const digest =
    crypto
      .createHash('sha256')
      .update(value)
      .digest();

  /**
   * PostgreSQL advisory lock accepts BIGINT.
   *
   * Take the first 8 bytes and convert to a signed bigint.
   */
  let result = BigInt("0");

  for (
    let index = 0;
    index < 8;
    index++
  ) {
    result =
      (result << BigInt("8")) |
      BigInt(digest[index]);
  }

  /**
   * Convert unsigned 64-bit value into signed BIGINT range.
   */
  if (
    result >
    BigInt("9223372036854775807")
  ) {
    result -=
      BigInt("18446744073709551616");
  }

  return result;
}

/**
 * Acquire a tenant-scoped PostgreSQL advisory lock.
 *
 * Uses PostgreSQL's hashtext() so we don't need JavaScript BigInt
 * or BigInt literals, keeping compatibility with lower TS targets.
 */
async function acquireTenantProvisioningLock(
  client: Client,
  tenantId: string
): Promise<void> {
  const lockKey = `sami:tenant-provisioning:${tenantId}`;

  await client.query(
    `SELECT pg_advisory_lock(hashtext($1))`,
    [lockKey]
  );
}

/**
 * Release the tenant-scoped PostgreSQL advisory lock.
 */
async function releaseTenantProvisioningLock(
  client: Client,
  tenantId: string
): Promise<void> {
  const lockKey = `sami:tenant-provisioning:${tenantId}`;

  await client.query(
    `SELECT pg_advisory_unlock(hashtext($1))`,
    [lockKey]
  );
}
/**
 * ================================================================
 * VERIFY TENANT DATABASE CONNECTION
 * ================================================================
 */

async function verifyTenantDatabaseConnection(
  databaseName: string,
): Promise<void> {
  const client =
    createTenantClient(
      databaseName,
    );

  await client.connect();

  try {
    const result =
      await client.query(
        'SELECT current_database() AS database_name',
      );

    const connectedDatabase =
      result.rows[0]
        ?.database_name;

    if (
      connectedDatabase !==
      databaseName
    ) {
      throw new Error(
        `Connected to "${connectedDatabase}" instead of expected tenant database "${databaseName}".`,
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * ================================================================
 * CHECK CORE DATABASE HEALTH
 * ================================================================
 *
 * We intentionally do not assume a specific application table
 * exists because the exact tenant-core.sql contents have not been
 * provided here.
 *
 * We only verify that the physical database is reachable.
 * ================================================================
 */

async function verifyTenantDatabase(
  databaseName: string,
): Promise<void> {
  await verifyTenantDatabaseConnection(
    databaseName,
  );
}

/**
 * ================================================================
 * PROVISION TENANT
 * ================================================================
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

  let databaseName:
    | string
    | undefined;

  let adminClient:
    | Client
    | undefined;

  let lockAcquired = false;

  let selectedApps: string[] = [];

  try {
    /**
     * ============================================================
     * 1. VALIDATE TENANT
     * ============================================================
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
        [tenantId],
      );

    if (
      tenantResult.rows.length === 0
    ) {
      throw new Error(
        `Tenant ${tenantId} not found.`,
      );
    }

    const tenant =
      tenantResult.rows[0] as TenantRow;

    /**
     * ============================================================
     * 2. VALIDATE SELECTED APPS
     * ============================================================
     */

    selectedApps =
      getValidatedApps(
        selectedAppsInput,
      );

    await validateAppsAgainstControlDatabase(
      selectedApps,
    );

    console.log(
      `[SaMi] Tenant: ${tenant.name}`,
    );

    console.log(
      `[SaMi] Apps requested: ${selectedApps.join(', ')}`,
    );

    /**
     * ============================================================
     * 3. ACQUIRE PROVISIONING LOCK
     * ============================================================
     */

    adminClient =
      createAdminClient();

    await adminClient.connect();

    await acquireTenantProvisioningLock(
      adminClient,
      tenantId,
    );

    lockAcquired = true;

    /**
     * ============================================================
     * 4. MARK TENANT AS PROVISIONING
     * ============================================================
     */

    await markTenantProvisioning(
      tenantId,
    );

    /**
     * ============================================================
     * 5. CHECK EXISTING DATABASE REGISTRY
     * ============================================================
     */

    const existingRegistry =
      await getRegisteredTenantDatabase(
        tenantId,
      );

    /**
     * ============================================================
     * 6. CREATE OR REUSE PHYSICAL DATABASE
     * ============================================================
     */

    const dbInfo =
      await createTenantDatabase(
        tenantId,
        tenant.name,
      );

    databaseName =
      dbInfo.databaseName;

    console.log(
      `[SaMi] Physical database: ${databaseName}`,
    );

    console.log(
      `[SaMi] Host: ${dbInfo.host}`,
    );

    console.log(
      `[SaMi] Port: ${dbInfo.port}`,
    );

    /**
     * ============================================================
     * 7. VERIFY PHYSICAL DATABASE
     * ============================================================
     */

    await verifyTenantDatabase(
      dbInfo.databaseName,
    );

    /**
     * ============================================================
     * 8. CORE SCHEMA
     * ============================================================
     *
     * IMPORTANT:
     *
     * We install core before apps.
     *
     * The SQL file itself should use idempotent PostgreSQL
     * constructs such as:
     *
     *   CREATE TABLE IF NOT EXISTS
     *   CREATE INDEX IF NOT EXISTS
     *   CREATE OR REPLACE FUNCTION
     *
     * for retry safety.
     *
     * The transaction in executeTenantSqlFile prevents partial
     * execution of the file.
     * ============================================================
     */

    console.log(
      `[SaMi] Installing core schema...`,
    );

    await installCoreSchema(
      dbInfo.databaseName,
    );

    /**
     * ============================================================
     * 9. INSTALL SELECTED APPS
     * ============================================================
     */

    const appResults:
      AppInstallResult[] = [];

    const successfulApps:
      string[] = [];

    for (
      const appKey of selectedApps
    ) {
      const result =
        await installAppSchema(
          dbInfo.databaseName,
          appKey,
        );

      appResults.push(
        result,
      );

      if (result.success) {
        successfulApps.push(
          appKey,
        );
      }
    }

    /**
     * ============================================================
     * 10. UPDATE MODULE STATUS
     * ============================================================
     */

    for (
      const result of appResults
    ) {
      try {
        await updateTenantModuleStatus(
          tenantId,
          result.appKey,
          result.success,
          result.error,
        );
      } catch (moduleStatusError) {
        /**
         * If we cannot update Control DB module status, the
         * provisioning operation itself must fail.
         *
         * Otherwise Control DB could say "pending" while the
         * physical database is actually installed.
         */
        throw new Error(
          `Failed to update module status for "${result.appKey}": ${
            moduleStatusError instanceof Error
              ? moduleStatusError.message
              : String(moduleStatusError)
          }`,
        );
      }
    }

    /**
     * ============================================================
     * 11. CHECK FOR ANY FAILED APP
     * ============================================================
     *
     * THIS IS THE CRITICAL HARDENING.
     *
     * The old implementation registered the database and
     * activated the tenant even when an app failed.
     *
     * That is no longer allowed.
     * ============================================================
     */

    const failedApps =
      appResults.filter(
        (result) =>
          !result.success,
      );

    if (
      failedApps.length > 0
    ) {
      const failureSummary =
        failedApps
          .map(
            (result) =>
              `${result.appKey}: ${
                result.error ||
                'unknown installation error'
              }`,
          )
          .join('; ');

      await markTenantProvisioningFailed(
        tenantId,
      );

      console.error(
        `[SaMi] ❌ Provisioning stopped because ${failedApps.length} app(s) failed: ${failureSummary}`,
      );

      /**
       * IMPORTANT:
       *
       * The physical database is intentionally NOT deleted.
       *
       * This allows an administrator/recovery process to inspect
       * and retry the tenant instead of destroying potentially
       * useful provisioning state.
       */

      return {
        success: false,
        tenantId,
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
    }

    /**
     * ============================================================
     * 12. ENSURE ALL SELECTED APPS WERE INSTALLED
     * ============================================================
     */

    if (
      successfulApps.length !==
      selectedApps.length
    ) {
      await markTenantProvisioningFailed(
        tenantId,
      );

      throw new Error(
        `Provisioning integrity check failed. Requested ${selectedApps.length} apps but installed ${successfulApps.length}.`,
      );
    }

    /**
     * ============================================================
     * 13. REGISTER PHYSICAL DATABASE
     * ============================================================
     */

    const databaseId =
      await registerTenantDatabase(
        tenantId,
        dbInfo.databaseName,
        dbInfo.host,
        dbInfo.port,
      );

    /**
     * ============================================================
     * 14. FINAL DATABASE HEALTH CHECK
     * ============================================================
     */

    await verifyTenantDatabase(
      dbInfo.databaseName,
    );

    /**
     * ============================================================
     * 15. ACTIVATE TENANT
     * ============================================================
     *
     * This is the FIRST point at which the tenant becomes active.
     * ============================================================
     */

    await activateTenant(
      tenantId,
    );

    /**
     * ============================================================
     * 16. FINAL SUCCESS
     * ============================================================
     */

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
      `[SaMi] Apps failed: 0`,
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
      appsFailed: [],
    };
  } catch (error) {
    console.error(
      `[SaMi] ❌ Tenant provisioning failed for ${tenantId}:`,
      error,
    );

    /**
     * Mark all requested modules failed when a fatal provisioning
     * error occurs.
     *
     * This is intentionally best-effort.
     */
    if (
      selectedApps.length > 0
    ) {
      await markAllModulesFailed(
        tenantId,
        selectedApps,
      );
    }

    /**
     * Mark tenant as provisioning_failed.
     */
    try {
      await markTenantProvisioningFailed(
        tenantId,
      );
    } catch (statusError) {
      console.error(
        `[SaMi] Failed to update tenant failure status:`,
        statusError,
      );
    }

    /**
     * DO NOT automatically drop the physical database here.
     *
     * Reasons:
     *
     * 1. The database may contain useful recovery information.
     * 2. A paid customer may already have completed payment.
     * 3. The next provisioning attempt can reuse the database.
     * 4. Automatic deletion makes production recovery harder.
     */
    if (databaseName) {
      console.error(
        `[SaMi] Physical database "${databaseName}" was preserved for recovery.`,
      );
    }

    throw error;
  } finally {
    /**
     * Release advisory lock before closing the connection.
     */
    if (
      adminClient &&
      lockAcquired
    ) {
      await releaseTenantProvisioningLock(
        adminClient,
        tenantId,
      );
    }

    if (adminClient) {
      try {
        await adminClient.end();
      } catch (error) {
        console.error(
          `[SaMi] Failed to close provisioning admin connection:`,
          error,
        );
      }
    }
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
   * Retained for compatibility with existing callers.
   *
   * Database naming is based on the actual tenant record rather
   * than businessSlug so that the tenant UUID remains part of the
   * physical database identity.
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
    const failedSummary =
      result.appsFailed.length > 0
        ? result.appsFailed
            .map(
              (app) =>
                `${app.appKey}: ${
                  app.error ||
                  'installation failed'
                }`,
            )
            .join('; ')
        : 'unknown provisioning failure';

    throw new Error(
      `Tenant database provisioning did not complete successfully for tenant ${tenantId}. ${failedSummary}`,
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
 * This should ONLY be called from a protected administrative
 * operation.
 *
 * ================================================================
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

  if (
    result.rows.length === 0
  ) {
    console.log(
      `[SaMi] No tenant database registry entry found for ${tenantId}.`,
    );

    return;
  }

  const databaseName =
    result.rows[0].database_name;

  if (
    typeof databaseName !==
      'string' ||
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

  /**
   * Remove registry entry from Control DB.
   */
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