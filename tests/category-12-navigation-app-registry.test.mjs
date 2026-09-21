import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  readdir,
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

function compact(
  value,
) {
  return value.replace(
    /\s+/g,
    ' ',
  );
}

function getAppsBlock(
  sourceText,
) {
  const start =
    sourceText.indexOf(
      'export const SAMI_APPS',
    );

  const end =
    sourceText.indexOf(
      'export const APP_CATEGORIES',
      start,
    );

  assert.notEqual(
    start,
    -1,
    'SAMI_APPS catalog must exist.',
  );

  assert.notEqual(
    end,
    -1,
    'APP_CATEGORIES must follow SAMI_APPS.',
  );

  return sourceText.slice(
    start,
    end,
  );
}

test('Category 12: first-party app catalog has unique stable routes and matching module schemas', async () => {
  const catalog =
    await source(
      'lib/sami-apps.ts',
    );

  const appsBlock =
    getAppsBlock(
      catalog,
    );

  const keys = [
    ...appsBlock.matchAll(
      /\bkey:\s*"([^"]+)"/g,
    ),
  ].map(
    match =>
      match[1],
  );

  const routes = [
    ...appsBlock.matchAll(
      /\broute:\s*"([^"]+)"/g,
    ),
  ].map(
    match =>
      match[1],
  );

  assert.ok(
    keys.length >
      0,
    'The SaMi app catalog must contain apps.',
  );

  assert.equal(
    new Set(
      keys,
    ).size,
    keys.length,
    'First-party app keys must be unique.',
  );

  assert.equal(
    routes.length,
    keys.length,
    'Every first-party app must define one navigation route.',
  );

  for (
    let index =
      0;
    index <
      keys.length;
    index +=
      1
  ) {
    assert.equal(
      routes[index],
      `apps/${keys[index]}`,
      `App "${keys[index]}" must use the stable /apps/<key> namespace.`,
    );
  }

  const appEntries =
    await readdir(
      path.join(
        root,
        'lib/apps',
      ),
      {
        withFileTypes:
          true,
      },
    );

  const schemaDirectories =
    new Set(
      appEntries
        .filter(
          entry =>
            entry.isDirectory(),
        )
        .map(
          entry =>
            entry.name,
        ),
    );

  for (
    const key
    of keys
  ) {
    assert.ok(
      schemaDirectories.has(
        key,
      ),
      `Catalog app "${key}" must have a matching lib/apps/${key} module directory.`,
    );
  }
});

test('Category 12: every catalog icon resolves through one shared icon registry', async () => {
  const [
    catalog,
    icons,
  ] =
    await Promise.all([
      source(
        'lib/sami-apps.ts',
      ),
      source(
        'lib/apps/icon-registry.ts',
      ),
    ]);

  const appsBlock =
    getAppsBlock(
      catalog,
    );

  const iconKeys = [
    ...appsBlock.matchAll(
      /\bicon:\s*"([^"]+)"/g,
    ),
  ].map(
    match =>
      match[1],
  );

  const registryStart =
    icons.indexOf(
      'const APP_ICON_REGISTRY',
    );

  const registryEnd =
    icons.indexOf(
      'export function getSaMiAppIcon',
      registryStart,
    );

  const registryBlock =
    icons.slice(
      registryStart,
      registryEnd,
    );

  const registeredIconKeys =
    new Set([
      ...[
        ...registryBlock.matchAll(
          /^\s*'([^']+)':\s*$/gm,
        ),
      ].map(
        match =>
          match[1],
      ),
      ...[
        ...registryBlock.matchAll(
          /^\s*([a-z][a-z0-9-]*):\s*$/gm,
        ),
      ].map(
        match =>
          match[1],
      ),
    ]);

  for (
    const iconKey
    of iconKeys
  ) {
    assert.ok(
      registeredIconKeys.has(
        iconKey,
      ),
      `Catalog icon "${iconKey}" must exist in the shared icon registry.`,
    );
  }

  assert.match(
    icons,
    /return \(\s*APP_ICON_REGISTRY\[\s*normalized\s*\]\s*\|\|\s*AppWindow\s*\)/s,
  );
});

