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

import FixedAssetsWorkspaceClient from '@/app/apps/fixed_assets/FixedAssetsWorkspaceClient';
import FixedAssetsAccountingControl from '@/app/apps/fixed_assets/FixedAssetsAccountingControl';

import {
  getFixedAssetsAccountingControl,
} from '@/lib/apps/fixed_assets/accounting-control';

const MODULE_KEY = 'fixed_assets';

export default async function FixedAssetsWorkspace({
  section,
}: {
  section?: string | null;
}) {
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
      section,
    );

  const appBaseHref =
    '/apps/fixed_assets';

  const appSidebarItems = [
    {
      key: 'overview',
      label: 'Asset Accounting',
      href: appBaseHref,
      description: 'Capitalization, depreciation, carrying value and lifecycle controls.',
    },
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

  const activeSidebarKey =
    resolved.view === 'records'
      ? resolved.tableKey
      : resolved.view;

  const accountingControl =
    resolved.view ===
      'overview'
      ? await getFixedAssetsAccountingControl()
      : null;

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
        {accountingControl ? (
          <FixedAssetsAccountingControl
            data={accountingControl}
            canEdit={
              data.capabilities
                .canEdit
            }
            canExecute={
              data.capabilities
                .canExecute
            }
          />
        ) : (
          <FixedAssetsWorkspaceClient
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
          />
        )}
      </div>
    </AppSurfaceShell>
  );
}
