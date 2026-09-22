-- ============================================================
-- SaMi Sales Commissions Module Schema
-- Module key: commissions
-- Required dependencies: sales
-- Optional dependencies: employees, accounting
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.commissions_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.commission_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    calculation_method VARCHAR(50) NOT NULL DEFAULT 'percentage',
    rate NUMERIC(8,4) NOT NULL DEFAULT 0,
    effective_from DATE,
    effective_to DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commission_plans_company
    ON public.commission_plans(company_id);

CREATE INDEX IF NOT EXISTS idx_commission_plans_company_status
    ON public.commission_plans(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commission_plans_company_created
    ON public.commission_plans(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.commission_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.commission_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    starts_at DATE,
    ends_at DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commission_assignments_company
    ON public.commission_assignments(company_id);

CREATE INDEX IF NOT EXISTS idx_commission_assignments_company_status
    ON public.commission_assignments(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commission_assignments_company_created
    ON public.commission_assignments(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.commission_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES public.commission_assignments(id) ON DELETE SET NULL,
    source_type VARCHAR(80) NOT NULL,
    source_id UUID,
    base_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    commission_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    earned_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commission_entries_company
    ON public.commission_entries(company_id);

CREATE INDEX IF NOT EXISTS idx_commission_entries_company_status
    ON public.commission_entries(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commission_entries_company_created
    ON public.commission_entries(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

