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
   * Complete tenant application lifecycle set exposed only to somebody
   * authorized to administer workspace applications.
   *
   * This includes disabled, failed and uninstalled records so the
   * Apps manager can present the correct recovery/action state.
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

  /**
   * Core SaMi AI entitlement for this workspace.
   *
   * This is deliberately NOT derived from ai.use / ai.manage.
   * Every active workspace member receives AI when the workspace
   * subscription includes it.
   */
  aiAvailable:
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


/*
 * Category 22/23 bridge.
 *
 * The current subscription model does not yet expose a dedicated
 * AI entitlement flag. Until Usage / Limits / Entitlements is built,
 * active and trial subscriptions are treated as AI-entitled.
 *
 * When Category 23 introduces a real plan entitlement such as
 * ai.enabled, ONLY isWorkspaceAiAvailable() should need changing.
 */
const AI_ALLOWED_SUBSCRIPTION_STATUSES =
  new Set([
    'active',
    'trial',
    'trialing',
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
   SaMi AI ENTITLEMENT

   SaMi AI is a CORE PLATFORM capability.

   Access rule:

     active workspace membership
            +
     workspace billing entitlement
            ↓
        SaMi AI available

   Authorization rule:

     SaMi AI access <= normal user data access

   Therefore roles do NOT switch AI on/off. Roles, companies and
   record rules only determine what SaMi AI may read or act on.
   ================================================================ */

export function isWorkspaceAiAvailable(
  subscription:
    SubscriptionContext | null,
): boolean {
  if (
    !subscription
  ) {
    return false;
  }


  return AI_ALLOWED_SUBSCRIPTION_STATUSES.has(
    normalizeKey(
      subscription.status,
    ),
  );
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
     AI

     Resolve this BEFORE subscription minimization. Ordinary users
     may use AI without receiving plan / billing information.
     ============================================================== */

  const aiAvailable =
    isWorkspaceAiAvailable(
      subscription,
    );


  /* ==============================================================
     RESULT
     ============================================================== */

  return {
    accessibleModules,

    managedModules:
      canManageApps
        ? modules
        : [],

    subscription:
      canViewBilling
        ? subscription
        : null,

    aiAvailable,

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
