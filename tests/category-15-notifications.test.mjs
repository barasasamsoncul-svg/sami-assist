import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(
    path.join(root, file),
    'utf8',
  );
}

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

test('Category 15: tenant core advances additively from 1.2.0 to 1.3.0', async () => {
  const [
    manifest,
    migration,
    core,
  ] = await Promise.all([
    source('lib/schema/tenant-migrations/manifest.ts'),
    source('lib/schema/tenant-migrations/migrations/003-core-1.2.0-to-1.3.0.sql'),
    source('lib/schema/tenant-core.sql'),
  ]);

  assert.match(
    manifest,
    /core-1\.2\.0-to-1\.3\.0/,
  );
  assert.match(
    manifest,
    /fromVersion:\s*['"]1\.2\.0['"]/,
  );
  assert.match(
    manifest,
    /toVersion:\s*['"]1\.3\.0['"]/,
  );
  assert.match(
    migration,
    /ALTER TABLE notifications/i,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS notification_preferences/i,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS notification_deliveries/i,
  );
  assert.doesNotMatch(
    migration,
    /DROP TABLE|DROP DATABASE|TRUNCATE/i,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.notification_deliveries/,
  );
});

test('Category 15: notification delivery model separates alerts, preferences and channel delivery state', async () => {
  const core = await source(
    'lib/schema/tenant-core.sql',
  );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.notifications/,
  );
  assert.match(
    core,
    /event_key VARCHAR\(150\)/,
  );
  assert.match(
    core,
    /priority VARCHAR\(20\) NOT NULL DEFAULT 'normal'/,
  );
  assert.match(
    core,
    /dedupe_key VARCHAR\(255\)/,
  );
  assert.match(
    core,
    /in_app_visible BOOLEAN NOT NULL DEFAULT TRUE/,
  );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.notification_preferences/,
  );
  assert.match(
    core,
    /in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE/,
  );
  assert.match(
    core,
    /email_enabled BOOLEAN NOT NULL DEFAULT FALSE/,
  );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.notification_deliveries/,
  );
  assert.match(
    core,
    /provider_message_id TEXT/,
  );
  assert.match(
    core,
    /attempts INTEGER NOT NULL DEFAULT 0/,
  );
});

test('Category 15: employee communication is a real message model, not fake system notifications', async () => {
  const core = await source(
    'lib/schema/tenant-core.sql',
  );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.workspace_conversations/,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.workspace_conversation_members/,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.workspace_messages/,
  );
  assert.match(
    core,
    /reply_to_message_id UUID/,
  );
  assert.match(
    core,
    /last_read_at TIMESTAMPTZ/,
  );
});

test('Category 15: browser can manage its own alerts but cannot forge system notifications', async () => {
  const [
    route,
    service,
  ] = await Promise.all([
    source('app/api/workspace/notifications/route.ts'),
    source('lib/services/workspace-notifications.ts'),
  ]);

  assert.match(
    route,
    /export async function GET/,
  );
  assert.doesNotMatch(
    route,
    /export async function POST/,
    'Browser notification endpoint must not expose arbitrary notification creation.',
  );

  const compactService =
    compact(service);

  assert.match(
    compactService,
    /Trusted server-side notification emitter/i,
  );
  assert.match(
    compactService,
    /getPermissionContext/,
  );
  assert.match(
    compactService,
    /session\.currentTenantId !== permissions\.tenantId/,
  );
  assert.match(
    compactService,
    /session\.currentCompanyId/,
  );
  assert.match(
    compactService,
    /requireCompanyAccess/,
    'Notification viewing follows trusted active company access rather than a separately assigned notification-view role.',
  );
  assert.doesNotMatch(
    compactService,
    /NOTIFICATIONS_VIEW_REQUIRED/,
  );
  assert.match(
    compactService,
    /WHERE user_id = \$1/,
  );
});

test('Category 15: direct messages require active internal recipients with current-company access', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-messages.ts',
      ),
    );

  assert.match(
    service,
    /member_type/,
  );
  assert.match(
    service,
    /'internal'/,
  );
  assert.match(
    service,
    /requireCompanyAccess/,
  );
  assert.match(
    service,
    /workspace_conversation_members/,
  );
  assert.match(
    service,
    /startWorkspaceDirectConversation/,
  );
  assert.match(
    service,
    /sendWorkspaceConversationMessage/,
  );
});

