import 'server-only';
import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

/** Additive lookup indexes for the company-scoped Barcode scanner. */
export const BARCODE_2_3_0_TO_2_4_0: SamiModuleMigrationDefinition = {
  key: 'barcode-2.3.0-to-2.4.0-company-scoped-scan-workspace',
  moduleKey: 'barcode',
  namespace: 'barcode',
  fromVersion: '2.3.0',
  toVersion: '2.4.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, [
      'CREATE INDEX IF NOT EXISTS idx_barcode_scan_events_company_recent',
      ' ON public.barcode_scan_events(company_id, scanned_at DESC, id DESC)',
      ' WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_barcode_identifiers_company_code_lookup',
      ' ON public.barcode_identifiers(company_id, lower(barcode))',
      " WHERE status = 'active' AND deleted_at IS NULL;",
      'CREATE INDEX IF NOT EXISTS idx_barcode_identifiers_company_entity',
      ' ON public.barcode_identifiers(company_id, entity_type, entity_id)',
      ' WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_barcode_rules_company_active',
      ' ON public.barcode_rules(company_id, status, entity_type)',
      ' WHERE deleted_at IS NULL;',
    ].join('\n'));
  },
};
