import { queryControl } from '@/lib/db/control';
import fs from 'fs';
import path from 'path';
import { SAMI_APPS } from '@/lib/sami-apps';

interface TenantDatabaseProvisionResult {
  databaseId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
}

type ProvisionOptions = {
  reuseExisting?: boolean;
};

/**
 * Read SaMi CORE tenant schema.
 * Expected: lib/schema/tenant-core.sql
 */
async function readTenantCoreSchema(): Promise<string> {
  const schemaPath = path.join(process.cwd(), 'lib', 'schema', 'tenant-core.sql');

  try {
    const sql = await fs.promises.readFile(schemaPath, 'utf8');
    if (!sql.trim()) {
      throw new Error('SaMi tenant CORE schema is empty.');
    }
    return sql;
  } catch (error) {
    throw new Error(
      `Unable to read SaMi tenant CORE schema at ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Read an application's tenant schema.
 * Expected: lib/apps/<appKey>/schema.sql
 */
async function readAppSchema(appKey: string): Promise<string> {
  const safeAppKey = appKey.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(safeAppKey)) {
    throw new Error(`Invalid app key "${appKey}".`);
  }

  const schemaPath = path.join(process.cwd(), 'lib', 'apps', safeAppKey, 'schema.sql');

  try {
    const sql = await fs.promises.readFile(schemaPath, 'utf8');
    if (!sql.trim()) {
      throw new Error(`Schema for app "${safeAppKey}" is empty.`);
    }
    return sql;
  } catch (error) {
    throw new Error(
      `Unable to read schema for app "${safeAppKey}" at ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Split SQL into statements.
 */
function splitSqlStatements(sql: string): string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => {
      const withoutComments = statement.replace(/^\s*--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      return withoutComments.length > 0;
    });
}

/**
 * Execute SQL statements using queryControl (same database)
 */
async function runSqlStatements(sql: string, label: string): Promise<void> {
  const statements = splitSqlStatements(sql);

  if (statements.length === 0) {
    throw new Error(`${label} contains no executable SQL statements.`);
  }

  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];
    try {
      await queryControl(statement);
    } catch (error) {
      throw new Error(
        `${label} failed at SQL statement ${index + 1}/${statements.length}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Get validated apps from input
 */
function getValidatedApps(appKeys: unknown): string[] {
  if (!Array.isArray(appKeys)) {
    throw new Error('At least one valid SaMi app must be selected.');
  }

  const selectedApps = appKeys
    .filter((key): key is string => typeof key === 'string')
    .map(key => key.trim().toLowerCase())
    .filter(Boolean);

  if (selectedApps.length === 0) {
    throw new Error('At least one valid SaMi app must be selected.');
  }

  return selectedApps;
}

/**
 * Ensure tenant_databases table exists
 */
export async function ensureTenantDatabaseRegistry(): Promise<void> {
  await queryControl(`
    CREATE TABLE IF NOT EXISTS tenant_databases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL DEFAULT 'postgresql',
      region VARCHAR(100),
      database_identifier VARCHAR(255) NOT NULL,
      database_name VARCHAR(255) NOT NULL,
      database_host VARCHAR(255),
      database_port INTEGER DEFAULT 5432,
      status VARCHAR(50) NOT NULL DEFAULT 'provisioning',
      provisioned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id)
    )
  `);

  await queryControl(`CREATE INDEX IF NOT EXISTS idx_tenant_databases_tenant_id ON tenant_databases(tenant_id)`);
  await queryControl(`CREATE INDEX IF NOT EXISTS idx_tenant_databases_status ON tenant_databases(status)`);
}

/**
 * PROVISION TENANT - Creates schema and installs core + app schemas
 * 
 * This version uses the SAME database (sami_control) with tenant schemas
 * instead of creating physical databases.
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
  const reuseExisting = options.reuseExisting ?? true;

  // 1. Validate tenant
  const tenantResult = await queryControl(
    `
      SELECT id, name, slug, status FROM tenants
      WHERE id = $1 AND deleted_at IS NULL LIMIT 1
    `,
    [tenantId]
  );

  if (tenantResult.rows.length === 0) {
    throw new Error(`Tenant ${tenantId} not found.`);
  }

  const tenant = tenantResult.rows[0];
  const selectedApps = getValidatedApps(selectedAppsInput);

  // 2. Ensure registry exists
  await ensureTenantDatabaseRegistry();

  // 3. Check if already provisioned
  if (reuseExisting) {
    const existing = await queryControl(
      `
        SELECT id, database_name, database_host, database_port
        FROM tenant_databases
        WHERE tenant_id = $1 AND status = 'active'
        LIMIT 1
      `,
      [tenantId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      console.log(`[SaMi] Tenant ${tenantId} already has database ${row.database_name}.`);
      
      // Still ensure modules are marked installed
      for (const appKey of selectedApps) {
        await queryControl(
          `
            UPDATE tenant_modules
            SET status = 'installed', installed_at = NOW()
            WHERE tenant_id = $1
            AND module_id = (SELECT id FROM modules WHERE key = $2 AND deleted_at IS NULL)
          `,
          [tenantId, appKey]
        );
      }

      return {
        success: true,
        tenantId,
        database: {
          databaseId: String(row.id),
          databaseName: String(row.database_name),
          databaseHost: String(row.database_host || 'localhost'),
          databasePort: Number(row.database_port || 5432),
        },
        appsInstalled: selectedApps,
      };
    }
  }

  // 4. Generate schema name
  const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
  const databaseName = process.env.POSTGRES_DB || 'sami_control';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432');

  try {
    // 5. Update tenant status to provisioning
    await queryControl(
      `
        UPDATE tenants SET status = 'provisioning', updated_at = NOW()
        WHERE id = $1
      `,
      [tenantId]
    );

    // 6. Insert/Update tenant_databases record
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
          $1, 'postgresql', $2, $3, $4, $5, $6, 'provisioning', NOW(), NOW()
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
        process.env.POSTGRES_REGION || 'us-east-1',
        schemaName,
        databaseName,
        host,
        port,
      ]
    );

    // 7. Create schema for tenant
    await queryControl(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    console.log(`[SaMi] Created schema ${schemaName}`);

    // 8. Install core schema
    const coreSchema = await readTenantCoreSchema();
    const coreSql = coreSchema.replace(/\{schema\}/g, schemaName);
    await runSqlStatements(coreSql, 'SaMi CORE schema');
    console.log(`[SaMi] Core schema installed in ${schemaName}`);

    // 9. Install each selected app schema
    for (const appKey of selectedApps) {
      const appSchema = await readAppSchema(appKey);
      const appSql = appSchema.replace(/\{schema\}/g, schemaName);
      await runSqlStatements(appSql, `App "${appKey}" schema`);
      console.log(`[SaMi] App ${appKey} schema installed in ${schemaName}`);
    }

    // 10. Update tenant_modules to installed
    for (const appKey of selectedApps) {
      await queryControl(
        `
          UPDATE tenant_modules
          SET status = 'installed', installed_at = NOW()
          WHERE tenant_id = $1
          AND module_id = (SELECT id FROM modules WHERE key = $2 AND deleted_at IS NULL)
        `,
        [tenantId, appKey]
      );
    }

    // 11. Mark tenant database active
    await queryControl(
      `
        UPDATE tenant_databases
        SET status = 'active', provisioned_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1
      `,
      [tenantId]
    );

    // 12. Get database ID
    const dbResult = await queryControl(
      `
        SELECT id FROM tenant_databases WHERE tenant_id = $1 LIMIT 1
      `,
      [tenantId]
    );

    const databaseId = dbResult.rows.length > 0 ? String(dbResult.rows[0].id) : '';

    // 13. Update tenant status to active
    await queryControl(
      `
        UPDATE tenants SET status = 'active', updated_at = NOW()
        WHERE id = $1
      `,
      [tenantId]
    );

    const result: TenantDatabaseProvisionResult = {
      databaseId,
      databaseName,
      databaseHost: host,
      databasePort: port,
    };

    console.log(
      `[SaMi] Tenant ${tenantId} provisioned successfully. Schema=${schemaName}, Apps=${selectedApps.join(', ')}`
    );

    return {
      success: true,
      tenantId,
      database: result,
      appsInstalled: selectedApps,
    };

  } catch (error) {
    console.error(`[SaMi] Provisioning failed for tenant ${tenantId}:`, error);

    // Mark tenant as failed
    try {
      await queryControl(
        `
          UPDATE tenants SET status = 'provisioning_failed', updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId]
      );
    } catch (statusError) {
      console.error(`[SaMi] Failed to update tenant ${tenantId} status:`, statusError);
    }

    // Mark database as failed
    try {
      await queryControl(
        `
          UPDATE tenant_databases SET status = 'failed', updated_at = NOW()
          WHERE tenant_id = $1
        `,
        [tenantId]
      );
    } catch (dbError) {
      console.error(`[SaMi] Failed to update tenant_databases for ${tenantId}:`, dbError);
    }

    throw error;
  }
}

/**
 * Alias for compatibility
 */
export async function provisionTenantDatabase(
  tenantId: string,
  businessSlug: string,
  appKeys: unknown
): Promise<TenantDatabaseProvisionResult> {
  void businessSlug;
  const result = await provisionTenant(tenantId, appKeys);
  return result.database;
}

/**
 * Delete tenant database
 */
export async function deleteTenantDatabase(tenantId: string): Promise<void> {
  await ensureTenantDatabaseRegistry();

  const result = await queryControl(
    `
      SELECT database_name FROM tenant_databases WHERE tenant_id = $1 LIMIT 1
    `,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return;
  }

  // Delete the record
  await queryControl(`DELETE FROM tenant_databases WHERE tenant_id = $1`, [tenantId]);
  console.log(`[SaMi] Deleted tenant database record for ${tenantId}`);
}