test('Category 15: company announcements are restricted to owner or notifications.manage', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-messages.ts',
      ),
    );

  assert.match(
    service,
    /sendWorkspaceCompanyAnnouncement/,
  );
  assert.match(
    service,
    /context\.permissions\.isOwner/,
  );
  assert.match(
    service,
    /SAMI_PERMISSIONS\.NOTIFICATIONS_MANAGE/,
  );
  assert.match(
    service,
    /communication\.announcement/,
  );
});

test('Category 15: notification center is integrated into shared shell and full workspace page', async () => {
  const [
    shell,
    center,
    page,
    sidebar,
  ] = await Promise.all([
    source('app/components/workspace/WorkspaceShell.tsx'),
    source('app/components/workspace/WorkspaceNotificationCenter.tsx'),
    source('app/notifications/page.tsx'),
    source('app/components/workspace/WorkspaceSidebar.tsx'),
  ]);

  assert.match(
    shell,
    /WorkspaceNotificationCenter/,
  );
  assert.match(
    shell,
    /liveUnreadNotifications/,
  );
  assert.match(
    center,
    /Notifications & messages/,
  );
  assert.match(
    center,
    /Company announcement/,
  );
  assert.match(
    center,
    /Direct message/,
  );
  assert.match(
    center,
    /Email notifications/,
  );
  assert.match(
    page,
    /mode="page"/,
  );
  assert.match(
    sidebar,
    /href="\/notifications"/,
  );
});

test('Category 15: notification navigation exposes view and manage separately', async () => {
  const navigation =
    compact(
      await source(
        'app/api/workspace/navigation/route.ts',
      ),
    );

  assert.match(
    navigation,
    /notificationsManage:/,
  );
  assert.match(
    navigation,
    /NOTIFICATIONS_MANAGE/,
  );
  assert.match(
    navigation,
    /notificationsView:/,
  );
});

test('Foundation completion: organization logo uses shared private Category 14 storage and real file metadata', async () => {
  const [
    service,
    route,
    ui,
  ] = await Promise.all([
    source('lib/services/organization-logo.ts'),
    source('app/api/workspace/organization/logo/route.ts'),
    source('app/settings/components/OrganizationSettings.tsx'),
  ]);

  assert.match(
    service,
    /@\/lib\/storage\/object-storage/,
  );
  assert.match(
    service,
    /putPrivateObject/,
  );
  assert.match(
    service,
    /getPrivateObjectBytes/,
  );
  assert.match(
    service,
    /deletePrivateObject/,
  );
  assert.match(
    service,
    /ORGANIZATION_MANAGE/,
  );
  assert.match(
    service,
    /purpose:\s*'organization-logo'/,
  );
  assert.match(
    service,
    /INSERT INTO files/,
  );
  assert.match(
    route,
    /MAX_LOGO_BYTES/,
  );
  assert.match(
    route,
    /arrayBuffer\(\)/,
  );
  assert.match(
    ui,
    /Upload logo/,
  );
  assert.match(
    ui,
    /Replace logo/,
  );
  assert.match(
    ui,
    /Remove/,
  );
});

test('Foundation completion: new-tenant logo foreign key is created only after files exists', async () => {
  const core =
    await source(
      'lib/schema/tenant-core.sql',
    );

  const filesPosition =
    core.indexOf(
      'CREATE TABLE IF NOT EXISTS {schema}.files',
    );

  const logoConstraintPosition =
    core.indexOf(
      'companies_logo_file_id_fkey',
    );

  assert.ok(
    filesPosition >= 0,
  );
  assert.ok(
    logoConstraintPosition >
      filesPosition,
    'Company logo foreign key must be added after core.files exists so tenant registration cannot fail.',
  );

  const beforeFiles =
    core.slice(
      0,
      filesPosition,
    );

  assert.doesNotMatch(
    beforeFiles,
    /logo_file_id UUID\s+REFERENCES \{schema\}\.files/i,
  );
});

test('Category 15: workspace notification email reuses the trusted email transport without controlling security mail', async () => {
  const email =
    await source(
      'lib/services/email.ts',
    );

  assert.match(
    email,
    /sendWorkspaceNotificationEmail/,
  );
  assert.match(
    email,
    /getTransporter\(\)/,
  );
  assert.match(
    email,
    /workspace-notification/,
  );
  assert.match(
    email,
    /Security and verification emails are controlled separately/,
  );
});

test('Category 15: full-suite gate includes notification regression coverage', async () => {
  const pkg =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  assert.equal(
    pkg.scripts['test:category15'],
    'node --test tests/category-15-notifications.test.mjs',
  );

  assert.match(
    pkg.scripts['test:all'],
    /test:category15/,
  );
});
