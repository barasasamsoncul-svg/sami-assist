import { Pool } from 'pg';

// Cache of tenant database pools
const tenantPools: Map<string, Pool> = new Map();

export function getTenantPool(databaseName: string): Pool {
  if (!tenantPools.has(databaseName)) {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_ADMIN_USER,
      password: process.env.POSTGRES_ADMIN_PASSWORD,
      database: databaseName, // sami_tenant_<business_id>
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    tenantPools.set(databaseName, pool);
  }
  return tenantPools.get(databaseName)!;
}

// Helper to run queries on a tenant database
export async function queryTenant(databaseName: string, text: string, params?: any[]) {
  const pool = getTenantPool(databaseName);
  const result = await pool.query(text, params);
  return result;
}