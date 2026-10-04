import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS sales_team_id UUID;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS territory_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS salesperson_user_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS sales_team_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS territory_id UUID;

  CREATE TABLE IF NOT EXISTS public.sales_territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    parent_territory_id UUID REFERENCES public.sales_territories(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_territories_name
    ON public.sales_territories(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_territories_code
    ON public.sales_territories(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    manager_user_id UUID,
    territory_id UUID REFERENCES public.sales_territories(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_teams_name
    ON public.sales_teams(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_teams_code
    ON public.sales_teams(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_teams_active
    ON public.sales_teams(company_id, is_active, name)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    team_id UUID NOT NULL REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
      CHECK (role IN ('manager','member')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, team_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_team_members_user
    ON public.sales_team_members(company_id, user_id, is_active);

  CREATE TABLE IF NOT EXISTS public.sales_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    target_scope VARCHAR(20) NOT NULL
      CHECK (target_scope IN ('company','team','user')),
    team_id UUID REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    user_id UUID,
    metric VARCHAR(20) NOT NULL
      CHECK (metric IN ('revenue','margin','orders')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_value NUMERIC(18,2) NOT NULL CHECK (target_value >= 0),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (period_end >= period_start),
    CHECK (
      (target_scope = 'company' AND team_id IS NULL AND user_id IS NULL)
      OR (target_scope = 'team' AND team_id IS NOT NULL AND user_id IS NULL)
      OR (target_scope = 'user' AND team_id IS NULL AND user_id IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_sales_targets_period
    ON public.sales_targets(company_id, period_start, period_end, target_scope)
    WHERE deleted_at IS NULL AND is_active = TRUE;

  CREATE TABLE IF NOT EXISTS public.sales_commission_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    basis VARCHAR(20) NOT NULL
      CHECK (basis IN ('revenue','margin')),
    rate_percent NUMERIC(9,4) NOT NULL CHECK (rate_percent BETWEEN 0 AND 100),
    threshold_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (threshold_amount >= 0),
    cap_amount NUMERIC(18,2) CHECK (cap_amount IS NULL OR cap_amount >= 0),
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commission_plans_name
    ON public.sales_commission_plans(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commission_plans_code
    ON public.sales_commission_plans(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_commission_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    plan_id UUID NOT NULL REFERENCES public.sales_commission_plans(id) ON DELETE CASCADE,
    assignee_type VARCHAR(20) NOT NULL
      CHECK (assignee_type IN ('user','team')),
    user_id UUID,
    team_id UUID REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (
      (assignee_type = 'user' AND user_id IS NOT NULL AND team_id IS NULL)
      OR (assignee_type = 'team' AND user_id IS NULL AND team_id IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_sales_commission_assignments_active
    ON public.sales_commission_assignments(company_id, plan_id, assignee_type, is_active);

  CREATE TABLE IF NOT EXISTS public.sales_commission_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.sales_commission_plans(id) ON DELETE RESTRICT,
    assignment_id UUID NOT NULL REFERENCES public.sales_commission_assignments(id) ON DELETE RESTRICT,
    user_id UUID,
    team_id UUID REFERENCES public.sales_teams(id) ON DELETE SET NULL,
    basis VARCHAR(20) NOT NULL CHECK (basis IN ('revenue','margin')),
    basis_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    commission_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'accrued'
      CHECK (status IN ('accrued','reversed','paid')),
    source_event_key VARCHAR(255) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, source_event_key)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_commission_entries_order
    ON public.sales_commission_entries(company_id, order_id, status);

  CREATE INDEX IF NOT EXISTS idx_sales_commission_entries_user
    ON public.sales_commission_entries(company_id, user_id, accrued_at DESC)
    WHERE user_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_commission_entries_team
    ON public.sales_commission_entries(company_id, team_id, accrued_at DESC)
    WHERE team_id IS NOT NULL;
`;

export const SALES_3_0_0_TO_3_1_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-3.0.0-to-3.1.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '3.0.0',
    toVersion:
      '3.1.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
