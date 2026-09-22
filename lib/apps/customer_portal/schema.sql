-- ============================================================
-- SaMi Customer Portal Module Schema
-- Module key: customer_portal
-- Required dependencies: none
-- Optional dependencies: crm, documents, sales, invoicing
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.customer_portal_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.portal_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_reference VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    last_login_at TIMESTAMPTZ,
    access_expires_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_customers_company
    ON public.portal_customers(company_id);

CREATE INDEX IF NOT EXISTS idx_portal_customers_company_status
    ON public.portal_customers(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_customers_company_created
    ON public.portal_customers(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.portal_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    portal_customer_id UUID NOT NULL REFERENCES public.portal_customers(id) ON DELETE CASCADE,
    resource_type VARCHAR(80) NOT NULL,
    resource_id UUID,
    permission VARCHAR(40) NOT NULL DEFAULT 'view',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_access_grants_company
    ON public.portal_access_grants(company_id);

CREATE INDEX IF NOT EXISTS idx_portal_access_grants_company_status
    ON public.portal_access_grants(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_access_grants_company_created
    ON public.portal_access_grants(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.portal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    portal_customer_id UUID REFERENCES public.portal_customers(id) ON DELETE CASCADE,
    subject VARCHAR(255),
    body TEXT NOT NULL,
    direction VARCHAR(20) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_company
    ON public.portal_messages(company_id);

CREATE INDEX IF NOT EXISTS idx_portal_messages_company_status
    ON public.portal_messages(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_messages_company_created
    ON public.portal_messages(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

