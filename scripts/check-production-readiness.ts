import 'dotenv/config';

import { queryControl, getControlPool } from '../lib/db/control';
import { getTenantPoolByTenantId } from '../lib/db/tenant';
import { CURRENT_TENANT_CORE_VERSION } from '../lib/schema/tenant-migrations/manifest';
import { getSamiModuleManifest } from '../lib/modules/registry';

type TenantRow = {
  tenant_id: string;
  tenant_name: string;
  database_name: string;
  schema_version: string | null;
};

type CheckResult = {
  tenant: string;
  database: string;
  coreVersion: string | null;
  coreVersionOk: boolean;
  missingCoreTables: string[];
  moduleDrift: Array<{
    moduleKey: string;
    installedVersion: string | null;
    targetVersion: string;
  }>;
};

const REQUIRED_CORE_TABLES = [
  'companies',
  'branches',
  'departments',
  'company_users',
  'company_settings',
  'files',
  'file_links',
  'comments',
  'activities',
  'notifications',
  'tags',
  'tag_relations',
  'audit_logs',
  'system_parameters',
  'sequences',
  'workflows',
  'workflow_states',
  'workflow_transitions',
  'ai_conversations',
  'ai_messages',
  'ai_memory',
  'ai_actions',
  'ai_runs',
  'ai_preferences',
  'automation_workflows',
  'automation_workflow_versions',
  'automation_runs',
  'automation_run_steps',
  'automation_events',
  'automation_approvals',
  'automation_schedules',
  'integration_connections',
  'integration_credentials',
  'integration_external_apps',
  'integration_external_app_assignments',
  'integration_assignment_rules',
  'integration_oauth_states',
  'integration_sync_jobs',
  'integration_events',
  'integration_webhook_endpoints',
  'integration_webhook_deliveries',
  'api_credentials',
  'api_rate_limit_windows',
  'api_request_logs',
  'bi_reports',
  'workbooks',
  'sheets',
  'cells',
  'workspace_conversations',
  'workspace_conversation_members',
  'workspace_messages',
];

async function main() {
  const result = await queryControl(`
    SELECT
      t.id::text AS tenant_id,
      t.name::text AS tenant_name,
      td.database_name::text AS database_name,
      td.schema_version::text AS schema_version
    FROM tenants t
    INNER JOIN tenant_databases td ON td.tenant_id = t.id
    WHERE t.deleted_at IS NULL
      AND td.purged_at IS NULL
      AND td.status = 'active'
    ORDER BY t.created_at, t.id
  `);

  const tenants = result.rows as TenantRow[];
  const checks: CheckResult[] = [];

  for (const tenant of tenants) {
    const pool = await getTenantPoolByTenantId(tenant.tenant_id);

    try {
      const tablesResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `);
      const tables = new Set(tablesResult.rows.map(row => String(row.table_name)));

      const missingCoreTables = REQUIRED_CORE_TABLES.filter(table => !tables.has(table));

      const modulesResult = await queryControl(`
        SELECT
          LOWER(m.key) AS module_key,
          tm.version
        FROM tenant_modules tm
        INNER JOIN modules m ON m.id = tm.module_id
        WHERE tm.tenant_id = $1
          AND tm.deleted_at IS NULL
          AND m.deleted_at IS NULL
          AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled', 'disabled')
        ORDER BY LOWER(m.key)
      `, [tenant.tenant_id]);

      const moduleDrift = modulesResult.rows
        .map(row => {
          const moduleKey = String(row.module_key).trim().toLowerCase();
          const manifest = getSamiModuleManifest(moduleKey);
          const installedVersion = row.version == null ? null : String(row.version);
          if (!manifest || !installedVersion || manifest.version === installedVersion) {
            return null;
          }
          return {
            moduleKey,
            installedVersion,
            targetVersion: manifest.version,
          };
        })
        .filter(Boolean) as CheckResult['moduleDrift'];

      checks.push({
        tenant: tenant.tenant_name,
        database: tenant.database_name,
        coreVersion: tenant.schema_version,
        coreVersionOk: tenant.schema_version === CURRENT_TENANT_CORE_VERSION,
        missingCoreTables,
        moduleDrift,
      });
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  const failures = checks.filter(check =>
    !check.coreVersionOk ||
    check.missingCoreTables.length > 0 ||
    check.moduleDrift.length > 0,
  );

  console.log(JSON.stringify({
    targetCoreVersion: CURRENT_TENANT_CORE_VERSION,
    tenantsChecked: checks.length,
    failures: failures.length,
    checks,
  }, null, 2));

  const controlPool = getControlPool();
  await controlPool.end().catch(() => undefined);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Production readiness check failed.');
  process.exitCode = 1;
});
