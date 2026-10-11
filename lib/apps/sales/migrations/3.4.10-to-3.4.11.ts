import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

/*
 * Repair quote-pipeline schema drift on upgraded tenants.
 *
 * Sales 3.4.1 introduced these columns, but tenants whose module version
 * was already advanced can otherwise skip that migration even if the
 * physical schema is incomplete. Keep this forward migration idempotent.
 */
const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS stage_id UUID
      REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS expected_close_date DATE;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS probability_override NUMERIC(5,2)
      CHECK (
        probability_override IS NULL
        OR (probability_override >= 0 AND probability_override <= 100)
      );

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS last_stage_change_at TIMESTAMPTZ;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_stage
    ON public.sales_quotes(company_id, stage_id, quote_date DESC)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_expected_close
    ON public.sales_quotes(company_id, expected_close_date)
    WHERE deleted_at IS NULL AND expected_close_date IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.sales_quote_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
    from_probability NUMERIC(5,2),
    to_probability NUMERIC(5,2),
    reason TEXT,
    changed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_stage_history_quote
    ON public.sales_quote_stage_history(company_id, quote_id, created_at DESC);

  UPDATE public.sales_quotes quote
  SET
    stage_id = stage.id,
    stage_entered_at = COALESCE(quote.stage_entered_at, quote.updated_at, quote.created_at),
    last_stage_change_at = COALESCE(quote.last_stage_change_at, quote.updated_at, quote.created_at)
  FROM public.sales_pipeline_stages stage
  WHERE quote.stage_id IS NULL
    AND stage.company_id = quote.company_id
    AND stage.deleted_at IS NULL
    AND LOWER(BTRIM(stage.code)) = LOWER(BTRIM(quote.status));
`;

export const SALES_3_4_10_TO_3_4_11:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.10-to-3.4.11',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.10',
    toVersion: '3.4.11',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
