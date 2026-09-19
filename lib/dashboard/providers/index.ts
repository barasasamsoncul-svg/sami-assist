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
  [];


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
): DashboardProvider[] {
  const accessible =
    new Set(
      modules.map(
        module =>
          normalizeKey(
            module.key,
          ),
      ),
    );


  return DASHBOARD_PROVIDERS.filter(
    provider =>
      accessible.has(
        normalizeKey(
          provider.moduleKey,
        ),
      ),
  );
}