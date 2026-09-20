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

test('Category 17: global search resolves trusted session, workspace and company context first', async () => {
  const service = compact(
    await source('lib/search/workspace-search.ts'),
  );

  assert.match(service, /getSession/);
  assert.match(service, /getPermissionContext/);
  assert.match(
    service,
    /session\.sessionId !== permissions\.sessionId/,
  );
  assert.match(
    service,
    /session\.currentTenantId !== permissions\.tenantId/,
  );
  assert.match(service, /requireCompanyAccess/);
  assert.match(service, /COMPANY_ACCESS_DENIED/);
});

test('Category 17: search reuses effective app, company, people and file access boundaries', async () => {
  const service = await source(
    'lib/search/workspace-search.ts',
  );

  assert.match(service, /resolveWorkspaceShellAccess/);
  assert.match(service, /shell\.accessibleModules/);
  assert.match(service, /shell\.accessibleModuleKeys/);
  assert.match(service, /getCompanySelectorState/);
  assert.match(service, /searchWorkspaceMessageRecipients/);
  assert.match(service, /searchWorkspaceFiles/);

  assert.doesNotMatch(
    service,
    /FROM\s+(customers|products|invoices|crm|inventory|employees)/i,
    'Core Search must not hardcode business-module tables.',
  );
});

