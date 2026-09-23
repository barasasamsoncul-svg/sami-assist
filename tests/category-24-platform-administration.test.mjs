import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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

test('Category 24 captures unhandled Next.js server and browser errors globally', async () => {
  const server = await source('instrumentation.ts');
  const client = await source('instrumentation-client.ts');

  assert.match(server, /Instrumentation\.onRequestError/);
  assert.match(server, /NEXT_RUNTIME/);
  assert.match(server, /capturePlatformIncident/);
  assert.match(server, /unhandled_server_request_error/);
  assert.match(server, /Global telemetry must never replace or mask the original application failure/);

  assert.match(client, /window\.addEventListener[\s\S]*['"]error['"]/);
  assert.match(client, /unhandledrejection/);
  assert.match(client, /DEDUPE_WINDOW_MS/);
  assert.match(client, /\/api\/telemetry\/error/);
  assert.match(client, /Instrumentation must remain fail-open/);
});


test('Category 24 operator alert preferences are durable, deduplicated and server-side', async () => {
  const migration = await source('lib/schema/control-migrations/006-category-24-platform-admin-alert-preferences.sql');
  const alerts = await source('lib/admin/platform-alerts.ts');
  const preferences = await source('lib/admin/alert-preferences.ts');

  for (const table of [
    'platform_admin_alert_preferences',
    'platform_admin_alert_deliveries',
  ]) {
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS ' + table));
  }

  assert.match(migration, /sms_phone_e164/);
  assert.match(migration, /destination_fingerprint/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_platform_admin_alert_delivery_service/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_platform_admin_alert_delivery_incident/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|TRUNCATE/i);

  assert.match(alerts, /sendWorkspaceNotificationEmail/);
  assert.match(alerts, /sendWorkspaceNotificationSms/);
  assert.match(alerts, /notifyPlatformAdminsOfServiceEvent/);
  assert.match(alerts, /notifyPlatformAdminsOfIncident/);
  assert.match(alerts, /claimDelivery/);
  assert.match(alerts, /Alerting must never[\s\S]*stop the infrastructure[\s\S]*monitor/);

  assert.match(preferences, /normalizeSmsPhone/);
  assert.match(preferences, /SMS_PHONE_REQUIRED/);
  assert.match(preferences, /INVALID_TIMEZONE/);
});


test('Category 24 personal alert settings and test delivery are authenticated and audited', async () => {
  const page = await source('app/admin/(protected)/settings/notifications/page.tsx');
  const route = await source('app/api/admin/account/alert-preferences/route.ts');
  const testRoute = await source('app/api/admin/account/alert-preferences/test/route.ts');
  const form = await source('app/admin/components/PlatformAlertPreferencesForm.tsx');
  const sidebar = await source('app/admin/components/AdminSidebar.tsx');

  assert.match(page, /requireAdminSession/);
  assert.match(route, /requireAdminSession/);
  assert.match(route, /recordAdminAuditEvent/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /REQUEST_TOO_LARGE/);

  assert.match(testRoute, /sendWorkspaceNotificationEmail/);
  assert.match(testRoute, /sendWorkspaceNotificationSms/);
  assert.match(testRoute, /recordAdminAuditEvent/);
  assert.match(testRoute, /NO_ALERT_CHANNEL_ENABLED/);

  assert.match(form, /Save alert preferences/);
  assert.match(form, /Send test alert/);
  assert.match(form, /criticalSms/);
  assert.match(form, /serviceAlertsEnabled/);
  assert.match(form, /incidentAlertsEnabled/);

  assert.ok(sidebar.includes("href: '/admin/settings/notifications'"));
  assert.doesNotMatch(
    sidebar,
    /href: '\/admin\/settings\/notifications'[\s\S]{0,180}disabled:\s*true/,
  );
});


test('Category 24 workspace controls coordinate logical workspace, tenant DB and current sessions', async () => {
  const service = await source('lib/admin/workspace-control.ts');
  const route = await source('app/api/admin/businesses/[tenantId]/control/route.ts');
  const page = await source('app/admin/(protected)/businesses/page.tsx');

  for (const action of [
    'health_check',
    'maintenance_on',
    'maintenance_off',
    'suspend',
    'reactivate',
  ]) {
    assert.ok(service.includes(action), action);
    assert.ok(route.includes(action), action);
  }

  assert.match(service, /suspendTenantDatabase/);
  assert.match(service, /reactivateTenantDatabase/);
  assert.match(service, /setTenantDatabaseMaintenance/);
  assert.match(service, /checkTenantDatabaseHealth/);

  assert.match(service, /UPDATE tenants[\s\S]*status[\s\S]*'suspended'/);
  assert.match(service, /UPDATE sessions[\s\S]*current_tenant_id[\s\S]*NULL/);
  assert.doesNotMatch(
    service,
    /UPDATE sessions[\s\S]*WHERE user_id/,
    'Workspace suspension must not revoke or clear every session belonging to users who may own other workspaces.',
  );

  const reactivateDb = service.indexOf('await reactivateTenantDatabase');
  const reactivateWorkspace = service.indexOf("await setWorkspaceStatus(\n        id,\n        'active'");
  assert.ok(
    reactivateDb >= 0 &&
    reactivateWorkspace > reactivateDb,
    'Tenant database must reactivate before the workspace is advertised as active.',
  );

  assert.ok(route.includes('tenants.manage'));
  assert.match(route, /recordAdminAuditEvent/);
  assert.match(route, /capturePlatformIncident/);
  assert.match(page, /WorkspaceControlActions/);
  assert.match(page, /database[\s\S]*healthStatus/);
});


test('Category 24 manual billing reconciliation reuses Category 22 billing authority', async () => {
  const route = await source('app/api/admin/operations/billing/reconcile/route.ts');
  const page = await source('app/admin/(protected)/subscriptions/page.tsx');
  const control = await source('app/admin/components/BillingReconcileButton.tsx');

  assert.ok(route.includes('subscriptions.manage'));
  assert.match(route, /reconcileWorkspaceBilling/);
  assert.match(route, /runTrackedPlatformJob/);
  assert.match(route, /recordAdminAuditEvent/);
  assert.doesNotMatch(
    route,
    /UPDATE subscriptions|INSERT INTO subscriptions|DELETE FROM subscriptions/,
    'Platform Admin reconciliation must call the canonical Category 22 engine instead of editing subscriptions directly.',
  );

  assert.match(page, /BillingReconcileButton/);
  assert.match(page, /subscriptions\.manage/);
  assert.match(control, /Reconcile billing/);
});


test('Category 24 admin home includes a fail-open control-room summary', async () => {
  const loader = await source('lib/admin/dashboard-operations.ts');
  const page = await source('app/admin/(protected)/page.tsx');
  const dashboard = await source('app/admin/components/dashboard/AdminDashboard.tsx');
  const overview = await source('app/admin/components/dashboard/AdminOperationsOverview.tsx');

  assert.match(loader, /platform_incidents/);
  assert.match(loader, /platform_job_runs/);
  assert.match(loader, /tenant_databases/);
  assert.match(loader, /platform_service_subscriptions/);
  assert.match(loader, /platform_provider_checks/);
  assert.match(loader, /Keep the pre-Category-24 admin dashboard usable/);

  assert.match(page, /getAdminOperationsDashboard/);
  assert.match(dashboard, /AdminOperationsOverview/);

  for (const label of [
    'Active incidents',
    'Tenant DB problems',
    'Failed jobs',
    'Services needing attention',
    'Infrastructure attention',
    'Last provider checks',
  ]) {
    assert.ok(overview.includes(label), label);
  }
});


test('Category 24 supports future custom SaMi dependencies without weakening core services', async () => {
  const service = await source('lib/admin/platform-services.ts');
  const createRoute = await source('app/api/admin/operations/services/route.ts');
  const resourceRoute = await source('app/api/admin/operations/services/[serviceKey]/route.ts');
  const manager = await source('app/admin/components/PlatformServiceManager.tsx');

  assert.match(service, /createPlatformServiceSubscription/);
  assert.match(service, /archivePlatformServiceSubscription/);
  assert.match(service, /CORE_SERVICE_CANNOT_BE_ARCHIVED/);
  assert.match(service, /required_for_platform/);

  assert.ok(createRoute.includes('providers.manage'));
  assert.match(createRoute, /recordAdminAuditEvent/);
  assert.match(resourceRoute, /export async function DELETE/);
  assert.match(resourceRoute, /archivePlatformServiceSubscription/);
  assert.match(resourceRoute, /recordAdminAuditEvent/);

  assert.match(manager, /Add another SaMi dependency/);
  assert.match(manager, /Add tracked service/);
  assert.match(manager, /Archive/);
});


test('Category 24 new error and infrastructure alerts are deduplicated before operator delivery', async () => {
  const incidents = await source('lib/observability/platform-incidents.ts');
  const services = await source('lib/admin/platform-services.ts');
  const alerts = await source('lib/admin/platform-alerts.ts');

  assert.match(incidents, /occurrenceCount ===[\s\S]*1/);
  assert.match(incidents, /notifyPlatformAdminsOfIncident/);
  assert.match(services, /notifyPlatformAdminsOfServiceEvent/);

  assert.match(alerts, /ON CONFLICT[\s\S]*DO NOTHING/);
  assert.match(alerts, /platform_admin_alert_deliveries/);
});


test('Category 24 migration readiness matches every numbered control migration', async () => {
  const manifest = await source('lib/schema/control-migrations/manifest.ts');
  const oversight = await source('lib/admin/oversight.ts');
  const status = await source('lib/admin/control-migration-status.ts');

  const files = (
    await readdir(
      path.join(
        root,
        'lib',
        'schema',
        'control-migrations',
      ),
    )
  )
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((left, right) =>
      left.localeCompare(right, 'en', { numeric: true })
    );

  for (const file of files) {
    assert.ok(
      manifest.includes("'" + file + "'"),
      'Migration manifest is missing ' + file,
    );
  }

  const manifestKeys = [
    ...manifest.matchAll(/'(\d+[^']+\.sql)'/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    manifestKeys,
    files,
    'Migration manifest must match the migration directory exactly.',
  );

  assert.match(oversight, /getControlMigrationStatus/);
  assert.doesNotMatch(
    oversight,
    /SELECT[\s\S]{0,100}version[\s\S]{0,100}FROM control_schema_migrations/,
    'Platform Health must use migration_key, not nonexistent version/name columns.',
  );

  assert.match(status, /migration_key/);
  assert.match(status, /42P01/);
  assert.doesNotMatch(
    status,
    /node:fs|readdir/,
    'Runtime migration readiness must not depend on reading SQL files from a serverless filesystem.',
  );
});


test('Category 24 administrator APIs use the canonical capability authority', async () => {
  const collection = await source('app/api/admin/administrators/route.ts');
  const resource = await source('app/api/admin/administrators/[adminId]/route.ts');
  const provisioning = await source('lib/auth/admin-provisioning.ts');
  const lifecycle = await source('lib/auth/admin-lifecycle.ts');

  assert.match(collection, /requireAdminCapability/);
  assert.ok(collection.includes('administrators.read'));
  assert.ok(collection.includes('administrators.manage'));

  assert.match(resource, /requireAdminCapability/);
  assert.ok(resource.includes('administrators.manage'));

  assert.doesNotMatch(collection, /requireAdminRole/);
  assert.doesNotMatch(resource, /requireAdminRole/);

  assert.match(provisioning, /hasAdminCapability/);
  assert.ok(provisioning.includes('administrators.manage'));

  assert.match(lifecycle, /hasAdminCapability/);
  assert.ok(lifecycle.includes('administrators.manage'));
});


test('Category 24 notification operations show delivery outcomes without destination leakage', async () => {
  const oversight = await source('lib/admin/notification-oversight.ts');
  const page = await source('app/admin/(protected)/notifications/page.tsx');

  assert.match(oversight, /platform_admin_alert_deliveries/);
  assert.match(oversight, /attempt_count/);
  assert.match(oversight, /error_code/);
  assert.match(oversight, /provider_message_id/);
  assert.match(oversight, /42P01/);

  assert.doesNotMatch(
    oversight,
    /SELECT[\s\S]{0,200}destination_fingerprint/,
    'Notification oversight must not read or expose destination fingerprints.',
  );

  assert.match(page, /Platform alert deliveries/);
  assert.match(page, /Notification & billing audit activity/);
  assert.match(page, /Alert settings/);

  assert.doesNotMatch(
    page,
    /smsPhoneE164|destination_fingerprint|message_body|body_text/,
    'Platform notification operations must not render delivery destinations or message bodies.',
  );
});


test('Category 24 Settings navigation avoids duplicate dead account pages', async () => {
  const sidebar = await source('app/admin/components/AdminSidebar.tsx');

  assert.ok(sidebar.includes("href: '/admin/settings/account'"));
  assert.ok(sidebar.includes("href: '/admin/settings/notifications'"));

  for (const deadHref of [
    "/admin/settings/security",
    "/admin/settings/sessions",
    "/admin/settings/preferences",
  ]) {
    assert.ok(
      !sidebar.includes("href: '" + deadHref + "'"),
      'Duplicate dead Settings route remains: ' + deadHref,
    );
  }

  assert.ok(
    sidebar.includes("href: '/admin/settings/platform'"),
    'Category 25 Platform Settings placeholder should remain explicit.',
  );
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
