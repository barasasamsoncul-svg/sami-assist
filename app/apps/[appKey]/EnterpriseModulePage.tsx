import Link from 'next/link';

import {
  ArrowLeft,
} from 'lucide-react';

import {
  notFound,
  redirect,
} from 'next/navigation';

import WorkspaceShell from '@/app/components/workspace/WorkspaceShell';
import SamiAppIconTile from '@/app/components/apps/SamiAppIconTile';
import EnterpriseModuleWorkspaceClient from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceClient';
import styles from '@/app/apps/[appKey]/EnterpriseModuleWorkspaceShell.module.css';

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

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

  return (
    <WorkspaceShell
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
      contentClassName="max-w-[1600px]"
    >
      <div
        className={
          styles.enterpriseWorkspace
        }
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
    </WorkspaceShell>
  );
}
