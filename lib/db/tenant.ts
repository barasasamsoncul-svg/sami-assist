import { Pool, QueryResult, QueryResultRow } from 'pg';

import { queryControl } from '@/lib/db/control';

/**
 * ================================================================
 * SaMi TENANT DATABASE CONNECTION MANAGER
 * ================================================================
 *
 * ARCHITECTURE
 *
 *                    sami_control
 *                         │
 *                         │ tenant_id
 *                         ▼
 *                tenant_databases
 *                         │
 *                         │ database_name
 *                         ▼
 *              ┌──────────────────────┐
 *              │ Physical PostgreSQL  │
 *              │ Tenant Database      │
 *              │                      │
 *              │ sami_company_a_xxx   │
 *              └──────────────────────┘
 *
 * Every tenant has its own PHYSICAL DATABASE.
 *
 * This file:
 *
 * 1. Resolves a tenant's physical database from the control DB.
 * 2. Creates/caches a PostgreSQL pool for that database.
 * 3. Executes queries against the tenant's physical database.
 *
 * IMPORTANT:
 *
 * sami_control must never be used for tenant application data.
 * ================================================================
 */

interface TenantDatabaseRecord {
  id: string;
  tenantId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
  status: string;
}

interface TenantPoolEntry {
  databaseName: string;
  pool: Pool;
}

/**
 * Maximum number of tenant pools kept in this process.
 *
 * This protects the application from creating an unlimited number
 * of PostgreSQL connection pools when many tenants exist.
 *
 * IMPORTANT:
 *
 * This is per application process/instance.
 *
 * In a serverless environment, each warm instance can have its
 * own pool cache.
 */
const MAX_TENANT_POOLS = 50;

/**
 * Tenant pool cache.
 *
 * Key:
 *   physical database name
 *
 * Value:
 *   PostgreSQL connection pool
 */
const tenantPools: Map<string, TenantPoolEntry> = new Map();

/**
 * Resolve a tenant's physical database from sami_control.
 *
 * This is the ONLY place where the tenant database registry is
 * consulted.
 */
