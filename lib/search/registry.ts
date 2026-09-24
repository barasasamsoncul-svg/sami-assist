import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

import {
  INVOICING_SEARCH_PROVIDER,
} from '@/lib/apps/invoicing/search';

import {
  ENTERPRISE_MODULE_SEARCH_PROVIDERS,
} from '@/lib/apps/enterprise/search';

import {
  SALES_SEARCH_PROVIDER,
} from '@/lib/apps/sales/search';

import {
  filterAccessibleModuleExtensions,
} from '@/lib/modules/registry';

/*
 * Category 17 provider registry.
 *
 * Core Search knows how to search SaMi platform surfaces.
 * Business apps register record providers here later without
 * teaching the shell about CRM, Invoicing, Inventory, HR, etc.
 */
export const WORKSPACE_SEARCH_PROVIDERS:
  WorkspaceSearchProvider[] =
  [
    INVOICING_SEARCH_PROVIDER,
    SALES_SEARCH_PROVIDER,
    ...ENTERPRISE_MODULE_SEARCH_PROVIDERS,
  ];

export function getWorkspaceSearchProviders(
  accessibleModuleKeys: string[],
) {
  return filterAccessibleModuleExtensions(
    WORKSPACE_SEARCH_PROVIDERS,
    accessibleModuleKeys,
    provider =>
      provider.key,
    'search',
  );
}
