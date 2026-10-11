import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS opportunity_id UUID;

  DO $sales_opportunity_quote_link$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.sales_quotes'::regclass
        AND conname = 'sales_quotes_opportunity_id_fkey'
    ) THEN
      ALTER TABLE public.sales_quotes
        ADD CONSTRAINT sales_quotes_opportunity_id_fkey
        FOREIGN KEY (opportunity_id)
        REFERENCES public.sales_opportunities(id)
        ON DELETE SET NULL;
    END IF;
  END;
  $sales_opportunity_quote_link$;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_opportunity
    ON public.sales_quotes(company_id, opportunity_id, created_at DESC)
    WHERE opportunity_id IS NOT NULL
      AND deleted_at IS NULL;
`;

export const SALES_3_4_4_TO_3_4_5:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.4-to-3.4.5',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.4',
    toVersion: '3.4.5',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };