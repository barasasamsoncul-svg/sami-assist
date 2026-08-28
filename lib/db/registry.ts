import { queryControl } from './control';

export async function getTenantDatabase(tenantId: string) {
  const result = await queryControl(
    `SELECT * FROM tenant_databases WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

export async function getTenantDatabaseName(tenantId: string): Promise<string | null> {
  const db = await getTenantDatabase(tenantId);
  return db?.database_name || null;
}