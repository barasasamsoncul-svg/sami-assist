import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
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

test('Category 23: fixed SaMi AI allowances remain plan-authoritative', async () => {
  const policy =
    await source(
      'lib/billing/plan-policy.ts',
    );

  assert.match(
    policy,
    /free:[\s\S]*monthlyQueriesPerUser:[\s\S]*limit:[\s\S]*100/s,
  );

  assert.match(
    policy,
    /standard:[\s\S]*monthlyQueriesPerUser:[\s\S]*limit:[\s\S]*1000/s,
  );

  assert.match(
    policy,
    /custom:[\s\S]*monthlyQueriesPerUser:[\s\S]*cost_controlled/s,
  );
});

test('Category 23: usage is derived from authoritative operational records', async () => {
  const usage =
    await source(
      'lib/usage/entitlements.ts',
    );

  for (
    const table
    of [
      'ai_runs',
      'files',
      'automation_runs',
      'api_request_logs',
      'tenant_users',
      'tenant_modules',
    ]
  ) {
    assert.match(
      usage,
      new RegExp(
        table,
      ),
      'Usage resolver must read ' +
        table +
        ' rather than inventing a disconnected counter.',
    );
  }

  assert.doesNotMatch(
    usage,
    /browser.*tenantId|request.*tenantId/i,
    'Usage authority must not come from a browser-supplied tenant selector.',
  );
});

test('Category 23: active seat usage counts internal users only', async () => {
  const usage =
    await source(
      'lib/usage/entitlements.ts',
    );

  assert.match(
    usage,
    /tu\.member_type[\s\S]*internal/s,
  );

  assert.match(
    usage,
    /tu\.status[\s\S]*active/s,
  );
});

test('Category 23: monthly AI allowance is enforced before a provider run is created', async () => {
  const ai =
    await source(
      'lib/services/workspace-ai.ts',
    );

  const quota =
    ai.indexOf(
      'assertAiMonthlyUsageAvailable',
    );

  const run =
    ai.indexOf(
      'const runId =',
    );

  assert.ok(
    quota >= 0,
  );

  assert.ok(
    run >= 0,
  );

  assert.ok(
    quota < run,
    'Monthly entitlement must be checked before an AI run/provider call is accepted.',
  );

  assert.match(
    ai,
    /AI_MONTHLY_LIMIT_REACHED[\s\S]*AI_RATE_LIMITED/s,
  );
});

test('Category 23: storage allowance is checked before issuing an upload intent', async () => {
  const files =
    await source(
      'lib/services/workspace-files.ts',
    );

  const quota =
    files.indexOf(
      'assertStorageAllocationAvailable',
    );

  const insert =
    files.indexOf(
      'INSERT INTO files',
    );

  assert.ok(
    quota >= 0,
  );

  assert.ok(
    insert >= 0,
  );

  assert.ok(
    quota < insert,
    'Storage allowance must be checked before a new file allocation is persisted.',
  );

  assert.match(
    files,
    /STORAGE_QUOTA_EXCEEDED/,
  );
});

test('Category 23: optional Custom AI and storage guardrails are environment-driven', async () => {
  const usage =
    await source(
      'lib/usage/entitlements.ts',
    );

  const env =
    await source(
      'docs/platform-env.example',
    );

  for (
    const key
    of [
      'SAMI_USAGE_CUSTOM_AI_MONTHLY_QUERIES_PER_USER',
      'SAMI_USAGE_FREE_STORAGE_BYTES',
      'SAMI_USAGE_STANDARD_STORAGE_BYTES',
      'SAMI_USAGE_CUSTOM_STORAGE_BYTES',
    ]
  ) {
    assert.match(
      usage,
      new RegExp(
        key,
      ),
    );

    assert.match(
      env,
      new RegExp(
        key,
      ),
    );
  }

  assert.match(
    env,
    /does NOT create a marketed[\s\S]*unlimited/s,
  );
});

