import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';

/**
 * Invoicing 2.22 reuses the shared encrypted Integrations runtime and existing
 * payment tables. No Invoicing-owned schema expansion is required.
 */
export const INVOICING_2_21_0_TO_2_22_0:SamiModuleMigrationDefinition={
  key:'invoicing-2.21.0-to-2.22.0-payment-integrations',
  moduleKey:'invoicing',
  namespace:'invoicing',
  fromVersion:'2.21.0',
  toVersion:'2.22.0',
  async run(){
    // Integration provider metadata and signed webhook evidence remain Core-owned.
  },
};
