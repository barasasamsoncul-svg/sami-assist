import { Pool } from 'pg';
import { queryControl } from '../db/control';
import fs from 'fs';
import path from 'path';

// Create a new tenant database
export async function createTenantDatabase(businessId: string, businessName: string) {
  // Generate safe database name
  const safeId = businessId.replace(/-/g, '_');
  const databaseName = `sami_tenant_${safeId}`;
  
  // Connect to the default postgres database to create new database
  const adminPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    database: 'postgres', // Connect to default database
  });

  try {
    // Create the database
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    console.log(`? Database ${databaseName} created`);
    
    return databaseName;
  } finally {
    await adminPool.end();
  }
}

// Install core schema into tenant database
export async function installCoreSchema(databaseName: string) {
  const coreSchemaPath = path.join(process.cwd(), 'lib/sami_tenant_core.sql');
  const coreSchema = fs.readFileSync(coreSchemaPath, 'utf-8');
  
  const tenantPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    database: databaseName,
  });

  try {
    await tenantPool.query(coreSchema);
    console.log(`? Core schema installed in ${databaseName}`);
  } finally {
    await tenantPool.end();
  }
}

// Install app schema into tenant database
export async function installAppSchema(databaseName: string, appKey: string) {
  const appSchemaPath = path.join(process.cwd(), `lib/apps/${appKey}/schema.sql`);
  
  // Check if schema file exists
  if (!fs.existsSync(appSchemaPath)) {
    console.warn(`?? Schema not found for app: ${appKey}`);
    return;
  }
  
  const appSchema = fs.readFileSync(appSchemaPath, 'utf-8');
  
  const tenantPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_ADMIN_USER,
    password: process.env.POSTGRES_ADMIN_PASSWORD,
    database: databaseName,
  });

  try {
    await tenantPool.query(appSchema);
    console.log(`? App schema installed for ${appKey} in ${databaseName}`);
  } finally {
    await tenantPool.end();
  }
}

// Register tenant database in control database
export async function registerTenantDatabase(
  businessId: string,
  databaseName: string
) {
  await queryControl(
    `INSERT INTO database_registry (business_id, database_name, database_host, database_port, database_user, database_password_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      businessId,
      databaseName,
      process.env.POSTGRES_HOST,
      parseInt(process.env.POSTGRES_PORT || '5432'),
      process.env.POSTGRES_ADMIN_USER,
      process.env.POSTGRES_ADMIN_PASSWORD, // In production, encrypt this
    ]
  );
  console.log(`? Database registered for business ${businessId}`);
}

// Full provisioning flow
export async function provisionBusinessDatabase(
  businessId: string,
  businessName: string,
  selectedApps: string[]
) {
  try {
    // 1. Create database
    const databaseName = await createTenantDatabase(businessId, businessName);
    
    // 2. Install core schema
    await installCoreSchema(databaseName);
    
    // 3. Install selected app schemas
    for (const app of selectedApps) {
      await installAppSchema(databaseName, app);
    }
    
    // 4. Register in control database
    await registerTenantDatabase(businessId, databaseName);
    
    return {
      success: true,
      databaseName,
    };
  } catch (error) {
    console.error('? Provisioning failed:', error);
    return {
  success: false,
  error: error instanceof Error ? error.message : 'Unknown error',
};
  }
}