test('Category 23: internal seat limits cover invitations and member reactivation', async () => {
  const [
    usage,
    invitations,
    membership,
  ] =
    await Promise.all([
      source(
        'lib/usage/entitlements.ts',
      ),
      source(
        'lib/services/invitation-acceptance.ts',
      ),
      source(
        'lib/services/membership-lifecycle.ts',
      ),
    ]);

  assert.match(
    usage,
    /pg_advisory_xact_lock/,
    'Seat checks must serialize concurrent activation paths.',
  );

  assert.match(
    usage,
    /INTERNAL_SEAT_LIMIT_REACHED/,
  );

  assert.match(
    usage,
    /member_type[\s\S]*internal[\s\S]*status[\s\S]*active/s,
  );

  assert.match(
    invitations,
    /assertInternalSeatAvailableWithClient/,
    'Invitation acceptance must not bypass the active internal-user allowance.',
  );

  assert.match(
    invitations,
    /INVITATION_PLAN_LIMIT_REACHED/,
  );

  assert.match(
    membership,
    /assertMembershipSeatAvailable[\s\S]*reactivate/s,
  );

  assert.match(
    membership,
    /assertMembershipSeatAvailable[\s\S]*restore/s,
  );
});

test('Category 23: Custom-only integrations are enforced at management and runtime boundaries', async () => {
  const [
    integrations,
    webhookRuntime,
    policy,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-integrations.ts',
      ),
      source(
        'lib/integrations/webhooks.ts',
      ),
      source(
        'lib/billing/plan-policy.ts',
      ),
    ]);

  assert.match(
    policy,
    /free:[\s\S]*customIntegrations:[\s\S]*false/s,
  );

  assert.match(
    policy,
    /standard:[\s\S]*customIntegrations:[\s\S]*false/s,
  );

  assert.match(
    policy,
    /custom:[\s\S]*customIntegrations:[\s\S]*true/s,
  );

  assert.match(
    integrations,
    /requireCustomIntegrationEntitlement/,
  );

  assert.match(
    integrations,
    /createWorkspaceWebhookEndpoint[\s\S]*requireCustomIntegrationEntitlement/s,
  );

  assert.match(
    integrations,
    /createWorkspaceExternalApp[\s\S]*requireCustomIntegrationEntitlement/s,
  );

  assert.match(
    integrations,
    /action ===[\s\S]*'resume'[\s\S]*rotate_secret[\s\S]*requireCustomIntegrationEntitlement/s,
  );

  assert.match(
    integrations,
    /operation ===[\s\S]*'update'[\s\S]*'enable'[\s\S]*requireCustomIntegrationEntitlement/s,
  );

  assert.match(
    webhookRuntime,
    /custom_webhook[\s\S]*customIntegrations[\s\S]*WEBHOOK_PLAN_INACTIVE/s,
    'Downgraded workspaces must not continue executing custom webhooks.',
  );
});

test('Category 23: workspace usage visibility follows billing authority', async () => {
  const service =
    await source(
      'lib/services/workspace-usage.ts',
    );

  assert.match(
    service,
    /permissions\.isOwner/,
  );

  assert.match(
    service,
    /BILLING_VIEW/,
  );

  assert.match(
    service,
    /BILLING_MANAGE/,
  );

  assert.match(
    service,
    /USAGE_VIEW_REQUIRED/,
  );
});

test('Category 23: Usage API is read-only, private and no-cache', async () => {
  const route =
    await source(
      'app/api/workspace/usage/route.ts',
    );

  assert.match(
    route,
    /export async function GET/,
  );

  assert.doesNotMatch(
    route,
    /export async function (POST|PUT|PATCH|DELETE)/,
  );

  assert.match(
    route,
    /no-store, no-cache, must-revalidate, private/,
  );
});

test('Category 23: Usage & Limits UI is responsive and permission-aware in navigation', async () => {
  const [
    page,
    sidebar,
  ] =
    await Promise.all([
      source(
        'app/usage/page.tsx',
      ),
      source(
        'app/components/workspace/WorkspaceSidebar.tsx',
      ),
    ]);

  assert.match(
    page,
    /sm:grid-cols-2/,
  );

  assert.match(
    page,
    /xl:grid-cols-3/,
  );

  assert.match(
    sidebar,
    /Usage & Limits/,
  );

  assert.match(
    sidebar,
    /href:[\s\S]*'\/usage'/s,
  );

  assert.match(
    sidebar,
    /billingView[\s\S]*billingManage[\s\S]*Usage & Limits/s,
  );
});