test('Category 12: navigation registry owns canonical aliases, metadata and safe unknown-module fallback', async () => {
  const registry =
    compact(
      await source(
        'lib/apps/navigation-registry.ts',
      ),
    );

  assert.match(
    registry,
    /APP_BY_KEY/,
  );

  assert.match(
    registry,
    /APP_KEY_ALIASES/,
  );

  assert.match(
    registry,
    /invoice: ['"]invoicing['"]/,
  );

  assert.match(
    registry,
    /stock: ['"]inventory['"]/,
  );

  assert.doesNotMatch(
    registry,
    /pos: ['"]pos_shop['"]/,
    'Generic POS must not be silently routed to one POS product.',
  );

  assert.doesNotMatch(
    registry,
    /ecommerce: ['"]pos_shop['"]/,
    'E-commerce must not be silently routed to POS Shop.',
  );

  assert.match(
    registry,
    /registered\?\.route/,
  );

  assert.match(
    registry,
    /\/apps\/\$\{encodeURIComponent\( key, \)\}/,
  );

  assert.match(
    registry,
    /registered: Boolean\( registered, \)/,
  );

  assert.match(
    registry,
    /sortAppNavigation/,
  );
});

test('Category 12: account context enriches only active global modules from the canonical registry', async () => {
  const account =
    compact(
      await source(
        'lib/auth/account-context.ts',
      ),
    );

  assert.match(
    account,
    /resolveAppNavigation/,
  );

  assert.match(
    account,
    /sortAppNavigation/,
  );

  assert.match(
    account,
    /COALESCE\( m\.status, ['"]active['"] \).*?= ['"]active['"]/,
  );

  assert.match(
    account,
    /registryKey: navigation\.registryKey/,
  );

  assert.match(
    account,
    /href: navigation\.href/,
  );

  assert.match(
    account,
    /iconKey: navigation\.iconKey/,
  );

  assert.match(
    account,
    /categoryLabel: navigation\.categoryLabel/,
  );
});

test('Category 12: navigation API returns only the permission-resolved accessible app navigation model', async () => {
  const route =
    compact(
      await source(
        'app/api/workspace/navigation/route.ts',
      ),
    );

  assert.match(
    route,
    /apps: shell\.accessibleModules\.map/,
  );

  assert.match(
    route,
    /appCount: shell\.accessibleModules\.length/,
  );

  assert.match(
    route,
    /module\.href/,
  );

  assert.match(
    route,
    /module\.iconKey/,
  );

  assert.match(
    route,
    /module\.categoryLabel/,
  );

  assert.match(
    route,
    /Cache-Control.*?no-store/s,
  );

  assert.match(
    route,
    /getAccountContextForUser\( context\.userId, context\.tenantId, \)/,
    'Navigation must derive tenant and user context from the trusted permission/session context.',
  );

  assert.doesNotMatch(
    route,
    /\bbody\s*(?:\?\.|\.)\s*tenantId\b/i,
    'Navigation must not accept tenantId from a request body.',
  );

  assert.doesNotMatch(
    route,
    /\bsearchParams\s*\.\s*get\(\s*['"]tenantId['"]\s*\)/i,
    'Navigation must not accept tenantId from URL search parameters.',
  );

  assert.doesNotMatch(
    route,
    /\brequest\s*\.\s*(?:nextUrl\s*\.\s*)?searchParams\s*\.\s*get\(\s*['"]tenantId['"]\s*\)/i,
    'Navigation must not derive tenantId from the browser request.',
  );
});

test('Category 12: sidebar consumes registry metadata, stays compact and preserves trusted server apps on refresh failures', async () => {
  const sidebar =
    compact(
      await source(
        'app/components/workspace/WorkspaceSidebar.tsx',
      ),
    );

  assert.match(
    sidebar,
    /getSaMiAppIcon/,
  );

  assert.match(
    sidebar,
    /SIDEBAR_APP_LIMIT = 6/,
  );

  assert.match(
    sidebar,
    /href=['"]\/apps['"]/,
  );

  assert.match(
    sidebar,
    /label=['"]All Apps['"]/,
  );

  assert.match(
    sidebar,
    /sidebarAppChildren/,
  );

  assert.match(
    sidebar,
    /setNavigationApps\( modules, \)/,
  );

  assert.match(
    sidebar,
    /setNavigationApps\( \[\], \).*?switch_workspace/s,
  );

  assert.doesNotMatch(
    sidebar,
    /APP_ROUTE_ALIASES/,
  );

  assert.doesNotMatch(
    sidebar,
    /function getModuleHref/,
  );

  assert.doesNotMatch(
    sidebar,
    /function getModuleIcon/,
  );
});

test('Category 12: app launcher is server-fed and filters instantly without a client catalog fetch', async () => {
  const [
    page,
    client,
  ] =
    await Promise.all([
      source(
        'app/apps/page.tsx',
      ),
      source(
        'app/apps/AppsLauncherClient.tsx',
      ),
    ]);

  assert.match(
    page,
    /resolveWorkspaceShellAccess/,
  );

  assert.match(
    page,
    /modules=\{\s*shell\.accessibleModules\s*\}/s,
  );

  assert.doesNotMatch(
    page,
    /managedModules/,
  );

  assert.match(
    client,
    /useDeferredValue/,
  );

  assert.match(
    client,
    /categoryCounts/,
  );

  assert.match(
    client,
    /aria-label=['"]Search apps['"]/,
  );

  assert.match(
    client,
    /event\.key ===\s*['"]\/['"]/,
  );

  assert.match(
    client,
    /SamiAppIconTile/,
  );

  assert.match(
    client,
    /getSaMiAppVisual/,
  );

  assert.doesNotMatch(
    client,
    /fetch\(/,
    'The launcher must render from server-resolved app data rather than fetching the catalog after paint.',
  );
});

test('Category 12: deep app routes re-authorize access and do not disclose inaccessible apps', async () => {
  const [
    entry,
    notFound,
  ] =
    await Promise.all([
      source(
        'app/apps/[appKey]/page.tsx',
      ),
      source(
        'app/apps/[appKey]/not-found.tsx',
      ),
    ]);

  const compactEntry =
    compact(
      entry,
    );

  assert.match(
    compactEntry,
    /requirePageSession/,
  );

  assert.match(
    compactEntry,
    /shell\.accessibleModules/,
  );

  assert.match(
    compactEntry,
    /notFound\(\)/,
  );

  assert.match(
    compactEntry,
    /redirect\( app\.href, \)/,
  );

  assert.doesNotMatch(
    entry,
    /Category 12|module framework/i,
    'Ordinary users must never see internal architecture terminology.',
  );

  assert.match(
    notFound,
    /App unavailable/,
  );

  assert.doesNotMatch(
    notFound,
    /not installed|permission denied|does not exist/i,
    'The unavailable state should not reveal why the app is inaccessible.',
  );
});

test('Category 12: dashboard and Settings share app identity while Settings exposes the full catalog', async () => {
  const [
    dashboard,
    settings,
    appsSettings,
  ] =
    await Promise.all([
      source(
        'app/dashboard/DashboardClient.tsx',
      ),
      source(
        'app/settings/SettingsClient.tsx',
      ),
      source(
        'app/settings/components/AppsSettings.tsx',
      ),
    ]);

  assert.doesNotMatch(
    dashboard,
    /SAMI_APPS|APP_METADATA|function getModuleHref|function getModuleIcon/,
  );

  assert.match(
    dashboard,
    /module\.href/,
  );

  assert.match(
    dashboard,
    /module\.description/,
  );

  assert.match(
    dashboard,
    /SamiAppIconTile/,
  );

  assert.match(
    dashboard,
    /getSaMiAppVisual/,
  );

  assert.match(
    dashboard,
    /href=['"]\/apps['"]/,
  );

  assert.match(
    settings,
    /AppsSettings/,
  );

  assert.match(
    settings,
    /workspaceModules=\{\s*managedModules\s*\}/s,
    'Category 13 lifecycle administration must pass complete workspace module state into Apps settings.',
  );

  assert.match(
    appsSettings,
    /SAMI_APPS/,
  );

  assert.match(
    appsSettings,
    /APP_CATEGORIES/,
  );

  assert.match(
    appsSettings,
    /filter ===\s*['"]installed['"]/,
  );

  assert.match(
    appsSettings,
    /filter ===\s*['"]available['"]/,
  );

  assert.match(
    appsSettings,
    /Installed/,
  );

  assert.match(
    appsSettings,
    /Available/,
  );

  assert.match(
    appsSettings,
    /getSaMiAppIcon/,
  );

  assert.doesNotMatch(
    appsSettings,
    /maxApps|appLimit|upgrade.*app/i,
    'Paid-plan app count must not be modeled as a workspace app limit.',
  );
});



test('Category 12: shared app visuals stay registry-driven across shell, dashboard and app workspaces', async () => {
  const [
    visuals,
    tile,
    switcher,
    sidebar,
    dashboard,
    launcher,
    entry,
  ] = await Promise.all([
    source('lib/apps/visual-registry.ts'),
    source('app/components/apps/SamiAppIconTile.tsx'),
    source('app/components/workspace/WorkspaceAppSwitcher.tsx'),
    source('app/components/workspace/WorkspaceSidebar.tsx'),
    source('app/dashboard/DashboardClient.tsx'),
    source('app/apps/AppsLauncherClient.tsx'),
    source('app/apps/[appKey]/page.tsx'),
  ]);

  assert.match(
    visuals,
    /export function getSaMiAppVisual/,
  );

  assert.match(
    visuals,
    /CATEGORY_VISUAL_KEYS/,
    'Unknown or future apps need a category-level visual fallback.',
  );

  assert.match(
    tile,
    /getSaMiAppVisual/,
  );

  assert.match(
    switcher,
    /SamiAppIconTile/,
  );

  assert.match(
    sidebar,
    /getSaMiAppVisual/,
  );

  assert.match(
    dashboard,
    /getSaMiAppVisual/,
  );

  assert.match(
    launcher,
    /getSaMiAppVisual/,
  );

  assert.match(
    entry,
    /getSaMiAppVisual/,
  );

  assert.doesNotMatch(
    dashboard,
    /SAMI_APPS/,
    'Dashboard visuals must remain driven by resolved installed modules, not a hardcoded module catalog.',
  );
});

test('Category 12: Apps routes have stable loading, error and unavailable states', async () => {
  const [
    loading,
    error,
    notFound,
  ] =
    await Promise.all([
      source(
        'app/apps/loading.tsx',
      ),
      source(
        'app/apps/error.tsx',
      ),
      source(
        'app/apps/[appKey]/not-found.tsx',
      ),
    ]);

  assert.match(
    loading,
    /WorkspaceRouteLoading/,
  );

  assert.match(
    error,
    /WorkspaceRouteError/,
  );

  assert.match(
    error,
    /Apps unavailable/,
  );

  assert.match(
    notFound,
    /Back to Apps/,
  );
});


test('Category 12: onboarding uses the same app catalog and shared icon registry', async () => {
  const selector =
    await source(
      'app/select-apps/page.tsx',
    );

  assert.match(
    selector,
    /SAMI_APPS/,
  );

  assert.match(
    selector,
    /APP_CATEGORIES/,
  );

  assert.match(
    selector,
    /getSaMiAppIcon/,
  );

  assert.doesNotMatch(
    selector,
    /const iconMap|function getIconComponent/,
    'Onboarding must not maintain a private app icon registry.',
  );
});
