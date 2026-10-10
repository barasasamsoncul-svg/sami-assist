import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 100000),
    min_base_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (min_base_amount >= 0),
    max_base_amount NUMERIC(18,2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT sales_quote_approval_policies_amount_band_check
      CHECK (max_base_amount IS NULL OR max_base_amount >= min_base_amount)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_approval_policies_name
    ON public.sales_quote_approval_policies(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_policies_match
    ON public.sales_quote_approval_policies(company_id, is_active, priority, min_base_amount DESC)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_policy_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    policy_id UUID NOT NULL REFERENCES public.sales_quote_approval_policies(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 10),
    step_name VARCHAR(120) NOT NULL,
    approver_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(policy_id, step_number),
    UNIQUE(policy_id, approver_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_policy_steps_approver
    ON public.sales_quote_approval_policy_steps(company_id, approver_user_id, policy_id);

  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    policy_id UUID REFERENCES public.sales_quote_approval_policies(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','approved','rejected','cancelled')),
    requested_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_step_number INTEGER NOT NULL DEFAULT 1 CHECK (current_step_number BETWEEN 1 AND 10),
    current_approver_user_id UUID,
    quote_revision INTEGER NOT NULL DEFAULT 1 CHECK (quote_revision > 0),
    quote_total_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (quote_total_amount >= 0),
    quote_base_total_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (quote_base_total_amount >= 0),
    base_currency VARCHAR(3) NOT NULL DEFAULT 'KES' CHECK (base_currency ~ '^[A-Z]{3}$'),
    step_snapshot JSONB NOT NULL,
    completed_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sales_quote_approval_requests_snapshot_check
      CHECK (
        jsonb_typeof(step_snapshot) = 'array'
        AND jsonb_array_length(step_snapshot) BETWEEN 1 AND 10
      )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_approval_requests_active_quote
    ON public.sales_quote_approval_requests(company_id, quote_id)
    WHERE status = 'pending';

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_requests_current_approver
    ON public.sales_quote_approval_requests(company_id, current_approver_user_id, requested_at DESC)
    WHERE status = 'pending';

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_requests_quote_history
    ON public.sales_quote_approval_requests(company_id, quote_id, requested_at DESC);

  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    request_id UUID NOT NULL REFERENCES public.sales_quote_approval_requests(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 10),
    step_name VARCHAR(120) NOT NULL,
    approver_user_id UUID NOT NULL,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','rejected')),
    note TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(request_id, step_number)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_decisions_quote
    ON public.sales_quote_approval_decisions(company_id, quote_id, decided_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_decisions_approver
    ON public.sales_quote_approval_decisions(company_id, approver_user_id, decided_at DESC);

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS approval_workflow_request_id UUID
      REFERENCES public.sales_quote_approval_requests(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_quotes_approval_workflow_request
    ON public.sales_quotes(company_id, approval_workflow_request_id)
    WHERE approval_workflow_request_id IS NOT NULL;
`;


export const SALES_3_4_1_TO_3_5_0:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.1-to-3.5.0',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.1',
    toVersion: '3.5.0',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