test('Category 23: SaMi AI attachments reuse private workspace storage and message links', async () => {
  const [
    attachments,
    ai,
    route,
    client,
    env,
  ] = await Promise.all([
    source(
      'lib/ai/attachments.ts',
    ),
    source(
      'lib/services/workspace-ai.ts',
    ),
    source(
      'app/api/workspace/ai/chat/route.ts',
    ),
    source(
      'app/components/workspace/WorkspaceAiClient.tsx',
    ),
    source(
      'docs/platform-env.example',
    ),
  ]);

  assert.match(
    attachments,
    /FROM files[\s\S]*company_id = \$1[\s\S]*status = 'active'/s,
  );

  assert.match(
    attachments,
    /INSERT INTO file_links[\s\S]*'core\.ai'[\s\S]*'ai_message'/s,
  );

  assert.match(
    attachments,
    /getPrivateObjectBytes/,
    'Readable text attachments must be read from private object storage server-side.',
  );

  assert.match(
    attachments,
    /Do not claim to have read its contents/,
    'Unsupported binary attachments must not be presented to the model as if their contents were read.',
  );

  assert.match(
    ai,
    /resolveSamiAiAttachments[\s\S]*linkSamiAiAttachmentsToMessage/s,
  );

  assert.match(
    ai,
    /loadSamiAiAttachmentContextForMessages/,
    'Regeneration/history must reconstruct attachment context from durable message links.',
  );

  assert.match(
    route,
    /attachmentIds:[\s\S]*body\?\.attachmentIds/s,
  );

  assert.match(
    client,
    /Paperclip/,
  );

  assert.match(
    client,
    /upload-intent/,
  );

  assert.match(
    client,
    /ai_attachment/,
  );

  assert.match(
    env,
    /SAMI_AI_MAX_ATTACHMENTS_PER_MESSAGE=5/,
  );

  assert.match(
    env,
    /SAMI_AI_ATTACHMENT_TEXT_MAX_BYTES=524288/,
  );
});

test('Category 23: tenant migration runner repairs physically completed audit history', async () => {
  const migrations =
    await source(
      'lib/services/tenant-migrations.ts',
    );

  assert.match(
    migrations,
    /repairCompletedMigrationHistory/,
  );

  assert.match(
    migrations,
    /FROM core_schema_version/,
  );

  assert.match(
    migrations,
    /ON CONFLICT[\s\S]*tenant_id[\s\S]*migration_key[\s\S]*status[\s\S]*completed/s,
  );
});

test('Category 23: pending downgrades immediately constrain new capacity without removing current access', async () => {
  const [
    access,
    usage,
    apps,
    organization,
    integrations,
  ] =
    await Promise.all([
      source(
        'lib/billing/access.ts',
      ),
      source(
        'lib/usage/entitlements.ts',
      ),
      source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
      source(
        'lib/services/organization-profile.ts',
      ),
      source(
        'lib/services/workspace-integrations.ts',
      ),
    ]);

  assert.match(
    access,
    /scheduled_plan_key/,
  );

  assert.match(
    access,
    /scheduledPolicy/,
  );

  assert.match(
    usage,
    /access\.scheduledPolicy[\s\S]*maxActiveInternalUsers/s,
    'New internal seats must obey a stricter pending target plan.',
  );

  assert.match(
    usage,
    /subscription[\s\S]*scheduledPolicy[\s\S]*maxInstalledBusinessApps/s,
    'Usage state must show pending-plan app limits.',
  );

  assert.match(
    apps,
    /access\.scheduledPolicy[\s\S]*maxInstalledBusinessApps/s,
    'New app installs must not make a pending downgrade impossible.',
  );

  assert.match(
    organization,
    /access\.scheduledPolicy[\s\S]*multiCompany/s,
    'A pending single-company plan must block creating or reactivating extra companies.',
  );

  assert.match(
    integrations,
    /access\.scheduledPolicy[\s\S]*customIntegrations/s,
    'A pending non-Custom plan must block creation or re-enabling of Custom-only integrations.',
  );
});

test('Category 23: full-suite gate includes Usage & Entitlements regression coverage', async () => {
  const pkg =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  assert.equal(
    pkg.scripts[
      'test:category23'
    ],
    'node --test tests/category-23-usage-entitlements.test.mjs',
  );

  assert.match(
    pkg.scripts[
      'test:all'
    ],
    /test:category23/,
  );
});
