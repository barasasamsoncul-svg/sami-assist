-- ============================================================
-- SaMi Payroll Module Schema
-- Module key: payroll
-- Required dependencies: employees
-- Optional dependencies: accounting, attendance, benefits
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.payroll_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    pay_date DATE,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_company
    ON public.payroll_periods(company_id);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_company_status
    ON public.payroll_periods(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_periods_company_created
    ON public.payroll_periods(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_reference UUID NOT NULL,
    payroll_number VARCHAR(100),
    basic_salary NUMERIC(19,4) NOT NULL DEFAULT 0,
    tax_number VARCHAR(120),
    bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_company
    ON public.payroll_employees(company_id);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_company_status
    ON public.payroll_employees(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_employees_company_created
    ON public.payroll_employees(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
    run_number VARCHAR(100) NOT NULL,
    total_gross NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_net NUMERIC(19,4) NOT NULL DEFAULT 0,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company
    ON public.payroll_runs(company_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_status
    ON public.payroll_runs(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_created
    ON public.payroll_runs(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE RESTRICT,
    gross_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    deductions NUMERIC(19,4) NOT NULL DEFAULT 0,
    net_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_company
    ON public.payroll_run_lines(company_id);

CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_company_status
    ON public.payroll_run_lines(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_company_created
    ON public.payroll_run_lines(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

