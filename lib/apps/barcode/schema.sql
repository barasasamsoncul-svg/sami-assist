-- ============================================================
-- SaMi Barcode Module Schema
-- Module key: barcode
-- Required dependencies: inventory
-- Optional dependencies: warehouse
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.barcode_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.barcode_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    pattern VARCHAR(255),
    entity_type VARCHAR(80) NOT NULL,
    sequence_prefix VARCHAR(50),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_barcode_rules_company
    ON public.barcode_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_barcode_rules_company_status
    ON public.barcode_rules(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_barcode_rules_company_created
    ON public.barcode_rules(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.barcode_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.barcode_rules(id) ON DELETE SET NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID NOT NULL,
    barcode VARCHAR(255) NOT NULL,
    symbology VARCHAR(40),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_barcode_identifiers_company
    ON public.barcode_identifiers(company_id);

CREATE INDEX IF NOT EXISTS idx_barcode_identifiers_company_status
    ON public.barcode_identifiers(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_barcode_identifiers_company_created
    ON public.barcode_identifiers(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.barcode_scan_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    barcode VARCHAR(255) NOT NULL,
    operation VARCHAR(80),
    scanned_by UUID,
    device_reference VARCHAR(255),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_barcode_scan_events_company
    ON public.barcode_scan_events(company_id);

CREATE INDEX IF NOT EXISTS idx_barcode_scan_events_company_status
    ON public.barcode_scan_events(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_barcode_scan_events_company_created
    ON public.barcode_scan_events(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

