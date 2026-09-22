-- ============================================================
-- SaMi Loyalty Module Schema
-- Module key: loyalty
-- Required dependencies: none
-- Optional dependencies: crm, sales, pos_shop, ecommerce
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    points_name VARCHAR(80) NOT NULL DEFAULT 'Points',
    earning_rate NUMERIC(12,4) NOT NULL DEFAULT 1,
    redemption_rate NUMERIC(12,4) NOT NULL DEFAULT 1,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loyalty_programs_company
    ON public.loyalty_programs(company_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_programs_company_status
    ON public.loyalty_programs(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_programs_company_created
    ON public.loyalty_programs(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.loyalty_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
    customer_reference UUID,
    customer_name VARCHAR(255),
    points_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
    tier VARCHAR(80),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loyalty_members_company
    ON public.loyalty_members(company_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_members_company_status
    ON public.loyalty_members(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_members_company_created
    ON public.loyalty_members(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.loyalty_members(id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL,
    points NUMERIC(19,4) NOT NULL,
    source_type VARCHAR(80),
    source_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_company
    ON public.loyalty_transactions(company_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_company_status
    ON public.loyalty_transactions(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_company_created
    ON public.loyalty_transactions(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

