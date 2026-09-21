import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

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
  [];

export function getWorkspaceSearchProviders(
  accessibleModuleKeys: string[],
) {
  return filterAccessibleModuleExtensions(
    WORKSPACE_SEARCH_PROVIDERS,
    accessibleModuleKeys,
    provider =>
      provider.key,
  );
}
