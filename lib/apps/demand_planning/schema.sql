-- ============================================================
-- SaMi Demand Planning Module Schema
-- Module key: demand_planning
-- Required dependencies: inventory
-- Optional dependencies: purchase, sales
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.demand_planning_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.demand_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    horizon_start DATE NOT NULL,
    horizon_end DATE NOT NULL,
    method VARCHAR(80) NOT NULL DEFAULT 'manual',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_demand_forecasts_company
    ON public.demand_forecasts(company_id);

CREATE INDEX IF NOT EXISTS idx_demand_forecasts_company_status
    ON public.demand_forecasts(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demand_forecasts_company_created
    ON public.demand_forecasts(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.demand_forecast_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    forecast_id UUID NOT NULL REFERENCES public.demand_forecasts(id) ON DELETE CASCADE,
    product_reference UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    forecast_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    confidence NUMERIC(5,2),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_demand_forecast_lines_company
    ON public.demand_forecast_lines(company_id);

CREATE INDEX IF NOT EXISTS idx_demand_forecast_lines_company_status
    ON public.demand_forecast_lines(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demand_forecast_lines_company_created
    ON public.demand_forecast_lines(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.replenishment_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    forecast_id UUID REFERENCES public.demand_forecasts(id) ON DELETE SET NULL,
    product_reference UUID NOT NULL,
    recommended_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    needed_by DATE,
    reason TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_replenishment_recommendations_company
    ON public.replenishment_recommendations(company_id);

CREATE INDEX IF NOT EXISTS idx_replenishment_recommendations_company_status
    ON public.replenishment_recommendations(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_replenishment_recommendations_company_created
    ON public.replenishment_recommendations(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

