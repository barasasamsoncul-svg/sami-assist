import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.accounting_bank_statement_lines
    ADD COLUMN IF NOT EXISTS excluded_reason TEXT,
    ADD COLUMN IF NOT EXISTS excluded_by UUID,
    ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;

  ALTER TABLE public.accounting_reconciliation_rules
    ADD COLUMN IF NOT EXISTS bank_account_id UUID
      REFERENCES public.accounting_bank_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS match_field VARCHAR(30) NOT NULL DEFAULT 'any',
    ADD COLUMN IF NOT EXISTS match_operator VARCHAR(30) NOT NULL DEFAULT 'contains',
    ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'any',
    ADD COLUMN IF NOT EXISTS days_tolerance INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS amount_tolerance NUMERIC(19,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS description_template VARCHAR(500);

  ALTER TABLE public.accounting_reconciliation_rules
    DROP CONSTRAINT IF EXISTS accounting_reconciliation_rules_match_field_check,
    DROP CONSTRAINT IF EXISTS accounting_reconciliation_rules_match_operator_check,
    DROP CONSTRAINT IF EXISTS accounting_reconciliation_rules_direction_check,
    DROP CONSTRAINT IF EXISTS accounting_reconciliation_rules_days_tolerance_check,
    DROP CONSTRAINT IF EXISTS accounting_reconciliation_rules_amount_tolerance_check;

  ALTER TABLE public.accounting_reconciliation_rules
    ADD CONSTRAINT accounting_reconciliation_rules_match_field_check
      CHECK (match_field IN ('any','description','reference','counterparty')) NOT VALID,
    ADD CONSTRAINT accounting_reconciliation_rules_match_operator_check
      CHECK (match_operator IN ('contains','equals','starts_with')) NOT VALID,
    ADD CONSTRAINT accounting_reconciliation_rules_direction_check
      CHECK (direction IN ('any','inflow','outflow')) NOT VALID,
    ADD CONSTRAINT accounting_reconciliation_rules_days_tolerance_check
      CHECK (days_tolerance >= 0 AND days_tolerance <= 365) NOT VALID,
    ADD CONSTRAINT accounting_reconciliation_rules_amount_tolerance_check
      CHECK (amount_tolerance >= 0) NOT VALID;

  CREATE TABLE IF NOT EXISTS public.accounting_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    reconciliation_number VARCHAR(100) NOT NULL,
    bank_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
    statement_line_id UUID NOT NULL
      REFERENCES public.accounting_bank_statement_lines(id) ON DELETE RESTRICT,
    reconciliation_date DATE NOT NULL,
    method VARCHAR(30) NOT NULL,
    rule_id UUID REFERENCES public.accounting_reconciliation_rules(id) ON DELETE SET NULL,
    statement_amount NUMERIC(19,2) NOT NULL,
    matched_amount NUMERIC(19,2) NOT NULL,
    difference_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'matched',
    adjustment_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    notes TEXT,
    reconciled_by UUID,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (method IN ('manual','suggestion','split','rule','adjustment')),
    CHECK (status IN ('matched','reversed')),
    CHECK (matched_amount <> 0)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_reconciliation_number
    ON public.accounting_reconciliations(company_id,reconciliation_number)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_active_statement_reconciliation
    ON public.accounting_reconciliations(company_id,statement_line_id)
    WHERE deleted_at IS NULL AND status='matched';

  CREATE INDEX IF NOT EXISTS idx_accounting_reconciliations_account_date
    ON public.accounting_reconciliations(
      company_id,
      bank_account_id,
      reconciliation_date DESC,
      created_at DESC
    )
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    reconciliation_id UUID NOT NULL
      REFERENCES public.accounting_reconciliations(id) ON DELETE CASCADE,
    journal_line_id UUID NOT NULL REFERENCES public.journal_lines(id) ON DELETE RESTRICT,
    match_amount NUMERIC(19,2) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (match_amount <> 0),
    CHECK (sequence >= 0)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_reconciliation_match_line
    ON public.accounting_reconciliation_matches(
      company_id,
      reconciliation_id,
      journal_line_id
    )
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_matches_journal
    ON public.accounting_reconciliation_matches(company_id,journal_line_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    statement_line_id UUID NOT NULL
      REFERENCES public.accounting_bank_statement_lines(id) ON DELETE CASCADE,
    suggestion_type VARCHAR(20) NOT NULL,
    journal_line_id UUID REFERENCES public.journal_lines(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.accounting_reconciliation_rules(id) ON DELETE CASCADE,
    confidence SMALLINT NOT NULL,
    suggested_amount NUMERIC(19,2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID,
    dismissed_at TIMESTAMPTZ,
    dismissed_by UUID,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (suggestion_type IN ('existing','rule')),
    CHECK (confidence >= 0 AND confidence <= 100),
    CHECK (suggested_amount <> 0),
    CHECK (status IN ('pending','accepted','dismissed','stale')),
    CHECK (
      (suggestion_type='existing' AND journal_line_id IS NOT NULL)
      OR
      (suggestion_type='rule' AND rule_id IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_suggestions_line
    ON public.accounting_reconciliation_suggestions(
      company_id,
      statement_line_id,
      status,
      confidence DESC
    )
    WHERE deleted_at IS NULL;

  INSERT INTO public.accounting_reconciliations (
    company_id,
    reconciliation_number,
    bank_account_id,
    statement_line_id,
    reconciliation_date,
    method,
    statement_amount,
    matched_amount,
    difference_amount,
    status,
    reconciled_by,
    reconciled_at,
    created_by,
    updated_by
  )
  SELECT
    s.company_id,
    'LEGACY-' || UPPER(SUBSTRING(s.id::text,1,8)),
    s.bank_account_id,
    s.id,
    s.transaction_date,
    'manual',
    s.amount::numeric(19,2),
    (l.debit-l.credit)::numeric(19,2),
    (s.amount-(l.debit-l.credit))::numeric(19,2),
    'matched',
    COALESCE(s.updated_by,s.created_by),
    COALESCE(s.updated_at,s.created_at,NOW()),
    COALESCE(s.created_by,s.updated_by),
    COALESCE(s.updated_by,s.created_by)
  FROM public.accounting_bank_statement_lines s
  JOIN public.journal_lines l
    ON l.company_id=s.company_id
   AND l.id=s.matched_journal_line_id
   AND l.deleted_at IS NULL
  WHERE s.deleted_at IS NULL
    AND s.reconciliation_status='matched'
    AND s.matched_journal_line_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.accounting_reconciliations r
      WHERE r.company_id=s.company_id
        AND r.statement_line_id=s.id
        AND r.deleted_at IS NULL
        AND r.status='matched'
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.accounting_reconciliation_matches (
    company_id,
    reconciliation_id,
    journal_line_id,
    match_amount,
    sequence,
    created_by,
    updated_by
  )
  SELECT
    r.company_id,
    r.id,
    s.matched_journal_line_id,
    (l.debit-l.credit)::numeric(19,2),
    10,
    COALESCE(s.created_by,s.updated_by),
    COALESCE(s.updated_by,s.created_by)
  FROM public.accounting_reconciliations r
  JOIN public.accounting_bank_statement_lines s
    ON s.company_id=r.company_id
   AND s.id=r.statement_line_id
   AND s.deleted_at IS NULL
  JOIN public.journal_lines l
    ON l.company_id=s.company_id
   AND l.id=s.matched_journal_line_id
   AND l.deleted_at IS NULL
  WHERE r.deleted_at IS NULL
    AND r.status='matched'
    AND r.reconciliation_number LIKE 'LEGACY-%'
    AND s.matched_journal_line_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.accounting_reconciliation_matches m
      WHERE m.company_id=r.company_id
        AND m.reconciliation_id=r.id
        AND m.journal_line_id=s.matched_journal_line_id
        AND m.deleted_at IS NULL
    )
  ON CONFLICT DO NOTHING;

  CREATE OR REPLACE VIEW public.accounting_reconciliation_journal_availability AS
  SELECT
    l.company_id,
    l.id AS journal_line_id,
    l.journal_id,
    l.account_id,
    j.journal_number,
    j.journal_date,
    j.reference,
    j.description AS journal_description,
    l.description AS line_description,
    (l.debit-l.credit)::numeric(19,2) AS journal_amount,
    COALESCE(
      SUM(m.match_amount) FILTER (
        WHERE r.status='matched'
          AND r.deleted_at IS NULL
          AND m.deleted_at IS NULL
      ),
      0
    )::numeric(19,2) AS reconciled_amount,
    (
      (l.debit-l.credit) -
      COALESCE(
        SUM(m.match_amount) FILTER (
          WHERE r.status='matched'
            AND r.deleted_at IS NULL
            AND m.deleted_at IS NULL
        ),
        0
      )
    )::numeric(19,2) AS remaining_amount
  FROM public.journal_lines l
  JOIN public.journals j
    ON j.company_id=l.company_id
   AND j.id=l.journal_id
   AND j.deleted_at IS NULL
   AND j.status='posted'
  LEFT JOIN public.accounting_reconciliation_matches m
    ON m.company_id=l.company_id
   AND m.journal_line_id=l.id
   AND m.deleted_at IS NULL
  LEFT JOIN public.accounting_reconciliations r
    ON r.company_id=m.company_id
   AND r.id=m.reconciliation_id
  WHERE l.deleted_at IS NULL
  GROUP BY
    l.company_id,
    l.id,
    l.journal_id,
    l.account_id,
    j.journal_number,
    j.journal_date,
    j.reference,
    j.description,
    l.description,
    l.debit,
    l.credit;
`;


export const ACCOUNTING_2_13_0_TO_2_14_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.13.0-to-2.14.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.13.0',
    toVersion:
      '2.14.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
