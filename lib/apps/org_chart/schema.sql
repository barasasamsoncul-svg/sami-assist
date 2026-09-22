-- ============================================================
-- SaMi Organization Chart Module Schema
-- Module key: org_chart
-- Required dependencies: employees
-- Optional dependencies: none
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.org_chart_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.org_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    parent_position_id UUID REFERENCES public.org_positions(id) ON DELETE SET NULL,
    employee_reference UUID,
    manager_position_id UUID REFERENCES public.org_positions(id) ON DELETE SET NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_positions_company
    ON public.org_positions(company_id);

CREATE INDEX IF NOT EXISTS idx_org_positions_company_status
    ON public.org_positions(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_positions_company_created
    ON public.org_positions(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.org_position_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES public.org_positions(id) ON DELETE CASCADE,
    employee_reference UUID,
    starts_at DATE,
    ends_at DATE,
    change_reason TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_position_history_company
    ON public.org_position_history(company_id);

CREATE INDEX IF NOT EXISTS idx_org_position_history_company_status
    ON public.org_position_history(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_position_history_company_created
    ON public.org_position_history(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

