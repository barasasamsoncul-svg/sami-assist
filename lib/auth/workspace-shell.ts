import 'server-only';

import type {
  ModuleContext,
  SubscriptionContext,
} from '@/lib/auth/account-context';

import type {
  PermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';


/* ================================================================
   TYPES
   ================================================================ */

export interface WorkspaceShellAccess {
  /**
   * Apps THIS user may actually use.
   *
   * Used by:
   * - Dashboard
   * - Sidebar
   * - Search
   * - AI
   * - Quick actions
   */
  accessibleModules:
    ModuleContext[];

  /**
   * Complete installed-app set, but only supplied to somebody
   * allowed to view/manage the Apps administration surface.
   */
  managedModules:
    ModuleContext[];

  /**
   * Subscription information is withheld entirely unless the
   * current user may view billing.
   */
  subscription:
    SubscriptionContext | null;

  canViewAppCatalog:
    boolean;

  canManageApps:
    boolean;

  canViewBilling:
    boolean;

  accessibleModuleKeys:
    string[];
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const HIDDEN_MODULE_STATUSES =
  new Set([
    'disabled',
    'failed',
    'uninstalled',
    'removed',
    'inactive',
  ]);


/* ================================================================
   HELPERS
   ================================================================ */

function normalizeKey(
  value:
    string | null | undefined,
): string {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}


function getActiveInstalledModules(
  modules:
    ModuleContext[],
): ModuleContext[] {
  return modules.filter(
    module => {
      const status =
        normalizeKey(
          module.status,
        );


      return !HIDDEN_MODULE_STATUSES.has(
        status,
      );
    },
  );
}


function getEffectiveModuleKeys(
  permissions:
    PermissionContext,
): Set<string> {
  const result =
    new Set<string>();


  for (
    const permission
    of permissions.permissions
  ) {
    const moduleKey =
      normalizeKey(
        permission.moduleKey,
      );


    if (
      moduleKey
    ) {
      result.add(
        moduleKey,
      );
    }
  }


  return result;
}


/* ================================================================
   RESOLVER
   ================================================================ */

export function resolveWorkspaceShellAccess(
  input: {
    modules:
      ModuleContext[];

    subscription:
      SubscriptionContext | null;

    permissions:
      PermissionContext;
  },
): WorkspaceShellAccess {
  const {
    modules,
    subscription,
    permissions,
  } =
    input;


  const installedModules =
    getActiveInstalledModules(
      modules,
    );


  /*
   * IMPORTANT:
   *
   * App access comes from MODULE permissions.
   *
   * apps.view / apps.manage do NOT automatically mean that app
   * should appear in the person's My Apps launcher.
   */
  const permittedModuleKeys =
    getEffectiveModuleKeys(
      permissions,
    );


  const accessibleModules =
    installedModules.filter(
      module =>
        permittedModuleKeys.has(
          normalizeKey(
            module.key,
          ),
        ),
    );


  /*
   * App administration is separate from app usage.
   */
  const canViewAppCatalog =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .APPS_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .APPS_MANAGE,
    );


  const canManageApps =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .APPS_MANAGE,
    );


  const canViewBilling =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
    );


  return {
    accessibleModules,

    managedModules:
      canViewAppCatalog
        ? installedModules
        : [],

    subscription:
      canViewBilling
        ? subscription
        : null,

    canViewAppCatalog,

    canManageApps,

    canViewBilling,

    accessibleModuleKeys:
      accessibleModules.map(
        module =>
          normalizeKey(
            module.key,
          ),
      ),
  };
}