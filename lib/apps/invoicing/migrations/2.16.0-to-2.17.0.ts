import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_etims_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    environment VARCHAR(20) NOT NULL DEFAULT 'sandbox'
      CHECK (environment IN ('sandbox','production')),
    control_unit_type VARCHAR(10) NOT NULL DEFAULT 'oscu'
      CHECK (control_unit_type IN ('oscu','vscu')),
    taxpayer_pin VARCHAR(20),
    branch_id VARCHAR(40),
    device_serial VARCHAR(120),
    require_fiscalization_before_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    auto_queue_on_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
  );

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    credit_note_id UUID REFERENCES public.invoicing_credit_notes(id) ON DELETE RESTRICT,
    document_kind VARCHAR(20) NOT NULL DEFAULT 'invoice'
      CHECK (document_kind IN ('invoice','credit_note')),
    receipt_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
      CHECK (receipt_type IN ('NORMAL','COPY','TRAINING','PROFORMA')),
    transaction_type VARCHAR(20) NOT NULL DEFAULT 'SALE'
      CHECK (transaction_type IN ('SALE','CREDIT_NOTE','DEBIT_NOTE')),
    receipt_label VARCHAR(4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued','submitting','accepted','rejected','failed','cancelled')),
    request_payload JSONB NOT NULL,
    request_sha256 VARCHAR(64) NOT NULL,
    provider VARCHAR(80),
    provider_request_id VARCHAR(180),
    scu_id VARCHAR(180),
    scu_receipt_number VARCHAR(180),
    cu_invoice_number VARCHAR(255),
    receipt_counter VARCHAR(80),
    total_receipt_counter VARCHAR(80),
    internal_data TEXT,
    receipt_signature TEXT,
    qr_payload TEXT,
    response_code VARCHAR(120),
    response_message TEXT,
    response_payload JSONB,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    fiscalized_at TIMESTAMPTZ,
    submitted_by UUID,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (document_kind = 'invoice' AND invoice_id IS NOT NULL AND credit_note_id IS NULL)
      OR
      (document_kind = 'credit_note' AND credit_note_id IS NOT NULL)
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_etims_invoice
    ON public.invoicing_etims_documents(company_id, invoice_id)
    WHERE invoice_id IS NOT NULL
      AND status <> 'cancelled';

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_etims_credit_note
    ON public.invoicing_etims_documents(company_id, credit_note_id)
    WHERE credit_note_id IS NOT NULL
      AND status <> 'cancelled';

  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_documents_queue
    ON public.invoicing_etims_documents(company_id, status, next_retry_at, created_at);

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    etims_document_id UUID NOT NULL REFERENCES public.invoicing_etims_documents(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
    status VARCHAR(20) NOT NULL
      CHECK (status IN ('submitted','accepted','rejected','failed')),
    request_sha256 VARCHAR(64) NOT NULL,
    response_sha256 VARCHAR(64),
    provider VARCHAR(80),
    response_code VARCHAR(120),
    response_message TEXT,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    response_payload JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(etims_document_id, attempt_no)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_attempts_document
    ON public.invoicing_etims_attempts(company_id, etims_document_id, attempt_no DESC);

  INSERT INTO public.invoicing_etims_settings (
    company_id,
    enabled,
    environment,
    control_unit_type,
    require_fiscalization_before_delivery,
    auto_queue_on_confirmation
  )
  SELECT
    c.id,
    FALSE,
    'sandbox',
    'oscu',
    TRUE,
    TRUE
  FROM public.companies c
  ON CONFLICT (company_id)
  DO NOTHING;
`;


export const INVOICING_2_16_0_TO_2_17_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.16.0-to-2.17.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.16.0',
    toVersion:
      '2.17.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
