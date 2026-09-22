-- ============================================================
-- SaMi Mail Module Schema
-- Module key: mail
-- Required dependencies: none
-- Optional dependencies: crm, documents
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mail_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.mail_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email_address VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    provider VARCHAR(80),
    owner_user_id UUID,
    last_sync_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_company
    ON public.mail_accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_company_status
    ON public.mail_accounts(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mail_accounts_company_created
    ON public.mail_accounts(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mail_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    mail_account_id UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
    external_thread_id VARCHAR(255),
    subject VARCHAR(500),
    participants JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_message_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mail_threads_company
    ON public.mail_threads(company_id);

CREATE INDEX IF NOT EXISTS idx_mail_threads_company_status
    ON public.mail_threads(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mail_threads_company_created
    ON public.mail_threads(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mail_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL REFERENCES public.mail_threads(id) ON DELETE CASCADE,
    external_message_id VARCHAR(255),
    direction VARCHAR(20),
    sender VARCHAR(255),
    recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
    subject VARCHAR(500),
    body_text TEXT,
    body_html TEXT,
    sent_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_company
    ON public.mail_messages(company_id);

CREATE INDEX IF NOT EXISTS idx_mail_messages_company_status
    ON public.mail_messages(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mail_messages_company_created
    ON public.mail_messages(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

