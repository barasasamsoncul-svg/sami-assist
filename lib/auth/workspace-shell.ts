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


export interface WorkspaceShellAccess {
  accessibleModules:
    ModuleContext[];

  managedModules:
    ModuleContext[];

  subscription:
    SubscriptionContext | null;

  canManageApps:
    boolean;

  canViewBilling:
    boolean;

  accessibleModuleKeys:
    string[];
}


const HIDDEN_MODULE_STATUSES =
  new Set([
    'disabled',
    'failed',
    'uninstalled',
    'removed',
    'inactive',
  ]);


function normalizeKey(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}


function activeInstalledModules(
  modules:
    ModuleContext[],
) {
  return modules.filter(
    module =>
      !HIDDEN_MODULE_STATUSES.has(
        normalizeKey(
          module.status,
        ),
      ),
  );
}


function effectiveModuleKeys(
  permissions:
    PermissionContext,
) {
  const keys =
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
      keys.add(
        moduleKey,
      );
    }
  }


  return keys;
}


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
  const installedModules =
    activeInstalledModules(
      input.modules,
    );


  const canManageApps =
    input.permissions.isOwner ||
    input.permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .APPS_MANAGE,
    );


  const canViewBilling =
    input.permissions.isOwner ||
    input.permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_VIEW,
    ) ||
    input.permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
    );


  /*
   * Owner has structural authority over the workspace.
   *
   * Everyone else gets only applications represented in their
   * effective module permissions.
   */
  const accessibleModules =
    input.permissions.isOwner
      ? installedModules
      : (() => {
          const allowed =
            effectiveModuleKeys(
              input.permissions,
            );


          return installedModules.filter(
            module =>
              allowed.has(
                normalizeKey(
                  module.key,
                ),
              ),
          );
        })();


  return {
    /*
     * Personal working environment.
     */
    accessibleModules,

    /*
     * Administration environment.
     *
     * apps.view alone does not expose the complete installed
     * catalog through the normal shell.
     */
    managedModules:
      canManageApps
        ? installedModules
        : [],

    /*
     * Never send plan information without billing permission.
     */
    subscription:
      canViewBilling
        ? input.subscription
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