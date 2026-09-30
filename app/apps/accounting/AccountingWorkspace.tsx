import type {
  CSSProperties,
} from 'react';

import Link from 'next/link';

import {
  ArrowLeft,
} from 'lucide-react';

import AppSurfaceShell from '@/app/components/apps/AppSurfaceShell';
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  loadStandaloneEnterpriseApp,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

import AccountingWorkspaceClient from '@/app/apps/accounting/AccountingWorkspaceClient';

import AccountingFoundationPanel, { ACCOUNTING_SECTIONS, type AccountingSection } from './AccountingFoundationPanel';
import { getAccountingFoundation } from '@/lib/apps/accounting/foundation';
import { AccountingInputError } from '@/lib/apps/accounting/validation';

const MODULE_KEY = 'accounting';

export default async function AccountingWorkspace({
  section,
  filters = {},
}: {
  section?: string | null;
  filters?: { from?: string; to?: string; accountId?: string; page?: string };
}) {
  const dedicatedSection = ACCOUNTING_SECTIONS.includes((section || 'overview') as AccountingSection) ? (section || 'overview') as AccountingSection : null;
  const {
    session,
    account,
    shell,
    app,
    data,
    notifications,
    resolved,
    can,
    visual,
    uiProfile,
  } =
    await loadStandaloneEnterpriseApp(
      MODULE_KEY,
      dedicatedSection ? undefined : section,
    );

  let foundation = null;
  let foundationError = '';
  if (dedicatedSection) {
    try { foundation = await getAccountingFoundation(filters); }
    catch (error) {
      foundationError = error instanceof AccountingInputError ? error.message : 'Accounting data could not be loaded. Retry this page.';
      if (!(error instanceof AccountingInputError)) console.error('[Accounting] Foundation load failed', error);
    }
  }

  const appBaseHref =
    '/apps/accounting';

  const appSidebarItems = [
    {
      key: 'overview',
      label: 'Overview',
      href: appBaseHref,
      description: 'KPIs, priorities and current operating state.',
    },
    { key: 'setup', label: 'Setup', href: appBaseHref + '/setup', description: 'Prepare accounts and fiscal periods.' },
    ...(data.capabilities.canCreate ? [{ key: 'new-journal', label: 'New journal', href: appBaseHref + '/new-journal', description: 'Create a balanced journal draft.' }] : []),
    ...(data.capabilities.canReport ? [
      { key: 'trial-balance', label: 'Trial balance', href: appBaseHref + '/trial-balance', description: 'Opening, movement and closing balances.' },
      { key: 'general-ledger', label: 'General ledger', href: appBaseHref + '/general-ledger', description: 'Account movements and running balance.' },
    ] : []),
    ...data.tables
      .filter(
        table =>
          !table.settingTable,
      )
      .map(
        table => ({
          key: table.key,
          label: table.label,
          href:
            appBaseHref +
            '/' +
            encodeURIComponent(
              table.key,
            ),
          description:
            'Open ' +
            table.label.toLowerCase() +
            ' records.',
          badge: table.count,
        }),
      ),
    ...(
      data.capabilities.canReport
        ? [{
            key: 'reports',
            label: 'Reports',
            href:
              appBaseHref +
              '/reports',
            description: 'Module analysis and operational reporting.',
          }]
        : []
    ),
    {
      key: 'activity',
      label: 'Activity',
      href:
        appBaseHref +
        '/activity',
      description: 'Recent module changes and user actions.',
    },
    ...(
      data.capabilities.canManageSettings &&
      data.tables.some(
        table =>
          table.settingTable,
      )
        ? [{
            key: 'settings',
            label: 'Settings',
            href:
              appBaseHref +
              '/settings',
            description: 'Module defaults, policy and configuration.',
          }]
        : []
    ),
  ];

  const activeSidebarKey = dedicatedSection || (
    resolved.view === 'records'
      ? resolved.tableKey
      : resolved.view);

  return (
    <AppSurfaceShell
      appKey={app.registryKey}
      appCategory={app.category}
      appIconKey={app.iconKey}
      profile={uiProfile}
      user={session.user}
      tenant={account.tenant}
      membership={account.membership}
      subscription={shell.subscription}
      modules={shell.accessibleModules}
      appSidebarItems={appSidebarItems}
      activeSidebarKey={activeSidebarKey}
      sidebarCapabilities={{
        aiEnabled: shell.aiAvailable,
        filesEnabled:
          can(
            SAMI_PERMISSIONS.FILES_VIEW,
          ),
        notificationsEnabled:
          can(
            SAMI_PERMISSIONS.NOTIFICATIONS_VIEW,
          ),
      }}
      unreadNotifications={
        notifications?.unreadCount ||
        0
      }
      title={app.name}
      description={app.description}
      contextLabel={data.company.name}
      actions={
        <div className="flex items-center gap-2">
          <SamiAppIconTile
            appKey={app.registryKey}
            category={app.category}
            iconKey={app.iconKey}
            size="sm"
          />

          <Link
            href="/apps"
            className={[
              'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px',
              visual.border,
              visual.soft,
              visual.text,
            ].join(' ')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">
              All Apps
            </span>
          </Link>
        </div>
      }
    >
      <div
        className={styles.enterpriseWorkspace}
        data-module={MODULE_KEY}
        data-archetype={uiProfile.archetype}
        data-navigation={uiProfile.navigation}
        data-density={uiProfile.density}
        data-header={uiProfile.header}
        style={{
          '--sami-module-accent':
            uiProfile.accent,
          '--sami-module-secondary':
            uiProfile.secondary,
        } as CSSProperties}
      >
        {dedicatedSection ? (foundation ? <AccountingFoundationPanel data={foundation} section={dedicatedSection} canCreate={data.capabilities.canCreate} /> : <div role="alert" className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]">{foundationError} <Link href="/apps/accounting" className="underline">Return to Accounting</Link></div>) : <AccountingWorkspaceClient
          initialData={data}
          userId={session.user.id}
          initialView={resolved.view}
          initialTableKey={resolved.tableKey}
          accessibleModuleKeys={
            shell.accessibleModules.map(
              module =>
                module.registryKey,
            )
          }
        />}
      </div>
    </AppSurfaceShell>
  );
}
