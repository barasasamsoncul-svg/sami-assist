import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('Category 24 capability authority is centralized', async () => {
  const capabilities = await source('lib/admin/capabilities.ts');
  const guard = await source('lib/admin/require-capability.ts');
  const sidebar = await source('app/admin/components/AdminSidebar.tsx');

  for (const capability of [
    'users.read',
    'users.security.manage',
    'tenants.read',
    'subscriptions.read',
    'modules.read',
    'incidents.read',
    'incidents.manage',
    'providers.read',
    'providers.manage',
    'jobs.read',
  ]) {
    assert.ok(capabilities.includes(capability), capability);
  }

  assert.match(guard, /hasAdminCapability/);
  assert.match(sidebar, /hasAdminCapability/);
  assert.doesNotMatch(sidebar, /roles\?: readonly PlatformAdminRole\[\]/);
});

test('Category 24 admin pages enforce page-boundary capabilities', async () => {
  const pages = [
    ['app/admin/(protected)/users/page.tsx', 'users.read'],
    ['app/admin/(protected)/businesses/page.tsx', 'tenants.read'],
    ['app/admin/(protected)/subscriptions/page.tsx', 'subscriptions.read'],
    ['app/admin/(protected)/apps/page.tsx', 'modules.read'],
    ['app/admin/(protected)/security/page.tsx', 'security.read'],
    ['app/admin/(protected)/notifications/page.tsx', 'notifications.read'],
    ['app/admin/(protected)/audit/page.tsx', 'audit.read'],
    ['app/admin/(protected)/operations/health/page.tsx', 'health.read'],
    ['app/admin/(protected)/operations/incidents/page.tsx', 'incidents.read'],
    ['app/admin/(protected)/operations/providers/page.tsx', 'providers.read'],
    ['app/admin/(protected)/operations/services/page.tsx', 'providers.read'],
    ['app/admin/(protected)/operations/jobs/page.tsx', 'jobs.read'],
  ];

  for (const [file, capability] of pages) {
    const content = await source(file);
    assert.match(content, /requireAdminCapability/);
    assert.ok(content.includes(capability), file + ' -> ' + capability);
  }
});

test('Category 24 observability schema is additive and correlated', async () => {
  const migration = await source('lib/schema/control-migrations/004-category-24-platform-observability.sql');

  for (const table of [
    'platform_incidents',
    'platform_incident_occurrences',
    'platform_provider_checks',
    'platform_job_runs',
  ]) {
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS ' + table));
  }

  assert.match(migration, /correlation_id/);
  assert.match(migration, /occurrence_count/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|TRUNCATE/i);
});

test('Category 24 incident capture redacts and groups failures', async () => {
  const incidents = await source('lib/observability/platform-incidents.ts');

  assert.match(incidents, /SENSITIVE_KEY_RE/);
  assert.match(incidents, /\[redacted\]/);
  assert.match(incidents, /createHash[\s\S]*sha256/);
  assert.match(incidents, /ON CONFLICT[\s\S]*fingerprint[\s\S]*occurrence_count/);
  assert.match(incidents, /platform_incident_occurrences/);
});

test('Category 24 workspace error telemetry is authenticated bounded and fail-open', async () => {
  const route = await source('app/api/telemetry/error/route.ts');
  const boundary = await source('app/components/workspace/WorkspaceRouteError.tsx');

  assert.match(route, /getSession/);
  assert.match(route, /checkRateLimit/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /currentTenantId/);
  assert.match(route, /session\.user\.id/);
  assert.match(boundary, /\/api\/telemetry\/error/);
  assert.match(boundary, /Telemetry must never interfere with workspace recovery/);
});

test('Category 24 incident lifecycle is gated and audited', async () => {
  const route = await source('app/api/admin/operations/incidents/[incidentId]/route.ts');
  const service = await source('lib/admin/incidents.ts');

  assert.ok(route.includes('incidents.manage'));
  assert.match(route, /recordAdminAuditEvent/);

  for (const action of ['acknowledge', 'resolve', 'ignore', 'reopen']) {
    assert.ok(route.includes(action));
    assert.ok(service.includes(action));
  }
});

test('Category 24 job telemetry is fail-open and wired to workers', async () => {
  const jobs = await source('lib/observability/platform-jobs.ts');
  const billing = await source('app/api/internal/billing/reconcile/route.ts');
  const automation = await source('app/api/internal/automation/tick/route.ts');

  assert.match(jobs, /return null/);
  assert.match(jobs, /observability is never allowed to break/i);
  assert.match(billing, /runTrackedPlatformJob/);
  assert.ok(billing.includes('billing.reconcile'));
  assert.match(automation, /runTrackedPlatformJob/);
  assert.ok(automation.includes('automation.tick'));
});

test('Category 24 provider health is server-only and env-driven', async () => {
  const provider = await source('lib/admin/provider-health.ts');

  for (const name of [
    'Neon',
    'Vercel',
    'SaMi AI Provider',
    'Billing Providers',
    'Email & SMS',
  ]) {
    assert.ok(provider.includes(name), name);
  }

  assert.ok(provider.includes('SAMI_VERCEL_API_TOKEN'));
  assert.ok(provider.includes('SAMI_NEON_API_KEY'));
  assert.doesNotMatch(provider, /NEXT_PUBLIC_(VERCEL|NEON|CLOUDFLARE)/);
});

