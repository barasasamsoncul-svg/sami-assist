import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_quote_saved_views
    DROP CONSTRAINT IF EXISTS sales_quote_saved_views_status_view_check;

  ALTER TABLE public.sales_quote_saved_views
    ADD CONSTRAINT sales_quote_saved_views_status_view_check
    CHECK (status_view IN (
      'all',
      'draft',
      'needs_approval',
      'awaiting_response',
      'accepted',
      'converted',
      'closed_without_sale',
      'expired',
      'expiring_soon'
    ));
`;

export const SALES_3_4_7_TO_3_4_8:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.7-to-3.4.8',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.7',
    toVersion: '3.4.8',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
