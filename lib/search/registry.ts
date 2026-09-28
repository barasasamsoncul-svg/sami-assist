import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

import {
  APP_RUNTIME_SEARCH_PROVIDERS,
} from '@/lib/apps/runtime-search';

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
    ...APP_RUNTIME_SEARCH_PROVIDERS,
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
