import { Pool } from 'pg';
import { queryControl } from '@/lib/db/control';
import fs from 'fs';
import path from 'path';

export async function createTenantDatabase(tenantId: string): Promise<string> {
  const safeId = tenantId.replace(/-/g, '_');
  const databaseName = `sami_tenant_${safeId}`;
  
  const adminPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    database: 'postgres',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    console.log(`✅ Database ${databaseName} created`);
    return databaseName;
  } catch (error) {
    console.error(`Failed to create database ${databaseName}:`, error);
    throw error;
  } finally {
    await adminPool.end();
  }
}

export async function installCoreSchema(databaseName: string): Promise<void> {
  const coreSchemaPath = path.join(process.cwd(), 'lib/schema/tenant-core.sql');
  
  if (!fs.existsSync(coreSchemaPath)) {
    throw new Error(`Core schema not found at ${coreSchemaPath}`);
  }

  const coreSchema = fs.readFileSync(coreSchemaPath, 'utf-8');
  
  const tenantPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    database: databaseName,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await tenantPool.query(coreSchema);
    console.log(`✅ Core schema installed in ${databaseName}`);
  } finally {
    await tenantPool.end();
  }
}

export async function installAppSchema(databaseName: string, appKey: string): Promise<void> {
  const appSchemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
  
  if (!fs.existsSync(appSchemaPath)) {
    console.warn(`⚠️ Schema not found for app: ${appKey}`);
    return;
  }
  
  const appSchema = fs.readFileSync(appSchemaPath, 'utf-8');
  
  const tenantPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    database: databaseName,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await tenantPool.query(appSchema);
    console.log(`✅ App schema installed for ${appKey} in ${databaseName}`);
  } finally {
    await tenantPool.end();
  }
}

export async function registerTenantDatabase(tenantId: string, databaseName: string): Promise<void> {
  await queryControl(
    `INSERT INTO tenant_databases (tenant_id, database_name, provider, status, provisioned_at)
     VALUES ($1, $2, 'neon', 'active', NOW())`,
    [tenantId, databaseName]
  );
  console.log(`✅ Database registered for tenant ${tenantId}`);
}

export async function provisionTenantDatabase(
  tenantId: string,
  selectedApps: string[]
): Promise<{ success: boolean; databaseName?: string; error?: string }> {
  try {
    const databaseName = await createTenantDatabase(tenantId);
    await installCoreSchema(databaseName);
    
    for (const app of selectedApps) {
      await installAppSchema(databaseName, app);
    }
    
    await registerTenantDatabase(tenantId, databaseName);
    
    return { success: true, databaseName };
  } catch (error) {
    console.error('❌ Provisioning failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}