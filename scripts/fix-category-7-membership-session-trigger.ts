import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

function useSsl(host: string): boolean {
  const configured = process.env.POSTGRES_SSL?.trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  const h = host.toLowerCase();
  return h.includes('neon.tech') || h.includes('neon.build') || h.includes('amazonaws.com');
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
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.sami_clear_session_workspace_on_membership_loss()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        target_user_id UUID;
        target_tenant_id UUID;
        old_had_access BOOLEAN := FALSE;
        new_has_access BOOLEAN := FALSE;
        identity_changed BOOLEAN := FALSE;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          target_user_id := OLD.user_id;
          target_tenant_id := OLD.tenant_id;

          UPDATE public.sessions
          SET
            current_company_id = NULL,
            selected_company_ids = '{}'::UUID[],
            current_tenant_id = NULL,
            updated_at = NOW()
          WHERE user_id = target_user_id
            AND current_tenant_id = target_tenant_id
            AND revoked_at IS NULL;

          RETURN OLD;
        END IF;

        IF TG_OP <> 'UPDATE' THEN
          RETURN NEW;
        END IF;

        old_had_access := (
          LOWER(COALESCE(OLD.status, '')) = 'active'
          AND LOWER(COALESCE(OLD.member_type, '')) = 'internal'
          AND OLD.deleted_at IS NULL
        );

        new_has_access := (
          LOWER(COALESCE(NEW.status, '')) = 'active'
          AND LOWER(COALESCE(NEW.member_type, '')) = 'internal'
          AND NEW.deleted_at IS NULL
        );

        identity_changed := (
          NEW.user_id IS DISTINCT FROM OLD.user_id
          OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        );

        IF NOT ((old_had_access AND NOT new_has_access) OR identity_changed) THEN
          RETURN NEW;
        END IF;

        target_user_id := OLD.user_id;
        target_tenant_id := OLD.tenant_id;

        UPDATE public.sessions
        SET
          current_company_id = NULL,
          selected_company_ids = '{}'::UUID[],
          current_tenant_id = NULL,
          updated_at = NOW()
        WHERE user_id = target_user_id
          AND current_tenant_id = target_tenant_id
          AND revoked_at IS NULL;

        RETURN NEW;
      END;
      $$;
    `);

    const trigger = await client.query(`
      SELECT t.tgname
      FROM pg_trigger t
      INNER JOIN pg_proc p ON p.oid = t.tgfoid
      INNER JOIN pg_class c ON c.oid = t.tgrelid
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'tenant_users'
        AND p.proname = 'sami_clear_session_workspace_on_membership_loss'
        AND NOT t.tgisinternal
    `);

    if (trigger.rows.length === 0) {
      throw new Error('No tenant_users trigger references sami_clear_session_workspace_on_membership_loss().');
    }

    await client.query('COMMIT');
    console.log('[SaMi] ✅ Membership-loss session trigger repaired.');
    console.log('[SaMi] Tenant, current company and selected companies now clear atomically.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async error => {
    console.error('[SaMi] ❌ Membership session trigger repair failed:', error);
    await pool.end();
    process.exitCode = 1;
  });
