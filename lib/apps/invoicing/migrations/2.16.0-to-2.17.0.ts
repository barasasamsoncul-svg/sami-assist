import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_etims_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    solution_type VARCHAR(10) NOT NULL DEFAULT 'oscu'
      CHECK (solution_type IN ('oscu','vscu')),
    environment VARCHAR(12) NOT NULL DEFAULT 'sandbox'
      CHECK (environment IN ('sandbox','production')),
    taxpayer_pin VARCHAR(20) NOT NULL,
    branch_id VARCHAR(20) NOT NULL DEFAULT '00',
    device_serial_number VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'configured'
      CHECK (status IN ('disabled','configured','activated','error')),
    default_payment_type_code VARCHAR(4) NOT NULL DEFAULT '02',
    next_transaction_invoice_no BIGINT NOT NULL DEFAULT 1
      CHECK (next_transaction_invoice_no > 0),
    kra_sdc_id VARCHAR(120),
    kra_mrc_no VARCHAR(120),
    communication_key_sealed TEXT,
    communication_key_version VARCHAR(32),
    initialization_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_device_init_at TIMESTAMPTZ,
    last_reference_sync_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_code VARCHAR(120),
    last_error_message TEXT,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
  );

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_item_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    catalog_item_id UUID NOT NULL REFERENCES public.invoicing_catalog_items(id) ON DELETE CASCADE,
    item_classification_code VARCHAR(40) NOT NULL,
    item_code VARCHAR(120) NOT NULL,
    item_type_code VARCHAR(1) NOT NULL DEFAULT '3'
      CHECK (item_type_code IN ('1','2','3')),
    origin_country_code VARCHAR(3) NOT NULL DEFAULT 'KE',
    packaging_unit_code VARCHAR(20) NOT NULL,
    quantity_unit_code VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    kra_sync_status VARCHAR(20) NOT NULL DEFAULT 'not_synced'
      CHECK (kra_sync_status IN ('not_synced','synced','failed')),
    kra_last_sync_at TIMESTAMPTZ,
    kra_result_code VARCHAR(120),
    kra_result_message TEXT,
    kra_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, catalog_item_id),
    UNIQUE(company_id, item_code)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_item_mappings_company
    ON public.invoicing_etims_item_mappings(company_id, is_active, catalog_item_id);

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_tax_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE CASCADE,
    tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
    tax_type_code VARCHAR(1) NOT NULL
      CHECK (tax_type_code IN ('A','B','C','D','E')),
    kra_rate NUMERIC(9,4) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (tax_rate_id IS NOT NULL AND tax_group_id IS NULL)
      OR
      (tax_rate_id IS NULL AND tax_group_id IS NOT NULL)
    )
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_etims_tax_rate_mapping
    ON public.invoicing_etims_tax_mappings(company_id, tax_rate_id)
    WHERE tax_rate_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_etims_tax_group_mapping
    ON public.invoicing_etims_tax_mappings(company_id, tax_group_id)
    WHERE tax_group_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_reference_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    reference_type VARCHAR(40) NOT NULL,
    external_key VARCHAR(160) NOT NULL DEFAULT 'snapshot',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_updated_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    UNIQUE(company_id, reference_type, external_key)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_reference_cache_company
    ON public.invoicing_etims_reference_cache(company_id, reference_type, synced_at DESC);

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    credit_note_id UUID REFERENCES public.invoicing_credit_notes(id) ON DELETE RESTRICT,
    source_key VARCHAR(180) NOT NULL,
    submission_type VARCHAR(20) NOT NULL
      CHECK (submission_type IN ('sale','credit_note')),
    solution_type VARCHAR(10) NOT NULL
      CHECK (solution_type IN ('oscu','vscu')),
    environment VARCHAR(12) NOT NULL
      CHECK (environment IN ('sandbox','production')),
    transaction_invoice_no BIGINT NOT NULL CHECK (transaction_invoice_no > 0),
    source_hash VARCHAR(64) NOT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'submitting'
      CHECK (status IN ('queued','submitting','succeeded','failed','retryable')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    kra_result_code VARCHAR(120),
    kra_result_message TEXT,
    kra_result_date VARCHAR(80),
    receipt_no BIGINT,
    total_receipt_no BIGINT,
    sdc_id VARCHAR(120),
    mrc_no VARCHAR(120),
    receipt_publication_date VARCHAR(80),
    internal_data TEXT,
    receipt_signature TEXT,
    verification_url TEXT,
    submitted_by UUID,
    succeeded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, source_key)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_submissions_company
    ON public.invoicing_etims_submissions(company_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_submissions_invoice
    ON public.invoicing_etims_submissions(company_id, invoice_id, created_at DESC)
    WHERE invoice_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_submissions_credit
    ON public.invoicing_etims_submissions(company_id, credit_note_id, created_at DESC)
    WHERE credit_note_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_submission_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES public.invoicing_etims_submissions(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    http_status INTEGER,
    kra_result_code VARCHAR(120),
    error_code VARCHAR(120),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(submission_id, attempt_no)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_attempts_submission
    ON public.invoicing_etims_submission_attempts(submission_id, attempt_no DESC);
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
