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
    )
  `);

  tableReady = true;
}

export async function saveEnabledApps(businessId: string, appKeys: unknown) {
  await ensureBusinessAppsTable();

  const normalized = normalizeAppKeys(appKeys);

  await postgresAdmin.query(
    `DELETE FROM business_apps WHERE business_id = $1`,
    [businessId]
  );

  for (const appKey of normalized) {
    await postgresAdmin.query(
      `INSERT INTO business_apps (business_id, app_key, enabled)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (business_id, app_key)
       DO UPDATE SET enabled = TRUE, updated_at = NOW()`,
      [businessId, appKey]
    );
  }

  return normalized;
}

export async function getEnabledAppsForUser(userId: string) {
  await ensureBusinessAppsTable();

  const result = await postgresAdmin.query(
    `SELECT b.id AS business_id
     FROM business_users bu
     INNER JOIN businesses b ON b.id = bu.business_id
     WHERE bu.user_id = $1 AND b.status = 'active'
     LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error("No active business is assigned to this user.");
  }

  const businessId = result.rows[0].business_id as string;

  const apps = await postgresAdmin.query(
    `SELECT app_key
     FROM business_apps
     WHERE business_id = $1 AND enabled = TRUE
     ORDER BY created_at ASC`,
    [businessId]
  );

  return {
    businessId,
    appKeys: apps.rows.map((row) => row.app_key as string),
  };
}