test('Category 17: people and file searches are bounded server-side and preserve company access', async () => {
  const [files, messages] = await Promise.all([
    source('lib/services/workspace-files.ts'),
    source('lib/services/workspace-messages.ts'),
  ]);

  assert.match(files, /export async function searchWorkspaceFiles/);
  assert.match(files, /resolveFileContext\('view'\)/);
  assert.match(files, /company_id = \$1/);
  assert.match(files, /LIMIT \$3/);
  assert.match(files, /POSITION\(LOWER\(\$2\)/);

  assert.match(messages, /export async function searchWorkspaceMessageRecipients/);
  assert.match(messages, /getWorkspaceNotificationContext/);
  assert.match(messages, /member_type/);
  assert.match(messages, /company_users/);
  assert.match(messages, /safeLimit \* 3/);
  assert.match(messages, /POSITION\(LOWER\(\$3\)/);
});

test('Category 17: future module record search plugs into an app-scoped provider registry', async () => {
  const [registry, types] = await Promise.all([
    source('lib/search/registry.ts'),
    source('lib/search/types.ts'),
  ]);

  assert.match(registry, /WORKSPACE_SEARCH_PROVIDERS/);
  assert.match(registry, /getWorkspaceSearchProviders/);
  assert.match(registry, /accessibleModuleKeys/);

  assert.match(types, /WorkspaceSearchProvider/);
  assert.match(types, /Promise<WorkspaceSearchResult\[\]>/);
  assert.match(types, /kind: WorkspaceSearchKind/);
});

test('Category 17: one broken provider cannot crash global search', async () => {
  const service = await source(
    'lib/search/workspace-search.ts',
  );

  assert.match(service, /Promise\.allSettled/);
  assert.match(service, /providerResults/);
  assert.match(service, /result\.status !==\s*'fulfilled'/s);
});

test('Category 17: search API is read-only, bounded and no-cache', async () => {
  const [route, helper, service] = await Promise.all([
    source('app/api/workspace/search/route.ts'),
    source('lib/search/workspace-search-api.ts'),
    source('lib/search/workspace-search.ts'),
  ]);

  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST/);

  assert.match(helper, /no-store/);
  assert.match(helper, /X-Content-Type-Options/);
  assert.match(helper, /Referrer-Policy/);

  assert.match(service, /MAX_QUERY_LENGTH\s*=\s*120/);
  assert.match(service, /MAX_LIMIT\s*=\s*60/);
});

test('Category 17: Search is core navigation and available globally through Ctrl or Command K', async () => {
  const [navigation, sidebar, shell, search] =
    await Promise.all([
      source('app/api/workspace/navigation/route.ts'),
      source('app/components/workspace/WorkspaceSidebar.tsx'),
      source('app/components/workspace/WorkspaceShell.tsx'),
      source('app/components/workspace/WorkspaceSearch.tsx'),
    ]);

  assert.match(navigation, /searchView:\s*true/s);
  assert.match(
    sidebar,
    /const canUseSearch =\s*navigationPermissions\s*\?\.searchView ===\s*true/s,
  );
  assert.match(sidebar, /href="\/search"/);

  assert.match(shell, /WorkspaceSearchLauncher/);
  assert.match(search, /event\.metaKey \|\|\s*event\.ctrlKey/s);
  assert.match(search, /ArrowDown/);
  assert.match(search, /ArrowUp/);
  assert.match(search, /Enter/);
  assert.match(search, /aria-modal="true"/);
});

test('Category 17: common top-bar trust controls survive custom page headers', async () => {
  const shell = compact(
    await source('app/components/workspace/WorkspaceShell.tsx'),
  );

  const headerIndex =
    shell.indexOf('headerContent ?');
  const searchIndex =
    shell.indexOf('<WorkspaceSearchLauncher');
  const companyIndex =
    shell.indexOf('<WorkspaceCompanyIdentity');
  const notificationIndex =
    shell.indexOf('<WorkspaceNotificationCenter');

  assert.ok(headerIndex >= 0);
  assert.ok(searchIndex > headerIndex);
  assert.ok(companyIndex > headerIndex);
  assert.ok(notificationIndex > headerIndex);
});

test('Category 17: actionable results use existing trusted APIs rather than raw URLs', async () => {
  const search = compact(
    await source('app/components/workspace/WorkspaceSearch.tsx'),
  );

  assert.match(search, /\/api\/workspace\/company-context/);
  assert.match(search, /action: 'set_current'/);
  assert.match(search, /\/notifications\?tab=messages&compose=/);
  assert.match(search, /\/api\/workspace\/files\//);

  assert.doesNotMatch(search, /storage_key|storageKey|signed\.url/);
  assert.doesNotMatch(search, /window\.alert\s*\(/);
});

test('Category 17: coworker search can deep-link into direct-message composition', async () => {
  const center = await source(
    'app/components/workspace/WorkspaceNotificationCenter.tsx',
  );

  assert.match(center, /params\.get\(\s*'compose'/s);
  assert.match(center, /setComposeType\(\s*'direct'/s);
  assert.match(center, /setRecipientId/);
  assert.match(center, /setComposeOpen\(\s*true/s);
});

test('Category 17: unfinished AI and Files pages are not exposed as dead workspace routes', async () => {
  const [sidebar, service, composer] = await Promise.all([
    source('app/components/workspace/WorkspaceSidebar.tsx'),
    source('lib/search/workspace-search.ts'),
    source('lib/dashboard/composer.ts'),
  ]);

  assert.doesNotMatch(sidebar, /href="\/ai"/);
  assert.doesNotMatch(sidebar, /href="\/files"/);

  assert.doesNotMatch(service, /href:\s*['"]\/ai['"]/);
  assert.doesNotMatch(service, /href:\s*['"]\/files['"]/);

  assert.doesNotMatch(composer, /href:\s*['"]\/ai['"]/);
});

test('Dashboard refresh: workspace home uses shared shell, real company identity and real platform signals', async () => {
  const [page, client] = await Promise.all([
    source('app/dashboard/page.tsx'),
    source('app/dashboard/DashboardClient.tsx'),
  ]);

  assert.match(page, /listWorkspaceActivity/);
  assert.match(page, /getWorkspaceActivitySummary/);
  assert.match(page, /getWorkspaceNotificationSummary/);
  assert.match(page, /currentCompany\.logoUrl/);

  assert.match(client, /WorkspaceShell/);
  assert.match(client, /CompanyAvatar/);
  assert.match(client, /Search workspace/);
  assert.match(client, /Recent activity/);
  assert.match(client, /Work & attention/);
  assert.match(client, /Your apps/);
});

test('Dashboard refresh: app content remains provider-driven and module-agnostic', async () => {
  const [client, composer] = await Promise.all([
    source('app/dashboard/DashboardClient.tsx'),
    source('lib/dashboard/composer.ts'),
  ]);

  assert.match(client, /module\.href/);
  assert.match(client, /module\.description/);
  assert.match(
    client,
    /getSaMiAppIcon\(\s*module\.iconKey/s,
  );

  assert.doesNotMatch(
    client,
    /SAMI_APPS|APP_METADATA|function getModuleHref|function getModuleIcon/,
  );

  assert.match(composer, /getDashboardProviders/);
  assert.match(composer, /Promise\.allSettled/);
});

test('Dashboard refresh: home does not invent business numbers or dead core destinations', async () => {
  const client = await source(
    'app/dashboard/DashboardClient.tsx',
  );

  assert.doesNotMatch(client, /href="\/ai"/);
  assert.doesNotMatch(client, /href="\/files"/);

  assert.doesNotMatch(
    client,
    /Outstanding invoices|Sales pipeline|Inventory value|Customers today/i,
    'Core Dashboard must not invent module-specific metrics.',
  );
});

test('Category 17: full-suite gate includes Search regression coverage', async () => {
  const pkg = JSON.parse(
    await source('package.json'),
  );

  assert.equal(
    pkg.scripts['test:category17'],
    'node --test tests/category-17-search.test.mjs',
  );

  assert.match(
    pkg.scripts['test:all'],
    /test:category17/,
  );
});
