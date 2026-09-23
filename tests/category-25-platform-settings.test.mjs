import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import test from 'node:test';

const root =
  process.cwd();

async function source(
  path,
) {
  return readFile(
    new URL(
      '../' +
      path,
      import.meta.url,
    ),
    'utf8',
  );
}


test('Category 25 migration is additive revisioned and secret-free', async () => {
  const migration =
    await source(
      'lib/schema/control-migrations/007-category-25-platform-settings.sql',
    );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS platform_settings/,
  );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS platform_settings_history/,
  );

  assert.match(
    migration,
    /revision BIGINT/,
  );

  assert.match(
    migration,
    /settings JSONB/,
  );

  assert.match(
    migration,
    /changed_keys TEXT[]/,
  );

  assert.doesNotMatch(
    migration,
    /DROP TABLE|DROP DATABASE|TRUNCATE/i,
  );

  assert.doesNotMatch(
    migration,
    /password|secret_key|api_key|access_token|database_url/i,
    'Category 25 must not store provider or infrastructure secrets.',
  );
});


test('Category 25 settings authority validates and fails open before migration', async () => {
  const settings =
    await source(
      'lib/admin/platform-settings.ts',
    );

  for (
    const value of [
      'publicRegistrationEnabled',
      'googleRegistrationEnabled',
      'selfServiceWorkspaceCreationEnabled',
      'normalSessionHours',
      'rememberMeDays',
      'allowMultipleActiveSessions',
      'samiAiEnabled',
      'automationEnabled',
      'developerApiEnabled',
      'maintenanceMode',
      'maintenanceMessage',
    ]
  ) {
    assert.ok(
      settings.includes(
        value,
      ),
      value,
    );
  }

  assert.match(
    settings,
    /PlatformSettingsValidationError/,
  );

  assert.match(
    settings,
    /PlatformSettingsConflictError/,
  );

  assert.match(
    settings,
    /revision =s*$3/,
  );

  assert.match(
    settings,
    /platform_settings_history/,
  );

  assert.match(
    settings,
    /code === '42P01'/,
    'Runtime settings must retain safe defaults before migration 007 is applied.',
  );

  assert.match(
    settings,
    /5_000/,
    'Runtime reads should use a short cache instead of querying the Control DB repeatedly within one process.',
  );
});


test('Category 25 capabilities separate read from global settings management', async () => {
  const capabilities =
    await source(
      'lib/admin/capabilities.ts',
    );

  assert.ok(
    capabilities.includes(
      "'settings.read'",
    ),
  );

  assert.ok(
    capabilities.includes(
      "'settings.manage'",
    ),
  );

  const superStart =
    capabilities.indexOf(
      'super_admin:',
    );

  const securityStart =
    capabilities.indexOf(
      'security_admin:',
    );

  const superBlock =
    capabilities.slice(
      superStart,
      securityStart,
    );

  assert.match(
    superBlock,
    /ALL_CAPABILITIES/,
  );

  for (
    const role of [
      'security_admin',
      'operations_admin',
      'developer_admin',
      'read_only_admin',
    ]
  ) {
    const start =
      capabilities.indexOf(
        role + ':',
      );

    assert.ok(
      start >= 0,
      role,
    );
  }

  assert.equal(
    (
      capabilities.match(
        /'settings.manage'/g,
      ) ||
      []
    ).length,
    2,
    'settings.manage should exist only in the capability type/list and flow to super_admin through ALL_CAPABILITIES.',
  );
});


test('Category 25 Platform Settings navigation is enabled and capability-scoped', async () => {
  const sidebar =
    await source(
      'app/admin/components/AdminSidebar.tsx',
    );

  assert.ok(
    sidebar.includes(
      "href: '/admin/settings/platform'",
    ),
  );

  assert.ok(
    sidebar.includes(
      "capability: 'settings.read'",
    ),
  );

  const start =
    sidebar.indexOf(
      "href: '/admin/settings/platform'",
    );

  const block =
    sidebar.slice(
      start,
      start +
        500,
    );

  assert.doesNotMatch(
    block,
    /disabled:s*true/,
  );
});


test('Category 25 page and API enforce settings capabilities and safe mutation boundaries', async () => {
  const [
    page,
    route,
  ] =
    await Promise.all([
      source(
        'app/admin/(protected)/settings/platform/page.tsx',
      ),
      source(
        'app/api/admin/settings/platform/route.ts',
      ),
    ]);

  assert.ok(
    page.includes(
      "'settings.read'",
    ),
  );

  assert.ok(
    page.includes(
      "'settings.manage'",
    ),
  );

  assert.ok(
    route.includes(
      "'settings.read'",
    ),
  );

  assert.ok(
    route.includes(
      "'settings.manage'",
    ),
  );

  assert.match(
    route,
    /sec-fetch-site/,
  );

  assert.match(
    route,
    /MAX_BODY_BYTES/,
  );

  assert.match(
    route,
    /application/json/,
  );

  assert.match(
    route,
    /PlatformSettingsConflictError/,
  );

  assert.match(
    route,
    /recordAdminAuditEvent/,
  );

  assert.match(
    route,
    /platform.settings.updated/,
  );
});


