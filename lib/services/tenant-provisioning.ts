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

/**
 * Create a physical database for a tenant using admin connection
 */
async function createTenantDatabase(tenantId: string, tenantName: string): Promise<{
  databaseName: string;
  host: string;
  port: number;
}> {
  const cleanName = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 30);
  
  const dbName = `sami_${cleanName}_${tenantId.slice(0, 8)}`;

  const adminClient = new Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'postgres',
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await adminClient.connect();

  try {
    const checkResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`[SaMi] Created database ${dbName}`);
    } else {
      console.log(`[SaMi] Database ${dbName} already exists`);
    }
  } finally {
    await adminClient.end();
  }

  return {
    databaseName: dbName,
    host: process.env.POSTGRES_HOST || '',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
  };
}

/**
 * Install core schema into a tenant's physical database
 * FAILS the entire provisioning if core schema fails
 */
async function installCoreSchema(databaseName: string): Promise<void> {
  const tenantClient = new Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: databaseName,
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await tenantClient.connect();

  try {
    const coreSchemaPath = path.join(process.cwd(), 'lib', 'schema', 'tenant-core.sql');
    if (!fs.existsSync(coreSchemaPath)) {
      throw new Error(`Core schema file not found at ${coreSchemaPath}`);
    }

    let coreSql = fs.readFileSync(coreSchemaPath, 'utf8');
    coreSql = coreSql.replace(/\{schema\}/g, 'public');
    
    const statements = coreSql.split(';').filter(stmt => stmt.trim().length > 0);
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await tenantClient.query(statement);
      } catch (error) {
        throw new Error(
          `Core schema failed at statement ${i + 1}/${statements.length}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    console.log(`[SaMi] Core schema installed successfully in ${databaseName}`);
  } finally {
    await tenantClient.end();
  }
}

/**
 * Install a single app schema into a tenant's physical database
 * Returns success/failure without throwing
 */
async function installAppSchema(databaseName: string, appKey: string): Promise<AppInstallResult> {
  const tenantClient = new Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: databaseName,
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await tenantClient.connect();

  try {
    const appSchemaPath = path.join(process.cwd(), 'lib', 'apps', appKey, 'schema.sql');
    if (!fs.existsSync(appSchemaPath)) {
      return {
        appKey,
        success: false,
        error: `Schema file not found for app "${appKey}" at ${appSchemaPath}`,
      };
    }

    let appSql = fs.readFileSync(appSchemaPath, 'utf8');
    appSql = appSql.replace(/\{schema\}/g, 'public');
    
    const statements = appSql.split(';').filter(stmt => stmt.trim().length > 0);
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await tenantClient.query(statement);
      } catch (error) {
        return {
          appKey,
          success: false,
          error: `Failed at statement ${i + 1}/${statements.length}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    
    console.log(`[SaMi] App ${appKey} schema installed successfully in ${databaseName}`);
    return { appKey, success: true };
  } finally {
    await tenantClient.end();
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
 * PROVISION TENANT - Creates physical database and installs schemas
 * 
 * Core schema must succeed - fails entire provisioning if it fails
 * App schemas can fail individually - does NOT fail entire provisioning
 */
export async function provisionTenant(
  tenantId: string,
  selectedAppsInput: unknown
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
    const selectedApps = getValidatedApps(selectedAppsInput);

    // 2. Create physical database
    const dbInfo = await createTenantDatabase(tenantId, tenant.name);
    console.log(`[SaMi] Created database ${dbInfo.databaseName}`);

    // 3. Install core schema (MUST succeed)
    await installCoreSchema(dbInfo.databaseName);
    console.log(`[SaMi] Core schema installed in ${dbInfo.databaseName}`);

    // 4. Install each app schema (individual failures are caught)
    const appResults: AppInstallResult[] = [];
    const successfulApps: string[] = [];

    for (const appKey of selectedApps) {
      const result = await installAppSchema(dbInfo.databaseName, appKey);
      appResults.push(result);
      
      if (result.success) {
        successfulApps.push(appKey);
      } else {
        console.error(`[SaMi] App ${appKey} installation failed:`, result.error);
      }
    }

    // 5. Update tenant_modules based on installation results
    for (const appKey of selectedApps) {
      const result = appResults.find(r => r.appKey === appKey);
      const status = result?.success ? 'installed' : 'failed';
      
      await queryControl(
        `
          UPDATE tenant_modules
          SET 
            status = $3,
            installed_at = CASE WHEN $3 = 'installed' THEN NOW() ELSE installed_at END,
            updated_at = NOW()
          WHERE tenant_id = $1
          AND module_id = (SELECT id FROM modules WHERE key = $2 AND deleted_at IS NULL)
        `,
        [tenantId, appKey, status]
      );
    }

    // 6. Update tenant_databases registry
    const dbResult = await queryControl(
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
          $1, 'postgresql', $2, $3, $4, $5, $6, '1.0.0', 'active', NOW(), NOW(), NOW()
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
        process.env.POSTGRES_REGION || 'us-east-1',
        `tenant_${tenantId.replace(/-/g, '_')}`,
        dbInfo.databaseName,
        dbInfo.host,
        dbInfo.port,
      ]
    );

    const databaseId = dbResult.rows.length > 0 ? String(dbResult.rows[0].id) : '';

    // 7. Update tenant status to active (even if some apps failed)
    await queryControl(
      `
        UPDATE tenants SET status = 'active', updated_at = NOW()
        WHERE id = $1
      `,
      [tenantId]
    );

    const failedCount = appResults.filter(r => !r.success).length;
    const successCount = appResults.filter(r => r.success).length;

    console.log(
      `[SaMi] ✅ Tenant ${tenantId} provisioned successfully. Database=${dbInfo.databaseName}, ` +
      `Apps: ${successCount} installed, ${failedCount} failed`
    );

    return {
      success: true,
      tenantId,
      databaseId,
      databaseName: dbInfo.databaseName,
      databaseHost: dbInfo.host,
      databasePort: dbInfo.port,
      appsInstalled: successfulApps,
      appsFailed: appResults.filter(r => !r.success),
    };

  } catch (error) {
    console.error(`[SaMi] ❌ Provisioning failed for tenant ${tenantId}:`, error);

    // Update tenant status to failed (core schema failed)
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

export async function provisionTenantDatabase(
  tenantId: string,
  businessSlug: string,
  appKeys: unknown
): Promise<TenantDatabaseProvisionResult> {
  void businessSlug;
  const result = await provisionTenant(tenantId, appKeys);
  return {
    databaseId: result.databaseId || '',
    databaseName: result.databaseName || '',
    databaseHost: result.databaseHost || '',
    databasePort: result.databasePort || 5432,
  };
}

export async function deleteTenantDatabase(tenantId: string): Promise<void> {
  const result = await queryControl(
    `
      SELECT database_name FROM tenant_databases WHERE tenant_id = $1 LIMIT 1
    `,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return;
  }

  const databaseName = result.rows[0].database_name;

  const adminClient = new Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'postgres',
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  await adminClient.connect();

  try {
    await adminClient.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [databaseName]
    );

    await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    console.log(`[SaMi] Dropped database ${databaseName}`);
  } finally {
    await adminClient.end();
  }

  await queryControl(`DELETE FROM tenant_databases WHERE tenant_id = $1`, [tenantId]);
}