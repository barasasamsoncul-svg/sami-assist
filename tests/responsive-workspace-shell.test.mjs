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

test('responsive shell: sign out is always available from the shared workspace drawer', async () => {
  const sidebar = await source(
    'app/components/workspace/WorkspaceSidebar.tsx',
  );

  assert.match(
    sidebar,
    /\/api\/auth\/logout/,
  );

  assert.match(
    sidebar,
    /Sign out/,
  );

  assert.match(
    sidebar,
    /max-w-\[calc\(100vw-16px\)\]/,
  );

  assert.match(
    sidebar,
    /safe-area-inset-bottom/,
  );
});

test('responsive shell: company identity remains visible on mobile with compact text treatment', async () => {
  const company = await source(
    'app/components/workspace/WorkspaceCompanyIdentity.tsx',
  );

  assert.match(
    company,
    /className="flex h-10/,
  );

  assert.match(
    company,
    /hidden min-w-0 md:block/,
  );

  assert.doesNotMatch(
    company,
    /className="hidden min-w-0 items-center/,
  );
});

test('responsive shell: common controls stay in the top bar and page actions reflow instead of disappearing', async () => {
  const shell = await source(
    'app/components/workspace/WorkspaceShell.tsx',
  );

  assert.match(
    shell,
    /WorkspaceSearchLauncher/,
  );

  assert.match(
    shell,
    /WorkspaceCompanyIdentity/,
  );

  assert.match(
    shell,
    /WorkspaceNotificationCenter/,
  );

  assert.match(
    shell,
    /WorkspaceAppSwitcher/,
    'The shared shell must keep the permission-aware app switcher available globally.',
  );

  assert.match(
    shell,
    /flex-wrap items-center/,
  );

  assert.match(
    shell,
    /order-3 flex w-full items-center/,
  );

  assert.equal(
    (shell.match(/\{actions\}/g) || []).length,
    1,
    'Page actions must render once and reflow responsively.',
  );
});

test('responsive shell: SaMi AI owns a dedicated collapsible chat sidebar instead of the workspace shell', async () => {
  const [page, client, aiSidebar] = await Promise.all([
    source('app/ai/page.tsx'),
    source('app/components/workspace/WorkspaceAiClient.tsx'),
    source('app/components/ai/SamiAiSidebar.tsx'),
  ]);

  assert.doesNotMatch(
    page,
    /<WorkspaceShell/,
  );

  assert.match(
    client,
    /h-\[100dvh\]/,
  );

  assert.match(
    client,
    /SamiAiSidebar/,
  );

  assert.match(
    client,
    /sidebarCollapsed/,
  );

  assert.match(
    client,
    /sidebarMobileOpen/,
  );

  assert.doesNotMatch(
    client,
    /WorkspaceCompanyIdentity/,
    'The SaMi AI page must not reuse the dashboard company header.',
  );

  assert.match(
    aiSidebar,
    /Collapse sidebar/,
  );

  assert.match(
    aiSidebar,
    /Expand sidebar/,
  );

  assert.match(
    aiSidebar,
    /Search conversations/,
  );

  assert.match(
    aiSidebar,
    /New chat/,
  );

  assert.match(
    aiSidebar,
    /lg:hidden/,
    'The AI sidebar must have a mobile overlay mode.',
  );

  assert.match(
    client,
    /PerformancePanel/,
  );

  assert.match(
    aiSidebar,
    /\/settings\?tab=ai/,
  );
});

test('responsive shell: SaMi AI performance uses real run metrics', async () => {
  const service = await source(
    'lib/services/workspace-ai.ts',
  );

  assert.match(
    service,
    /FROM ai_runs/,
  );

  assert.match(
    service,
    /requests_24h/,
  );

  assert.match(
    service,
    /failures_24h/,
  );

  assert.match(
    service,
    /avg_duration_ms_24h/,
  );

  assert.match(
    service,
    /total_tokens_24h/,
  );

  assert.match(
    service,
    /tool_calls_24h/,
  );
});

test('responsive dashboard: Odoo-style app home stays mobile-first while AI remains prominent', async () => {
  const dashboard = await source(
    'app/dashboard/DashboardClient.tsx',
  );

  assert.match(
    dashboard,
    /grid grid-cols-3.*sm:grid-cols-4.*md:grid-cols-5.*lg:grid-cols-6.*xl:grid-cols-8.*2xl:grid-cols-9/s,
  );

  assert.match(
    dashboard,
    /Ask SaMi anything about your business/,
  );

  assert.match(
    dashboard,
    /flex w-full flex-col gap-2 sm:flex-row/,
    'AI/search command controls must stack safely on narrow screens.',
  );

  assert.match(
    dashboard,
    /size="xl"/,
    'App launcher should use touch-friendly product icons.',
  );
});

test('responsive settings: content uses mobile-first padding and remains horizontally navigable', async () => {
  const [settings, ai] = await Promise.all([
    source('app/settings/SettingsClient.tsx'),
    source('app/settings/components/AiSettings.tsx'),
  ]);

  assert.match(
    settings,
    /overflow-x-auto/,
  );

  assert.match(
    settings,
    /sami-surface min-w-0 rounded-\[24px\] p-4 sm:p-6/,
  );

  assert.match(
    ai,
    /p-4 sm:p-6/,
  );
});
