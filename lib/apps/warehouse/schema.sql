-- ============================================================
-- SaMi Warehouse Module Schema
-- Module key: warehouse
-- Required dependencies: inventory
-- Optional dependencies: barcode, shipping
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.warehouse_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.warehouse_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(80) NOT NULL,
    parent_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
    location_type VARCHAR(50) NOT NULL DEFAULT 'internal',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_company
    ON public.warehouse_locations(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_company_status
    ON public.warehouse_locations(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_company_created
    ON public.warehouse_locations(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL,
    source_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
    destination_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reference VARCHAR(255),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warehouse_operations_company
    ON public.warehouse_operations(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_operations_company_status
    ON public.warehouse_operations(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_operations_company_created
    ON public.warehouse_operations(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_operation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL REFERENCES public.warehouse_operations(id) ON DELETE CASCADE,
    product_reference UUID NOT NULL,
    quantity NUMERIC(19,4) NOT NULL,
    lot_reference VARCHAR(120),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warehouse_operation_lines_company
    ON public.warehouse_operation_lines(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_operation_lines_company_status
    ON public.warehouse_operation_lines(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_operation_lines_company_created
    ON public.warehouse_operation_lines(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

