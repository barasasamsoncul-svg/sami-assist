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
    name VARCHAR(160) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 100,
    min_quote_total NUMERIC(20,6),
    max_discount_percent NUMERIC(7,4),
    min_margin_percent NUMERIC(7,4),
    currency_code VARCHAR(3),
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (min_quote_total IS NULL OR min_quote_total >= 0),
    CHECK (max_discount_percent IS NULL OR max_discount_percent BETWEEN 0 AND 100),
    CHECK (min_margin_percent IS NULL OR min_margin_percent BETWEEN 0 AND 100)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_policies_company
    ON public.sales_quote_approval_policies(company_id, is_active, priority)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_policy_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    policy_id UUID NOT NULL REFERENCES public.sales_quote_approval_policies(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL CHECK (step_order > 0),
    approver_user_id UUID,
    approver_role_key VARCHAR(120),
    required_approvals INTEGER NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(policy_id, step_order),
    CHECK (approver_user_id IS NOT NULL OR approver_role_key IS NOT NULL)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_policy_steps_policy
    ON public.sales_quote_approval_policy_steps(company_id, policy_id, step_order);

  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    policy_id UUID REFERENCES public.sales_quote_approval_policies(id) ON DELETE SET NULL,
    quote_fingerprint TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','approved','rejected','superseded','cancelled')),
    current_step_order INTEGER NOT NULL DEFAULT 1 CHECK (current_step_order > 0),
    requested_by UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_approval_request_pending
    ON public.sales_quote_approval_requests(company_id, quote_id)
    WHERE status = 'pending';

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_requests_queue
    ON public.sales_quote_approval_requests(company_id, status, requested_at DESC);

  CREATE TABLE IF NOT EXISTS public.sales_quote_approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    request_id UUID NOT NULL REFERENCES public.sales_quote_approval_requests(id) ON DELETE CASCADE,
    policy_step_id UUID REFERENCES public.sales_quote_approval_policy_steps(id) ON DELETE SET NULL,
    step_order INTEGER NOT NULL CHECK (step_order > 0),
    reviewer_user_id UUID NOT NULL,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','rejected')),
    reason TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(request_id, step_order, reviewer_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_decisions_request
    ON public.sales_quote_approval_decisions(company_id, request_id, step_order, decided_at);
`;

export const SALES_3_4_1_TO_3_4_2:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.1-to-3.4.2',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.1',
    toVersion: '3.4.2',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
