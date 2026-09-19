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
   * Applications the CURRENT USER is actually allowed to use.
   *
   * Used by:
   * - Dashboard
   * - Sidebar
   * - Search
   * - Recent work
   * - Quick actions
   * - SaMi AI context
   */
  accessibleModules:
    ModuleContext[];

  /**
   * Complete installed application set exposed only to somebody
   * authorized to administer workspace applications.
   *
   * IMPORTANT:
   * managedModules must never be used for the user's My Apps list.
   */
  managedModules:
    ModuleContext[];

  /**
   * Subscription information is withheld unless the current user
   * has explicit billing visibility.
   */
  subscription:
    SubscriptionContext | null;

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


  /* ==============================================================
     ACCESSIBLE BUSINESS APPS

     Installed != accessible.

     A normal member sees only applications represented by their
     effective module permissions.

     Workspace owner is structural authority and therefore receives
     the complete active installed application set.
     ============================================================== */

  let accessibleModules:
    ModuleContext[];


  if (
    permissions.isOwner
  ) {
    accessibleModules =
      installedModules;
  } else {
    const permittedModuleKeys =
      getEffectiveModuleKeys(
        permissions,
      );


    accessibleModules =
      installedModules.filter(
        module =>
          permittedModuleKeys.has(
            normalizeKey(
              module.key,
            ),
          ),
      );
  }


  /* ==============================================================
     APPS ADMINISTRATION

     apps.manage controls the complete Apps administration surface.

     IMPORTANT:
     apps.manage does NOT automatically grant business-record access.
     ============================================================== */

  const canManageApps =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .APPS_MANAGE,
    );


  /* ==============================================================
     BILLING
     ============================================================== */

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


  /* ==============================================================
     RESULT
     ============================================================== */

  return {
    accessibleModules,

    managedModules:
      canManageApps
        ? installedModules
        : [],

    subscription:
      canViewBilling
        ? subscription
        : null,

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