-- ============================================================
-- SaMi Team Inbox Module Schema
-- Module key: team_inbox
-- Required dependencies: none
-- Optional dependencies: mail, crm, helpdesk
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.team_inbox_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.team_inboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    address VARCHAR(255),
    channel VARCHAR(40) NOT NULL DEFAULT 'email',
    assignment_mode VARCHAR(40) NOT NULL DEFAULT 'manual',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_inboxes_company
    ON public.team_inboxes(company_id);

CREATE INDEX IF NOT EXISTS idx_team_inboxes_company_status
    ON public.team_inboxes(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_inboxes_company_created
    ON public.team_inboxes(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_inbox_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    inbox_id UUID NOT NULL REFERENCES public.team_inboxes(id) ON DELETE CASCADE,
    subject VARCHAR(500),
    customer_name VARCHAR(255),
    customer_address VARCHAR(255),
    assigned_user_id UUID,
    priority VARCHAR(30) NOT NULL DEFAULT 'normal',
    last_message_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_inbox_threads_company
    ON public.team_inbox_threads(company_id);

CREATE INDEX IF NOT EXISTS idx_team_inbox_threads_company_status
    ON public.team_inbox_threads(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_inbox_threads_company_created
    ON public.team_inbox_threads(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_inbox_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    thread_id UUID NOT NULL REFERENCES public.team_inbox_threads(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    sender VARCHAR(255),
    recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
    body TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_inbox_messages_company
    ON public.team_inbox_messages(company_id);

CREATE INDEX IF NOT EXISTS idx_team_inbox_messages_company_status
    ON public.team_inbox_messages(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_inbox_messages_company_created
    ON public.team_inbox_messages(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

