import { Pool } from 'pg';

// Singleton pool for the control database
let controlPool: Pool | null = null;

export function getControlPool(): Pool {
  if (!controlPool) {
    controlPool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_ADMIN_USER,
      password: process.env.POSTGRES_ADMIN_PASSWORD,
      database: process.env.POSTGRES_DB, // sami_control
      max: 20, // Maximum connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return controlPool;
}

// Helper to run queries on control database
export async function queryControl(text: string, params?: any[]) {
  const pool = getControlPool();
  const result = await pool.query(text, params);
  return result;
}