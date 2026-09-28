import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSamiAppRuntimeContributions,
  type SamiAppRuntimeContribution,
} from '@/lib/apps/runtime-contract';

import {
  assertValidSamiModuleManifests,
} from '@/lib/modules/validation';

import type {
  SamiModuleManifest,
} from '@/lib/modules/types';


const FUTURE_MODULE:
  SamiModuleManifest = {
    key:
      'future_ops',
    name:
      'Future Operations',
    version:
      '1.0.0',
    description:
      'Synthetic future module used only to prove the frozen SaMi kernel accepts a new app contract.',
    category:
      'operations',
    icon:
      'boxes',
    route:
      'apps/future_ops',

    application:
      true,
    installable:
      true,
    autoInstall:
      false,
    recommended:
      false,

    depends:
      [],
    optionalDepends:
      [],

    schemaPath:
      'lib/apps/future_ops/schema.sql',
    migrationNamespace:
      'future_ops',

    navigation:
      [],
    actions:
      [],
    views:
      [],
    resources: [
      {
        key:
          'record',
        label:
          'Future records',
        table:
          'future_ops_records',
        companyScoped:
          true,
        permissions: {
          read: [
            'future_ops.record.view',
          ],
        },
      },
    ],

    security: {
      permissions: [
        {
          key:
            'future_ops.record.view',
          name:
            'View future records',
          resource:
            'record',
          action:
            'view',
          scope:
            'company',
          defaultSystemRoles: [
            'admin',
            'member',
          ],
        },
      ],
      recordPolicies: [
        {
          key:
            'future_ops.record.company',
          name:
            'Future records in current company',
          resourceKey:
            'record',
          operations: [
            'read',
          ],
          scope:
            'company',
          requiredPermissions: [
            'future_ops.record.view',
          ],
        },
      ],
      fieldPolicies:
        [],
    },

    settings:
      [],

    extensions: {
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
      aiTools:
        true,
      integrationProviders:
        true,
      apiEndpoints:
        true,
      dataExport:
        true,
      dataErasure:
        true,
    },
  };


const FUTURE_CONTRIBUTION:
  SamiAppRuntimeContribution = {
    key:
      'future-ops-runtime',
    moduleKeys: [
      'future_ops',
    ],

    dashboardProviders: [
      {
        moduleKey:
          'future_ops',
        load:
          async () =>
            ({
              cards:
                [],
              sections:
                [],
            }) as never,
      },
    ],

    searchProviders: [
      {
        key:
          'future_ops',
        search:
          async () =>
            [],
      },
    ],

    aiTools: [
      {
        key:
          'future_ops_summary',
        name:
          'Future operations summary',
        description:
          'Read future operations data.',
        moduleKey:
          'future_ops',
        operation:
          'read',
        riskLevel:
          'low',
        confirmationRequired:
          false,
        inputSchema: {
          type:
            'object',
          additionalProperties:
            false,
          properties:
            {},
        },
        execute:
          async () => ({
            ok:
              true,
          }),
      },
    ],

    automationTriggers: [
      {
        key:
          'future_ops.record.created',
        name:
          'Future record created',
        description:
          'Runs when a future record is created.',
        type:
          'event',
        moduleKey:
          'future_ops',
        resourceKey:
          'record',
        requiredPermissions: [
          'future_ops.record.view',
        ],
        companyScoped:
          true,
      },
    ],

    automationActions: [
      {
        key:
          'future_ops.record.inspect',
        name:
          'Inspect future record',
        description:
          'Inspect a future record.',
        moduleKey:
          'future_ops',
        operation:
          'read',
        resourceKey:
          'record',
        requiredPermissions: [
          'future_ops.record.view',
        ],
        approvalPolicy:
          'never',
      },
    ],

    automationActionHandlers:
      new Map([
        [
          'future_ops.record.inspect',
          async () => ({
            ok:
              true,
          }),
        ],
      ]),

    integrationProviders: [
      {
        key:
          'future_ops_partner',
        name:
          'Future Operations Partner',
        description:
          'Synthetic future-module integration.',
        category:
          'other',
        iconKey:
          'plug',
        connectionType:
          'webhook',
        websiteUrl:
          null,
        docsUrl:
          null,
        capabilities: [
          'inbound_webhook',
          'outbound_webhook',
        ],
        moduleKey:
          'future_ops',
      },
    ],

    dataLifecycleHandlers: [
      {
        moduleKey:
          'future_ops',
        exportData:
          async () => ({
            moduleKey:
              'future_ops',
            version:
              '1.0',
            generatedAt:
              new Date(0)
                .toISOString(),
            data:
              {},
          }),
        planErasure:
          async () => ({
            moduleKey:
              'future_ops',
            blockers:
              [],
            recordCounts: {
              future_ops_records:
                0,
            },
          }),
        executeErasure:
          async () => ({
            moduleKey:
              'future_ops',
            erasedRecords:
              0,
            anonymizedRecords:
              0,
            retainedRecords:
              0,
          }),
      },
    ],

    migrations: [
      {
        key:
          'future_ops:1.0.0-to-1.1.0',
        moduleKey:
          'future_ops',
        namespace:
          'future_ops',
        fromVersion:
          '1.0.0',
        toVersion:
          '1.1.0',
        run:
          async () => {},
      },
    ],

    additionalDataTables: {
      future_ops: [
        'future_ops_events',
      ],
    },
  };


test(
  'future module acceptance: a new business app passes the frozen manifest and runtime contribution contracts without kernel edits',
  () => {
    assert.doesNotThrow(
      () =>
        assertValidSamiModuleManifests(
          [
            FUTURE_MODULE,
          ],
        ),
    );

    assert.doesNotThrow(
      () =>
        assertSamiAppRuntimeContributions(
          [
            FUTURE_CONTRIBUTION,
          ],
          [
            FUTURE_MODULE,
          ],
        ),
    );
  },
);


test(
  'future module acceptance: runtime contributions cannot smuggle another module through the shared kernel',
  () => {
    const invalid:
      SamiAppRuntimeContribution = {
        ...FUTURE_CONTRIBUTION,
        searchProviders: [
          {
            key:
              'another_module',
            search:
              async () =>
                [],
          },
        ],
      };

    assert.throws(
      () =>
        assertSamiAppRuntimeContributions(
          [
            invalid,
          ],
          [
            FUTURE_MODULE,
          ],
        ),
      /outside its owned module set/,
    );
  },
);


test(
  'future module acceptance: unsafe app-owned lifecycle tables are rejected at registration',
  () => {
    const invalid:
      SamiAppRuntimeContribution = {
        ...FUTURE_CONTRIBUTION,
        additionalDataTables: {
          future_ops: [
            'future_ops_records; DROP TABLE users',
          ],
        },
      };

    assert.throws(
      () =>
        assertSamiAppRuntimeContributions(
          [
            invalid,
          ],
          [
            FUTURE_MODULE,
          ],
        ),
      /unsafe data table/,
    );
  },
);
