import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_einvoice_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    network_key VARCHAR(40) NOT NULL DEFAULT 'peppol'
      CHECK (network_key IN ('peppol','custom_edi')),
    provider_key VARCHAR(80) NOT NULL DEFAULT 'peppol_gateway',
    environment VARCHAR(12) NOT NULL DEFAULT 'sandbox'
      CHECK (environment IN ('sandbox','production')),
    status VARCHAR(20) NOT NULL DEFAULT 'configured'
      CHECK (status IN ('disabled','configured','active','error')),
    syntax_key VARCHAR(40) NOT NULL DEFAULT 'ubl-2.1'
      CHECK (syntax_key IN ('ubl-2.1')),
    supplier_country_code VARCHAR(2) NOT NULL,
    supplier_endpoint_scheme VARCHAR(32) NOT NULL,
    supplier_endpoint_id VARCHAR(160) NOT NULL,
    customization_id VARCHAR(320) NOT NULL,
    process_id VARCHAR(320) NOT NULL,
    provider_account_id VARCHAR(180),
    credential_sealed TEXT,
    credential_version VARCHAR(32),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_code VARCHAR(120),
    last_error_message TEXT,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_einvoice_profile_name
    ON public.invoicing_einvoice_profiles(company_id, LOWER(name))
    WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_einvoice_profile_default
    ON public.invoicing_einvoice_profiles(company_id)
    WHERE is_default = TRUE AND deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_invoicing_einvoice_profiles_company
    ON public.invoicing_einvoice_profiles(company_id, status, network_key)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_einvoice_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
    network_key VARCHAR(40) NOT NULL DEFAULT 'peppol'
      CHECK (network_key IN ('peppol','custom_edi')),
    participant_scheme VARCHAR(32) NOT NULL,
    participant_id VARCHAR(180) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    buyer_reference VARCHAR(180),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, customer_id, network_key)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_einvoice_participants_company
    ON public.invoicing_einvoice_participants(company_id, network_key, is_active);

  CREATE TABLE IF NOT EXISTS public.invoicing_einvoice_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.invoicing_einvoice_profiles(id) ON DELETE RESTRICT,
    participant_id UUID NOT NULL REFERENCES public.invoicing_einvoice_participants(id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    credit_note_id UUID REFERENCES public.invoicing_credit_notes(id) ON DELETE RESTRICT,
    document_kind VARCHAR(20) NOT NULL
      CHECK (document_kind IN ('invoice','credit_note')),
    network_key VARCHAR(40) NOT NULL,
    syntax_key VARCHAR(40) NOT NULL,
    specification_id VARCHAR(320) NOT NULL,
    process_id VARCHAR(320) NOT NULL,
    source_key VARCHAR(220) NOT NULL,
    source_hash VARCHAR(64) NOT NULL,
    document_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    xml_payload TEXT NOT NULL,
    xml_sha256 VARCHAR(64) NOT NULL,
    validation_status VARCHAR(20) NOT NULL DEFAULT 'invalid'
      CHECK (validation_status IN ('valid','invalid')),
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    transmission_status VARCHAR(20) NOT NULL DEFAULT 'draft'
      CHECK (transmission_status IN ('draft','ready','queued','accepted','rejected','failed','exported')),
    provider_message_id VARCHAR(255),
    provider_status VARCHAR(120),
    provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    generated_by UUID,
    submitted_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (document_kind = 'invoice' AND invoice_id IS NOT NULL AND credit_note_id IS NULL)
      OR
      (document_kind = 'credit_note' AND credit_note_id IS NOT NULL AND invoice_id IS NULL)
    ),
    UNIQUE(company_id, profile_id, source_key, source_hash),
    UNIQUE(company_id, document_uuid)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_einvoice_documents_company
    ON public.invoicing_einvoice_documents(company_id, transmission_status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoicing_einvoice_documents_invoice
    ON public.invoicing_einvoice_documents(company_id, invoice_id, created_at DESC)
    WHERE invoice_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_invoicing_einvoice_documents_credit
    ON public.invoicing_einvoice_documents(company_id, credit_note_id, created_at DESC)
    WHERE credit_note_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_einvoice_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.invoicing_einvoice_documents(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
    adapter_key VARCHAR(80) NOT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    http_status INTEGER,
    provider_status VARCHAR(120),
    error_code VARCHAR(120),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(document_id, attempt_no)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_einvoice_attempts_document
    ON public.invoicing_einvoice_attempts(document_id, attempt_no DESC);
`;


export const INVOICING_2_17_0_TO_2_18_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.17.0-to-2.18.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.17.0',
    toVersion:
      '2.18.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
