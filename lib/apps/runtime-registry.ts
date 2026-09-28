import 'server-only';

import {
  ENTERPRISE_MODULE_TABLES,
} from '@/lib/apps/enterprise/catalog';

import {
  APP_RUNTIME_ADDITIONAL_DATA_TABLES,
  getAdditionalModuleDataTables,
} from '@/lib/apps/runtime-data-tables';

import {
  ENTERPRISE_RUNTIME_MIGRATIONS,
  INVOICING_RUNTIME_MIGRATIONS,
  SALES_RUNTIME_MIGRATIONS,
} from '@/lib/apps/runtime-migrations';

import {
  assertSamiAppRuntimeContributions,
} from '@/lib/apps/runtime-contract';

import type {
  SamiAppRuntimeContribution,
} from '@/lib/apps/runtime-contract';

import {
  getSamiModuleManifests,
} from '@/lib/modules/registry';


/*
 * Lightweight app-runtime index.
 *
 * Executable Search/AI/Automation/Integration/Dashboard/Lifecycle providers
 * are loaded through their cycle-safe extension-specific runtime files.
 * This index owns cross-cutting metadata and validates the common contribution
 * contract without eagerly initializing those executable subsystems.
 */

const ENTERPRISE_MODULE_KEYS =
  Object.keys(
    ENTERPRISE_MODULE_TABLES,
  );


export const SAMI_APP_RUNTIME_CONTRIBUTIONS:
  readonly SamiAppRuntimeContribution[] = [
    {
      key:
        'enterprise-suite',
      moduleKeys:
        ENTERPRISE_MODULE_KEYS,
      migrations:
        ENTERPRISE_RUNTIME_MIGRATIONS,
    },
    {
      key:
        'sales',
      moduleKeys: [
        'sales',
      ],
      migrations:
        SALES_RUNTIME_MIGRATIONS,
      additionalDataTables: {
        sales:
          APP_RUNTIME_ADDITIONAL_DATA_TABLES
            .sales ||
          [],
      },
    },
    {
      key:
        'invoicing',
      moduleKeys: [
        'invoicing',
      ],
      migrations:
        INVOICING_RUNTIME_MIGRATIONS,
      additionalDataTables: {
        invoicing:
          APP_RUNTIME_ADDITIONAL_DATA_TABLES
            .invoicing ||
          [],
      },
    },
  ];


export function assertSamiAppRuntimeRegistry() {
  assertSamiAppRuntimeContributions(
    SAMI_APP_RUNTIME_CONTRIBUTIONS,
    getSamiModuleManifests(),
  );
}


assertSamiAppRuntimeRegistry();


export {
  assertSamiAppRuntimeContributions,
  getAdditionalModuleDataTables,
};

export type {
  SamiAppRuntimeContribution,
};
