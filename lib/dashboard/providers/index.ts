import 'server-only';

import type {
  ModuleContext,
} from '@/lib/auth/account-context';

import type {
  PermissionContext,
} from '@/lib/auth/permission-context';

import type {
  DashboardContribution,
  DashboardScope,
} from '@/lib/dashboard/types';

import {
  filterAccessibleModuleExtensions,
} from '@/lib/modules/registry';

import {
  APP_RUNTIME_DASHBOARD_PROVIDERS,
} from '@/lib/apps/runtime-dashboard';


/* ================================================================
   PROVIDER CONTEXT
   ================================================================ */

export interface DashboardProviderContext {
  userId:
    string;

  tenantId:
    string;

  membershipId:
    string;

  isOwner:
    boolean;

  scope:
    DashboardScope;

  currentCompanyId:
    string | null;

  selectedCompanyIds:
    string[];

  allowedCompanyIds:
    string[];

  permissions:
    PermissionContext;
}


/* ================================================================
   PROVIDER CONTRACT
   ================================================================ */

export interface DashboardProvider {
  moduleKey:
    string;

  supportedScopes?:
    DashboardScope[];

  /**
   * Explicit read authority required before this provider may load.
   *
   * The workspace shell already limits providers to installed apps that the
   * user can access. This second boundary prevents a user with only a narrow
   * module permission from receiving broader dashboard KPIs.
   *
   * Non-owner providers must declare at least one permission key. Owners keep
   * their structural access to installed modules.
   */
  requiredAnyPermissions?:
    string[];

  load:
    (
      context:
        DashboardProviderContext,
    ) =>
      Promise<DashboardContribution>;
}


/* ================================================================
   REGISTRY

   Future examples:

   import { invoicingDashboardProvider }
     from '@/modules/invoicing/dashboard/provider';

   import { crmDashboardProvider }
     from '@/modules/crm/dashboard/provider';

   export const DASHBOARD_PROVIDERS = [
     invoicingDashboardProvider,
     crmDashboardProvider,
   ];

   ================================================================ */

export const DASHBOARD_PROVIDERS:
  DashboardProvider[] =
  [
    ...APP_RUNTIME_DASHBOARD_PROVIDERS,
  ];


/* ================================================================
   LOOKUP
   ================================================================ */

function normalizeKey(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase();
}


export function getDashboardProviders(
  modules:
    ModuleContext[],
  permissions:
    PermissionContext,
): DashboardProvider[] {
  const accessibleProviders =
    filterAccessibleModuleExtensions(
      DASHBOARD_PROVIDERS,
      modules.map(
        module =>
          normalizeKey(
            module.key,
          ),
      ),
      provider =>
        provider.moduleKey,
      'dashboard',
    );

  if (
    permissions.isOwner
  ) {
    return accessibleProviders;
  }

  return accessibleProviders
    .filter(
      provider => {
        const required =
          (
            provider
              .requiredAnyPermissions ||
            []
          )
            .map(
              normalizeKey,
            )
            .filter(
              Boolean,
            );

        /*
         * Fail closed for non-owners. A new Home provider without an
         * explicit read contract must never expose module data by accident.
         */
        if (
          required.length ===
          0
        ) {
          return false;
        }

        return required.some(
          permission =>
            permissions
              .permissionSet
              .has(
                permission,
              ),
        );
      },
    );
}
