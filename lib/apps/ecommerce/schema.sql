-- ============================================================
-- SaMi E-commerce Module Schema
-- Module key: ecommerce
-- Required dependencies: sales, inventory
-- Optional dependencies: payments, shipping, crm
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ecommerce_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.storefronts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    domain VARCHAR(255),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storefronts_company
    ON public.storefronts(company_id);

CREATE INDEX IF NOT EXISTS idx_storefronts_company_status
    ON public.storefronts(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storefronts_company_created
    ON public.storefronts(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.storefront_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    storefront_id UUID NOT NULL REFERENCES public.storefronts(id) ON DELETE CASCADE,
    product_reference UUID,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(160) NOT NULL,
    price NUMERIC(19,4) NOT NULL DEFAULT 0,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storefront_products_company
    ON public.storefront_products(company_id);

CREATE INDEX IF NOT EXISTS idx_storefront_products_company_status
    ON public.storefront_products(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_products_company_created
    ON public.storefront_products(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.storefront_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    storefront_id UUID NOT NULL REFERENCES public.storefronts(id) ON DELETE RESTRICT,
    order_number VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255),
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_company
    ON public.storefront_orders(company_id);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_company_status
    ON public.storefront_orders(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_company_created
    ON public.storefront_orders(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.storefront_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.storefront_orders(id) ON DELETE CASCADE,
    storefront_product_id UUID REFERENCES public.storefront_products(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    line_total NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storefront_order_lines_company
    ON public.storefront_order_lines(company_id);

CREATE INDEX IF NOT EXISTS idx_storefront_order_lines_company_status
    ON public.storefront_order_lines(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_order_lines_company_created
    ON public.storefront_order_lines(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

