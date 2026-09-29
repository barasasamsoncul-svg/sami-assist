import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_settings
    ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS portal_access_days INTEGER NOT NULL DEFAULT 90,
    ADD COLUMN IF NOT EXISTS portal_allow_messages BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS portal_show_payment_history BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS portal_show_credit_notes BOOLEAN NOT NULL DEFAULT TRUE;

  ALTER TABLE public.invoicing_settings
    DROP CONSTRAINT IF EXISTS invoicing_settings_portal_access_days_check;

  ALTER TABLE public.invoicing_settings
    ADD CONSTRAINT invoicing_settings_portal_access_days_check
      CHECK (portal_access_days BETWEEN 1 AND 3650);

  CREATE TABLE IF NOT EXISTS public.invoicing_portal_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','revoked','expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_by UUID,
    revoked_by UUID,
    revoked_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(token_hash)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_portal_access_customer_active
    ON public.invoicing_portal_access(company_id, customer_id)
    WHERE status = 'active';

  CREATE INDEX IF NOT EXISTS idx_invoicing_portal_access_expiry
    ON public.invoicing_portal_access(company_id, expires_at)
    WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS public.invoicing_portal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
    portal_access_id UUID REFERENCES public.invoicing_portal_access(id) ON DELETE SET NULL,
    direction VARCHAR(30) NOT NULL
      CHECK (direction IN ('customer_to_business','business_to_customer','system')),
    category VARCHAR(30) NOT NULL DEFAULT 'general'
      CHECK (category IN ('general','invoice_question','dispute','payment_promise')),
    subject VARCHAR(255),
    body TEXT NOT NULL,
    idempotency_key VARCHAR(120),
    promised_amount NUMERIC(19,4) CHECK (promised_amount IS NULL OR promised_amount > 0),
    promised_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
      CHECK (status IN ('open','resolved','closed')),
    customer_name_snapshot VARCHAR(255),
    customer_email_snapshot VARCHAR(255),
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_portal_messages_customer
    ON public.invoicing_portal_messages(company_id, customer_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_invoicing_portal_messages_inbox
    ON public.invoicing_portal_messages(company_id, status, created_at DESC)
    WHERE direction = 'customer_to_business';

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_portal_message_idempotency
    ON public.invoicing_portal_messages(portal_access_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_portal_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
    portal_access_id UUID REFERENCES public.invoicing_portal_access(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
    event_type VARCHAR(60) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_portal_events_customer
    ON public.invoicing_portal_events(company_id, customer_id, created_at DESC);
`;


export const INVOICING_2_8_0_TO_2_9_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.8.0-to-2.9.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.8.0',
    toVersion:
      '2.9.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
