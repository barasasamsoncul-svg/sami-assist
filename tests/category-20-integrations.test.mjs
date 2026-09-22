import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root =
  process.cwd();

async function source(
  file,
) {
  return readFile(
    path.join(
      root,
      file,
    ),
    'utf8',
  );
}

function compact(
  value,
) {
  return value.replace(
    /\s+/g,
    ' ',
  );
}

test('Category 20: tenant core advances additively from 1.6.0 to 1.7.0', async () => {
  const [
    manifest,
    migration,
    core,
  ] =
    await Promise.all([
      source(
        'lib/schema/tenant-migrations/manifest.ts',
      ),
      source(
        'lib/schema/tenant-migrations/migrations/007-core-1.6.0-to-1.7.0.sql',
      ),
      source(
        'lib/schema/tenant-core.sql',
      ),
    ]);

  assert.match(
    manifest,
    /CURRENT_TENANT_CORE_VERSION\s*=\s*['"]1\.7\.0['"]/s,
  );

  assert.match(
    manifest,
    /core-1\.6\.0-to-1\.7\.0/,
  );

  assert.match(
    manifest,
    /007-core-1\.6\.0-to-1\.7\.0\.sql/,
  );

  assert.doesNotMatch(
    migration,
    /DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE|DELETE\s+FROM/i,
    'Category 20 tenant migration must remain additive.',
  );

  for (
    const table
    of [
      'integration_connections',
      'integration_credentials',
      'integration_oauth_states',
      'integration_sync_jobs',
      'integration_webhook_endpoints',
      'integration_webhook_deliveries',
      'integration_events',
      'integration_external_apps',
      'integration_external_app_assignments',
      'integration_assignment_rules',
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      ),
    );

    assert.match(
      core,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS \\{schema\\}\\.${table}`,
      ),
    );
  }

  assert.match(
    migration,
    /ALTER TABLE automation_workflows[\s\S]*run_as_user_id/,
  );

  assert.match(
    core,
    /ALTER TABLE \{schema\}\.automation_workflows[\s\S]*run_as_user_id/,
  );

  assert.match(
    migration,
    /VALUES \('1\.7\.0'/,
  );

  assert.match(
    core,
    /VALUES \('1\.7\.0'\)/,
  );
});

test('Category 20: new-tenant updated_at helper exists before Category 19 and 20 trigger creation', async () => {
  const core =
    await source(
      'lib/schema/tenant-core.sql',
    );

  const helper =
    core.indexOf(
      'CREATE OR REPLACE FUNCTION {schema}.set_updated_at()',
    );

  const automationTrigger =
    core.indexOf(
      'CREATE TRIGGER trg_automation_workflows_updated_at',
    );

  const integrationTrigger =
    core.indexOf(
      'CREATE TRIGGER trg_integration_connections_updated_at',
    );

  assert.ok(
    helper >=
      0,
  );

  assert.ok(
    automationTrigger >
      helper,
  );

  assert.ok(
    integrationTrigger >
      helper,
  );
});

test('Category 20: provider registry is code-owned, env-configured and module-runtime filtered', async () => {
  const [
    registry,
    moduleTypes,
    manifests,
  ] =
    await Promise.all([
      source(
        'lib/integrations/registry.ts',
      ),
      source(
        'lib/modules/types.ts',
      ),
      source(
        'lib/modules/first-party.ts',
      ),
    ]);

  assert.match(
    registry,
    /CORE_INTEGRATION_PROVIDERS/,
  );

  assert.match(
    registry,
    /APP_INTEGRATION_PROVIDERS/,
  );

  assert.match(
    registry,
    /SAMI_GOOGLE_OAUTH_CLIENT_ID/,
  );

  assert.match(
    registry,
    /SAMI_MICROSOFT_OAUTH_CLIENT_ID/,
  );

  assert.match(
    registry,
    /SAMI_SLACK_OAUTH_CLIENT_ID/,
  );

  assert.match(
    registry,
    /isIntegrationEncryptionConfigured/,
  );

  assert.match(
    registry,
    /getSamiModuleManifest/,
  );

  assert.match(
    registry,
    /integrationProviders/,
  );

  assert.match(
    moduleTypes,
    /integrationProviders:\s*boolean/,
  );

  assert.equal(
    (
      manifests.match(
        /integrationProviders:\s*false/g,
      ) ||
      []
    ).length,
    36,
    'Every existing first-party module must fail closed until it deliberately contributes an integration provider.',
  );

  assert.doesNotMatch(
    registry,
    /queryControl|getTenantPool|eval\(|new Function|executeSql|rawSql/i,
  );
});

test('Category 20: integration credential encryption uses a versioned AES-GCM keyring', async () => {
  const crypto =
    await source(
      'lib/integrations/crypto.ts',
    );

  assert.match(
    crypto,
    /aes-256-gcm/,
  );

  assert.match(
    crypto,
    /SAMI_INTEGRATION_ENCRYPTION_KEY_VERSION/,
  );

  assert.match(
    crypto,
    /SAMI_INTEGRATION_ENCRYPTION_KEY_/,
  );

  assert.match(
    crypto,
    /createCipheriv/,
  );

  assert.match(
    crypto,
    /getAuthTag/,
  );

  assert.match(
    crypto,
    /setAuthTag/,
  );

  assert.match(
    crypto,
    /sha256/,
  );

  assert.doesNotMatch(
    crypto,
    /localStorage|sessionStorage|document\.|window\./,
  );
});

test('Category 20: OAuth state is one-time, expiring, PKCE-capable and credentials never return to the browser', async () => {
  const [
    oauth,
    startRoute,
    callbackRoute,
  ] =
    await Promise.all([
      source(
        'lib/integrations/oauth.ts',
      ),
      source(
        'app/api/workspace/integrations/oauth/[providerKey]/start/route.ts',
      ),
      source(
        'app/api/workspace/integrations/oauth/[providerKey]/callback/route.ts',
      ),
    ]);

  assert.match(
    oauth,
    /integration_oauth_states/,
  );

  assert.match(
    oauth,
    /state_hash/,
  );

  assert.match(
    oauth,
    /expires_at/,
  );

  assert.match(
    oauth,
    /consumed_at/,
  );

  assert.match(
    oauth,
    /code_challenge_method/,
  );

  assert.match(
    oauth,
    /S256/,
  );

  assert.match(
    oauth,
    /sealIntegrationSecret/,
  );

  assert.match(
    oauth,
    /integration_credentials/,
  );

  assert.match(
    startRoute,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    callbackRoute,
    /completeWorkspaceIntegrationOAuth/,
  );

  assert.doesNotMatch(
    startRoute +
      callbackRoute,
    /accessToken|refreshToken|sealed_payload|clientSecret/,
    'OAuth browser routes must not expose provider credentials.',
  );
});

test('Category 20: workspace integration authority is session, company and permission scoped', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-integrations.ts',
      ),
    );

  assert.match(
    service,
    /getPermissionContext/,
  );

  assert.match(
    service,
    /getSession/,
  );

  assert.match(
    service,
    /session\.sessionId !== permissions\.sessionId/,
  );

  assert.match(
    service,
    /session\.currentTenantId !== permissions\.tenantId/,
  );

  assert.match(
    service,
    /requireCompanyAccess/,
  );

  assert.match(
    service,
    /INTEGRATIONS_VIEW/,
  );

  assert.match(
    service,
    /INTEGRATIONS_MANAGE/,
  );

  assert.match(
    service,
    /resolveWorkspaceShellAccess/,
  );

  assert.match(
    service,
    /accessibleModuleKeys/,
  );
});

test('Category 20: integration state is redacted and disconnect destroys stored credentials', async () => {
  const service =
    await source(
      'lib/services/workspace-integrations.ts',
    );

  const stateStart =
    service.indexOf(
      'export async function getWorkspaceIntegrationState',
    );

  const createWebhook =
    service.indexOf(
      'export async function createWorkspaceWebhookEndpoint',
    );

  const stateBlock =
    service.slice(
      stateStart,
      createWebhook,
    );

  assert.doesNotMatch(
    stateBlock,
    /sealed_payload|access_token|refresh_token|client_secret|webhook_secret/i,
    'Normal integration state must never return stored secrets.',
  );

  assert.match(
    service,
    /DELETE FROM integration_credentials/,
  );

  assert.match(
    service,
    /status =\s*'revoked'/,
  );

  assert.match(
    service,
    /integration\.disconnected/,
  );
});

test('Category 20: custom webhook secrets are one-time and inbound delivery is bounded, verified and idempotent', async () => {
  const [
    service,
    webhook,
    route,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'lib/integrations/webhooks.ts',
      ),
      source(
        'app/api/integrations/webhooks/inbound/[tenantId]/[endpointKey]/route.ts',
      ),
    ]);

  assert.match(
    service,
    /hashIntegrationToken/,
  );

  assert.match(
    service,
    /secretHash/,
  );

  assert.match(
    service,
    /secret,/,
    'The newly generated webhook secret may be returned exactly at creation time.',
  );

  assert.match(
    webhook,
    /timingSafeEqual/,
  );

  assert.match(
    webhook,
    /MAX_WEBHOOK_BYTES/,
  );

  assert.match(
    webhook,
    /256 \*/,
  );

  assert.match(
    webhook,
    /MAX_DELIVERIES_PER_MINUTE/,
  );

  assert.match(
    webhook,
    /120/,
  );

  assert.match(
    webhook,
    /external_event_id/,
  );

  assert.match(
    webhook,
    /payload_digest/,
  );

  assert.match(
    webhook,
    /WEBHOOK_EVENT_NOT_ALLOWED/,
  );

  assert.match(
    route,
    /Authorization|authorization/,
  );

  assert.doesNotMatch(
    route,
    /queryControl|executeSql|rawSql/,
  );
});

test('Category 20: verified webhooks dispatch through Category 19 using a live run-as authority principal', async () => {
  const [
    webhook,
    automationService,
    automationDefinition,
    automationRegistry,
  ] =
    await Promise.all([
      source(
        'lib/integrations/webhooks.ts',
      ),
      source(
        'lib/services/workspace-automation.ts',
      ),
      source(
        'lib/automation/definition.ts',
      ),
      source(
        'lib/automation/registry.ts',
      ),
    ]);

  assert.match(
    automationRegistry,
    /integrations\.webhook\.received/,
  );

  assert.match(
    automationDefinition,
    /integrations\.webhook\.received/,
  );

  assert.match(
    automationService,
    /run_as_user_id = \$4/,
  );

  assert.match(
    webhook,
    /resolveAutomationWorkerRuntime/,
  );

  assert.match(
    webhook,
    /loadActiveAutomationWorkflow/,
  );

  assert.match(
    webhook,
    /startAutomationRun/,
  );

  assert.match(
    webhook,
    /run_as_user_id/,
  );
});

test('Category 20: Slack Automation action uses only a current-company encrypted Slack connection', async () => {
  const [
    integrationRuntime,
    automationRegistry,
    providerRegistry,
  ] =
    await Promise.all([
      source(
        'lib/integrations/runtime.ts',
      ),
      source(
        'lib/automation/registry.ts',
      ),
      source(
        'lib/integrations/registry.ts',
      ),
    ]);

  assert.match(
    providerRegistry,
    /chat:write/,
  );

  assert.match(
    automationRegistry,
    /integrations\.slack\.send_message/,
  );

  assert.match(
    automationRegistry,
    /INTEGRATIONS_VIEW/,
  );

  assert.match(
    integrationRuntime,
    /sendSlackIntegrationMessage/,
  );

  assert.match(
    integrationRuntime,
    /https:\/\/slack\.com\/api\/chat\.postMessage/,
  );

  assert.match(
    integrationRuntime,
    /company_id = \$2/,
  );

  assert.match(
    integrationRuntime,
    /providerKey !==\s*'slack'/,
  );

  assert.doesNotMatch(
    integrationRuntime,
    /input\.url|targetUrl|fetch\(\s*input\./,
    'Slack action must not become an arbitrary HTTP request primitive.',
  );
});

test('Category 20: OAuth credentials refresh and rotate server-side without exposing refreshed tokens', async () => {
  const runtime =
    await source(
      'lib/integrations/runtime.ts',
    );

  assert.match(
    runtime,
    /refreshOAuthCredential/,
  );

  assert.match(
    runtime,
    /grant_type/,
  );

  assert.match(
    runtime,
    /refresh_token/,
  );

  assert.match(
    runtime,
    /requireConfiguredOAuthProvider/,
  );

  assert.match(
    runtime,
    /sealIntegrationSecret/,
  );

  assert.match(
    runtime,
    /rotated_at = NOW\(\)/,
  );

  assert.match(
    runtime,
    /usableOAuthCredential/,
  );

  assert.doesNotMatch(
    runtime,
    /console\.log\([^)]*(accessToken|refreshToken|sealed)/i,
    'Credential refresh must never log decrypted OAuth material.',
  );
});

test('Category 20: health checks are code-owned and Sync is unavailable without a registered handler', async () => {
  const [
    runtime,
    service,
    client,
  ] =
    await Promise.all([
      source(
        'lib/integrations/runtime.ts',
      ),
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'app/integrations/IntegrationsClient.tsx',
      ),
    ]);

  assert.match(
    runtime,
    /openidconnect\.googleapis\.com/,
  );

  assert.match(
    runtime,
    /graph\.microsoft\.com/,
  );

  assert.match(
    runtime,
    /slack\.com\/api\/auth\.test/,
  );

  assert.match(
    runtime,
    /SYNC_HANDLERS/,
  );

  assert.match(
    runtime,
    /getIntegrationSyncHandler/,
  );

  assert.match(
    service,
    /syncAvailable/,
  );

  assert.match(
    client,
    /connection\.syncAvailable/,
  );

  assert.doesNotMatch(
    runtime,
    /eval\(|new Function|rawSql|executeSql/,
  );
});

test('Category 20: external app consumption is separate from integration administration', async () => {
  const [
    service,
    launcherRoute,
    appsPage,
    appsClient,
    switcher,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'app/api/workspace/integrations/launcher/route.ts',
      ),
      source(
        'app/apps/page.tsx',
      ),
      source(
        'app/apps/AppsLauncherClient.tsx',
      ),
      source(
        'app/components/workspace/WorkspaceAppSwitcher.tsx',
      ),
    ]);

  const launcherStart =
    service.indexOf(
      'export async function getWorkspaceExternalAppLauncherEntries',
    );

  const launcherEnd =
    service.indexOf(
      'export async function getWorkspaceIntegrationAssignableUsers',
      launcherStart,
    );

  const launcherBlock =
    service.slice(
      launcherStart,
      launcherEnd,
    );

  assert.match(
    launcherBlock,
    /getPermissionContext/,
  );

  assert.match(
    launcherBlock,
    /requireCompanyAccess/,
  );

  assert.doesNotMatch(
    launcherBlock,
    /INTEGRATIONS_VIEW|INTEGRATIONS_MANAGE/,
    'Assigned users must not need integration-administration permissions to launch an app.',
  );

  assert.match(
    launcherRoute,
    /getWorkspaceExternalAppLauncherEntries/,
  );

  assert.match(
    appsPage,
    /externalApps/,
  );

  assert.match(
    appsClient,
    /External app/,
  );

  assert.match(
    appsClient,
    /noopener noreferrer/,
  );

  assert.match(
    switcher,
    /integrations\/launcher/,
  );

  assert.match(
    switcher,
    /External/,
  );
});

test('Category 20: webhook lifecycle supports pause, resume, one-time secret rotation, revoke and delivery history', async () => {
  const [
    service,
    route,
    client,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'app/api/workspace/integrations/webhooks/[endpointId]/route.ts',
      ),
      source(
        'app/integrations/IntegrationsClient.tsx',
      ),
    ]);

  assert.match(
    service,
    /manageWorkspaceWebhookEndpoint/,
  );

  for (
    const operation
    of [
      'pause',
      'resume',
      'rotate_secret',
      'revoke',
    ]
  ) {
    assert.match(
      service,
      new RegExp(
        operation,
      ),
    );
  }

  assert.match(
    service,
    /generateIntegrationToken/,
  );

  assert.match(
    service,
    /hashIntegrationToken/,
  );

  assert.match(
    service,
    /integration_webhook_deliveries/,
  );

  assert.match(
    service,
    /webhookDeliveries/,
  );

  assert.match(
    route,
    /manageWorkspaceWebhookEndpoint/,
  );

  assert.match(
    route,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    client,
    /Recent webhook deliveries/,
  );

  assert.match(
    client,
    /Rotate secret/,
  );

  assert.match(
    client,
    /webhookOperation/,
  );
});

test('Category 20: external apps have governed edit, enable, disable and archive lifecycle', async () => {
  const [
    service,
    route,
    client,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'app/api/workspace/integrations/external-apps/[externalAppId]/route.ts',
      ),
      source(
        'app/integrations/IntegrationsClient.tsx',
      ),
    ]);

  assert.match(
    service,
    /manageWorkspaceExternalApp/,
  );

  for (
    const operation
    of [
      'update',
      'enable',
      'disable',
      'archive',
    ]
  ) {
    assert.match(
      service,
      new RegExp(
        operation,
      ),
    );
  }

  assert.match(
    service,
    /normalizeExternalLaunchUrl/,
  );

  assert.match(
    route,
    /manageWorkspaceExternalApp/,
  );

  assert.match(
    route,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    client,
    /openExternalEditor/,
  );

  assert.match(
    client,
    /externalAppOperation/,
  );

  assert.match(
    client,
    /Save changes/,
  );

  assert.match(
    client,
    /Archive/,
  );
});

test('Category 20: external app access supports selected users, everyone and structured conditional rules', async () => {
  const [
    service,
    client,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'app/integrations/IntegrationsClient.tsx',
      ),
    ]);

  assert.match(
    service,
    /setWorkspaceExternalAppAccessPolicy/,
  );

  assert.match(
    service,
    /all_internal/,
  );

  assert.match(
    service,
    /roleKeysAny/,
  );

  assert.match(
    service,
    /emailDomainsAny/,
  );

  assert.match(
    service,
    /conditions\.match ===\s*'any'/,
  );

  assert.doesNotMatch(
    service,
    /eval\(|new Function|vm\./,
    'Conditional assignment must remain structured data, never executable expressions.',
  );

  assert.match(
    client,
    /Selected users/,
  );

  assert.match(
    client,
    /Everyone with company access/,
  );

  assert.match(
    client,
    /Conditional rule/,
  );

  assert.match(
    client,
    /SaMi roles/,
  );

  assert.match(
    client,
    /Email domains/,
  );
});

test('Category 20: Integrations UI, navigation and search are permission-aware and responsive', async () => {
  const [
    page,
    client,
    navigation,
    sidebar,
    search,
  ] =
    await Promise.all([
      source(
        'app/integrations/page.tsx',
      ),
      source(
        'app/integrations/IntegrationsClient.tsx',
      ),
      source(
        'app/api/workspace/navigation/route.ts',
      ),
      source(
        'app/components/workspace/WorkspaceSidebar.tsx',
      ),
      source(
        'lib/search/workspace-search.ts',
      ),
    ]);

  assert.match(
    page,
    /INTEGRATIONS_VIEW/,
  );

  assert.match(
    page,
    /INTEGRATIONS_MANAGE/,
  );

  assert.match(
    page,
    /WorkspaceShell/,
  );

  assert.match(
    page,
    /getWorkspaceIntegrationState/,
  );

  assert.match(
    client,
    /Integration catalog/,
  );

  assert.match(
    client,
    /Connections/,
  );

  assert.match(
    client,
    /Webhooks/,
  );

  assert.match(
    client,
    /External business apps/,
  );

  assert.match(
    client,
    /Recent sync activity/,
  );

  assert.match(
    client,
    /sm:grid-cols-2/,
  );

  assert.match(
    navigation,
    /integrationsView/,
  );

  assert.match(
    navigation,
    /integrationsManage/,
  );

  assert.match(
    sidebar,
    /href="\/integrations"/,
  );

  assert.match(
    sidebar,
    /label="Integrations"/,
  );

  assert.match(
    search,
    /href:\s*['"]\/integrations['"]/,
  );

  assert.match(
    search,
    /externalAppCandidates/,
  );
});

test('Category 20: Automation uses real webhook and Slack connection selectors instead of UUID-paste UX', async () => {
  const client =
    await source(
      'app/automation/AutomationClient.tsx',
    );

  assert.match(
    client,
    /\/api\/workspace\/integrations/,
  );

  assert.match(
    client,
    /integrations\.webhook\.received/,
  );

  assert.match(
    client,
    /Webhook endpoint/,
  );

  assert.match(
    client,
    /Choose webhook/,
  );

  assert.match(
    client,
    /integrations\.slack\.send_message/,
  );

  assert.match(
    client,
    /Choose Slack connection/,
  );

  assert.match(
    client,
    /connection\.providerKey ===\s*['"]slack['"]/,
  );
});

test('Category 20: browser management APIs are narrow, same-origin protected and no-cache', async () => {
  const [
    helper,
    collection,
    connection,
    webhook,
    externalApp,
    assignments,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations-api.ts',
      ),
      source(
        'app/api/workspace/integrations/route.ts',
      ),
      source(
        'app/api/workspace/integrations/connections/[connectionId]/route.ts',
      ),
      source(
        'app/api/workspace/integrations/webhooks/[endpointId]/route.ts',
      ),
      source(
        'app/api/workspace/integrations/external-apps/[externalAppId]/route.ts',
      ),
      source(
        'app/api/workspace/integrations/external-apps/[externalAppId]/assignments/route.ts',
      ),
    ]);

  assert.match(
    helper,
    /sec-fetch-site/,
  );

  assert.match(
    helper,
    /INVALID_ORIGIN/,
  );

  assert.match(
    helper,
    /no-store/,
  );

  assert.match(
    collection,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    connection,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    webhook,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    externalApp,
    /rejectIntegrationCrossOrigin/,
  );

  assert.match(
    assignments,
    /rejectIntegrationCrossOrigin/,
  );

  assert.doesNotMatch(
    collection +
      connection +
      webhook +
      externalApp +
      assignments,
    /queryControl|getTenantPool|sealed_payload|access_token|refresh_token/i,
    'Browser management routes must call trusted services rather than touch credentials or databases directly.',
  );
});

test('Category 20: operational boundary and reserved SSO state are documented accurately', async () => {
  const doc =
    await source(
      'docs/integrations-runtime.md',
    );

  assert.match(
    doc,
    /AES-256-GCM/,
  );

  assert.match(
    doc,
    /SAMI_INTEGRATION_ENCRYPTION_KEY_VERSION/,
  );

  assert.match(
    doc,
    /one-time, expiring/i,
  );

  assert.match(
    doc,
    /Selected users|selected users/,
  );

  assert.match(
    doc,
    /structured rules/,
  );

  assert.match(
    doc,
    /Slack.*Automation action/is,
  );

  assert.match(
    doc,
    /currently exposes bookmark-style external app launching only/i,
    'SaMi must not claim enterprise SSO before the identity-provider flow exists.',
  );
});

test('Category 20: full-suite gate includes Integrations regression coverage', async () => {
  const pkg =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  assert.equal(
    pkg.scripts[
      'test:category20'
    ],
    'node --test tests/category-20-integrations.test.mjs',
  );

  assert.match(
    pkg.scripts[
      'test:all'
    ],
    /test:category20/,
  );
});
