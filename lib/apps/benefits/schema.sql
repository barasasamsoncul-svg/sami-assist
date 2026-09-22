-- ============================================================
-- SaMi Benefits Module Schema
-- Module key: benefits
-- Required dependencies: employees
-- Optional dependencies: payroll
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.benefits_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.benefit_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    benefit_type VARCHAR(80),
    provider_name VARCHAR(255),
    employer_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    employee_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_benefit_plans_company
    ON public.benefit_plans(company_id);

CREATE INDEX IF NOT EXISTS idx_benefit_plans_company_status
    ON public.benefit_plans(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_benefit_plans_company_created
    ON public.benefit_plans(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.benefit_eligibility_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    benefit_plan_id UUID NOT NULL REFERENCES public.benefit_plans(id) ON DELETE CASCADE,
    rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_benefit_eligibility_rules_company
    ON public.benefit_eligibility_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_benefit_eligibility_rules_company_status
    ON public.benefit_eligibility_rules(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_benefit_eligibility_rules_company_created
    ON public.benefit_eligibility_rules(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.benefit_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    benefit_plan_id UUID NOT NULL REFERENCES public.benefit_plans(id) ON DELETE CASCADE,
    employee_reference UUID NOT NULL,
    enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_at DATE,
    dependent_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_company
    ON public.benefit_enrollments(company_id);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_company_status
    ON public.benefit_enrollments(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_company_created
    ON public.benefit_enrollments(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

