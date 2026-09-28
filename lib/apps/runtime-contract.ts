import type {
  DashboardProvider,
} from '@/lib/dashboard/providers';

import type {
  WorkspaceSearchProvider,
} from '@/lib/search/types';

import type {
  SamiAiToolDefinition,
} from '@/lib/ai/types';

import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';

import type {
  SamiIntegrationProviderDefinition,
} from '@/lib/integrations/types';

import type {
  SamiModuleDataLifecycleHandler,
} from '@/lib/data-lifecycle/types';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import type {
  SamiModuleManifest,
} from '@/lib/modules/types';


export type SamiAppRuntimeContribution = {
  key: string;
  moduleKeys: readonly string[];
  dashboardProviders?: readonly DashboardProvider[];
  searchProviders?: readonly WorkspaceSearchProvider[];
  aiTools?: readonly SamiAiToolDefinition[];
  automationTriggers?: readonly SamiAutomationTriggerDefinition[];
  automationActions?: readonly SamiAutomationActionDefinition[];
  automationActionHandlers?: ReadonlyMap<
    string,
    SamiAutomationActionHandler
  >;
  integrationProviders?: readonly SamiIntegrationProviderDefinition[];
  dataLifecycleHandlers?: readonly SamiModuleDataLifecycleHandler[];
  migrations?: readonly SamiModuleMigrationDefinition[];
  additionalDataTables?: Readonly<
    Record<
      string,
      readonly string[]
    >
  >;
};


function normalize(
  value:
    string | null | undefined,
) {
  return (
    value ||
    ''
  )
    .trim()
    .toLowerCase();
}


function manifestFor(
  moduleKey:
    string,
  manifests:
    readonly SamiModuleManifest[],
) {
  const key =
    normalize(
      moduleKey,
    );

  const manifest =
    manifests.find(
      item =>
        normalize(
          item.key,
        ) ===
        key,
    );

  if (
    !manifest
  ) {
    throw new Error(
      `SaMi app runtime contribution references unknown module "${moduleKey}".`,
    );
  }

  return manifest;
}


function assertExtension(
  moduleKey:
    string | null | undefined,
  extension:
    keyof SamiModuleManifest[
      'extensions'
    ],
  manifests:
    readonly SamiModuleManifest[],
) {
  const key =
    normalize(
      moduleKey,
    );

  if (
    !key
  ) {
    return;
  }

  const manifest =
    manifestFor(
      key,
      manifests,
    );

  if (
    manifest.extensions[
      extension
    ] !==
    true
  ) {
    throw new Error(
      `SaMi module "${key}" contributes "${extension}" runtime code without enabling that manifest extension.`,
    );
  }
}


