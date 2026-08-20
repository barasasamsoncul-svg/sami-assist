import { Pool } from "pg";
import { postgresAdmin } from "./postgres-admin";

type TenantRecord = {
  business_id: string;
  business_name: string;
  business_slug: string;
  business_status: string;
  database_name: string;
  database_host: string;
  database_port: number;
  database_user: string;
  database_password_encrypted: string;
  database_status: string;
};

export type TenantDatabase = {
  pool: Pool;
  business: {
    id: string;
    name: string;
    slug: string;
  };
  databaseName: string;
};

const tenantPools = new Map<string, Pool>();

async function findTenant(
  userId: string,
  businessId?: string
): Promise<TenantRecord> {
  const values: unknown[] = [userId];

  let businessCondition = "";

  if (businessId) {
    values.push(businessId);

    businessCondition = `
      AND b.id = $2
    `;
  }

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
        ${businessCondition}
        AND b.status = 'active'
        AND dr.status = 'active'
      ORDER BY bu.created_at ASC
      LIMIT 1
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new Error(
      businessId
        ? "You are not a member of this business or its tenant database is unavailable."
        : "No active business or tenant database is assigned to this user."
    );
  }

  return result.rows[0] as TenantRecord;
}

export async function getTenantDatabaseForUser(
  userId: string,
  businessId?: string
): Promise<TenantDatabase> {
  const tenant = await findTenant(
    userId,
    businessId
  );

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

export async function closeTenantPool(
  databaseName: string
): Promise<void> {
  const pool =
    tenantPools.get(databaseName);

  if (!pool) {
    return;
  }

  await pool.end();

  tenantPools.delete(databaseName);
}

export async function closeAllTenantPools(): Promise<void> {
  const pools = [...tenantPools.values()];

  await Promise.all(
    pools.map((pool) => pool.end())
  );

  tenantPools.clear();
}