-- ============================================================
-- SaMi Lead Capture Module Schema
-- Module key: lead_capture
-- Required dependencies: crm
-- Optional dependencies: landing_pages, marketing_automation
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.lead_capture_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.lead_capture_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(100),
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    assignment_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_forms_company
    ON public.lead_capture_forms(company_id);

CREATE INDEX IF NOT EXISTS idx_lead_capture_forms_company_status
    ON public.lead_capture_forms(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_capture_forms_company_created
    ON public.lead_capture_forms(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_capture_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.lead_capture_forms(id) ON DELETE CASCADE,
    values JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url TEXT,
    campaign VARCHAR(255),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_user_id UUID,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_entries_company
    ON public.lead_capture_entries(company_id);

CREATE INDEX IF NOT EXISTS idx_lead_capture_entries_company_status
    ON public.lead_capture_entries(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_capture_entries_company_created
    ON public.lead_capture_entries(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.lead_capture_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES public.lead_capture_entries(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_events_company
    ON public.lead_capture_events(company_id);

CREATE INDEX IF NOT EXISTS idx_lead_capture_events_company_status
    ON public.lead_capture_events(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_capture_events_company_created
    ON public.lead_capture_events(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