export function assertSamiAppRuntimeContributions(
  contributions:
    readonly SamiAppRuntimeContribution[],
  manifests:
    readonly SamiModuleManifest[],
) {
  const contributionKeys =
    new Set<string>();

  const handlerKeys =
    new Set<string>();

  for (
    const contribution
    of contributions
  ) {
    const contributionKey =
      normalize(
        contribution.key,
      );

    if (
      !contributionKey ||
      contributionKeys.has(
        contributionKey,
      )
    ) {
      throw new Error(
        `Invalid or duplicate SaMi app runtime contribution "${contribution.key}".`,
      );
    }

    contributionKeys.add(
      contributionKey,
    );

    const owned =
      new Set(
        contribution.moduleKeys
          .map(
            normalize,
          )
          .filter(
            Boolean,
          ),
      );

    if (
      owned.size ===
        0
    ) {
      throw new Error(
        `SaMi runtime contribution "${contribution.key}" must own at least one registered module.`,
      );
    }

    for (
      const moduleKey
      of owned
    ) {
      manifestFor(
        moduleKey,
        manifests,
      );
    }

    const assertOwnedModule =
      (
        moduleKey:
          string | null | undefined,
        contributionType:
          string,
      ) => {
        const key =
          normalize(
            moduleKey,
          );

        if (
          !key
        ) {
          return;
        }

        if (
          !owned.has(
            key,
          )
        ) {
          throw new Error(
            `SaMi runtime contribution "${contribution.key}" contributes ${contributionType} for module "${key}" outside its owned module set.`,
          );
        }
      };

    for (
      const provider
      of contribution.dashboardProviders ||
      []
    ) {
      assertOwnedModule(
        provider.moduleKey,
        'dashboard provider',
      );

      assertExtension(
        provider.moduleKey,
        'dashboard',
        manifests,
      );
    }

    for (
      const provider
      of contribution.searchProviders ||
      []
    ) {
      assertOwnedModule(
        provider.key,
        'search provider',
      );

      assertExtension(
        provider.key,
        'search',
        manifests,
      );
    }

    for (
      const tool
      of contribution.aiTools ||
      []
    ) {
      assertOwnedModule(
        tool.moduleKey,
        'AI tool',
      );

      assertExtension(
        tool.moduleKey,
        'aiTools',
        manifests,
      );
    }

    for (
      const trigger
      of contribution.automationTriggers ||
      []
    ) {
      assertOwnedModule(
        trigger.moduleKey,
        'automation trigger',
      );

      assertExtension(
        trigger.moduleKey,
        'automationTriggers',
        manifests,
      );
    }

    for (
      const action
      of contribution.automationActions ||
      []
    ) {
      assertOwnedModule(
        action.moduleKey,
        'automation action',
      );

      assertExtension(
        action.moduleKey,
        'automationActions',
        manifests,
      );
    }

    for (
      const provider
      of contribution.integrationProviders ||
      []
    ) {
      assertOwnedModule(
        provider.moduleKey,
        'integration provider',
      );

      assertExtension(
        provider.moduleKey,
        'integrationProviders',
        manifests,
      );
    }

    for (
      const handler
      of contribution.dataLifecycleHandlers ||
      []
    ) {
      const key =
        normalize(
          handler.moduleKey,
        );

      assertOwnedModule(
        key,
        'data lifecycle handler',
      );

      if (
        handler.exportData
      ) {
        assertExtension(
          key,
          'dataExport',
          manifests,
        );
      }

      if (
        handler.planErasure ||
        handler.executeErasure
      ) {
        assertExtension(
          key,
          'dataErasure',
          manifests,
        );
      }

      if (
        Boolean(
          handler.planErasure,
        ) !==
        Boolean(
          handler.executeErasure,
        )
      ) {
        throw new Error(
          `SaMi module "${key}" must contribute both erasure planning and execution handlers together.`,
        );
      }
    }

    for (
      const [
        moduleKey,
        tables,
      ]
      of Object.entries(
        contribution
          .additionalDataTables ||
        {},
      )
    ) {
      assertOwnedModule(
        moduleKey,
        'additional data tables',
      );

      manifestFor(
        moduleKey,
        manifests,
      );

      for (
        const table
        of tables
      ) {
        if (
          !/^[a-z_][a-z0-9_]*$/.test(
            table,
          )
        ) {
          throw new Error(
            `SaMi module "${moduleKey}" declares unsafe data table "${table}".`,
          );
        }
      }
    }

    for (
      const migration
      of contribution.migrations ||
      []
    ) {
      const key =
        normalize(
          migration.moduleKey,
        );

      const manifest =
        manifestFor(
          key,
          manifests,
        );

      if (
        !owned.has(
          key,
        )
      ) {
        throw new Error(
          `SaMi runtime contribution "${contribution.key}" registered migration "${migration.key}" for module "${key}" outside its owned module set.`,
        );
      }

      if (
        normalize(
          migration.namespace,
        ) !==
        normalize(
          manifest.migrationNamespace,
        )
      ) {
        throw new Error(
          `SaMi migration "${migration.key}" does not match module "${key}" migration namespace.`,
        );
      }
    }

    for (
      const [
        actionKey,
      ]
      of contribution
        .automationActionHandlers ||
      []
    ) {
      const key =
        normalize(
          actionKey,
        );

      if (
        !key ||
        handlerKeys.has(
          key,
        )
      ) {
        throw new Error(
          `Duplicate SaMi automation action handler "${actionKey}".`,
        );
      }

      handlerKeys.add(
        key,
      );

      const action =
        (
          contribution
            .automationActions ||
          []
        )
          .find(
            item =>
              normalize(
                item.key,
              ) ===
              key,
          );

      if (
        !action
      ) {
        throw new Error(
          `SaMi automation handler "${actionKey}" has no matching app-owned action definition.`,
        );
      }
    }
  }
}
