import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(
    path.join(
      root,
      file,
    ),
    'utf8',
  );
}

function compact(value) {
  return value.replace(
    /\s+/g,
    ' ',
  );
}

test('pre-module hardening: platform edge applies browser security policy and request correlation', async () => {
  const [
    proxy,
    security,
  ] = await Promise.all([
    source('proxy.ts'),
    source('lib/security/http-security.ts'),
  ]);

  for (
    const route
    of [
      '/ai',
      '/automation',
      '/integrations',
      '/developer',
      '/activity',
      '/notifications',
      '/usage',
    ]
  ) {
    assert.ok(
      proxy.includes(
        `'${route}'`,
      ),
      `proxy must protect core route ${route}`,
    );
  }

  assert.match(
    proxy,
    /requestRequiresSameOrigin/,
  );
  assert.match(
    proxy,
    /x-sami-request-id/,
  );
  assert.match(
    proxy,
    /Content-Security-Policy/,
  );
  assert.match(
    proxy,
    /Strict-Transport-Security/,
  );

  assert.match(
    security,
    /requestHasSaMiSession/,
  );
  assert.match(
    security,
    /__Host-sami_session/,
  );
  assert.match(
    security,
    /__Host-sami_admin_session/,
  );
  assert.match(
    security,
    /script-src 'self' 'nonce-/,
  );
  assert.match(
    security,
    /'strict-dynamic'/,
  );
  assert.match(
    security,
    /object-src 'none'/,
  );
  assert.match(
    security,
    /frame-ancestors 'none'/,
  );
  assert.match(
    security,
    /Permissions-Policy/,
  );
});

test('pre-module hardening: external callbacks are not blanket-blocked by browser CSRF policy', async () => {
  const security =
    compact(
      await source(
        'lib/security/http-security.ts',
      ),
    );

  assert.match(
    security,
    /requestHasSaMiSession/,
  );
  assert.match(
    security,
    /requestRequiresSameOrigin/,
  );
  assert.ok(
    security.includes(
      "'/api/'",
    ),
    'same-origin policy must be scoped to API routes',
  );

  assert.doesNotMatch(
    security,
    /webhook.*false|callback.*false/i,
    'security must use the browser session boundary rather than fragile callback path allowlists',
  );
});

test('pre-module hardening: CSP no longer requires an inline theme bootstrap', async () => {
  const [
    layout,
    runtime,
    bootstrap,
  ] =
    await Promise.all([
      source(
        'app/layout.tsx',
      ),
      source(
        'lib/theme/runtime.ts',
      ),
      source(
        'public/sami-theme-bootstrap.js',
      ),
    ]);

  assert.match(
    layout,
    /sami-theme-bootstrap\.js/,
  );

  assert.doesNotMatch(
    layout,
    /dangerouslySetInnerHTML/,
  );

  assert.doesNotMatch(
    runtime,
    /SAMI_THEME_BOOTSTRAP_SCRIPT/,
  );

  assert.match(
    bootstrap,
    /sami_theme/,
  );
});

test('pre-module hardening: uncaught server and browser errors enter Category 24 incident telemetry with request IDs', async () => {
  const [
    instrumentation,
    telemetry,
    incidents,
  ] =
    await Promise.all([
      source(
        'instrumentation.ts',
      ),
      source(
        'app/api/telemetry/error/route.ts',
      ),
      source(
        'lib/observability/platform-incidents.ts',
      ),
    ]);

  assert.match(
    instrumentation,
    /Instrumentation\.onRequestError/,
  );

  assert.match(
    instrumentation,
    /capturePlatformIncident/,
  );

  assert.match(
    instrumentation,
    /x-sami-request-id/,
  );

  assert.match(
    telemetry,
    /x-sami-request-id/,
  );

  assert.match(
    incidents,
    /latest_request_id/,
  );
});

