import { queryControl } from '@/lib/db/control';
import fs from 'fs';
import path from 'path';
import { SAMI_APPS } from '@/lib/sami-apps';

interface DatabaseResult {
  databaseName: string;
  host: string;
  port: number;
}

export async function createTenantDatabase(tenantId: string, businessName: string): Promise<DatabaseResult> {
  const dbName = `sami_${tenantId.replace(/-/g, '_')}`;
  
  await queryControl(
    `INSERT INTO tenant_databases (
      tenant_id,
      provider,
      region,
      database_identifier,
      database_name,
      status,
      provisioned_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    RETURNING id`,
    [
      tenantId,
      'neon',
      'us-east-2',
      dbName,
      process.env.POSTGRES_DB || 'sami_control',
      'provisioned'
    ]
  );

  return {
    databaseName: process.env.POSTGRES_DB || 'sami_control',
    host: process.env.POSTGRES_HOST || '',
    port: parseInt(process.env.POSTGRES_PORT || '5432')
  };
}

export async function installCoreSchema(tenantId: string, databaseName: string) {
  const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
  
  // Create schema
  await queryControl(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  
  // Read core schema SQL
  const coreSchemaPath = path.join(process.cwd(), 'lib/schema/tenant-core.sql');
  
  if (!fs.existsSync(coreSchemaPath)) {
    throw new Error(`Core schema file not found at ${coreSchemaPath}`);
  }
  
  const coreSql = fs.readFileSync(coreSchemaPath, 'utf8');
  
  // Replace {schema} placeholder with actual schema name
  const processedSql = coreSql.replace(/\{schema\}/g, schemaName);
  
  // Execute each statement
  const statements = processedSql
    .split(';')
    .filter(stmt => stmt.trim().length > 0);
  
  for (const statement of statements) {
    await queryControl(statement);
  }

  // Record core module installation
  await queryControl(
    `INSERT INTO tenant_modules (tenant_id, module_id, status, installed_at)
     SELECT $1, id, 'installed', NOW()
     FROM modules WHERE key = 'core'`,
    [tenantId]
  );

  console.log(`Core schema installed for tenant ${tenantId}`);
}

export async function installAppSchema(tenantId: string, appKey: string, databaseName: string) {
  const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
  
  // Verify app exists
  const app = SAMI_APPS.find(a => a.key === appKey);
  if (!app) {
    throw new Error(`App ${appKey} not found in SAMI_APPS`);
  }

  // Get module
  const moduleResult = await queryControl(
    `SELECT id FROM modules WHERE key = $1 AND deleted_at IS NULL`,
    [appKey]
  );

  if (moduleResult.rows.length === 0) {
    throw new Error(`Module ${appKey} not found in modules table`);
  }

  // Read app schema SQL
  const appSchemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
  
  if (!fs.existsSync(appSchemaPath)) {
    throw new Error(`App schema file not found at ${appSchemaPath}`);
  }
  
  const appSql = fs.readFileSync(appSchemaPath, 'utf8');
  
  // Replace {schema} placeholder with actual schema name
  const processedSql = appSql.replace(/\{schema\}/g, schemaName);
  
  // Execute each statement
  const statements = processedSql
    .split(';')
    .filter(stmt => stmt.trim().length > 0);
  
  for (const statement of statements) {
    await queryControl(statement);
  }

  // Update tenant_modules status
  await queryControl(
    `UPDATE tenant_modules 
     SET status = 'installed', installed_at = NOW() 
     WHERE tenant_id = $1 AND module_id = $2`,
    [tenantId, moduleResult.rows[0].id]
  );

  console.log(`App ${appKey} schema installed for tenant ${tenantId}`);
}

export async function provisionTenant(tenantId: string, selectedApps: string[]) {
  try {
    // 1. Get tenant info
    const tenantResult = await queryControl(
      `SELECT name FROM tenants WHERE id = $1`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const tenantName = tenantResult.rows[0].name;

    // 2. Create tenant database
    const dbResult = await createTenantDatabase(tenantId, tenantName);

    // 3. Install core schema
    await installCoreSchema(tenantId, dbResult.databaseName);

    // 4. Install each app schema
    for (const appKey of selectedApps) {
      await installAppSchema(tenantId, appKey, dbResult.databaseName);
    }

    // 5. Update tenant status to active
    await queryControl(
      `UPDATE tenants SET status = 'active' WHERE id = $1`,
      [tenantId]
    );

    // 6. Update tenant_modules status
    await queryControl(
      `UPDATE tenant_modules 
       SET status = 'installed', installed_at = NOW() 
       WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId]
    );

    console.log(`Tenant ${tenantId} fully provisioned with ${selectedApps.length} apps`);
    
    return {
      success: true,
      tenantId,
      database: dbResult,
      appsInstalled: selectedApps
    };

  } catch (error) {
    console.error(`Provisioning failed for tenant ${tenantId}:`, error);
    
    // Update tenant status to failed
    await queryControl(
      `UPDATE tenants SET status = 'provisioning_failed' WHERE id = $1`,
      [tenantId]
    );
    
    throw error;
  }
}