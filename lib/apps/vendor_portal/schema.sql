-- ============================================================
-- SaMi Vendor Portal Module Schema
-- Module key: vendor_portal
-- Required dependencies: purchase
-- Optional dependencies: documents
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.vendor_portal_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.vendor_portal_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vendor_reference UUID,
    vendor_name VARCHAR(255) NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_vendor_portal_accounts_company
    ON public.vendor_portal_accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_vendor_portal_accounts_company_status
    ON public.vendor_portal_accounts(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_portal_accounts_company_created
    ON public.vendor_portal_accounts(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.vendor_portal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vendor_account_id UUID NOT NULL REFERENCES public.vendor_portal_accounts(id) ON DELETE CASCADE,
    document_type VARCHAR(80),
    file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
    document_date DATE,
    expires_at DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_portal_documents_company
    ON public.vendor_portal_documents(company_id);

CREATE INDEX IF NOT EXISTS idx_vendor_portal_documents_company_status
    ON public.vendor_portal_documents(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_portal_documents_company_created
    ON public.vendor_portal_documents(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.vendor_portal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vendor_account_id UUID NOT NULL REFERENCES public.vendor_portal_accounts(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_vendor_portal_messages_company
    ON public.vendor_portal_messages(company_id);

CREATE INDEX IF NOT EXISTS idx_vendor_portal_messages_company_status
    ON public.vendor_portal_messages(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_portal_messages_company_created
    ON public.vendor_portal_messages(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

