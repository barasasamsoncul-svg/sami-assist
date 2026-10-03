import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';

/**
 * Accounting 2.32 is an integration-depth release.
 *
 * SaMi AI runs/actions and Automation workflows/runs already live in
 * their shared Core schemas, so Accounting must not duplicate those
 * records inside the module database. The migration is intentionally
 * schema-neutral while preserving the sequential module migration ledger.
 */
export const ACCOUNTING_2_31_0_TO_2_32_0:SamiModuleMigrationDefinition={
  key:'accounting-2.31.0-to-2.32.0-automation-ai',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.31.0',
  toVersion:'2.32.0',
  async run(){
    // No Accounting-owned tables are required for this integration release.
  },
};