test('pre-module hardening: module data lifecycle capabilities require code-owned handlers', async () => {
  const [
    types,
    firstParty,
    additional,
    validation,
    registry,
    suiteExport,
  ] =
    await Promise.all([
      source(
        'lib/modules/types.ts',
      ),
      source(
        'lib/modules/first-party.ts',
      ),
      source(
        'lib/modules/additional-first-party.ts',
      ),
      source(
        'lib/modules/validation.ts',
      ),
      source(
        'lib/data-lifecycle/registry.ts',
      ),
      source(
        'lib/data-lifecycle/suite-export.ts',
      ),
    ]);

  assert.match(
    types,
    /dataExport:\s*boolean/,
  );

  assert.match(
    types,
    /dataErasure:\s*boolean/,
  );

  for (
    const key
    of [
      'invoicing',
      'sales',
    ]
  ) {
    const start =
      firstParty.indexOf(
        'key: "' +
        key +
        '"',
      );

    const end =
      firstParty.indexOf(
        'defineSamiModule({',
        start +
          20,
      );

    const block =
      firstParty.slice(
        start,
        end >
          start
          ? end
          : firstParty.length,
      );

    assert.match(
      block,
      /dataExport:\s*true/,
      key +
      ' must opt in only because its code-owned export handler is registered.',
    );

    assert.match(
      block,
      /dataErasure:\s*false/,
      key +
      ' erasure remains fail-closed until a dedicated erasure plan exists.',
    );
  }

  assert.match(
    additional,
    /dataExport:\s*false/,
    'Raw additional module manifests remain fail-closed before the enterprise runtime wraps them.',
  );

  assert.match(
    additional,
    /dataErasure:\s*false/,
  );

  assert.match(
    registry,
    /SUITE_DATA_LIFECYCLE_HANDLERS/,
  );

  assert.match(
    suiteExport,
    /ENTERPRISE_MODULE_TABLES/,
  );

  assert.match(
    suiteExport,
    /DEDICATED_EXPORT_TABLES/,
  );

  assert.match(
    suiteExport,
    /company_id = \$1/,
  );

  assert.match(
    suiteExport,
    /MAX_ROWS_PER_TABLE/,
  );

  assert.match(
    validation,
    /'dataExport'/,
  );

  assert.match(
    validation,
    /'dataErasure'/,
  );
});

test('pre-module hardening: data lifecycle handlers are code-owned, permission-filtered and cannot be enabled by metadata alone', async () => {
  const registry =
    await source(
      'lib/data-lifecycle/registry.ts',
    );

  assert.match(
    registry,
    /APP_DATA_LIFECYCLE_HANDLERS/,
  );

  assert.match(
    registry,
    /getSamiModuleManifest/,
  );

  assert.match(
    registry,
    /filterAccessibleModuleExtensions/,
  );

  assert.match(
    registry,
    /enables data export without a code-owned export handler/,
  );

  assert.match(
    registry,
    /enables data erasure without plan and execute handlers/,
  );

  assert.doesNotMatch(
    registry,
    /queryControl|getTenantPool|eval\(|new Function|executeSql|rawSql/i,
  );
});

test('pre-module hardening: account export is user-scoped and module data obeys workspace access', async () => {
  const [
    service,
    route,
    settings,
  ] =
    await Promise.all([
      source(
        'lib/data-lifecycle/account-export.ts',
      ),
      source(
        'app/api/account/export/route.ts',
      ),
      source(
        'app/settings/components/MyAccountSettings.tsx',
      ),
    ]);

  assert.match(
    service,
    /getUserAccountWithPreferences/,
  );

  assert.match(
    service,
    /listUserWorkspaceMemberships/,
  );

  assert.match(
    service,
    /listActiveSessions/,
  );

  assert.match(
    service,
    /getPermissionContext/,
  );

  assert.match(
    service,
    /resolveWorkspaceShellAccess/,
  );

  assert.match(
    service,
    /getAccessibleModuleDataExportHandlers/,
  );

  assert.match(
    route,
    /getSession/,
  );

  assert.match(
    route,
    /checkRateLimit/,
  );

  assert.match(
    route,
    /Content-Disposition/,
  );

  assert.match(
    route,
    /no-store/,
  );

  assert.match(
    settings,
    /Data & privacy/,
  );

  assert.match(
    settings,
    /\/api\/account\/export/,
  );
});


test('pre-module hardening: every module extension flag is enforced by a real runtime boundary', async () => {
  const [
    registry,
    dashboard,
    search,
    ai,
    automation,
    integrations,
    developer,
    notifications,
    activity,
    lifecycle,
  ] = await Promise.all([
    source('lib/modules/registry.ts'),
    source('lib/dashboard/providers/index.ts'),
    source('lib/search/registry.ts'),
    source('lib/ai/tool-registry.ts'),
    source('lib/automation/registry.ts'),
    source('lib/integrations/registry.ts'),
    source('lib/developer/registry.ts'),
    source('lib/services/workspace-notifications.ts'),
    source('lib/services/workspace-activity.ts'),
    source('lib/data-lifecycle/registry.ts'),
  ]);

  assert.match(
    registry,
    /requiredExtension/,
  );

  assert.match(
    dashboard,
    /'dashboard'/,
  );

  assert.match(
    search,
    /'search'/,
  );

  assert.match(
    ai,
    /'aiTools'/,
  );

  assert.match(
    automation,
    /'automationTriggers'/,
  );

  assert.match(
    automation,
    /'automationActions'/,
  );

  assert.match(
    integrations,
    /integrationProviders/,
  );

  assert.match(
    developer,
    /apiEndpoints/,
  );

  assert.match(
    notifications,
    /assertRegisteredSamiModuleExtension[\s\S]*?'notifications'/s,
  );

  assert.match(
    activity,
    /assertRegisteredSamiModuleExtension[\s\S]*?'activity'/s,
  );

  assert.match(
    lifecycle,
    /dataExport/,
  );

  assert.match(
    lifecycle,
    /dataErasure/,
  );
});
