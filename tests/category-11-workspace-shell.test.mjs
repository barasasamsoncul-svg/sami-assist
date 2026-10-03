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

const liveClientSurfaces = [
  'app/dashboard/DashboardClient.tsx',
  'app/forgot-password/ForgotPasswordClient.tsx',
  'app/google-complete/page.tsx',
  'app/invite/[token]/InvitationAcceptClient.tsx',
  'app/login/LoginClient.tsx',
  'app/login/two-factor/TwoFactorLoginClient.tsx',
  'app/register/RegisterClient.tsx',
  'app/reset-password/ResetPasswordClient.tsx',
  'app/select-apps/page.tsx',
  'app/select-plan/page.tsx',
  'app/settings/SettingsClient.tsx',
  'app/settings/components/EmailTwoFactorSettings.tsx',
  'app/settings/components/MyAccountSettings.tsx',
  'app/settings/components/OrganizationSettings.tsx',
  'app/settings/components/SecurityActivitySettings.tsx',
  'app/settings/components/SecuritySettings.tsx',
  'app/settings/components/SessionsSettings.tsx',
  'app/settings/components/TwoFactorSettings.tsx',
  'app/settings/components/WorkspaceSettings.tsx',
  'app/settings/roles/RolesSettingsClient.tsx',
  'app/settings/users/UsersSettingsClient.tsx',
  'app/verify-email/VerifyEmailClient.tsx',
];

test('Category 11: core workspace surfaces share one professional workspace shell', async () => {
  const [shell, dashboard, settings, users, roles] = await Promise.all([
    source('app/components/workspace/WorkspaceShell.tsx'),
    source('app/dashboard/DashboardClient.tsx'),
    source('app/settings/SettingsClient.tsx'),
    source('app/settings/users/UsersSettingsClient.tsx'),
    source('app/settings/roles/RolesSettingsClient.tsx'),
  ]);

  assert.match(shell, /WorkspaceSidebar/);
  assert.match(shell, /lg:pl-\[286px\]/);
  assert.match(shell, /headerContent/);
  assert.match(shell, /Open navigation/);

  for (const [name, component] of [
    ['Dashboard', dashboard],
    ['Settings', settings],
    ['People & Access', users],
    ['Roles & Permissions', roles],
  ]) {
    assert.match(
      component,
      /WorkspaceShell/,
      `${name} must use the shared workspace shell.`,
    );
  }
});

