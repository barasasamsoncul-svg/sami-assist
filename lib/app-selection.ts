import { postgresAdmin } from "./postgres-admin";

let tableReady = false;

export async function ensureBusinessAppSelectionsTable() {
  if (tableReady) return;

  await postgresAdmin.query(`
    CREATE TABLE IF NOT EXISTS business_app_selections (
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      app_id VARCHAR(120) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (business_id, app_id)
    );
    CREATE INDEX IF NOT EXISTS idx_business_app_selections_business
      ON business_app_selections(business_id);
  `);

  tableReady = true;
}

export async function getBusinessForUser(userId: string) {
  const result = await postgresAdmin.query(
    `SELECT b.id, b.name, b.slug
     FROM business_users bu
     INNER JOIN businesses b ON b.id = bu.business_id
     WHERE bu.user_id = $1 AND b.status = 'active'
     ORDER BY b.created_at ASC LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error("No active business is assigned to this user.");
  }

  return result.rows[0] as { id: string; name: string; slug: string };
}

export async function getEnabledAppIds(businessId: string) {
  await ensureBusinessAppSelectionsTable();

  const result = await postgresAdmin.query(
    `SELECT app_id
     FROM business_app_selections
     WHERE business_id = $1 AND enabled = true
     ORDER BY app_id`,
    [businessId]
  );

  return result.rows.map((row) => String(row.app_id));
}

export async function saveEnabledAppIds(
  businessId: string,
  appIds: string[]
) {
  await ensureBusinessAppSelectionsTable();

  const cleanIds = [...new Set(
    appIds.filter((id) => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean)
  )];

  const client = await postgresAdmin.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE business_app_selections
       SET enabled = false, updated_at = NOW()
       WHERE business_id = $1`,
      [businessId]
    );

    for (const appId of cleanIds) {
      await client.query(
        `INSERT INTO business_app_selections
           (business_id, app_id, enabled, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         ON CONFLICT (business_id, app_id)
         DO UPDATE SET enabled = true, updated_at = NOW()`,
        [businessId, appId]
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
