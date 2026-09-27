import type {
  SamiModuleManifest,
} from '@/lib/modules/types';

import {
  enterpriseModuleTables,
} from '@/lib/apps/enterprise/catalog';

import {
  getEnterpriseDomainProfile,
} from '@/lib/apps/enterprise/domain-profiles';

import {
  isSpecialistEnterpriseModuleKey,
} from '@/lib/apps/enterprise/specialist-catalog';


import {
  suiteDependencyProfile,
} from '@/lib/modules/suite-dependencies';



const GENERIC_ACTIONS =
  [
    'view',
    'create',
    'edit',
    'transition',
    'execute',
    'approve',
    'close',
    'delete',
    'report',
    'settings',
  ] as const;


export function withEnterpriseModuleDefaults(
  manifest:
    SamiModuleManifest,
): SamiModuleManifest {
  const dependencyProfile =
    suiteDependencyProfile(
      manifest.key,
    );

  const requiredDependencies =
    [
      ...new Set([
        ...manifest.depends,
        ...dependencyProfile
          .required,
      ]),
    ]
      .filter(
        dependency =>
          dependency !==
          manifest.key,
      );

  const requiredDependencySet =
    new Set(
      requiredDependencies,
    );

  manifest = {
    ...manifest,
    depends:
      requiredDependencies,
    optionalDepends:
      [
        ...new Set([
          ...manifest
            .optionalDepends,
          ...dependencyProfile
            .optional,
        ]),
      ]
        .filter(
          dependency =>
            dependency !==
              manifest.key &&
            !requiredDependencySet
              .has(
                dependency,
              ),
        ),
  };

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
        notifications:
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

  const recordTables =
    tables.filter(
      table =>
        !table.endsWith(
          '_settings',
        ),
    );

  const settingsTables =
    tables.filter(
      table =>
        table.endsWith(
          '_settings',
        ),
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

  const settingsResourceKey =
    settingsTables[0]
      ? resourceKeyForTable(
          settingsTables[0],
        )
      : null;

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
                    'transition'
                  ? 'Run ' +
                    manifest.name +
                    ' workflows'
                  : action ===
                      'execute'
                    ? 'Execute ' +
                      manifest.name +
                      ' operations'
                    : action ===
                        'approve'
                      ? 'Approve ' +
                        manifest.name +
                        ' workflow decisions'
                      : action ===
                          'close'
                        ? 'Close or post ' +
                          manifest.name +
                          ' business records'
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
            'transition' ||
          action ===
            'execute' ||
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
      isSpecialistEnterpriseModuleKey(
        key,
      )
        ? '2.3.0'
        : manifest.version ===
              '1.0.0' ||
            manifest.version ===
              '2.0.0'
          ? '2.1.0'
          : manifest.version,

    navigation: [
      ...manifest.navigation,
      ...recordTables.map(
        (
          table,
          index,
        ) => ({
          key:
            key +
            '.' +
            table,
          label:
            table
              .replaceAll(
                '_',
                ' ',
              )
              .replace(
                /\b\w/g,
                character =>
                  character.toUpperCase(),
              ),
          href:
            '/apps/' +
            key +
            '/' +
            table,
          iconKey:
            manifest.icon,
          parentKey:
            key +
            '.root',
          actionKey:
            key +
            '.' +
            table +
            '.open',
          order:
            20 +
            index *
              10,
        }),
      ),
      {
        key:
          key +
          '.reports',
        label:
          profile
            ?.reportsLabel ||
          'Reports',
        href:
          '/apps/' +
          key +
          '/reports',
        iconKey:
          'bar-chart',
        parentKey:
          key +
          '.root',
        actionKey:
          key +
          '.report.open',
        order:
          900,
      },
      ...(
        settingsResourceKey
          ? [
              {
                key:
                  key +
                  '.settings',
                label:
                  'Settings',
                href:
                  '/apps/' +
                  key +
                  '/settings',
                iconKey:
                  'settings',
                parentKey:
                  key +
                  '.root',
                actionKey:
                  key +
                  '.settings.open',
                order:
                  950,
              },
            ]
          : []
      ),
    ],

    actions: [
      ...manifest.actions,
      ...recordTables
        .flatMap(
          table => {
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
                  '.open',
                name:
                  'Open ' +
                  table
                    .replaceAll(
                      '_',
                      ' ',
                    ),
                type:
                  'route' as const,
                resourceKey,
                href:
                  '/apps/' +
                  key +
                  '/' +
                  table,
                viewKeys: [
                  key +
                  '.' +
                  table +
                  '.list',
                ],
                target:
                  'current' as const,
              },
              {
                key:
                  key +
                  '.' +
                  table +
                  '.create',
                name:
                  'Create ' +
                  table
                    .replaceAll(
                      '_',
                      ' ',
                    ),
                type:
                  'record' as const,
                resourceKey,
                href:
                  '/apps/' +
                  key +
                  '/' +
                  table,
                viewKeys: [
                  key +
                  '.' +
                  table +
                  '.form',
                ],
                target:
                  'dialog' as const,
              },
            ];
          },
        ),
      ...(
        settingsResourceKey
          ? [
              {
                key:
                  key +
                  '.settings.open',
                name:
                  'Open ' +
                  manifest.name +
                  ' settings',
                type:
                  'route' as const,
                resourceKey:
                  settingsResourceKey,
                href:
                  '/apps/' +
                  key +
                  '/settings',
                viewKeys: [
                  key +
                  '.settings',
                ],
                target:
                  'current' as const,
              },
            ]
          : []
      ),
      {
        key:
          key +
          '.report.open',
        name:
          'Open ' +
          (
            profile
              ?.reportsLabel ||
            manifest.name +
              ' reports'
          ),
        type:
          'report',
        resourceKey:
          'report',
        href:
          '/apps/' +
          key +
          '/reports',
        viewKeys: [
          key +
          '.report',
        ],
        target:
          'current',
      },
    ],

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
      ...recordTables
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
                  key +
                  '/' +
                  table,
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
                  key +
                  '/' +
                  table,
                priority:
                  21 +
                  index *
                    10,
              },
            ];
          },
        ),
      ...(
        settingsResourceKey
          ? [
              {
                key:
                  key +
                  '.settings',
                name:
                  manifest.name +
                  ' settings',
                type:
                  'workspace' as const,
                resourceKey:
                  settingsResourceKey,
                route:
                  '/apps/' +
                  key +
                  '/settings',
                priority:
                  850,
              },
            ]
          : []
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
          key +
          '/reports',
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
      notifications:
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
