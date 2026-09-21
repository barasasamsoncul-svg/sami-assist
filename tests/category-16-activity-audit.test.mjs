import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

test('Category 16: tenant core advances additively from 1.3.0 to 1.4.0', async () => {
  const [manifest, migration, core] = await Promise.all([
    source('lib/schema/tenant-migrations/manifest.ts'),
    source('lib/schema/tenant-migrations/migrations/004-core-1.3.0-to-1.4.0.sql'),
    source('lib/schema/tenant-core.sql'),
  ]);

  assert.match(
    manifest,
    /core-1\.3\.0-to-1\.4\.0/,
  );
  assert.match(
    manifest,
    /fromVersion:\s*['"]1\.3\.0['"]/,
  );
  assert.match(
    manifest,
    /toVersion:\s*['"]1\.4\.0['"]/,
  );
  assert.match(
    manifest,
    /004-core-1\.3\.0-to-1\.4\.0\.sql/,
  );

  assert.match(migration, /ALTER TABLE audit_logs/i);
  assert.match(migration, /category VARCHAR\(50\)/i);
  assert.match(migration, /severity VARCHAR\(20\)/i);
  assert.match(migration, /changes JSONB/i);
  assert.match(migration, /request_method VARCHAR\(10\)/i);
  assert.match(migration, /request_path TEXT/i);
  assert.doesNotMatch(
    migration,
    /DROP TABLE|DROP DATABASE|TRUNCATE/i,
  );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.audit_logs/,
  );
  assert.match(
    core,
    /idx_audit_logs_company_category_created/,
  );
});

test('Category 16: personal Activity is user scoped while Audit can safely federate authorized workspace events', async () => {
  const service = compact(
    await source('lib/services/workspace-activity.ts'),
  );

  assert.match(
    service,
    /FROM audit_logs WHERE company_id = \$1/,
  );
  assert.match(
    service,
    /view === 'activity' \? context\.userId/,
    'Personal Activity must force the authenticated user as the actor filter.',
  );
  assert.match(
    service,
    /\(\$4::uuid IS NULL OR user_id = \$4\)/,
    'Tenant activity queries must support the trusted actor scope.',
  );
  assert.match(
    service,
    /\(\$2::uuid IS NULL OR user_id = \$2\)/,
    'Activity summary must use the same authenticated-user scope.',
  );
  assert.match(
    service,
    /listWorkspaceAdminRows/,
  );
  assert.match(
    service,
    /tenant_id = \$1/,
  );
  assert.match(
    service,
    /context\.canAudit/,
  );
  assert.match(
    service,
    /AUDIT_VIEW_REQUIRED/,
  );
  assert.doesNotMatch(
    service,
    /ACTIVITY_VIEW_REQUIRED/,
    'Every trusted active internal member can view their own Activity.',
  );
  assert.match(
    service,
    /action LIKE 'role\.%'/,
  );
  assert.match(
    service,
    /action LIKE 'workspace_app\.%'/,
  );
  assert.doesNotMatch(
    service,
    /SELECT \* FROM audit_logs/,
    'Audit federation must select only explicit fields rather than exposing raw platform rows.',
  );
});

test('Category 16: canonical audit writer is server-only and redacts secrets before persistence and display', async () => {
  const [service, route] = await Promise.all([
    source('lib/services/workspace-activity.ts'),
    source('app/api/workspace/activity/route.ts'),
  ]);

  assert.match(service, /import 'server-only'/);
  assert.match(service, /SENSITIVE_KEYS/);
  assert.match(service, /\[redacted\]/);
  assert.match(service, /safeJsonObject/);
  assert.match(service, /recordWorkspaceAuditEvent/);
  assert.match(service, /INSERT INTO audit_logs/);

  assert.match(route, /export async function GET/);
  assert.doesNotMatch(
    route,
    /export async function POST/,
    'Browser clients must never have a generic audit-write endpoint.',
  );
});

test('Category 16: UI follows a business timeline model with separate Activity and Audit experiences', async () => {
  const client = await source(
    'app/components/workspace/WorkspaceActivityClient.tsx',
  );

  assert.match(client, /dayLabel/);
  assert.match(client, />\s*My Activity\s*</);
  assert.match(client, />\s*Audit\s*</);
  assert.match(
    client,
    /Search my activity/,
    'Personal Activity search must make the user-scoped boundary explicit.',
  );

  assert.match(
    client,
    /Search audit/,
    'Audit search must remain a distinct permission-gated experience.',
  );
  assert.match(client, /All outcomes/);
  assert.match(client, /All areas/);
  assert.match(client, /Load older activity/);
  assert.match(client, /Workspace/);
  assert.match(client, /Company/);
  assert.match(client, /Sensitive metadata is redacted/);
});

test('Category 16: activity appears in Workspace Tools and audit detail remains permission-gated', async () => {
  const [sidebar, navigation, page] = await Promise.all([
    source('app/components/workspace/WorkspaceSidebar.tsx'),
    source('app/api/workspace/navigation/route.ts'),
    source('app/activity/page.tsx'),
  ]);

  assert.match(sidebar, /href="\/activity"/);
  assert.match(sidebar, /label="Activity"/);
  assert.match(sidebar, /activityView/);
  assert.match(sidebar, /auditView/);

  assert.match(
    navigation,
    /activityView:\s*true/s,
    'Activity must be available to every trusted active internal member.',
  );
  assert.match(navigation, /auditView:/);
  assert.match(navigation, /AUDIT_VIEW/);

  assert.match(page, /WorkspaceActivityClient/);
  assert.match(page, /title="My Activity & Audit"/);
});

test('Core communication: every trusted active internal member can see notifications and messages without a separate view-role assignment', async () => {
  const [navigation, notifications, sidebar, shell] =
    await Promise.all([
      source('app/api/workspace/navigation/route.ts'),
      source('lib/services/workspace-notifications.ts'),
      source('app/components/workspace/WorkspaceSidebar.tsx'),
      source('app/components/workspace/WorkspaceShell.tsx'),
    ]);

  assert.match(
    navigation,
    /notificationsView:\s*true/s,
  );
  assert.match(
    navigation,
    /notificationsManage:/,
  );
  assert.match(
    navigation,
    /NOTIFICATIONS_MANAGE/,
  );

  assert.doesNotMatch(
    notifications,
    /assertViewPermission/,
  );
  assert.doesNotMatch(
    notifications,
    /NOTIFICATIONS_VIEW_REQUIRED/,
  );
  assert.match(
    notifications,
    /requireCompanyAccess/,
  );

  assert.match(
    sidebar,
    /const canUseNotifications =\s*navigationPermissions\s*\?\.notificationsView ===\s*true/s,
  );
  assert.match(
    shell,
    /<WorkspaceNotificationCenter/,
  );
});

test('Category 16: messages create useful activity without persisting message bodies in audit metadata', async () => {
  const service = await source(
    'lib/services/workspace-messages.ts',
  );

  assert.match(
    service,
    /recordWorkspaceAuditEvent/,
  );
  assert.match(
    service,
    /communication\.message\.sent/,
  );
  assert.match(
    service,
    /communication\.announcement\.sent/,
  );

  const compactService = compact(service);

  assert.doesNotMatch(
    compactService,
    /recordWorkspaceAuditEvent\([^)]*metadata:\s*\{[^}]*body:/,
    'Message text must not be copied into audit metadata.',
  );
});

test('Company identity: uploaded organization logo is visible in the sidebar selector and top bar', async () => {
  const [avatar, identity, sidebar, shell, organization] =
    await Promise.all([
      source('app/components/workspace/CompanyAvatar.tsx'),
      source('app/components/workspace/WorkspaceCompanyIdentity.tsx'),
      source('app/components/workspace/WorkspaceSidebar.tsx'),
      source('app/components/workspace/WorkspaceShell.tsx'),
      source('app/settings/components/OrganizationSettings.tsx'),
    ]);

  assert.match(avatar, /logoUrl/);
  assert.match(avatar, /<img/);

  assert.match(
    sidebar,
    /<CompanyAvatar/,
  );
  assert.match(
    sidebar,
    /currentCompany\s*\?\.logoUrl/s,
  );

  assert.match(
    shell,
    /<WorkspaceCompanyIdentity/,
  );
  assert.match(
    identity,
    /\/api\/workspace\/company-context/,
  );

  assert.match(
    organization,
    /sami:company-context-changed/,
  );
});

test('Category 16: notification preference changes are part of the activity timeline', async () => {
  const notifications = await source(
    'lib/services/workspace-notifications.ts',
  );

  assert.match(
    notifications,
    /notifications\.preferences\.updated/,
  );
  assert.match(
    notifications,
    /changes:/,
  );
});

test('Category 16: full-suite gate includes Activity & Audit regression coverage', async () => {
  const pkg = JSON.parse(
    await source('package.json'),
  );

  assert.equal(
    pkg.scripts['test:category16'],
    'node --test tests/category-16-activity-audit.test.mjs',
  );

  assert.match(
    pkg.scripts['test:all'],
    /test:category16/,
  );
});
