import { postgresAdmin } from "./postgres-admin";
import { normalizeAppKeys } from "./sami-apps";

let tableReady = false;

async function ensureBusinessAppsTable() {
  if (tableReady) return;

  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS business_apps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      app_key VARCHAR(100) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, app_key)
    );

    CREATE INDEX IF NOT EXISTS idx_business_apps_business
      ON business_apps(business_id);
  `);

  tableReady = true;
}

export async function getBusinessForUser(userId: string) {
  const result = await postgresAdmin.query(
    `SELECT b.id, b.name, b.slug
     FROM business_users bu
     INNER JOIN businesses b ON b.id = bu.business_id
     WHERE bu.user_id = $1
       AND b.status = 'active'
     ORDER BY b.created_at ASC
     LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error("No active business is assigned to this user.");
  }

  return result.rows[0] as {
    id: string;
    name: string;
    slug: string;
  };
}

export async function getEnabledAppIds(businessId: string) {
  await ensureBusinessAppsTable();

  const result = await postgresAdmin.query(
    `SELECT app_key
     FROM business_apps
     WHERE business_id = $1
       AND enabled = true
     ORDER BY app_key`,
    [businessId]
  );

  return result.rows.map((row) => String(row.app_key));
}

export async function saveEnabledAppIds(
  businessId: string,
  appIds: unknown
) {
  await ensureBusinessAppsTable();

  const cleanIds = normalizeAppKeys(appIds);

  const client = await postgresAdmin.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE business_apps
       SET enabled = false,
           updated_at = NOW()
       WHERE business_id = $1`,
      [businessId]
    );

    for (const appKey of cleanIds) {
      await client.query(
        `INSERT INTO business_apps (
           business_id,
           app_key,
           enabled,
           created_at,
           updated_at
         )
         VALUES ($1, $2, true, NOW(), NOW())
         ON CONFLICT (business_id, app_key)
         DO UPDATE SET
           enabled = true,
           updated_at = NOW()`,
        [businessId, appKey]
      );
    }

    await client.query("COMMIT");
    return cleanIds;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
