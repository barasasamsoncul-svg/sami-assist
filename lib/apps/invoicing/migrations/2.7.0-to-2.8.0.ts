import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_dunning_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_dunning_policy_name
    ON public.invoicing_dunning_policies(company_id, LOWER(name))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_dunning_default
    ON public.invoicing_dunning_policies(company_id)
    WHERE is_default = TRUE
      AND is_active = TRUE
      AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_dunning_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES public.invoicing_dunning_policies(id) ON DELETE CASCADE,
    stage_key VARCHAR(120) NOT NULL,
    name VARCHAR(180) NOT NULL,
    sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
    offset_days INTEGER NOT NULL CHECK (offset_days BETWEEN -365 AND 3650),
    severity VARCHAR(20) NOT NULL DEFAULT 'friendly'
      CHECK (severity IN ('friendly','firm','final')),
    channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
    auto_send BOOLEAN NOT NULL DEFAULT TRUE,
    retry_limit INTEGER NOT NULL DEFAULT 3 CHECK (retry_limit BETWEEN 1 AND 20),
    retry_delay_minutes INTEGER NOT NULL DEFAULT 60 CHECK (retry_delay_minutes BETWEEN 5 AND 10080),
    subject_template VARCHAR(255),
    message_template TEXT,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(policy_id, stage_key),
    UNIQUE(policy_id, sequence_no)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_dunning_stages_due
    ON public.invoicing_dunning_stages(policy_id, offset_days, sequence_no)
    WHERE auto_send = TRUE
      AND deleted_at IS NULL;

  ALTER TABLE public.invoicing_customers
    ADD COLUMN IF NOT EXISTS reminder_mode VARCHAR(20) NOT NULL DEFAULT 'inherit',
    ADD COLUMN IF NOT EXISTS reminder_pause_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reminder_pause_reason TEXT;

  ALTER TABLE public.invoicing_customers
    DROP CONSTRAINT IF EXISTS invoicing_customers_reminder_mode_check;

  ALTER TABLE public.invoicing_customers
    ADD CONSTRAINT invoicing_customers_reminder_mode_check
      CHECK (reminder_mode IN ('inherit','enabled','paused','disabled'));

  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS reminder_mode VARCHAR(20) NOT NULL DEFAULT 'inherit',
    ADD COLUMN IF NOT EXISTS reminder_pause_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reminder_pause_reason TEXT;

  ALTER TABLE public.invoicing_invoices
    DROP CONSTRAINT IF EXISTS invoicing_invoices_reminder_mode_check;

  ALTER TABLE public.invoicing_invoices
    ADD CONSTRAINT invoicing_invoices_reminder_mode_check
      CHECK (reminder_mode IN ('inherit','enabled','paused','disabled'));

  ALTER TABLE public.invoicing_reminders
    ADD COLUMN IF NOT EXISTS dunning_policy_id UUID REFERENCES public.invoicing_dunning_policies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dunning_stage_id UUID REFERENCES public.invoicing_dunning_stages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'worker',
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sent_by UUID,
    ADD COLUMN IF NOT EXISTS failure_message TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  ALTER TABLE public.invoicing_reminders
    DROP CONSTRAINT IF EXISTS invoicing_reminders_status_check,
    DROP CONSTRAINT IF EXISTS invoicing_reminders_source_check,
    DROP CONSTRAINT IF EXISTS invoicing_reminders_attempt_count_check,
    DROP CONSTRAINT IF EXISTS invoicing_reminders_max_attempts_check;

  ALTER TABLE public.invoicing_reminders
    ADD CONSTRAINT invoicing_reminders_status_check
      CHECK (status IN ('scheduled','sending','sent','failed','cancelled','suppressed')),
    ADD CONSTRAINT invoicing_reminders_source_check
      CHECK (source IN ('worker','manual','retry')),
    ADD CONSTRAINT invoicing_reminders_attempt_count_check
      CHECK (attempt_count >= 0),
    ADD CONSTRAINT invoicing_reminders_max_attempts_check
      CHECK (max_attempts BETWEEN 1 AND 20);

  CREATE INDEX IF NOT EXISTS idx_invoicing_reminders_retry
    ON public.invoicing_reminders(company_id, next_attempt_at)
    WHERE status IN ('scheduled','failed');

  CREATE INDEX IF NOT EXISTS idx_invoicing_reminders_invoice_history
    ON public.invoicing_reminders(invoice_id, created_at DESC);

  INSERT INTO public.invoicing_dunning_policies (
    company_id,
    name,
    is_default,
    is_active,
    created_by,
    updated_by,
    metadata
  )
  SELECT
    s.company_id,
    'Standard payment follow-up',
    TRUE,
    TRUE,
    s.updated_by,
    s.updated_by,
    jsonb_build_object(
      'migratedFromLegacyReminderSettings',
      TRUE
    )
  FROM public.invoicing_settings s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.invoicing_dunning_policies p
    WHERE p.company_id = s.company_id
      AND p.is_default = TRUE
      AND p.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.invoicing_dunning_stages (
    company_id,
    policy_id,
    stage_key,
    name,
    sequence_no,
    offset_days,
    severity,
    channels,
    auto_send,
    retry_limit,
    retry_delay_minutes,
    created_by,
    updated_by
  )
  SELECT
    s.company_id,
    p.id,
    'before_due_' || s.reminder_days_before::text,
    CASE
      WHEN s.reminder_days_before = 0
      THEN 'Due today'
      ELSE s.reminder_days_before::text || ' days before due'
    END,
    1,
    -s.reminder_days_before,
    'friendly',
    s.reminder_channels,
    s.reminder_enabled,
    3,
    60,
    s.updated_by,
    s.updated_by
  FROM public.invoicing_settings s
  JOIN public.invoicing_dunning_policies p
    ON p.company_id = s.company_id
   AND p.is_default = TRUE
   AND p.deleted_at IS NULL
  ON CONFLICT (policy_id, stage_key) DO NOTHING;

  INSERT INTO public.invoicing_dunning_stages (
    company_id,
    policy_id,
    stage_key,
    name,
    sequence_no,
    offset_days,
    severity,
    channels,
    auto_send,
    retry_limit,
    retry_delay_minutes,
    created_by,
    updated_by
  )
  SELECT
    s.company_id,
    p.id,
    'overdue_' || overdue.day_value::text,
    overdue.day_value::text || ' days overdue',
    overdue.ordinality::int + 1,
    overdue.day_value,
    CASE
      WHEN overdue.ordinality >= 3 THEN 'final'
      WHEN overdue.ordinality = 2 THEN 'firm'
      ELSE 'friendly'
    END,
    s.reminder_channels,
    s.reminder_enabled,
    3,
    60,
    s.updated_by,
    s.updated_by
  FROM public.invoicing_settings s
  JOIN public.invoicing_dunning_policies p
    ON p.company_id = s.company_id
   AND p.is_default = TRUE
   AND p.deleted_at IS NULL
  CROSS JOIN LATERAL
    unnest(s.reminder_days_after)
    WITH ORDINALITY
      AS overdue(day_value, ordinality)
  ON CONFLICT (policy_id, stage_key) DO NOTHING;
`;


export const INVOICING_2_7_0_TO_2_8_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.7.0-to-2.8.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.7.0',
    toVersion:
      '2.8.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
