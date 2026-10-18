import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';

const SQL = `
  -- Quote-level pipeline columns were never wired into quote authoring or
  -- status transitions. The Sales pipeline remains opportunity-based.
  DROP INDEX IF EXISTS public.idx_sales_quotes_stage;
  DROP INDEX IF EXISTS public.idx_sales_quotes_expected_close;
  DROP TABLE IF EXISTS public.sales_quote_stage_history;
  ALTER TABLE public.sales_quotes DROP COLUMN IF EXISTS last_stage_change_at;
  ALTER TABLE public.sales_quotes DROP COLUMN IF EXISTS stage_entered_at;
  ALTER TABLE public.sales_quotes DROP COLUMN IF EXISTS probability_override;
  ALTER TABLE public.sales_quotes DROP COLUMN IF EXISTS expected_close_date;
  ALTER TABLE public.sales_quotes DROP COLUMN IF EXISTS stage_id;
`;

export const SALES_3_4_20_TO_3_4_21: SamiModuleMigrationDefinition = {
  key: 'sales-3.4.20-to-3.4.21',
  moduleKey: 'sales',
  namespace: 'sales',
  fromVersion: '3.4.20',
  toVersion: '3.4.21',
  run: async client => {
    // Intentionally destructive, product-approved removal of the dormant
    // quote-level pipeline. Do not weaken the default additive migration guard.
    await client.query(SQL);
  },
};