export async function getTenantDatabase(
  tenantId: string,
): Promise<TenantDatabaseRecord> {
  if (
    typeof tenantId !== 'string' ||
    !tenantId.trim()
  ) {
    throw new Error(
      'A valid tenant ID is required.',
    );
  }

  const result = await queryControl(
    `
      SELECT
        id,
        tenant_id,
        database_name,
        database_host,
        database_port,
        status
      FROM tenant_databases
      WHERE tenant_id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [tenantId],
  );

  if (result.rows.length === 0) {
    throw new Error(
      `No active physical database is registered for tenant ${tenantId}.`,
    );
  }

  const row = result.rows[0];

  if (
    typeof row.database_name !== 'string' ||
    !row.database_name.trim()
  ) {
    throw new Error(
      `Tenant ${tenantId} has an invalid database name.`,
    );
  }

  if (
    typeof row.database_host !== 'string' ||
    !row.database_host.trim()
  ) {
    throw new Error(
      `Tenant ${tenantId} has an invalid database host.`,
    );
  }

  const databasePort =
    Number(row.database_port);

  if (
    !Number.isInteger(databasePort) ||
    databasePort <= 0
  ) {
    throw new Error(
      `Tenant ${tenantId} has an invalid database port.`,
    );
  }

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    databaseName:
      row.database_name.trim(),
    databaseHost:
      row.database_host.trim(),
    databasePort,
    status: String(row.status),
  };
}

/**
 * Create a PostgreSQL pool for a specific physical tenant
 * database.
 *
 * IMPORTANT:
 *
 * databaseName must come from the trusted tenant_databases
 * registry.
 *
 * This function does NOT connect to sami_control.
 */
function createTenantPool(
  database: TenantDatabaseRecord,
): Pool {
  const adminUser =
    process.env.POSTGRES_ADMIN_USER;

  const adminPassword =
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!adminUser) {
    throw new Error(
      'POSTGRES_ADMIN_USER is not configured.',
    );
  }

  if (!adminPassword) {
    throw new Error(
      'POSTGRES_ADMIN_PASSWORD is not configured.',
    );
  }

  const pool = new Pool({
    /**
     * Use the database host recorded for THIS tenant.
     *
     * This allows the architecture to support tenants on
     * different PostgreSQL hosts later.
     */
    host: database.databaseHost,

    port: database.databasePort,

    user: adminUser,

    password: adminPassword,

    /**
     * THIS IS THE IMPORTANT PART.
     *
     * The connection goes directly to the tenant's physical
     * PostgreSQL database.
     *
     * Example:
     *
     * database: "sami_acme_company_a1b2c3d4"
     *
     * NOT:
     *
     * database: "sami_control"
     */
    database: database.databaseName,

    max: 10,

    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 10_000,

    /**
     * Keep the same SSL behavior as the control database.
     */
    ssl:
      process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized: false,
          }
        : undefined,

    /**
     * Application name makes PostgreSQL activity easier to
     * identify during debugging.
     */
    application_name: `sami-tenant-${database.databaseName}`,
  });

  pool.on(
    'error',
    (error) => {
      console.error(
        `[SaMi] Tenant database pool error (${database.databaseName}):`,
        error,
      );

      /**
       * Remove the broken pool from the cache.
       *
       * A future request can create a fresh pool.
       */
      const entry =
        tenantPools.get(
          database.databaseName,
        );

      if (
        entry?.pool === pool
      ) {
        tenantPools.delete(
          database.databaseName,
        );
      }
    },
  );

  return pool;
}

/**
 * Evict the oldest cached tenant pool.
 *
 * JavaScript Map preserves insertion order, so the first
 * entry is the oldest entry.
 */
async function evictOldestTenantPool(): Promise<void> {
  const oldestEntry =
    tenantPools.entries().next();

  if (oldestEntry.done) {
    return;
  }

  const [
    databaseName,
    entry,
  ] = oldestEntry.value;

  tenantPools.delete(
    databaseName,
  );

  try {
    await entry.pool.end();
  } catch (error) {
    console.error(
      `[SaMi] Failed to close tenant pool ${databaseName}:`,
      error,
    );
  }
}

/**
 * Get a pool for a tenant using tenant ID.
 *
 * This is the recommended function for application code.
 *
 * Example:
 *
 * const pool = await getTenantPoolByTenantId(tenantId);
 *
 * await pool.query(
 *   'SELECT * FROM customers'
 * );
 */
export async function getTenantPoolByTenantId(
  tenantId: string,
): Promise<Pool> {
  const database =
    await getTenantDatabase(
      tenantId,
    );

  /**
   * Reuse existing pool.
   */
  const existing =
    tenantPools.get(
      database.databaseName,
    );

  if (existing) {
    return existing.pool;
  }

  /**
   * Keep the cache bounded.
   */
  if (
    tenantPools.size >=
    MAX_TENANT_POOLS
  ) {
    await evictOldestTenantPool();
  }

  const pool =
    createTenantPool(
      database,
    );

  tenantPools.set(
    database.databaseName,
    {
      databaseName:
        database.databaseName,
      pool,
    },
  );

  console.log(
    `[SaMi] Tenant database pool created: ${database.databaseName}`,
  );

  return pool;
}

/**
 * Get a tenant pool directly by physical database name.
 *
 * This is retained for compatibility with code that already
 * knows the trusted database name.
 *
 * IMPORTANT:
 *
 * Prefer getTenantPoolByTenantId() whenever possible.
 */
export function getTenantPool(
  databaseName: string,
): Pool {
  if (
    typeof databaseName !== 'string' ||
    !databaseName.trim()
  ) {
    throw new Error(
      'A valid tenant database name is required.',
    );
  }

  const normalizedName =
    databaseName.trim();

  const existing =
    tenantPools.get(
      normalizedName,
    );

  if (existing) {
    return existing.pool;
  }

  if (
    tenantPools.size >=
    MAX_TENANT_POOLS
  ) {
    /**
     * We cannot await here because this function is intentionally
     * synchronous for backward compatibility.
     *
     * Remove the oldest pool from the cache and close it in the
     * background.
     */
    const oldestEntry =
      tenantPools.entries().next();

    if (!oldestEntry.done) {
      const [
        oldestDatabaseName,
        oldestPoolEntry,
      ] = oldestEntry.value;

      tenantPools.delete(
        oldestDatabaseName,
      );

      void oldestPoolEntry.pool
        .end()
        .catch((error) => {
          console.error(
            `[SaMi] Failed to close tenant pool ${oldestDatabaseName}:`,
            error,
          );
        });
    }
  }

  const host =
    process.env.POSTGRES_HOST;

  const port = Number.parseInt(
    process.env.POSTGRES_PORT ||
      String(5432),
    10,
  );

  const user =
    process.env.POSTGRES_ADMIN_USER;

  const password =
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!host) {
    throw new Error(
      'POSTGRES_HOST is not configured.',
    );
  }

  if (!user) {
    throw new Error(
      'POSTGRES_ADMIN_USER is not configured.',
    );
  }

  if (!password) {
    throw new Error(
      'POSTGRES_ADMIN_PASSWORD is not configured.',
    );
  }

  const pool = new Pool({
    host,

    port,

    user,

    password,

    /**
     * Direct physical tenant database.
     */
    database:
      normalizedName,

    max: 10,

    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 10_000,

    ssl:
      process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized: false,
          }
        : undefined,

    application_name:
      `sami-tenant-${normalizedName}`,
  });

  pool.on(
    'error',
    (error) => {
      console.error(
        `[SaMi] Tenant DB pool error (${normalizedName}):`,
        error,
      );

      const entry =
        tenantPools.get(
          normalizedName,
        );

      if (
        entry?.pool === pool
      ) {
        tenantPools.delete(
          normalizedName,
        );
      }
    },
  );

  tenantPools.set(
    normalizedName,
    {
      databaseName:
        normalizedName,
      pool,
    },
  );

  return pool;
}

/**
 * ================================================================
 * QUERY TENANT BY TENANT ID
 * ================================================================
 *
 * Recommended application-level query function.
 *
 * Example:
 *
 * const result = await queryTenant(
 *   tenantId,
 *   `
 *     SELECT *
 *     FROM customers
 *     ORDER BY created_at DESC
 *   `,
 * );
 */
export async function queryTenant<T extends QueryResultRow = any>(
  tenantId: string,
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  if (
    typeof text !== 'string' ||
    !text.trim()
  ) {
    throw new Error(
      'Tenant SQL query cannot be empty.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const start =
    Date.now();

  try {
    const result =
      await pool.query<T>(
        text,
        params,
      );

    const duration =
      Date.now() - start;

    if (duration > 1000) {
      console.warn(
        `[SaMi] Slow tenant query (${duration}ms): ${text.substring(
          0,
          150,
        )}`,
      );
    }

    return result;
  } catch (error) {
    console.error(
      `[SaMi] Tenant query failed for tenant ${tenantId}:`,
      error,
    );

    throw error;
  }
}

/**
 * ================================================================
 * QUERY TENANT BY PHYSICAL DATABASE NAME
 * ================================================================
 *
 * Compatibility helper.
 *
 * Use this only when databaseName is already trusted and resolved
 * from tenant_databases.
 */
export async function queryTenantDatabase<T extends QueryResultRow = any>(
  databaseName: string,
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  if (
    typeof text !== 'string' ||
    !text.trim()
  ) {
    throw new Error(
      'Tenant SQL query cannot be empty.',
    );
  }

  const pool =
    getTenantPool(
      databaseName,
    );

  const start =
    Date.now();

  try {
    const result =
      await pool.query<T>(
        text,
        params,
      );

    const duration =
      Date.now() - start;

    if (duration > 1000) {
      console.warn(
        `[SaMi] Slow tenant query (${duration}ms): ${text.substring(
          0,
          150,
        )}`,
      );
    }

    return result;
  } catch (error) {
    console.error(
      `[SaMi] Tenant database query failed (${databaseName}):`,
      error,
    );

    throw error;
  }
}

/**
 * ================================================================
 * TEST TENANT DATABASE CONNECTION
 * ================================================================
 */
export async function testTenantDatabase(
  tenantId: string,
): Promise<{
  connected: boolean;
  databaseName: string;
  currentDatabase: string;
}> {
  const database =
    await getTenantDatabase(
      tenantId,
    );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query<{
      current_database: string;
    }>(
      `
        SELECT
          current_database()
            AS current_database
      `,
    );

  const currentDatabase =
    result.rows[0]
      ?.current_database;

  if (
    currentDatabase !==
    database.databaseName
  ) {
    throw new Error(
      `Tenant database mismatch. Expected "${database.databaseName}" but PostgreSQL connected to "${currentDatabase}".`,
    );
  }

  return {
    connected: true,
    databaseName:
      database.databaseName,
    currentDatabase,
  };
}

/**
 * ================================================================
 * CLOSE ONE TENANT POOL
 * ================================================================
 */
export async function closeTenantPool(
  databaseName: string,
): Promise<void> {
  const normalizedName =
    databaseName.trim();

  const entry =
    tenantPools.get(
      normalizedName,
    );

  if (!entry) {
    return;
  }

  tenantPools.delete(
    normalizedName,
  );

  await entry.pool.end();

  console.log(
    `[SaMi] Tenant database pool closed: ${normalizedName}`,
  );
}

/**
 * ================================================================
 * CLOSE ALL TENANT POOLS
 * ================================================================
 *
 * Useful for controlled shutdowns/tests.
 */
export async function closeAllTenantPools(): Promise<void> {
  const entries =
    Array.from(
      tenantPools.entries(),
    );

  tenantPools.clear();

  await Promise.all(
    entries.map(
      async ([
        databaseName,
        entry,
      ]) => {
        try {
          await entry.pool.end();
        } catch (error) {
          console.error(
            `[SaMi] Failed to close tenant pool ${databaseName}:`,
            error,
          );
        }
      },
    ),
  );

  console.log(
    `[SaMi] Closed ${entries.length} tenant database pool(s).`,
  );
}

/**
 * ================================================================
 * GET CURRENT POOL COUNT
 * ================================================================
 */
export function getTenantPoolCount(): number {
  return tenantPools.size;
}