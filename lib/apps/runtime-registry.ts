import 'server-only';

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

import {
  ENTERPRISE_MODULE_TABLES,
} from '@/lib/apps/enterprise/catalog';

import {
  ENTERPRISE_MODULE_SEARCH_PROVIDERS,
} from '@/lib/apps/enterprise/search';

import {
  SALES_SEARCH_PROVIDER,
} from '@/lib/apps/sales/search';

import {
  INVOICING_SEARCH_PROVIDER,
} from '@/lib/apps/invoicing/search';

import {
  ENTERPRISE_SUITE_AI_TOOLS,
} from '@/lib/apps/enterprise/ai-tools';

import {
  SALES_AI_TOOLS,
} from '@/lib/apps/sales/ai-tools';

import {
  INVOICING_AI_TOOLS,
} from '@/lib/apps/invoicing/ai-tools';

import {
  ENTERPRISE_AUTOMATION_ACTION_HANDLERS,
  ENTERPRISE_AUTOMATION_ACTIONS,
  ENTERPRISE_AUTOMATION_TRIGGERS,
} from '@/lib/apps/enterprise/automation';

import {
  SALES_AUTOMATION_ACTION_HANDLERS,
  SALES_AUTOMATION_ACTIONS,
  SALES_AUTOMATION_TRIGGERS,
} from '@/lib/apps/sales/automation';

import {
  INVOICING_AUTOMATION_ACTION_HANDLERS,
  INVOICING_AUTOMATION_ACTIONS,
  INVOICING_AUTOMATION_TRIGGERS,
} from '@/lib/apps/invoicing/automation';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

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
  additionalDataTables?: Readonly<
    Record<
      string,
      readonly string[]
    >
  >;
};


const ENTERPRISE_MODULE_KEYS =
  Object.keys(
    ENTERPRISE_MODULE_TABLES,
  );


const DEDICATED_DATA_TABLES = {
  invoicing: [
    'invoicing_payment_terms',
    'invoicing_tax_rates',
    'invoicing_customers',
    'invoicing_catalog_items',
    'invoicing_templates',
    'invoicing_sequences',
    'invoicing_settings',
    'invoicing_invoices',
    'invoicing_invoice_items',
    'invoicing_status_history',
    'invoicing_payments',
    'invoicing_payment_allocations',
    'invoicing_credit_notes',
    'invoicing_credit_note_items',
    'invoicing_recurring_templates',
    'invoicing_reminders',
    'invoicing_delivery_log',
    'invoicing_events',
  ],
  sales: [
    'sales_settings',
    'sales_sequences',
    'sales_quote_templates',
    'sales_quotes',
    'sales_quote_items',
    'sales_orders_v2',
    'sales_order_items_v2',
    'sales_order_invoice_batches',
    'sales_quote_approval_history',
    'sales_quote_status_history',
    'sales_order_status_history',
    'sales_delivery_log',
  ],
} as const;


