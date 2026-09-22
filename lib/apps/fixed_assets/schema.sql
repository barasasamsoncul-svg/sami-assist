-- ============================================================
-- SaMi Fixed Assets Module Schema
-- Module key: fixed_assets
-- Required dependencies: accounting
-- Optional dependencies: maintenance
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.fixed_assets_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.fixed_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_code VARCHAR(80) NOT NULL,
    name VARCHAR(255) NOT NULL,
    acquisition_date DATE,
    acquisition_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    salvage_value NUMERIC(19,4) NOT NULL DEFAULT 0,
    useful_life_months INTEGER,
    depreciation_method VARCHAR(40) NOT NULL DEFAULT 'straight_line',
    location VARCHAR(255),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_company
    ON public.fixed_assets(company_id);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_company_status
    ON public.fixed_assets(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_company_created
    ON public.fixed_assets(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_depreciation_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
    period_date DATE NOT NULL,
    depreciation_amount NUMERIC(19,4) NOT NULL,
    accumulated_depreciation NUMERIC(19,4) NOT NULL,
    book_value NUMERIC(19,4) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_asset_depreciation_entries_company
    ON public.asset_depreciation_entries(company_id);

CREATE INDEX IF NOT EXISTS idx_asset_depreciation_entries_company_status
    ON public.asset_depreciation_entries(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_depreciation_entries_company_created
    ON public.asset_depreciation_entries(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
    from_location VARCHAR(255),
    to_location VARCHAR(255),
    transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transferred_by UUID,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_asset_transfers_company
    ON public.asset_transfers(company_id);

CREATE INDEX IF NOT EXISTS idx_asset_transfers_company_status
    ON public.asset_transfers(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_transfers_company_created
    ON public.asset_transfers(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_disposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
    disposal_date DATE NOT NULL,
    disposal_method VARCHAR(50),
    proceeds NUMERIC(19,4) NOT NULL DEFAULT 0,
    notes TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_asset_disposals_company
    ON public.asset_disposals(company_id);

CREATE INDEX IF NOT EXISTS idx_asset_disposals_company_status
    ON public.asset_disposals(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_disposals_company_created
    ON public.asset_disposals(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

