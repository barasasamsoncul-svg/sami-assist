-- ============================================================
-- SaMi Employee Onboarding Module Schema
-- Module key: onboarding
-- Required dependencies: employees
-- Optional dependencies: documents
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.onboarding_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.onboarding_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role_name VARCHAR(160),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_company
    ON public.onboarding_templates(company_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_company_status
    ON public.onboarding_templates(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_company_created
    ON public.onboarding_templates(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_template_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    owner_role VARCHAR(100),
    due_offset_days INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_company
    ON public.onboarding_template_tasks(company_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_company_status
    ON public.onboarding_template_tasks(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_company_created
    ON public.onboarding_template_tasks(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_onboardings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_reference UUID NOT NULL,
    template_id UUID REFERENCES public.onboarding_templates(id) ON DELETE SET NULL,
    start_date DATE NOT NULL,
    target_completion_date DATE,
    completed_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_onboardings_company
    ON public.employee_onboardings(company_id);

CREATE INDEX IF NOT EXISTS idx_employee_onboardings_company_status
    ON public.employee_onboardings(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_onboardings_company_created
    ON public.employee_onboardings(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_onboarding_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    onboarding_id UUID NOT NULL REFERENCES public.employee_onboardings(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    assigned_user_id UUID,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_employee_onboarding_tasks_company
    ON public.employee_onboarding_tasks(company_id);

CREATE INDEX IF NOT EXISTS idx_employee_onboarding_tasks_company_status
    ON public.employee_onboarding_tasks(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_onboarding_tasks_company_created
    ON public.employee_onboarding_tasks(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