export const SAMI_APP_RUNTIME_CONTRIBUTIONS:
  readonly SamiAppRuntimeContribution[] = [
    {
      key:
        'enterprise-suite',
      moduleKeys:
        ENTERPRISE_MODULE_KEYS,
      searchProviders:
        ENTERPRISE_MODULE_SEARCH_PROVIDERS,
      aiTools:
        ENTERPRISE_SUITE_AI_TOOLS,
      automationTriggers:
        ENTERPRISE_AUTOMATION_TRIGGERS,
      automationActions:
        ENTERPRISE_AUTOMATION_ACTIONS,
      automationActionHandlers:
        ENTERPRISE_AUTOMATION_ACTION_HANDLERS,
    },
    {
      key:
        'sales',
      moduleKeys: [
        'sales',
      ],
      searchProviders: [
        SALES_SEARCH_PROVIDER,
      ],
      aiTools:
        SALES_AI_TOOLS,
      automationTriggers:
        SALES_AUTOMATION_TRIGGERS,
      automationActions:
        SALES_AUTOMATION_ACTIONS,
      automationActionHandlers:
        SALES_AUTOMATION_ACTION_HANDLERS,
      additionalDataTables: {
        sales:
          DEDICATED_DATA_TABLES
            .sales,
      },
    },
    {
      key:
        'invoicing',
      moduleKeys: [
        'invoicing',
      ],
      searchProviders: [
        INVOICING_SEARCH_PROVIDER,
      ],
      aiTools:
        INVOICING_AI_TOOLS,
      automationTriggers:
        INVOICING_AUTOMATION_TRIGGERS,
      automationActions:
        INVOICING_AUTOMATION_ACTIONS,
      automationActionHandlers:
        INVOICING_AUTOMATION_ACTION_HANDLERS,
      additionalDataTables: {
        invoicing:
          DEDICATED_DATA_TABLES
            .invoicing,
      },
    },
  ];


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
) {
  const manifest =
    getSamiModuleManifest(
      moduleKey,
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


export function assertSamiAppRuntimeRegistry() {
  const contributionKeys =
    new Set<string>();

  const handlerKeys =
    new Set<string>();

  for (
    const contribution
    of SAMI_APP_RUNTIME_CONTRIBUTIONS
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

    for (
      const moduleKey
      of owned
    ) {
      manifestFor(
        moduleKey,
      );
    }

    for (
      const provider
      of contribution.dashboardProviders ||
      []
    ) {
      assertExtension(
        provider.moduleKey,
        'dashboard',
      );
    }

    for (
      const provider
      of contribution.searchProviders ||
      []
    ) {
      assertExtension(
        provider.key,
        'search',
      );
    }

    for (
      const tool
      of contribution.aiTools ||
      []
    ) {
      assertExtension(
        tool.moduleKey,
        'aiTools',
      );
    }

    for (
      const trigger
      of contribution.automationTriggers ||
      []
    ) {
      assertExtension(
        trigger.moduleKey,
        'automationTriggers',
      );
    }

    for (
      const action
      of contribution.automationActions ||
      []
    ) {
      assertExtension(
        action.moduleKey,
        'automationActions',
      );
    }

    for (
      const provider
      of contribution.integrationProviders ||
      []
    ) {
      assertExtension(
        provider.moduleKey,
        'integrationProviders',
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

      if (
        handler.exportData
      ) {
        assertExtension(
          key,
          'dataExport',
        );
      }

      if (
        handler.planErasure ||
        handler.executeErasure
      ) {
        assertExtension(
          key,
          'dataErasure',
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
      manifestFor(
        moduleKey,
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
    }
  }
}


assertSamiAppRuntimeRegistry();


export const APP_RUNTIME_DASHBOARD_PROVIDERS:
  DashboardProvider[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution
            .dashboardProviders ||
          []
        ),
      ],
    );


export const APP_RUNTIME_SEARCH_PROVIDERS:
  WorkspaceSearchProvider[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution
            .searchProviders ||
          []
        ),
      ],
    );


export const APP_RUNTIME_AI_TOOLS:
  SamiAiToolDefinition[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution.aiTools ||
          []
        ),
      ],
    );


export const APP_RUNTIME_AUTOMATION_TRIGGERS:
  SamiAutomationTriggerDefinition[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution
            .automationTriggers ||
          []
        ),
      ],
    );


export const APP_RUNTIME_AUTOMATION_ACTIONS:
  SamiAutomationActionDefinition[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution
            .automationActions ||
          []
        ),
      ],
    );


export const APP_RUNTIME_AUTOMATION_ACTION_HANDLERS =
  new Map<
    string,
    SamiAutomationActionHandler
  >(
    SAMI_APP_RUNTIME_CONTRIBUTIONS
      .flatMap(
        contribution => [
          ...(
            contribution
              .automationActionHandlers
              ?.entries() ||
            []
          ),
        ],
      ),
  );


export const APP_RUNTIME_INTEGRATION_PROVIDERS:
  SamiIntegrationProviderDefinition[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution
            .integrationProviders ||
          []
        ),
      ],
    );


export const APP_RUNTIME_DATA_LIFECYCLE_HANDLERS:
  SamiModuleDataLifecycleHandler[] =
  SAMI_APP_RUNTIME_CONTRIBUTIONS
    .flatMap(
      contribution => [
        ...(
          contribution
            .dataLifecycleHandlers ||
          []
        ),
      ],
    );


export function getAdditionalModuleDataTables(
  moduleKey:
    string,
) {
  const key =
    normalize(
      moduleKey,
    );

  return [
    ...new Set(
      SAMI_APP_RUNTIME_CONTRIBUTIONS
        .flatMap(
          contribution => [
            ...(
              contribution
                .additionalDataTables
                ?.[
                  key
                ] ||
              []
            ),
          ],
        ),
    ),
  ];
}
