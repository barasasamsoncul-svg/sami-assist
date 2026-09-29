import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_recurring_templates
    ADD COLUMN IF NOT EXISTS max_occurrences INTEGER,
    ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_retry_attempts INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(120),
    ADD COLUMN IF NOT EXISTS last_error_message TEXT,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paused_by UUID,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID,
    ADD COLUMN IF NOT EXISTS completion_reason VARCHAR(120);

  ALTER TABLE public.invoicing_recurring_templates
    DROP CONSTRAINT IF EXISTS invoicing_recurring_templates_max_occurrences_check,
    DROP CONSTRAINT IF EXISTS invoicing_recurring_templates_run_count_check,
    DROP CONSTRAINT IF EXISTS invoicing_recurring_templates_consecutive_failures_check,
    DROP CONSTRAINT IF EXISTS invoicing_recurring_templates_max_retry_attempts_check;

  ALTER TABLE public.invoicing_recurring_templates
    ADD CONSTRAINT invoicing_recurring_templates_max_occurrences_check
      CHECK (max_occurrences IS NULL OR max_occurrences > 0),
    ADD CONSTRAINT invoicing_recurring_templates_run_count_check
      CHECK (run_count >= 0),
    ADD CONSTRAINT invoicing_recurring_templates_consecutive_failures_check
      CHECK (consecutive_failures >= 0),
    ADD CONSTRAINT invoicing_recurring_templates_max_retry_attempts_check
      CHECK (max_retry_attempts BETWEEN 1 AND 20);

  UPDATE public.invoicing_recurring_templates r
  SET
    run_count = GREATEST(
      COALESCE(r.run_count, 0),
      (
        SELECT COUNT(*)::int
        FROM public.invoicing_invoices i
        WHERE i.company_id = r.company_id
          AND i.deleted_at IS NULL
          AND i.metadata ->> 'recurringTemplateId' = r.id::text
      )
    ),
    last_success_at = COALESCE(r.last_success_at, r.last_run_at);

  CREATE TABLE IF NOT EXISTS public.invoicing_recurring_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    recurring_template_id UUID NOT NULL REFERENCES public.invoicing_recurring_templates(id) ON DELETE CASCADE,
    scheduled_for DATE NOT NULL,
    run_key VARCHAR(180) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'failed'
      CHECK (status IN ('processing','succeeded','failed','skipped')),
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'not_requested'
      CHECK (delivery_status IN ('not_requested','pending','sent','failed')),
    delivery_error_code VARCHAR(120),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_code VARCHAR(120),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recurring_template_id, scheduled_for),
    UNIQUE(company_id, run_key)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_recurring_runs_schedule
    ON public.invoicing_recurring_runs(
      recurring_template_id,
      scheduled_for DESC,
      created_at DESC
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_recurring_runs_company_status
    ON public.invoicing_recurring_runs(
      company_id,
      status,
      last_attempt_at DESC
    );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_recurring_generated_invoice
    ON public.invoicing_invoices(
      company_id,
      (metadata ->> 'recurringRunKey')
    )
    WHERE deleted_at IS NULL
      AND metadata ? 'recurringRunKey';
`;


export const INVOICING_2_6_0_TO_2_7_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.6.0-to-2.7.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.6.0',
    toVersion:
      '2.7.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
