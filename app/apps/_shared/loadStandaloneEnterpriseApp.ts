import 'server-only';

import {
  notFound,
} from 'next/navigation';

import {
  getAccountContextForUser,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

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

import {
  getSaMiAppVisual,
} from '@/lib/apps/visual-registry';

import {
  getSamiAppUiProfile,
} from '@/lib/apps/ui-profiles';


export type StandaloneEnterpriseWorkspaceView =
  | 'overview'
  | 'records'
  | 'reports'
  | 'activity'
  | 'settings';


export type StandaloneEnterpriseSection = {
  view:
    StandaloneEnterpriseWorkspaceView;
  tableKey:
    string | null;
};


function resolveSection(
  data:
    EnterpriseWorkspaceData,
  sectionInput?:
    string | null,
):
  StandaloneEnterpriseSection |
  null {
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
    return data.capabilities
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
    const table =
      data.tables.find(
        item =>
          item.settingTable,
      );

    return table &&
      data.capabilities
        .canManageSettings
      ? {
          view:
            'settings',
          tableKey:
            table.key,
        }
      : null;
  }

  const table =
    data.tables.find(
      item =>
        item.key ===
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


export async function loadStandaloneEnterpriseApp(
  moduleKey:
    string,
  section?:
    string | null,
) {
  const requestedPath =
    '/apps/' +
    moduleKey +
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

  const app =
    shell.accessibleModules
      .find(
        item =>
          item.registryKey ===
            moduleKey ||
          item.key ===
            moduleKey,
      );

  if (
    !app
  ) {
    notFound();
  }

  const [
    data,
    notifications,
  ] =
    await Promise.all([
      getEnterpriseModuleWorkspace(
        moduleKey,
      )
        .catch(
          error => {
            console.error(
              '[SaMi] Standalone app workspace load failed:',
              {
                moduleKey,
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
          () =>
            null,
        ),
    ]);

  if (
    !data
  ) {
    notFound();
  }

  const resolved =
    resolveSection(
      data,
      section,
    );

  if (
    !resolved
  ) {
    notFound();
  }

  const can =
    (
      permission:
        string,
    ) =>
      permissions.isOwner ||
      permissions.permissionSet
        .has(
          permission,
        );

  return {
    session,
    account,
    permissions,
    shell,
    app,
    data,
    notifications,
    resolved,
    can,
    visual:
      getSaMiAppVisual(
        app.registryKey,
        app.category,
      ),
    uiProfile:
      getSamiAppUiProfile(
        app.registryKey,
      ),
  };
}
