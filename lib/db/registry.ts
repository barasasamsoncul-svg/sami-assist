import { queryControl } from './control';

export interface TenantDatabase {
  id: string;
  business_id: string;
  database_name: string;
  database_host: string;
  database_port: number;
  database_user: string;
  database_password_encrypted: string;
}

// Get tenant database info for a business
export async function getTenantDatabase(businessId: string): Promise<TenantDatabase | null> {
  const result = await queryControl(
    `SELECT * FROM database_registry WHERE business_id = $1 AND status = 'active'`,
    [businessId]
  );
  
  return result.rows[0] || null;
}

// Get database name only (used for routing queries)
export async function getTenantDatabaseName(businessId: string): Promise<string | null> {
  const db = await getTenantDatabase(businessId);
  return db?.database_name || null;
}