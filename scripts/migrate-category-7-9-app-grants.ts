import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

function useSsl(host: string): boolean {
  const explicit = process.env.POSTGRES_SSL?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  const h = host.toLowerCase();
  return h.includes('neon.tech') || h.includes('amazonaws.com') || h.includes('render.com') || h.includes('railway.app');
}

const host = process.env.POSTGRES_HOST;
const user = process.env.POSTGRES_ADMIN_USER;
const password = process.env.POSTGRES_ADMIN_PASSWORD;
if (!host || !user || !password) {
  throw new Error('POSTGRES_HOST, POSTGRES_ADMIN_USER and POSTGRES_ADMIN_PASSWORD are required.');
}

const pool = new Pool({
  host,
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user,
  password,
  database: process.env.POSTGRES_DB || 'sami_control',
  ssl: useSsl(host) ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await client.query(`
      ALTER TABLE tenant_users
      ADD COLUMN IF NOT EXISTS app_access_mode TEXT NOT NULL DEFAULT 'role_based';
    `);

    await client.query(`
      ALTER TABLE workspace_invitations
      ADD COLUMN IF NOT EXISTS app_access_mode TEXT NOT NULL DEFAULT 'role_based';
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'tenant_users_app_access_mode_check'
        ) THEN
          ALTER TABLE tenant_users
          ADD CONSTRAINT tenant_users_app_access_mode_check
          CHECK (app_access_mode IN ('role_based', 'selected'));
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'workspace_invitations_app_access_mode_check'
        ) THEN
          ALTER TABLE workspace_invitations
          ADD CONSTRAINT workspace_invitations_app_access_mode_check
          CHECK (app_access_mode IN ('role_based', 'selected'));
        END IF;
      END
      $$;
    `);

    /* Existing memberships/invitations remain role_based. New invitations default selected. */
    await client.query(`
      ALTER TABLE workspace_invitations
      ALTER COLUMN app_access_mode SET DEFAULT 'selected';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_user_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        granted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL,
        CONSTRAINT tenant_user_apps_unique UNIQUE (tenant_id, user_id, module_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tenant_user_apps_lookup
      ON tenant_user_apps (tenant_id, user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_invitation_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invitation_id UUID NOT NULL REFERENCES workspace_invitations(id) ON DELETE CASCADE,
        module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT workspace_invitation_apps_unique UNIQUE (invitation_id, module_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workspace_invitation_apps_invitation
      ON workspace_invitation_apps (invitation_id);
    `);

    /*
     * Acceptance stays atomic in the Control DB without rewriting the large
     * invitation-acceptance service. The existing service creates/restores the
     * membership before marking the invitation accepted, so this AFTER UPDATE
     * trigger can safely apply the invitation's app boundary in the same
     * Control DB transaction.
     */
    await client.query(`
      CREATE OR REPLACE FUNCTION public.sami_apply_invitation_app_access_on_acceptance()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.status = 'accepted'
           AND NEW.accepted_by IS NOT NULL
           AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.accepted_by IS DISTINCT FROM NEW.accepted_by)
        THEN
          UPDATE tenant_users
          SET app_access_mode = COALESCE(NEW.app_access_mode, 'selected'),
              updated_at = NOW()
          WHERE tenant_id = NEW.tenant_id
            AND user_id = NEW.accepted_by;

          UPDATE tenant_user_apps
          SET deleted_at = NOW(),
              updated_at = NOW()
          WHERE tenant_id = NEW.tenant_id
            AND user_id = NEW.accepted_by
            AND deleted_at IS NULL;

          IF COALESCE(NEW.app_access_mode, 'selected') = 'selected' THEN
            INSERT INTO tenant_user_apps (
              tenant_id,
              user_id,
              module_id,
              granted_by,
              created_at,
              updated_at,
              deleted_at
            )
            SELECT
              NEW.tenant_id,
              NEW.accepted_by,
              wia.module_id,
              NEW.invited_by,
              NOW(),
              NOW(),
              NULL
            FROM workspace_invitation_apps wia
            WHERE wia.invitation_id = NEW.id
            ON CONFLICT (tenant_id, user_id, module_id)
            DO UPDATE SET
              granted_by = EXCLUDED.granted_by,
              updated_at = NOW(),
              deleted_at = NULL;
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_sami_apply_invitation_app_access_on_acceptance
      ON workspace_invitations;

      CREATE TRIGGER trg_sami_apply_invitation_app_access_on_acceptance
      AFTER UPDATE OF status, accepted_by, app_access_mode
      ON workspace_invitations
      FOR EACH ROW
      EXECUTE FUNCTION public.sami_apply_invitation_app_access_on_acceptance();
    `);

    await client.query('COMMIT');
    console.log('[SaMi] ✅ Direct member/invitation app grants migration complete.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

migrate()
  .then(async () => {
    await pool.end();
  })
  .catch(async error => {
    console.error('[SaMi] ❌ App-grants migration failed:', error);
    await pool.end();
    process.exitCode = 1;
  });
