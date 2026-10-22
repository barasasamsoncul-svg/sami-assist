-- ============================================================
-- SaMi Shipping Module Schema
-- Module key: shipping
-- Required dependencies: inventory
-- Optional dependencies: sales, ecommerce, warehouse
--
-- Company-scoped shipping operations schema for shipments, parcels, carriers,
-- audit milestones, rate quotes and externally generated carrier labels.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.shipping_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.shipping_carriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    provider_key VARCHAR(100),
    service_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
    tracking_url_template TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipping_carriers_company
    ON public.shipping_carriers(company_id);

CREATE INDEX IF NOT EXISTS idx_shipping_carriers_company_status
    ON public.shipping_carriers(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipping_carriers_company_created
    ON public.shipping_carriers(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,
    shipment_number VARCHAR(100) NOT NULL,
    recipient_name VARCHAR(255),
    recipient_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    tracking_number VARCHAR(255),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipments_company
    ON public.shipments(company_id);

CREATE INDEX IF NOT EXISTS idx_shipments_company_status
    ON public.shipments(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_company_created
    ON public.shipments(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipment_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
    weight NUMERIC(12,4),
    length NUMERIC(12,4),
    width NUMERIC(12,4),
    height NUMERIC(12,4),
    contents JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipment_packages_company
    ON public.shipment_packages(company_id);

CREATE INDEX IF NOT EXISTS idx_shipment_packages_company_status
    ON public.shipment_packages(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_packages_company_created
    ON public.shipment_packages(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL,
    location VARCHAR(255),
    message TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_company
    ON public.shipment_events(company_id);

CREATE INDEX IF NOT EXISTS idx_shipment_events_company_status
    ON public.shipment_events(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_events_company_created
    ON public.shipment_events(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS public.shipping_rate_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
    carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,
    quote_reference VARCHAR(120),
    service_level VARCHAR(100) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    base_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    surcharge_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    tax_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.shipping_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,
    tracking_number VARCHAR(255),
    label_url TEXT,
    label_format VARCHAR(40),
    status VARCHAR(40) NOT NULL DEFAULT 'prepared',
    provider_reference VARCHAR(255),
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);



CREATE INDEX IF NOT EXISTS idx_shipments_company_recent
    ON public.shipments(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_company_number_lookup
    ON public.shipments(company_id, lower(shipment_number))
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_company_tracking_lookup
    ON public.shipments(company_id, lower(tracking_number))
    WHERE deleted_at IS NULL AND tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_carriers_company_active
    ON public.shipping_carriers(company_id, name)
    WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_packages_company_shipment_recent
    ON public.shipment_packages(company_id, shipment_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_events_company_shipment_recent
    ON public.shipment_events(company_id, shipment_id, occurred_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_rate_quotes_company_recent
    ON public.shipping_rate_quotes(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipping_labels_company_tracking
    ON public.shipping_labels(company_id, lower(tracking_number), created_at DESC)
    WHERE deleted_at IS NULL AND tracking_number IS NOT NULL;
