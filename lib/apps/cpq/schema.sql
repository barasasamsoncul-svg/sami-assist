-- ============================================================
-- SaMi CPQ Module Schema
-- Module key: cpq
-- Required dependencies: sales
-- Optional dependencies: inventory
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cpq_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.cpq_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    base_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    configuration_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cpq_products_company
    ON public.cpq_products(company_id);

CREATE INDEX IF NOT EXISTS idx_cpq_products_company_status
    ON public.cpq_products(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cpq_products_company_created
    ON public.cpq_products(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cpq_price_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.cpq_products(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    adjustment_type VARCHAR(30) NOT NULL,
    adjustment_value NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cpq_price_rules_company
    ON public.cpq_price_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_cpq_price_rules_company_status
    ON public.cpq_price_rules(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cpq_price_rules_company_created
    ON public.cpq_price_rules(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cpq_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_name VARCHAR(255),
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    valid_until DATE,
    subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cpq_quotes_company
    ON public.cpq_quotes(company_id);

CREATE INDEX IF NOT EXISTS idx_cpq_quotes_company_status
    ON public.cpq_quotes(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cpq_quotes_company_created
    ON public.cpq_quotes(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cpq_quote_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.cpq_quotes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.cpq_products(id) ON DELETE SET NULL,
    quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_cpq_quote_lines_company
    ON public.cpq_quote_lines(company_id);

CREATE INDEX IF NOT EXISTS idx_cpq_quote_lines_company_status
    ON public.cpq_quote_lines(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cpq_quote_lines_company_created
    ON public.cpq_quote_lines(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

