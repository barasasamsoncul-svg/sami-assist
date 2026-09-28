import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';
import path from 'node:path';

const root =
  process.cwd();

async function source(
  file,
) {
  return (
    await readFile(
      path.join(
        root,
        file,
      ),
      'utf8',
    )
  ).replace(
    /\r\n/g,
    '\n',
  );
}

const kernelFiles = [
  'lib/search/registry.ts',
  'lib/ai/tool-registry.ts',
  'lib/automation/registry.ts',
  'lib/integrations/registry.ts',
  'lib/dashboard/providers/index.ts',
  'lib/data-lifecycle/registry.ts',
  'lib/data-lifecycle/suite-export.ts',
  'lib/developer/registry.ts',
  'lib/modules/migrations.ts',
  'lib/services/tenant-provisioning.ts',
];

const directBusinessAppImport =
  /from\s+['"]@\/lib\/apps\/(?:sales|invoicing|enterprise)(?:\/|['"])/;

test(
  'platform closure: kernel registries do not import current business apps directly',
  async () => {
    for (
      const file
      of kernelFiles
    ) {
      const content =
        await source(
          file,
        );

      assert.doesNotMatch(
        content,
        directBusinessAppImport,
        file +
          ' must consume the stable app-runtime or manifest contract instead of importing a current business app.',
      );

      assert.doesNotMatch(
        content,
        /@\/lib\/apps\/runtime-registry/,
        file +
          ' must use its cycle-safe extension-specific app runtime boundary instead of the all-in-one registry.',
      );
    }
  },
);

test(
  'platform closure: one canonical contract governs cycle-safe app contribution boundaries',
  async () => {
    const [
      contract,
      runtime,
      runtimeSearch,
      runtimeAi,
      runtimeAutomation,
      runtimeIntegrations,
      runtimeDashboard,
      runtimeLifecycle,
      runtimeMigrations,
      runtimeTables,
    ] =
      await Promise.all([
        source(
          'lib/apps/runtime-contract.ts',
        ),
        source(
          'lib/apps/runtime-registry.ts',
        ),
        source(
          'lib/apps/runtime-search.ts',
        ),
        source(
          'lib/apps/runtime-ai.ts',
        ),
        source(
          'lib/apps/runtime-automation.ts',
        ),
        source(
          'lib/apps/runtime-integrations.ts',
        ),
        source(
          'lib/apps/runtime-dashboard.ts',
        ),
        source(
          'lib/apps/runtime-lifecycle.ts',
        ),
        source(
          'lib/apps/runtime-migrations.ts',
        ),
        source(
          'lib/apps/runtime-data-tables.ts',
        ),
      ]);

    for (
      const marker
      of [
        'SamiAppRuntimeContribution',
        'moduleKeys',
        'dashboardProviders',
        'searchProviders',
        'aiTools',
        'automationTriggers',
        'automationActions',
        'automationActionHandlers',
        'integrationProviders',
        'dataLifecycleHandlers',
        'migrations',
        'additionalDataTables',
        'assertSamiAppRuntimeContributions',
        'outside its owned module set',
        'manifest.extensions',
        'migrationNamespace',
        'unsafe data table',
      ]
    ) {
      assert.ok(
        contract.includes(
          marker,
        ),
        'Canonical runtime contract must expose ' +
          marker +
          '.',
      );
    }

    assert.match(
      runtime,
      /SAMI_APP_RUNTIME_CONTRIBUTIONS/,
    );

    assert.match(
      runtime,
      /assertSamiAppRuntimeContributions/,
    );

    assert.match(
      runtimeSearch,
      /APP_RUNTIME_SEARCH_PROVIDERS/,
    );

    assert.match(
      runtimeAi,
      /APP_RUNTIME_AI_TOOLS/,
    );

    assert.match(
      runtimeAutomation,
      /APP_RUNTIME_AUTOMATION_TRIGGERS/,
    );

    assert.match(
      runtimeAutomation,
      /APP_RUNTIME_AUTOMATION_ACTIONS/,
    );

    assert.match(
      runtimeAutomation,
      /APP_RUNTIME_AUTOMATION_ACTION_HANDLERS/,
    );

    assert.match(
      runtimeIntegrations,
      /APP_RUNTIME_INTEGRATION_PROVIDERS/,
    );

    assert.match(
      runtimeDashboard,
      /APP_RUNTIME_DASHBOARD_PROVIDERS/,
    );

    assert.match(
      runtimeLifecycle,
      /APP_RUNTIME_DATA_LIFECYCLE_HANDLERS/,
    );

    assert.match(
      runtimeMigrations,
      /APP_RUNTIME_MODULE_MIGRATIONS/,
    );

    assert.match(
      runtimeTables,
      /getAdditionalModuleDataTables/,
    );
  },
);

test(
  'platform closure: kernel subsystems discover app extensions through isolated app-owned boundaries',
  async () => {
    const [
      search,
      ai,
      automation,
      integrations,
      dashboard,
      lifecycle,
      suiteExport,
    ] =
      await Promise.all([
        source(
          'lib/search/registry.ts',
        ),
        source(
          'lib/ai/tool-registry.ts',
        ),
        source(
          'lib/automation/registry.ts',
        ),
        source(
          'lib/integrations/registry.ts',
        ),
        source(
          'lib/dashboard/providers/index.ts',
        ),
        source(
          'lib/data-lifecycle/registry.ts',
        ),
        source(
          'lib/data-lifecycle/suite-export.ts',
        ),
      ]);

    const boundaries = [
      [
        search,
        'runtime-search',
        'APP_RUNTIME_SEARCH_PROVIDERS',
      ],
      [
        ai,
        'runtime-ai',
        'APP_RUNTIME_AI_TOOLS',
      ],
      [
        automation,
        'runtime-automation',
        'APP_RUNTIME_AUTOMATION_TRIGGERS',
      ],
      [
        integrations,
        'runtime-integrations',
        'APP_RUNTIME_INTEGRATION_PROVIDERS',
      ],
      [
        dashboard,
        'runtime-dashboard',
        'APP_RUNTIME_DASHBOARD_PROVIDERS',
      ],
      [
        lifecycle,
        'runtime-lifecycle',
        'APP_RUNTIME_DATA_LIFECYCLE_HANDLERS',
      ],
      [
        suiteExport,
        'runtime-data-tables',
        'getAdditionalModuleDataTables',
      ],
    ];

    for (
      const [
        sourceText,
        boundary,
        symbol,
      ]
      of boundaries
    ) {
      assert.ok(
        sourceText.includes(
          boundary,
        ),
        'Kernel subsystem must import cycle-safe ' +
          boundary +
          '.',
      );

      assert.ok(
        sourceText.includes(
          symbol,
        ),
        'Kernel subsystem must consume ' +
          symbol +
          '.',
      );

      assert.doesNotMatch(
        sourceText,
        /runtime-registry/,
      );
    }

    assert.match(
      ai,
      /filterAccessibleModuleExtensions/,
    );

    assert.match(
      automation,
      /APP_RUNTIME_AUTOMATION_ACTIONS/,
    );

    assert.match(
      automation,
      /APP_RUNTIME_AUTOMATION_ACTION_HANDLERS/,
    );
  },
);

test(
  'platform closure: module migrations are app-owned and kernel-executed',
  async () => {
    const [
      migrations,
      runtime,
      runtimeMigrations,
      safety,
    ] =
      await Promise.all([
        source(
          'lib/modules/migrations.ts',
        ),
        source(
          'lib/apps/runtime-registry.ts',
        ),
        source(
          'lib/apps/runtime-migrations.ts',
        ),
        source(
          'lib/modules/migration-safety.ts',
        ),
      ]);

    assert.match(
      migrations,
      /APP_RUNTIME_MODULE_MIGRATIONS/,
    );

    assert.match(
      migrations,
      /apps\/runtime-migrations/,
      'The migration executor must depend only on the bootstrap-safe app migration contribution registry.',
    );

    assert.match(
      runtimeMigrations,
      /APP_RUNTIME_MODULE_MIGRATIONS/,
    );

    assert.doesNotMatch(
      runtimeMigrations,
      /runtime-registry/,
      'Bootstrap migration discovery must not import the general app runtime registry.',
    );

    assert.doesNotMatch(
      migrations,
      /apps\/(?:sales|invoicing|enterprise)/,
    );

    assert.match(
      runtime,
      /migrations:/,
    );

    assert.match(
      safety,
      /MODULE_MIGRATION_UNSAFE/,
    );

    assert.match(
      safety,
      /DROP\s*\|TRUNCATE|DROP/,
    );
  },
);

test(
  'platform closure: tenant provisioning follows manifest schema and dependency contracts',
  async () => {
    const provisioning =
      await source(
        'lib/services/tenant-provisioning.ts',
      );

    assert.match(
      provisioning,
      /getSamiModuleDependencyPlan/,
    );

    assert.match(
      provisioning,
      /getSamiModuleManifest/,
    );

    assert.match(
      provisioning,
      /manifest\.schemaPath/,
    );

    assert.match(
      provisioning,
      /!manifest\.schemaPath/,
    );

    assert.doesNotMatch(
      provisioning,
      /'lib',[\s\S]{0,120}'apps',[\s\S]{0,120}normalizedAppKey[\s\S]{0,120}'schema\.sql'/,
      'Provisioning must not construct business-app schema paths by naming convention.',
    );
  },
);

test(
  'platform closure: manifest validation fails fast before tenant installation',
  async () => {
    const validation =
      await source(
        'lib/modules/validation.ts',
      );

    for (
      const contract
      of [
        'MODULE_KEY_PATTERN',
        'VERSION_PATTERN',
        'MIGRATION_NAMESPACE_PATTERN',
        'isSafeModuleRoute',
        'isSafeSchemaPath',
        'optionalDepends',
        'dependency cycle detected',
      ]
    ) {
      assert.ok(
        validation.includes(
          contract,
        ),
        'Manifest validation must enforce ' +
          contract +
          '.',
      );
    }
  },
);

test(
  'platform closure: developer API and exports derive business resources from manifests',
  async () => {
    const [
      developerRegistry,
      developerRuntime,
      lifecycle,
    ] =
      await Promise.all([
        source(
          'lib/developer/registry.ts',
        ),
        source(
          'lib/apps/enterprise/developer.ts',
        ),
        source(
          'lib/data-lifecycle/suite-export.ts',
        ),
      ]);

    assert.match(
      developerRegistry,
      /manifest\.resources/,
    );

    assert.doesNotMatch(
      developerRegistry,
      /isEnterpriseModuleKey/,
    );

    assert.match(
      developerRuntime,
      /manifest[\s\S]*resources/,
    );

    assert.doesNotMatch(
      developerRuntime,
      /enterpriseModuleTables|isEnterpriseModuleKey/,
    );

    assert.match(
      lifecycle,
      /getSamiModuleManifests/,
    );

    assert.match(
      lifecycle,
      /manifest\.resources/,
    );

    assert.match(
      lifecycle,
      /getAdditionalModuleDataTables/,
    );

    assert.doesNotMatch(
      lifecycle,
      /ENTERPRISE_MODULE_TABLES|DEDICATED_EXPORT_TABLES/,
    );
  },
);

test(
  'platform closure: data erasure is a stable fail-closed module contract',
  async () => {
    const [
      types,
      registry,
    ] =
      await Promise.all([
        source(
          'lib/data-lifecycle/types.ts',
        ),
        source(
          'lib/data-lifecycle/registry.ts',
        ),
      ]);

    assert.match(
      types,
      /planErasure/,
    );

    assert.match(
      types,
      /executeErasure/,
    );

    assert.match(
      registry,
      /getAccessibleModuleDataErasureHandlers/,
    );

    assert.match(
      registry,
      /enables data erasure without plan and execute handlers/,
    );
  },
);

test(
  'platform closure: notifications and activity remain extension-gated generic services',
  async () => {
    const [
      notifications,
      activity,
    ] =
      await Promise.all([
        source(
          'lib/services/workspace-notifications.ts',
        ),
        source(
          'lib/services/workspace-activity.ts',
        ),
      ]);

    assert.match(
      notifications,
      /assertRegisteredSamiModuleExtension/,
    );

    assert.match(
      notifications,
      /'notifications'/,
    );

    assert.match(
      activity,
      /assertRegisteredSamiModuleExtension/,
    );

    assert.match(
      activity,
      /'activity'/,
    );
  },
);

test(
  'platform closure: backup recovery billing usage and readiness remain module agnostic',
  async () => {
    const [
      recovery,
      backupProvider,
      billing,
      usage,
      readiness,
    ] =
      await Promise.all([
        source(
          'lib/services/tenant-recovery.ts',
        ),
        source(
          'lib/services/tenant-backup-provider.ts',
        ),
        source(
          'lib/billing/plan-policy.ts',
        ),
        source(
          'lib/usage/entitlements.ts',
        ),
        source(
          'scripts/check-production-readiness.ts',
        ),
      ]);

    assert.match(
      recovery,
      /getTenantBackupProvider/,
    );

    assert.doesNotMatch(
      recovery,
      /@\/lib\/apps\//,
    );

    assert.match(
      backupProvider,
      /TenantBackupProvider/,
    );

    assert.doesNotMatch(
      billing,
      /@\/lib\/apps\//,
    );

    assert.doesNotMatch(
      usage,
      /@\/lib\/apps\//,
    );

    assert.match(
      readiness,
      /getSamiModuleManifest/,
    );

    assert.match(
      readiness,
      /moduleDrift/,
    );
  },
);

test(
  'platform closure: first-party frontend ownership remains physically standalone',
  async () => {
    const appUi =
      await source(
        'tests/app-surfaces-ui.test.ts',
      );

    assert.match(
      appUi,
      /all 78 enterprise business apps own dedicated frontend route trees/,
    );

    assert.match(
      appUi,
      /must not depend on the dynamic route as its frontend owner/,
    );
  },
);