test('Category 25 regional defaults are consumed only when users have no personal preference', async () => {
  const account =
    await source(
      'lib/account/user-account.ts',
    );

  assert.match(
    account,
    /getRuntimePlatformSettings/,
  );

  assert.match(
    account,
    /platformSettings.defaults.locale/,
  );

  assert.match(
    account,
    /platformSettings.defaults.timezone/,
  );

  assert.match(
    account,
    /platformSettings.defaults.dateFormat/,
  );

  assert.match(
    account,
    /platformSettings.defaults.timeFormat/,
  );

  assert.match(
    account,
    /platformSettings.defaults.firstDayOfWeek/,
  );
});


test('Category 25 registration policy is enforced at draft provisioning and Google entry boundaries', async () => {
  const [
    draft,
    registration,
    google,
  ] =
    await Promise.all([
      source(
        'app/api/auth/registration-draft/route.ts',
      ),
      source(
        'app/api/auth/register/route.ts',
      ),
      source(
        'app/api/auth/google/route.ts',
      ),
    ]);

  for (
    const file of [
      draft,
      registration,
    ]
  ) {
    assert.match(
      file,
      /publicRegistrationEnabled/,
    );

    assert.match(
      file,
      /googleRegistrationEnabled/,
    );

    assert.match(
      file,
      /selfServiceWorkspaceCreationEnabled/,
    );
  }

  assert.match(
    google,
    /googleRegistrationEnabled/,
  );

  assert.match(
    google,
    /registration_disabled/,
  );
});


test('Category 25 session policy controls new user lifetime and concurrent-session behavior', async () => {
  const session =
    await source(
      'lib/auth/session.ts',
    );

  assert.match(
    session,
    /getRuntimePlatformSettings/,
  );

  assert.match(
    session,
    /normalSessionHours/,
  );

  assert.match(
    session,
    /rememberMeDays/,
  );

  assert.match(
    session,
    /allowMultipleActiveSessions/,
  );

  assert.doesNotMatch(
    session,
    /SAMI_ALLOW_MULTIPLE_ACTIVE_SESSIONS/,
    'Dynamic Category 25 session policy must not be shadowed by an old environment-only switch.',
  );
});


test('Category 25 core feature kill switches are enforced at runtime boundaries', async () => {
  const [
    ai,
    aiApi,
    automation,
    automationApi,
    worker,
    developer,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-ai.ts',
      ),
      source(
        'lib/services/workspace-ai-api.ts',
      ),
      source(
        'lib/services/workspace-automation.ts',
      ),
      source(
        'lib/services/workspace-automation-api.ts',
      ),
      source(
        'app/api/internal/automation/tick/route.ts',
      ),
      source(
        'lib/developer/auth.ts',
      ),
    ]);

  assert.match(
    ai,
    /AI_PLATFORM_DISABLED/,
  );

  assert.match(
    ai,
    /samiAiEnabled/,
  );

  assert.match(
    aiApi,
    /AI_PLATFORM_DISABLED[sS]*503/,
  );

  assert.match(
    automation,
    /AUTOMATION_PLATFORM_DISABLED/,
  );

  assert.match(
    automation,
    /automationEnabled/,
  );

  assert.match(
    automationApi,
    /AUTOMATION_PLATFORM_DISABLED[sS]*503/,
  );

  assert.match(
    worker,
    /automationEnabled/,
  );

  assert.match(
    developer,
    /API_PLATFORM_DISABLED/,
  );

  assert.match(
    developer,
    /developerApiEnabled/,
  );

  assert.match(
    developer,
    /503/,
  );
});


test('Category 25 maintenance mode blocks ordinary pages but retains recovery paths', async () => {
  const [
    guard,
    page,
  ] =
    await Promise.all([
      source(
        'lib/auth/require-page-session.ts',
      ),
      source(
        'app/maintenance/page.tsx',
      ),
    ]);

  assert.match(
    guard,
    /maintenanceMode/,
  );

  assert.match(
    guard,
    /redirect([sS]*'/maintenance'/,
  );

  assert.match(
    guard,
    /'/settings'/,
  );

  assert.match(
    guard,
    /'/subscription-required'/,
  );

  assert.match(
    page,
    /maintenanceMessage/,
  );

  assert.match(
    page,
    /Your data remains intact/,
  );
});


test('Category 25 settings UI keeps infrastructure secrets outside the browser', async () => {
  const form =
    await source(
      'app/admin/components/PlatformSettingsForm.tsx',
    );

  assert.match(
    form,
    /Secrets excluded/,
  );

  assert.match(
    form,
    /Runtime applied/,
  );

  assert.match(
    form,
    /Module-safe/,
  );

  assert.doesNotMatch(
    form,
    /R2_SECRET_ACCESS_KEY|SMTP_PASSWORD|POSTGRES_PASSWORD|SAMI_VERCEL_API_TOKEN|SAMI_NEON_API_KEY/,
  );
});


test('Category 25 migration manifest includes the final platform category', async () => {
  const manifest =
    await source(
      'lib/schema/control-migrations/manifest.ts',
    );

  assert.match(
    manifest,
    /007-category-25-platform-settings.sql/,
  );
});


test('Category 25 release gate includes all previous categories and production validation', async () => {
  const pkg =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  const workflow =
    await source(
      '.github/workflows/category-25-platform-settings.yml',
    );

  assert.match(
    pkg.scripts[
      'test:category25'
    ],
    /category-25-platform-settings/,
  );

  assert.match(
    pkg.scripts[
      'test:ci'
    ],
    /test:category25/,
  );

  assert.match(
    workflow,
    /npm run test:ci/,
  );

  assert.match(
    workflow,
    /npx tsc --noEmit/,
  );
});
