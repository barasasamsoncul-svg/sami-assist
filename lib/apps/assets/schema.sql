-- ============================================================
-- SaMi Operational Assets Module Schema
-- Module key: assets
-- Required dependencies: none
-- Optional dependencies: maintenance, fixed_assets
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.assets_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.operational_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(80),
    serial_number VARCHAR(160),
    location VARCHAR(255),
    assigned_user_id UUID,
    acquired_at DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operational_assets_company
    ON public.operational_assets(company_id);

CREATE INDEX IF NOT EXISTS idx_operational_assets_company_status
    ON public.operational_assets(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_operational_assets_company_created
    ON public.operational_assets(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.operational_asset_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.operational_assets(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL,
    description TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by UUID,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operational_asset_events_company
    ON public.operational_asset_events(company_id);

CREATE INDEX IF NOT EXISTS idx_operational_asset_events_company_status
    ON public.operational_asset_events(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_operational_asset_events_company_created
    ON public.operational_asset_events(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.operational_asset_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.operational_assets(id) ON DELETE CASCADE,
    file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
    document_type VARCHAR(80),
    expires_at DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operational_asset_documents_company
    ON public.operational_asset_documents(company_id);

CREATE INDEX IF NOT EXISTS idx_operational_asset_documents_company_status
    ON public.operational_asset_documents(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_operational_asset_documents_company_created
    ON public.operational_asset_documents(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

