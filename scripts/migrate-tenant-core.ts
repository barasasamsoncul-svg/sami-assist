import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config({ path: '.env.local' });
dotenv.config();

function argValue(name: string): string | null {
  const prefix = '--' + name + '=';
  const inline = process.argv.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim() || null;
  const index = process.argv.indexOf('--' + name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes('--' + name);
}

async function main() {
  const { queryControl, getControlPool } = await import('../lib/db/control');
  const { CURRENT_TENANT_CORE_VERSION } = await import('../lib/schema/tenant-migrations/manifest');
  const { runTenantCoreMigrations } = await import('../lib/services/tenant-migrations');

  try {
    const tenants = await queryControl(`
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

    const requestedTenantId = argValue('tenant');

    if (hasFlag('list') || !requestedTenantId) {
      console.log('\nSaMi active tenant schema versions\n');
      if (tenants.rows.length === 0) {
        console.log('No active tenant databases were found.');
        return;
      }
      for (const row of tenants.rows) {
        console.log('- ' + row.tenant_name + ' | tenant ' + row.tenant_id + ' | database ' + row.database_name + ' | schema ' + (row.schema_version || 'unknown'));
      }
      console.log('\nPlatform target schema: ' + CURRENT_TENANT_CORE_VERSION);
      console.log('\nRun: npm run migrate:tenant-core -- --tenant <tenant-id>');
      return;
    }

    const tenant = tenants.rows.find(row => String(row.tenant_id) === requestedTenantId);
    if (!tenant) {
      throw new Error('The requested tenant does not have an active registered tenant database.');
    }

    const backup = await queryControl(`
      SELECT
        id,
        provider_reference,
        available_at,
        last_verified_at,
        expires_at
      FROM tenant_database_recovery_points
      WHERE tenant_id = $1
        AND status = 'available'
        AND provider_reference IS NOT NULL
        AND (expires_at IS NULL OR expires_at > NOW())
        AND COALESCE(last_verified_at, available_at, created_at) >= NOW() - INTERVAL '7 days'
      ORDER BY COALESCE(last_verified_at, available_at, created_at) DESC
      LIMIT 1
    `, [requestedTenantId]);

    if (backup.rows.length !== 1) {
      throw new Error('Migration refused: create and verify a tenant recovery point within the last 7 days before changing the tenant schema.');
    }

    console.log('\nSaMi tenant-core migration\n');
    console.log('Workspace: ' + tenant.tenant_name);
    console.log('Database: ' + tenant.database_name);
    console.log('Current registry version: ' + (tenant.schema_version || 'unknown'));
    console.log('Target version: ' + CURRENT_TENANT_CORE_VERSION);
    console.log('Recovery point: ' + backup.rows[0].id + '\n');

    const result = await runTenantCoreMigrations(requestedTenantId, CURRENT_TENANT_CORE_VERSION);

    console.log('Previous version: ' + result.previousVersion);
    console.log('Current version: ' + result.currentVersion);
    console.log('Applied: ' + (result.appliedMigrations.length > 0 ? result.appliedMigrations.join(', ') : 'none (already current)'));
    console.log('\nPASS  Tenant core schema is at the platform target version.');
  } finally {
    const pool = getControlPool();
    await pool.end().catch(() => undefined);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Unknown tenant migration failure.');
  process.exitCode = 1;
});
