import { Pool } from "pg";
import { postgresAdmin } from "./postgres-admin";

const tenantPools = new Map<string, Pool>();

export async function getTenantDatabaseForUser(
  userId: string
) {
  const result = await postgresAdmin.query(
    `
    SELECT
      b.id AS business_id,
      b.name AS business_name,
      b.slug AS business_slug,
      b.status AS business_status,
      dr.database_name,
      dr.database_host,
      dr.database_port,
      dr.database_user,
      dr.database_password_encrypted,
      dr.status AS database_status
    FROM business_users bu
    INNER JOIN businesses b
      ON b.id = bu.business_id
    INNER JOIN database_registry dr
      ON dr.business_id = b.id
    WHERE bu.user_id = $1
      AND b.status = 'active'
      AND dr.status = 'active'
    LIMIT 1
    `,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error(
      "No active business or tenant database is assigned to this user."
    );
  }

  const tenant = result.rows[0];

  const existingPool = tenantPools.get(
    tenant.database_name
  );

  if (existingPool) {
    return {
      pool: existingPool,
      business: {
        id: tenant.business_id,
        name: tenant.business_name,
        slug: tenant.business_slug,
      },
      databaseName: tenant.database_name,
    };
  }

  const pool = new Pool({
    host: tenant.database_host,
    port: Number(tenant.database_port),
    user: tenant.database_user,
    password:
      tenant.database_password_encrypted,
    database: tenant.database_name,

    ssl: {
      rejectUnauthorized: false,
    },

    max: 10,

    idleTimeoutMillis: 30_000,

    connectionTimeoutMillis: 10_000,
  });

  tenantPools.set(
    tenant.database_name,
    pool
  );

  return {
    pool,
    business: {
      id: tenant.business_id,
      name: tenant.business_name,
      slug: tenant.business_slug,
    },
    databaseName: tenant.database_name,
  };
}