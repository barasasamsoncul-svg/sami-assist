import 'server-only';

import {
  filterAccessibleModuleExtensions,
  getSamiModuleManifest,
  getSamiModuleManifests,
} from '@/lib/modules/registry';

import {
  isEnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

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

export const MODULE_DEVELOPER_ENDPOINTS:
  SamiDeveloperEndpointDefinition[] =
  getSamiModuleManifests()
    .filter(
      manifest =>
        manifest.extensions
          .apiEndpoints ===
          true &&
        (
          isEnterpriseModuleKey(
            manifest.key,
          ) ||
          manifest.resources
            .some(
              resource =>
                typeof resource.table ===
                  'string' &&
                resource.table
                  .trim()
                  .length >
                  0,
            )
        ),
    )
    .map(
      manifest => ({
        key:
          manifest.key +
          '.records.read',
        moduleKey:
          manifest.key,
        path:
          '/api/v1/apps/' +
          manifest.key +
          '/records',
        method:
          'GET',
        scope:
          'apps.read',
        operation:
          'read',
        resourceKey:
          null,
      }),
    );

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
