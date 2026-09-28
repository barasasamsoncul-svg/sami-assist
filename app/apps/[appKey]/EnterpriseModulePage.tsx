import type {
  CSSProperties,
} from 'react';

import Link from 'next/link';

import {
  ArrowLeft,
} from 'lucide-react';

import {
  notFound,
  redirect,
} from 'next/navigation';

import AppSurfaceShell from '@/app/components/apps/AppSurfaceShell';
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import EnterpriseModuleWorkspaceClient from '@/app/apps/_shared/EnterpriseDataWorkspaceClient';
import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

import {
  getSamiAppUiProfile,
} from '@/lib/apps/ui-profiles';

import {
  getCanonicalAppKey,
} from '@/lib/apps/navigation-registry';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requirePageSession,
} from '@/lib/auth/require-page-session';

import {
  resolveWorkspaceShellAccess,
} from '@/lib/auth/workspace-shell';

import {
  getWorkspaceNotificationSummary,
} from '@/lib/services/workspace-notifications';

import {
  getEnterpriseModuleWorkspace,
  type EnterpriseWorkspaceData,
} from '@/lib/apps/enterprise/service';


export type EnterpriseWorkspaceView =
  | 'overview'
  | 'records'
  | 'reports'
  | 'activity'
  | 'settings';


function resolveWorkspaceSection(
  data:
    EnterpriseWorkspaceData,
  sectionInput?:
    string | null,
): {
  view:
    EnterpriseWorkspaceView;
  tableKey:
    string | null;
} | null {
  const section =
    (
      sectionInput ||
      ''
    )
      .trim()
      .toLowerCase();

  if (
    !section ||
    section ===
      'overview'
  ) {
    return {
      view:
        'overview',
      tableKey:
        null,
    };
  }

  if (
    section ===
      'reports'
  ) {
    return data
      .capabilities
      .canReport
      ? {
          view:
            'reports',
          tableKey:
            null,
        }
      : null;
  }

  if (
    section ===
      'activity'
  ) {
    return {
      view:
        'activity',
      tableKey:
        null,
    };
  }

  if (
    section ===
      'settings'
  ) {
    const settingsTable =
      data.tables.find(
        table =>
          table.settingTable,
      );

    return settingsTable &&
      data.capabilities
        .canManageSettings
      ? {
          view:
            'settings',
          tableKey:
            settingsTable.key,
        }
      : null;
  }

  const table =
    data.tables.find(
      candidate =>
        candidate.key ===
          section,
    );

  if (
    !table
  ) {
    return null;
  }

  if (
    table.settingTable &&
    !data.capabilities
      .canManageSettings
  ) {
    return null;
  }

  return {
    view:
      table.settingTable
        ? 'settings'
        : 'records',
    tableKey:
      table.key,
  };
}


