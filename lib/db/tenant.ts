import { Pool } from 'pg';

const tenantPools: Map<string, Pool> = new Map();

export function getTenantPool(databaseName: string): Pool {
  if (!tenantPools.has(databaseName)) {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_ADMIN_USER,
      password: process.env.POSTGRES_ADMIN_PASSWORD,
      database: databaseName,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });

    pool.on('error', (err) => {
      console.error(`Tenant DB pool error (${databaseName}):`, err);
      tenantPools.delete(databaseName);
    });

    tenantPools.set(databaseName, pool);
  }
  return tenantPools.get(databaseName)!;
}

export async function queryTenant(databaseName: string, text: string, params?: any[]) {
  const pool = getTenantPool(databaseName);
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`Slow tenant query (${duration}ms): ${text.substring(0, 100)}`);
  }
  return result;
}