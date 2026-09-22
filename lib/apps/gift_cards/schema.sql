-- ============================================================
-- SaMi Gift Cards Module Schema
-- Module key: gift_cards
-- Required dependencies: payments
-- Optional dependencies: pos_shop, ecommerce, sales
--
-- Company-scoped domain foundation. This schema is real and migration-ready,
-- but the module remains non-installable until its permissions, routes,
-- services and UI are implemented and verified.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.gift_cards_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.gift_card_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    expires_after_days INTEGER,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gift_card_programs_company
    ON public.gift_card_programs(company_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_programs_company_status
    ON public.gift_card_programs(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gift_card_programs_company_created
    ON public.gift_card_programs(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.gift_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    program_id UUID REFERENCES public.gift_card_programs(id) ON DELETE SET NULL,
    code_hash VARCHAR(128) NOT NULL,
    initial_value NUMERIC(19,4) NOT NULL,
    balance NUMERIC(19,4) NOT NULL,
    expires_at TIMESTAMPTZ,
    issued_to VARCHAR(255),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_company
    ON public.gift_cards(company_id);

CREATE INDEX IF NOT EXISTS idx_gift_cards_company_status
    ON public.gift_cards(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gift_cards_company_created
    ON public.gift_cards(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    gift_card_id UUID NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL,
    amount NUMERIC(19,4) NOT NULL,
    reference VARCHAR(255),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_company
    ON public.gift_card_transactions(company_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_company_status
    ON public.gift_card_transactions(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_company_created
    ON public.gift_card_transactions(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

