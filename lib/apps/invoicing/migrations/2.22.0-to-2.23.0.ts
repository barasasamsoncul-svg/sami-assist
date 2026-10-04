import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

/*
 * Invoicing 2.23 is intentionally schema-neutral.
 *
 * Provider refund attempts reuse integration_events. The existing financial
 * refund tables remain authoritative only after provider-confirmed settlement.
 */
export const INVOICING_2_22_0_TO_2_23_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.22.0-to-2.23.0-provider-refunds',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.22.0',
    toVersion:
      '2.23.0',
    run:
      async () => {},
  };
