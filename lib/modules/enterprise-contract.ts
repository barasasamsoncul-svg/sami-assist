import type {
  SamiModuleManifest,
} from '@/lib/modules/types';


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
          '.records',
        name:
          manifest.name +
          ' records',
        type:
          'list',
        resourceKey:
          'record',
        route:
          '/apps/' +
          key,
        priority:
          20,
      },
      {
        key:
          key +
          '.report',
        name:
          manifest.name +
          ' report',
        type:
          'dashboard',
        resourceKey:
          'report',
        route:
          '/apps/' +
          key,
        priority:
          30,
      },
    ],

    resources: [
      {
        key:
          'record',
        label:
          manifest.name +
          ' record',
        table:
          null,
        companyScoped:
          true,
        permissions: {
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
      },
      {
        key:
          'report',
        label:
          manifest.name +
          ' report',
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
      {
        key:
          'settings',
        label:
          manifest.name +
          ' settings',
        table:
          null,
        companyScoped:
          true,
        permissions: {
          read: [
            key +
            '.record.view',
          ],
          write: [
            key +
            '.record.settings',
          ],
        },
      },
    ],

    security: {
      permissions,

      recordPolicies: [
        {
          key:
            key +
            '.record.company',
          name:
            manifest.name +
            ' records in current company',
          resourceKey:
            'record',
          operations: [
            'read',
            'create',
            'write',
            'delete',
          ],
          scope:
            'company',
        },
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
        {
          key:
            key +
            '.settings.company',
          name:
            manifest.name +
            ' settings in current company',
          resourceKey:
            'settings',
          operations: [
            'read',
            'write',
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
      apiEndpoints:
        true,
      dataExport:
        true,
    },
  };
}