test('Category 24 infrastructure registry tracks paid dependencies and thresholds', async () => {
  const migration = await source('lib/schema/control-migrations/005-category-24-platform-service-subscriptions.sql');

  for (const table of [
    'platform_service_subscriptions',
    'platform_service_usage_snapshots',
    'platform_service_events',
  ]) {
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS ' + table));
  }

  for (const key of [
    'vercel',
    'neon',
    'cloudflare-r2',
    'domain-primary',
    'ai-primary',
    'email-primary',
    'sms-primary',
  ]) {
    assert.ok(migration.includes("'" + key + "'"), key);
  }

  assert.match(migration, /renewal_at/);
  assert.match(migration, /expires_at/);
  assert.match(migration, /quota_limit/);
  assert.match(migration, /warning_threshold_percent/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|TRUNCATE/i);
});

test('Category 24 infrastructure sync supports providers and manual contracts', async () => {
  const service = await source('lib/admin/platform-services.ts');

  assert.ok(service.includes('/v1/billing/charges'));
  assert.ok(service.includes('/v1/billing/contract-commitments'));
  assert.ok(service.includes('console.neon.tech/api/v2/projects/'));
  assert.ok(service.includes('billable-usage/info'));
  assert.ok(service.includes('cloudflare_r2'));
  assert.ok(service.includes('This service is maintained manually.'));

  for (const state of [
    'renewal_due',
    'quota_warning',
    'upgrade_recommended',
    'expired',
  ]) {
    assert.ok(service.includes(state), state);
  }

  assert.match(service, /derivedStatuses/);
  assert.match(service, /derivedStatuses\.has[\s\S]*'active'/);
});

test('Category 24 infrastructure monitor is scheduled protected and tracked', async () => {
  const route = await source('app/api/internal/platform/monitor/route.ts');
  const vercel = JSON.parse(await source('vercel.json'));

  assert.ok(route.includes('SAMI_PLATFORM_MONITOR_SECRET'));
  assert.ok(route.includes('CRON_SECRET'));
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /runTrackedPlatformJob/);
  assert.match(route, /syncPlatformServiceSubscriptions/);

  assert.ok(vercel.crons.some((cron) => cron.path === '/api/internal/platform/monitor'));
});

test('Category 24 service edits and manual sync are gated and audited', async () => {
  const syncRoute = await source('app/api/admin/operations/services/sync/route.ts');
  const updateRoute = await source('app/api/admin/operations/services/[serviceKey]/route.ts');
  const manager = await source('app/admin/components/PlatformServiceManager.tsx');

  for (const route of [syncRoute, updateRoute]) {
    assert.ok(route.includes('providers.manage'));
    assert.match(route, /recordAdminAuditEvent/);
    assert.match(route, /sec-fetch-site/);
  }

  assert.ok(manager.includes('Sync now'));
  assert.ok(manager.includes('Save contract settings'));
  assert.doesNotMatch(manager, /NEXT_PUBLIC_/);
});

test('Category 24 global user controls preserve identities and revoke sessions', async () => {
  const control = await source('lib/admin/user-control.ts');
  const route = await source('app/api/admin/users/[userId]/control/route.ts');
  const page = await source('app/admin/(protected)/users/page.tsx');

  for (const action of [
    'lock',
    'unlock',
    'suspend',
    'reactivate',
    'revoke_sessions',
  ]) {
    assert.ok(control.includes(action), action);
  }

  assert.match(control, /UPDATE sessions/);
  assert.match(control, /revoked_at/);
  assert.match(control, /REASON_REQUIRED/);
  assert.doesNotMatch(control, /DELETE FROM users/);
  assert.ok(route.includes('users.security.manage'));
  assert.match(route, /recordAdminAuditEvent/);
  assert.match(page, /UserControlActions/);
});

test('Category 24 provider credentials stay server-only', async () => {
  const env = await source('docs/platform-env.example');

  for (const key of [
    'SAMI_PLATFORM_MONITOR_SECRET',
    'SAMI_VERCEL_API_TOKEN',
    'SAMI_NEON_API_KEY',
    'SAMI_CLOUDFLARE_API_TOKEN',
  ]) {
    assert.ok(new RegExp('^' + key + '=', 'm').test(env), key);
  }

  assert.doesNotMatch(env, /NEXT_PUBLIC_(SAMI_VERCEL_API_TOKEN|SAMI_NEON_API_KEY|SAMI_CLOUDFLARE_API_TOKEN)/);
});

test('Category 24 internal platform operations remain outside the workspace shell', async () => {
  const shell = await source('app/components/workspace/WorkspaceShell.tsx');

  assert.doesNotMatch(
    shell,
    /platform_service_subscriptions|platform_incidents|platform_provider_checks|platform_job_runs/,
  );
});

test('Category 24 full-suite gate includes Platform Administration', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:all'], /test:category24/);
});
