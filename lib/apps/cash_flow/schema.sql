-- ============================================================
-- SaMi Cash Flow Module Schema
-- Module key: cash_flow
-- Required dependencies: accounting
-- Optional dependencies: invoicing, expenses, payments
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cash_flow_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.cash_flow_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_forecasts_company
    ON public.cash_flow_forecasts(company_id);

CREATE INDEX IF NOT EXISTS idx_cash_flow_forecasts_company_status
    ON public.cash_flow_forecasts(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_flow_forecasts_company_created
    ON public.cash_flow_forecasts(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cash_flow_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    forecast_id UUID NOT NULL REFERENCES public.cash_flow_forecasts(id) ON DELETE CASCADE,
    flow_type VARCHAR(20) NOT NULL,
    category VARCHAR(100),
    expected_date DATE NOT NULL,
    amount NUMERIC(19,4) NOT NULL,
    probability NUMERIC(5,2) NOT NULL DEFAULT 100,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_items_company
    ON public.cash_flow_items(company_id);

CREATE INDEX IF NOT EXISTS idx_cash_flow_items_company_status
    ON public.cash_flow_items(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_flow_items_company_created
    ON public.cash_flow_items(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cash_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    position_date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
    inflows NUMERIC(19,4) NOT NULL DEFAULT 0,
    outflows NUMERIC(19,4) NOT NULL DEFAULT 0,
    closing_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cash_positions_company
    ON public.cash_positions(company_id);

CREATE INDEX IF NOT EXISTS idx_cash_positions_company_status
    ON public.cash_positions(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_positions_company_created
    ON public.cash_positions(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

