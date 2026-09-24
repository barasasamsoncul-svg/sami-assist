import type {
  SamiModuleManifest,
} from '@/lib/modules/types';

import {
  enterpriseModuleTables,
} from '@/lib/apps/enterprise/catalog';

import {
  getEnterpriseDomainProfile,
} from '@/lib/apps/enterprise/domain-profiles';


const GENERIC_ACTIONS =
  [
    'view',
    'create',
    'edit',
    'delete',
    'report',
    'settings',
  ] as const;


export function withEnterpriseModuleDefaults(
  manifest:
    SamiModuleManifest,
): SamiModuleManifest {
  if (
    manifest.key ===
      'invoicing' ||
    manifest.key ===
      'sales'
  ) {
    return manifest;
  }

  const needsGenericContract =
    manifest.resources.length ===
      0 &&
    manifest.security
      .permissions
      .length ===
      0;

  if (
    !needsGenericContract
  ) {
    return {
      ...manifest,
      extensions: {
        ...manifest.extensions,
        dashboard:
          true,
        search:
          true,
        activity:
          true,
        automationTriggers:
          true,
        automationActions:
          true,
        apiEndpoints:
          true,
        dataExport:
          true,
      },
    };
  }

  const key =
    manifest.key;

  const tables =
    enterpriseModuleTables(
      key,
    );

  const profile =
    getEnterpriseDomainProfile(
      key,
    );

  const resourceKeyForTable =
    (
      table:
        string,
    ) =>
      table.endsWith(
        '_settings',
      )
        ? 'settings.' +
          table
        : 'record.' +
          table;

  const permissions =
    GENERIC_ACTIONS.map(
      action => ({
        key:
          key +
          '.record.' +
          action,
        name:
          action ===
            'view'
            ? 'View ' +
              manifest.name +
              ' records'
            : action ===
                'create'
              ? 'Create ' +
                manifest.name +
                ' records'
              : action ===
                  'edit'
                ? 'Edit ' +
                  manifest.name +
                  ' records'
                : action ===
                    'delete'
                  ? 'Delete ' +
                    manifest.name +
                    ' records'
                  : action ===
                      'report'
                    ? 'View ' +
                      manifest.name +
                      ' reports'
                    : 'Manage ' +
                      manifest.name +
                      ' settings',
        resource:
          action ===
            'report'
            ? 'report'
            : action ===
                'settings'
              ? 'settings'
              : 'record',
        action:
          action,
        scope:
          'company' as const,
        defaultSystemRoles:
          action ===
            'view' ||
          action ===
            'create' ||
          action ===
            'edit' ||
          action ===
            'report'
            ? [
                'admin' as const,
                'member' as const,
              ]
            : [
                'admin' as const,
              ],
      }),
    );

  return {
    ...manifest,
    version:
      manifest.version ===
        '1.0.0'
        ? '2.0.0'
        : manifest.version,

    views: [
      ...manifest.views,
      {
        key:
          key +
          '.dashboard',
        name:
          manifest.name +
          ' dashboard',
        type:
          'dashboard',
        resourceKey:
          'report',
        route:
          '/apps/' +
          key,
        priority:
          10,
      },
      ...tables
        .filter(
          table =>
            !table.endsWith(
              '_settings',
            ),
        )
        .flatMap(
          (
            table,
            index,
          ) => {
            const resourceKey =
              resourceKeyForTable(
                table,
              );

            return [
              {
                key:
                  key +
                  '.' +
                  table +
                  '.list',
                name:
                  table
                    .replaceAll(
                      '_',
                      ' ',
                    ),
                type:
                  'list' as const,
                resourceKey,
                route:
                  '/apps/' +
                  key,
                priority:
                  20 +
                  index *
                    10,
              },
              {
                key:
                  key +
                  '.' +
                  table +
                  '.form',
                name:
                  table
                    .replaceAll(
                      '_',
                      ' ',
                    ) +
                  ' form',
                type:
                  'form' as const,
                resourceKey,
                route:
                  '/apps/' +
                  key,
                priority:
                  21 +
                  index *
                    10,
              },
            ];
          },
        ),
      {
        key:
          key +
          '.report',
        name:
          (
            profile
              ?.reportsLabel ||
            manifest.name +
              ' reporting'
          ),
        type:
          'dashboard',
        resourceKey:
          'report',
        route:
          '/apps/' +
          key,
        priority:
          900,
      },
    ],

    resources: [
      ...tables.map(
        table => {
          const settings =
            table.endsWith(
              '_settings',
            );

          const resourceKey =
            resourceKeyForTable(
              table,
            );

          return {
            key:
              resourceKey,
            label:
              table
                .replaceAll(
                  '_',
                  ' ',
                ),
            table,
            companyScoped:
              true,
            permissions: settings
              ? {
                  read: [
                    key +
                    '.record.view',
                  ],
                  write: [
                    key +
                    '.record.settings',
                  ],
                }
              : {
                  read: [
                    key +
                    '.record.view',
                  ],
                  create: [
                    key +
                    '.record.create',
                  ],
                  write: [
                    key +
                    '.record.edit',
                  ],
                  delete: [
                    key +
                    '.record.delete',
                  ],
                },
          };
        },
      ),
      {
        key:
          'report',
        label:
          (
            profile
              ?.reportsLabel ||
            manifest.name +
              ' report'
          ),
        table:
          null,
        companyScoped:
          true,
        permissions: {
          read: [
            key +
            '.record.report',
          ],
        },
      },
    ],

    security: {
      permissions,

      recordPolicies: [
        ...tables.map(
          table => {
            const settings =
              table.endsWith(
                '_settings',
              );

            return {
              key:
                key +
                '.' +
                table +
                '.company',
              name:
                table
                  .replaceAll(
                    '_',
                    ' ',
                  ) +
                ' in current company',
              resourceKey:
                resourceKeyForTable(
                  table,
                ),
              operations:
                settings
                  ? [
                      'read' as const,
                      'write' as const,
                    ]
                  : [
                      'read' as const,
                      'create' as const,
                      'write' as const,
                      'delete' as const,
                    ],
              scope:
                'company' as const,
            };
          },
        ),
        {
          key:
            key +
            '.report.company',
          name:
            manifest.name +
            ' reports in current company',
          resourceKey:
            'report',
          operations: [
            'read',
          ],
          scope:
            'company',
        },
      ],

      fieldPolicies: [],
    },

    extensions: {
      ...manifest.extensions,
      dashboard:
        true,
      search:
        true,
      activity:
        true,
      aiTools:
        true,
      automationTriggers:
        true,
      automationActions:
        true,
      apiEndpoints:
        true,
      dataExport:
        true,
    },
  };
}
