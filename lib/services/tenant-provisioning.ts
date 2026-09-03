import { queryControl } from '@/lib/db/control';
import fs from 'fs';
import path from 'path';

interface TenantDatabaseProvisionResult {
  databaseId: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
}

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
      console.log(`[SaMi] Executed SQL ${index + 1}/${statements.length} for ${label}`);
    } catch (error) {
      console.error(`[SaMi] SQL Error in ${label} at statement ${index + 1}:`, error);
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
 * PROVISION TENANT - Creates schema and installs core + app schemas
 */
export async function provisionTenant(
  tenantId: string,
  selectedAppsInput: unknown
): Promise<{
  success: boolean;
  tenantId: string;
  appsInstalled: string[];
}> {
  console.log(`[SaMi] Starting provisioning for tenant ${tenantId}`);

  try {
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
    console.log(`[SaMi] Tenant found: ${tenant.name} (${tenant.status})`);

    // 2. Get validated apps
    const selectedApps = getValidatedApps(selectedAppsInput);
    console.log(`[SaMi] Apps to install: ${selectedApps.join(', ')}`);

    // 3. Generate schema name
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    console.log(`[SaMi] Schema name: ${schemaName}`);

    // 4. Check if schema already exists
    const schemaCheck = await queryControl(
      `
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = $1
      `,
      [schemaName]
    );

    const schemaExists = schemaCheck.rows.length > 0;
    console.log(`[SaMi] Schema exists: ${schemaExists}`);

    if (!schemaExists) {
      // 5. Create schema
      await queryControl(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      console.log(`[SaMi] Created schema ${schemaName}`);
    }

    // 6. Install core schema
    try {
      console.log(`[SaMi] Installing core schema...`);
      const coreSchema = await readTenantCoreSchema();
      const coreSql = coreSchema.replace(/\{schema\}/g, schemaName);
      await runSqlStatements(coreSql, 'SaMi CORE schema');
      console.log(`[SaMi] Core schema installed successfully`);
    } catch (coreError) {
      console.error(`[SaMi] Core schema installation failed:`, coreError);
      throw new Error(`Core schema installation failed: ${coreError instanceof Error ? coreError.message : String(coreError)}`);
    }

    // 7. Install each app schema
    for (const appKey of selectedApps) {
      try {
        console.log(`[SaMi] Installing app schema: ${appKey}`);
        const appSchema = await readAppSchema(appKey);
        const appSql = appSchema.replace(/\{schema\}/g, schemaName);
        await runSqlStatements(appSql, `App "${appKey}" schema`);
        console.log(`[SaMi] App ${appKey} schema installed successfully`);
      } catch (appError) {
        console.error(`[SaMi] App ${appKey} schema installation failed:`, appError);
        // Continue with other apps
      }
    }

    // 8. Update tenant_modules to installed
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
      console.log(`[SaMi] Updated tenant_modules for ${appKey}`);
    }

    // 9. Update tenant_databases
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
          provisioned_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, 'postgresql', $2, $3, $4, $5, $6, 'active', NOW(), NOW(), NOW()
        )
        ON CONFLICT (tenant_id)
        DO UPDATE SET
          provider = EXCLUDED.provider,
          region = EXCLUDED.region,
          database_identifier = EXCLUDED.database_identifier,
          database_name = EXCLUDED.database_name,
          database_host = EXCLUDED.database_host,
          database_port = EXCLUDED.database_port,
          status = 'active',
          provisioned_at = NOW(),
          updated_at = NOW()
      `,
      [
        tenantId,
        process.env.POSTGRES_REGION || 'us-east-1',
        schemaName,
        process.env.POSTGRES_DB || 'sami_control',
        process.env.POSTGRES_HOST || 'localhost',
        parseInt(process.env.POSTGRES_PORT || '5432'),
      ]
    );
    console.log(`[SaMi] Updated tenant_databases for ${tenantId}`);

    // 10. Update tenant status to active
    await queryControl(
      `
        UPDATE tenants SET status = 'active', updated_at = NOW()
        WHERE id = $1
      `,
      [tenantId]
    );
    console.log(`[SaMi] Tenant ${tenantId} status updated to active`);

    console.log(`[SaMi] ✅ Tenant ${tenantId} provisioned successfully. Schema=${schemaName}, Apps=${selectedApps.join(', ')}`);

    return {
      success: true,
      tenantId,
      appsInstalled: selectedApps,
    };

  } catch (error) {
    console.error(`[SaMi] ❌ Provisioning failed for tenant ${tenantId}:`, error);

    // Update tenant status to failed
    try {
      await queryControl(
        `
          UPDATE tenants SET status = 'provisioning_failed', updated_at = NOW()
          WHERE id = $1
        `,
        [tenantId]
      );
    } catch (statusError) {
      console.error(`[SaMi] Failed to update tenant status:`, statusError);
    }

    throw error;
  }
}