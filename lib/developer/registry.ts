import 'server-only';

import {
  filterAccessibleModuleExtensions,
  getSamiModuleManifest,
} from '@/lib/modules/registry';

export type SamiDeveloperEndpointOperation =
  | 'read'
  | 'create'
  | 'write'
  | 'delete';

export type SamiDeveloperEndpointDefinition = {
  key: string;
  moduleKey: string;
  path: string;
  method:
    'GET' |
    'POST' |
    'PATCH' |
    'DELETE';
  scope: string;
  operation:
    SamiDeveloperEndpointOperation;
  resourceKey:
    string | null;
};

const MODULE_DEVELOPER_ENDPOINTS:
  SamiDeveloperEndpointDefinition[] =
  [];

/**
 * Category 21 deliberately starts with no module business-record APIs.
 *
 * A future module endpoint must be registered in code AND the module
 * manifest must opt in with extensions.apiEndpoints=true. Installation
 * alone never exposes business data.
 */
export function getAccessibleModuleDeveloperEndpoints(
  accessibleModuleKeys:
    string[],
  credentialAllowedAppKeys:
    string[],
) {
  const credentialBoundary =
    credentialAllowedAppKeys
      .map(
        key =>
          key
            .trim()
            .toLowerCase(),
      )
      .filter(
        Boolean,
      );

  /*
   * Empty is intentionally NONE, not ALL.
   * A service credential must explicitly opt into each future
   * business app API boundary.
   */
  if (
    credentialBoundary.length ===
      0
  ) {
    return [];
  }

  const effectiveKeys =
    accessibleModuleKeys
      .filter(
        key =>
          credentialBoundary
            .includes(
              key
                .trim()
                .toLowerCase(),
            ),
      );

  return filterAccessibleModuleExtensions(
    MODULE_DEVELOPER_ENDPOINTS,
    effectiveKeys,
    endpoint =>
      endpoint.moduleKey,
  )
    .filter(
      endpoint =>
        getSamiModuleManifest(
          endpoint.moduleKey,
        )
          ?.extensions
          .apiEndpoints ===
        true,
    );
}