test('Category 11: transient action feedback and destructive confirmations use SaMiOverlay', async () => {
  const [
    overlay,
    hook,
    users,
    roles,
    sessions,
    invitation,
  ] = await Promise.all([
    source('app/components/SaMiOverlay.tsx'),
    source('app/components/useSaMiOverlay.ts'),
    source('app/settings/users/UsersSettingsClient.tsx'),
    source('app/settings/roles/RolesSettingsClient.tsx'),
    source('app/settings/components/SessionsSettings.tsx'),
    source('app/invite/[token]/InvitationAcceptClient.tsx'),
  ]);

  assert.match(overlay, /items-end/);
  assert.match(overlay, /max-h-\[88vh\]/);
  assert.match(overlay, /safe-area-inset-bottom/);

  assert.match(hook, /confirmAction/);
  assert.match(hook, /type:\s*['"]warning['"]/);

  assert.match(users, /SaMiOverlay/);
  assert.match(users, /Revoke invitation\?/i);
  assert.match(roles, /SaMiOverlay/);
  assert.match(roles, /Delete role\?/i);
  assert.match(sessions, /SaMiOverlay/);
  assert.match(sessions, /Sign out other devices\?/i);
  assert.match(invitation, /SaMiOverlay/);
});

test('Category 11: live user-facing core surfaces do not use browser confirm or alert dialogs', async () => {
  const sources = await Promise.all(
    liveClientSurfaces.map(async file => ({
      file,
      content: await source(file),
    })),
  );

  for (const { file, content } of sources) {
    assert.doesNotMatch(
      content,
      /window\.confirm\s*\(/,
      `${file} must use SaMiOverlay instead of window.confirm().`,
    );

    assert.doesNotMatch(
      content,
      /window\.alert\s*\(/,
      `${file} must use SaMiOverlay instead of window.alert().`,
    );
  }
});

test('Category 11: mobile workspace pages use progressive disclosure instead of one long page', async () => {
  const [
    dashboard,
    organization,
    sessions,
    invitation,
    account,
    workspace,
  ] = await Promise.all([
    source('app/dashboard/DashboardClient.tsx'),
    source('app/settings/components/OrganizationSettings.tsx'),
    source('app/settings/components/SessionsSettings.tsx'),
    source('app/invite/[token]/InvitationAcceptClient.tsx'),
    source('app/settings/components/MyAccountSettings.tsx'),
    source('app/settings/components/WorkspaceSettings.tsx'),
  ]);

  assert.match(
    dashboard,
    /grid grid-cols-3.*sm:grid-cols-4.*md:grid-cols-5.*lg:grid-cols-6.*xl:grid-cols-8.*2xl:grid-cols-9/s,
    'Odoo-style app home must progressively expand its permission-resolved launcher across breakpoints.',
  );

  assert.match(
    dashboard,
    /flex flex-wrap items-center gap-2/,
    'Dashboard command controls must wrap safely on narrow screens instead of disappearing or overflowing.',
  );

  assert.match(
    dashboard,
    /Only apps available to your role are shown/,
  );

  assert.match(
    dashboard,
    /Needs attention/,
  );

  assert.doesNotMatch(
    dashboard,
    /My activity|Operational pulse|Your actions today/,
    'Home must not surface personal or workspace activity telemetry.',
  );

  assert.match(organization, /mobileSection/);
  assert.match(organization, /mobileEditorOpen/);
  assert.match(organization, /mobileCreateOpen/);

  assert.match(sessions, /overflow-x-auto/);

  assert.match(invitation, /showInviteDetails/);
  assert.match(invitation, /View details/);

  assert.match(account, /type AccountView/);
  assert.match(account, /['"]overview['"]/);
  assert.match(account, /['"]personal['"]/);
  assert.match(account, /['"]security['"]/);

  assert.match(workspace, /type WorkspaceView/);
  assert.match(workspace, /['"]overview['"]/);
  assert.match(workspace, /['"]ownership['"]/);
  assert.match(workspace, /['"]lifecycle['"]/);
});

test('Category 11: dashboard turns permitted business data into operational analysis', async () => {
  const [
    dashboard,
    page,
    composer,
    aiSummary,
    runtimeDashboard,
    providerRegistry,
    businessProviders,
  ] = await Promise.all([
    source('app/dashboard/DashboardClient.tsx'),
    source('app/dashboard/page.tsx'),
    source('lib/dashboard/composer.ts'),
    source('app/api/workspace/dashboard/ai-summary/route.ts'),
    source('lib/apps/runtime-dashboard.ts'),
    source('lib/dashboard/providers/index.ts'),
    source('lib/dashboard/providers/business-analysis.ts'),
  ]);

  assert.match(
    dashboard,
    /SaMi analysis/,
  );
  assert.match(
    dashboard,
    /Workspace snapshot/,
  );
  assert.match(
    dashboard,
    /Needs attention/,
  );
  assert.doesNotMatch(
    dashboard,
    /Operational pulse|Your actions today|Failed or denied · 7d|Modules touched · 7d|activityBrief|Live activity summary/,
    'Home must present business analysis rather than personal activity telemetry.',
  );
  assert.match(
    dashboard,
    /\/api\/workspace\/dashboard\/ai-summary/,
  );
  assert.match(
    page,
    /aiEnabled:[\s\S]*shell\.aiAvailable/,
  );
  assert.doesNotMatch(
    page,
    /getWorkspaceActivityDashboardSnapshot/,
    'Home must not load the Activity timeline as dashboard intelligence.',
  );
  assert.match(
    composer,
    /input\.aiEnabled ===[\s\S]*true/,
  );
  assert.match(
    composer,
    /getDashboardProviders\([\s\S]*input\.modules,[\s\S]*input\.permissions/s,
    'Dashboard providers must resolve against both accessible modules and the current permission context.',
  );
  assert.match(
    providerRegistry,
    /requiredAnyPermissions/,
    'Dashboard providers must declare their read authority explicitly.',
  );
  assert.match(
    providerRegistry,
    /required\.length ===[\s\S]*0[\s\S]*return false/s,
    'Non-owner dashboard providers must fail closed when no read permission contract is declared.',
  );
  assert.match(
    businessProviders,
    /accounting\.record\.view[\s\S]*accounting\.record\.report/s,
  );
  assert.match(
    businessProviders,
    /invoicing\.invoice\.view/,
  );
  assert.match(
    businessProviders,
    /sales\.quote\.view/,
  );
  assert.doesNotMatch(
    composer,
    /dashboard provider becomes active|dashboard providers become active/,
    'User-facing dashboard copy must never expose provider implementation state.',
  );
  assert.match(
    runtimeDashboard,
    /accountingDashboardAnalysisProvider/,
  );
  assert.match(
    runtimeDashboard,
    /invoicingDashboardAnalysisProvider/,
  );
  assert.match(
    runtimeDashboard,
    /salesDashboardAnalysisProvider/,
  );
  assert.match(
    aiSummary,
    /completeSamiAiChat/,
  );
  assert.match(
    aiSummary,
    /composeDashboard/,
  );
  assert.doesNotMatch(
    aiSummary,
    /getWorkspaceActivityDashboardSnapshot/,
  );
  assert.match(
    aiSummary,
    /Do not summarize audit events, user actions, AI-generated responses, tool calls, logins, or routine system telemetry/,
  );
  assert.match(
    aiSummary,
    /Use only supplied facts/,
  );
  assert.match(
    aiSummary,
    /Do not assume Accounting, Invoicing, Sales, HR, CRM, Inventory or any other app exists unless its signal is supplied/,
  );
  assert.match(
    aiSummary,
    /Mention financial facts only when a permitted finance app supplied them/,
  );
  assert.doesNotMatch(
    aiSummary,
    /permitted apps produce financial, sales and operational signals/,
    'Home fallback copy must not imply that every workspace is finance-led.',
  );
});

test('Category 11: People & Access explains authorization dimensions and keeps mobile summaries compact', async () => {
  const users = compact(
    await source('app/settings/users/UsersSettingsClient.tsx'),
  );

  assert.match(users, /How access works/i);
  assert.match(users, /Roles decide what a person may do/i);
  assert.match(users, /Apps decide which tools are available/i);
  assert.match(users, /Companies decide where that access applies/i);
  assert.match(users, /overflow-x-auto/);
  assert.match(users, /hidden gap-3 lg:grid lg:grid-cols-4/);

  assert.doesNotMatch(
    users,
    /function Notice\(/,
    'Global People & Access feedback must not fall back to inline notices.',
  );
});

test('Category 11: Roles shell capabilities come from real permission context', async () => {
  const [page, client] = await Promise.all([
    source('app/settings/roles/page.tsx'),
    source('app/settings/roles/RolesSettingsClient.tsx'),
  ]);

  assert.match(page, /canUseAi/);
  assert.match(page, /shell\.aiAvailable/);
  assert.match(page, /SAMI_PERMISSIONS\s*\.FILES_VIEW|SAMI_PERMISSIONS\s*\.\s*FILES_VIEW/s);
  assert.match(
    client,
    /notificationsEnabled/,
    'Roles surface must use the shared core notification capability rather than hide communication behind a view role.',
  );

  assert.match(client, /canUseAi/);
  assert.match(client, /canViewFiles/);
  assert.match(client, /canViewNotifications/);

  assert.doesNotMatch(
    compact(client),
    /aiEnabled:\s*true,\s*filesEnabled:\s*false,\s*notificationsEnabled:\s*false/,
    'Roles must not invent sidebar capabilities.',
  );
});

test('Category 11: standalone invitations route stays unified under People & Access', async () => {
  const page = compact(
    await source('app/settings/invitations/page.tsx'),
  );

  assert.match(page, /redirect\(['"]\/settings\/users\?view=invited['"]\)/);
  assert.match(page, /INVITATIONS_VIEW/);
  assert.match(page, /INVITATIONS_MANAGE/);
});

test('Category 11: platform typography and controls use one global baseline', async () => {
  const css = await source('app/globals.css');

  assert.match(css, /ui-sans-serif/);
  assert.match(css, /system-ui/);
  assert.match(css, /button,\s*input,\s*select,\s*textarea\s*\{\s*font:\s*inherit/s);
  assert.match(css, /-webkit-text-size-adjust:\s*100%/);
});


test('Category 11: one account theme runtime governs every route and settings surface', async () => {
  const [
    layout,
    provider,
    runtime,
    settings,
    account,
  ] = await Promise.all([
    source('app/layout.tsx'),
    source('app/components/SaMiThemeProvider.tsx'),
    source('lib/theme/runtime.ts'),
    source('app/settings/SettingsClient.tsx'),
    source('app/settings/components/MyAccountSettings.tsx'),
  ]);

  assert.match(layout, /SaMiThemeProvider/);
  assert.match(layout, /sami-theme-bootstrap\.js/);
  assert.doesNotMatch(layout, /dangerouslySetInnerHTML/);
  assert.match(layout, /suppressHydrationWarning/);

  assert.match(provider, /\/api\/account\/preferences/);
  assert.match(provider, /usePathname/);
  assert.match(provider, /prefers-color-scheme:\s*dark/);
  assert.match(provider, /addEventListener\(\s*['"]storage['"]/s);

  assert.match(runtime, /SAMI_THEME_STORAGE_KEY/);
  assert.match(runtime, /SAMI_THEME_CHANGE_EVENT/);
  assert.match(runtime, /document\.documentElement/);
  assert.match(runtime, /style\.colorScheme/);

  assert.match(settings, /setSaMiTheme/);
  assert.match(account, /setSaMiTheme/);

  assert.doesNotMatch(
    settings,
    /const\s+THEME_STORAGE_KEY|function\s+applyThemeToDocument/,
    'Settings must not own a second route-local theme system.',
  );

  assert.doesNotMatch(
    account,
    /const\s+THEME_STORAGE_KEY|\bapplyTheme\s*\(/,
    'My Account Appearance must use the same global theme runtime and must not call the removed legacy applyTheme helper.',
  );

  const authThemeConsumers =
    await Promise.all([
      source('app/components/auth/AuthShell.tsx'),
      source('app/login/LoginClient.tsx'),
      source('app/register/RegisterClient.tsx'),
      source('app/forgot-password/ForgotPasswordClient.tsx'),
      source('app/reset-password/ResetPasswordClient.tsx'),
      source('app/verify-email/VerifyEmailClient.tsx'),
      source('app/google-complete/page.tsx'),
      source('app/select-apps/page.tsx'),
      source('app/select-plan/page.tsx'),
      source('app/login/two-factor/TwoFactorLoginClient.tsx'),
    ]);

  for (
    const consumer of
    authThemeConsumers
  ) {
    assert.match(
      consumer,
      /useSaMiTheme/,
      'Auth and onboarding pages must consume the shared global theme runtime.',
    );

    assert.doesNotMatch(
      consumer,
      /sami_theme|THEME_STORAGE_KEY|THEME_KEY|document\.documentElement\.classList\.toggle|\bapplyTheme\s*\(/,
      'Auth and onboarding pages must not recreate route-local theme persistence, root-class mutation, or legacy theme helpers.',
    );
  }
});


test('Category 11: Settings exposes a clear permission-aware local section map', async () => {
  const settings = compact(
    await source('app/settings/SettingsClient.tsx'),
  );

  assert.match(settings, /SETTINGS_NAVIGATION/);
  assert.match(settings, /aria-label=['"]Settings sections['"]/);
  assert.match(settings, /allowedSections\.has/);
  assert.match(settings, /My Account/);
  assert.match(settings, /Workspace/);
  assert.match(settings, /Organization/);
  assert.match(settings, /Apps/);
  assert.match(settings, /SaMi AI/);
  assert.match(settings, /Billing/);
  assert.match(settings, /overflow-x-auto/);
});


test('Category 11: dashboard and settings have stable loading and SaMiOverlay error boundaries', async () => {
  const [
    loading,
    routeError,
    dashboardLoading,
    dashboardError,
    settingsLoading,
    settingsError,
  ] = await Promise.all([
    source('app/components/workspace/WorkspaceRouteLoading.tsx'),
    source('app/components/workspace/WorkspaceRouteError.tsx'),
    source('app/dashboard/loading.tsx'),
    source('app/dashboard/error.tsx'),
    source('app/settings/loading.tsx'),
    source('app/settings/error.tsx'),
  ]);

  assert.match(loading, /Loading workspace/);
  assert.match(loading, /lg:pl-\[286px\]/);
  assert.match(routeError, /SaMiOverlay/);
  assert.match(routeError, /Retry/);
  assert.match(routeError, /\/dashboard/);

  assert.match(dashboardLoading, /WorkspaceRouteLoading/);
  assert.match(dashboardError, /WorkspaceRouteError/);
  assert.match(settingsLoading, /WorkspaceRouteLoading/);
  assert.match(settingsError, /WorkspaceRouteError/);
});


test('Category 11: Help uses compact disclosure and only real platform destinations', async () => {
  const help = compact(
    await source('app/help/page.tsx'),
  );

  assert.match(help, /<details/);
  assert.match(help, /Getting started/);
  assert.match(help, /Account & security/);
  assert.match(help, /People & Access/);
  assert.match(help, /Workspace & organization/);
  assert.match(help, /\/dashboard/);
  assert.match(help, /\/settings\/users/);
  assert.match(help, /\/settings\/roles/);
  assert.match(help, /tab=organization/);

  assert.doesNotMatch(help, /\/auth\/terms/);
  assert.doesNotMatch(help, /\/auth\/privacy/);
  assert.doesNotMatch(help, /support@sami\.tech/i);
});


test('Category 11: Settings sections do not stack a second persistent navigation bar', async () => {
  const [
    organization,
    account,
    workspace,
  ] = await Promise.all([
    source('app/settings/components/OrganizationSettings.tsx'),
    source('app/settings/components/MyAccountSettings.tsx'),
    source('app/settings/components/WorkspaceSettings.tsx'),
  ]);

  const organizationCompact = compact(
    organization,
  );

  assert.match(
    organizationCompact,
    /type View = \| ['"]overview['"] \| ['"]profile['"] \| ['"]branches['"] \| ['"]companies['"] \| ['"]history['"]/,
  );

  assert.match(
    organizationCompact,
    /Organization management/,
  );

  assert.match(
    organizationCompact,
    /Back to organization/,
  );

  assert.match(
    organizationCompact,
    /params\.delete\(\s*['"]organization['"]\s*,?\s*\)/,
  );

  assert.doesNotMatch(
    organizationCompact,
    /const selected = view === item\.key/,
    'Organization must not render a persistent inner tab selector beneath the Settings navigation.',
  );

  assert.match(
    account,
    /function AccountRow/,
  );

  assert.match(
    account,
    /grid gap-3 sm:grid-cols-2/,
  );

  assert.match(
    account,
    /group rounded-\[20px\] border border-slate-200 bg-white p-4 text-left/,
  );

  assert.match(
    workspace,
    /function WorkspaceMenuRow/,
  );

  assert.match(
    workspace,
    /grid gap-3 sm:grid-cols-2/,
  );

  assert.match(
    workspace,
    /group rounded-\[20px\] border border-slate-200 bg-white p-4 text-left/,
  );
});