export default async function EnterpriseModulePage({
  appKey,
  section,
}: {
  appKey:
    string;
  section?:
    string | null;
}) {
  const requestedPath =
    '/apps/' +
    appKey +
    (
      section
        ? '/' +
          section
        : ''
    );

  const session =
    await requirePageSession(
      requestedPath,
    );

  const [
    account,
    permissions,
  ] =
    await Promise.all([
      getAccountContextForUser(
        session.user.id,
        session.currentTenantId,
      ),
      getPermissionContext(),
    ]);

  const shell =
    resolveWorkspaceShellAccess({
      modules:
        account.modules,
      subscription:
        account.subscription,
      permissions,
    });

  const canonicalKey =
    getCanonicalAppKey(
      appKey,
    );

  /*
   * Sales and Invoicing own dedicated route trees. They must never
   * silently fall into the shared enterprise workspace.
   */
  if (
    canonicalKey ===
      'sales' ||
    canonicalKey ===
      'invoicing'
  ) {
    notFound();
  }

  const app =
    shell.accessibleModules
      .find(
        module =>
          module.registryKey ===
            canonicalKey ||
          module.key ===
            canonicalKey,
      );

  if (
    !app
  ) {
    notFound();
  }

  if (
    appKey !==
      app.registryKey
  ) {
    redirect(
      app.href +
      (
        section
          ? '/' +
            encodeURIComponent(
              section,
            )
          : ''
      ),
    );
  }

  const can =
    (
      permission:
        string,
    ) =>
      permissions
        .isOwner ||
      permissions
        .permissionSet
        .has(
          permission,
        );

  const [
    data,
    notifications,
  ] =
    await Promise.all([
      getEnterpriseModuleWorkspace(
        canonicalKey,
      )
        .catch(
          error => {
            console.error(
              '[SaMi] Enterprise workspace load failed:',
              {
                moduleKey:
                  canonicalKey,
                section:
                  section ||
                  'overview',
                error,
              },
            );

            return null;
          },
        ),
      getWorkspaceNotificationSummary()
        .catch(
          () => null,
        ),
    ]);

  if (
    !data
  ) {
    notFound();
  }

  const resolved =
    resolveWorkspaceSection(
      data,
      section,
    );

  if (
    !resolved
  ) {
    notFound();
  }

  const visual =
    getSaMiAppVisual(
      app.registryKey,
      app.category,
    );

  const uiProfile =
    getSamiAppUiProfile(
      app.registryKey,
    );

  const appBaseHref =
    app.href ||
    (
      '/apps/' +
      app.registryKey
    );

  const appSidebarItems = [
    {
      key:
        'overview',
      label:
        'Overview',
      href:
        appBaseHref,
      description:
        'KPIs, priorities and current operating state.',
    },
    ...data.tables
      .filter(
        table =>
          !table.settingTable,
      )
      .map(
        table => ({
          key:
            table.key,
          label:
            table.label,
          href:
            appBaseHref +
            '/' +
            encodeURIComponent(
              table.key,
            ),
          description:
            'Open ' +
            table.label
              .toLowerCase() +
            ' records.',
          badge:
            table.count,
        }),
      ),
    ...(
      data.capabilities
        .canReport
        ? [
            {
              key:
                'reports',
              label:
                'Reports',
              href:
                appBaseHref +
                '/reports',
              description:
                'Module analysis and operational reporting.',
            },
          ]
        : []
    ),
    {
      key:
        'activity',
      label:
        'Activity',
      href:
        appBaseHref +
          '/activity',
      description:
        'Recent module changes and user actions.',
    },
    ...(
      data.capabilities
        .canManageSettings &&
      data.tables.some(
        table =>
          table.settingTable,
      )
        ? [
            {
              key:
                'settings',
              label:
                'Settings',
              href:
                appBaseHref +
                  '/settings',
              description:
                'Module defaults, policy and configuration.',
            },
          ]
        : []
    ),
  ];

  const activeSidebarKey =
    resolved.view ===
      'records'
      ? resolved.tableKey
      : resolved.view;

  return (
    <AppSurfaceShell
      appKey={
        app.registryKey
      }
      appCategory={
        app.category
      }
      appIconKey={
        app.iconKey
      }
      profile={
        uiProfile
      }
      user={
        session.user
      }
      tenant={
        account.tenant
      }
      membership={
        account.membership
      }
      subscription={
        shell.subscription
      }
      modules={
        shell.accessibleModules
      }
      appSidebarItems={
        appSidebarItems
      }
      activeSidebarKey={
        activeSidebarKey
      }
      sidebarCapabilities={{
        aiEnabled:
          shell.aiAvailable,
        filesEnabled:
          can(
            SAMI_PERMISSIONS
              .FILES_VIEW,
          ),
        notificationsEnabled:
          can(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          ),
      }}
      unreadNotifications={
        notifications
          ?.unreadCount ||
        0
      }
      title={
        app.name
      }
      description={
        app.description
      }
      contextLabel={
        data.company.name
      }
      actions={
        <div className="flex items-center gap-2">
          <SamiAppIconTile
            appKey={
              app.registryKey
            }
            category={
              app.category
            }
            iconKey={
              app.iconKey
            }
            size="sm"
          />

          <Link
            href="/apps"
            className={[
              'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-[var(--sami-shadow-sm)] transition hover:-translate-y-px',
              visual.border,
              visual.soft,
              visual.text,
            ].join(
              ' ',
            )}
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
        className={
          styles.enterpriseWorkspace
        }
        data-module={
          app.registryKey
        }
        data-archetype={
          uiProfile.archetype
        }
        data-navigation={
          uiProfile.navigation
        }
        data-density={
          uiProfile.density
        }
        data-header={
          uiProfile.header
        }
        style={{
          '--sami-module-accent':
            uiProfile.accent,
          '--sami-module-secondary':
            uiProfile.secondary,
        } as CSSProperties}
      >
        <EnterpriseModuleWorkspaceClient
          initialData={
            data
          }
          userId={
            session.user.id
          }
          initialView={
            resolved.view
          }
          initialTableKey={
            resolved.tableKey
          }
          accessibleModuleKeys={
            shell
              .accessibleModules
              .map(
                module =>
                  module.registryKey,
              )
          }
        />
      </div>
    </AppSurfaceShell>
  );
}
