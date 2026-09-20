import 'server-only';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

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
  const allowed =
    new Set(
      accessibleModuleKeys.map(
        key =>
          key
            .trim()
            .toLowerCase(),
      ),
    );

  return WORKSPACE_SEARCH_PROVIDERS.filter(
    provider =>
      allowed.has(
        provider.key
          .trim()
          .toLowerCase(),
      ),
  );
}
