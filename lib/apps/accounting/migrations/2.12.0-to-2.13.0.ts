import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.accounting_bank_feed_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE CASCADE,
    provider_key VARCHAR(100) NOT NULL,
    provider_label VARCHAR(160) NOT NULL,
    external_account_reference VARCHAR(255) NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    sync_cursor TEXT,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (status IN ('active','paused','error','disconnected'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_feed_connection
    ON public.accounting_bank_feed_connections(
      company_id,
      bank_account_id,
      provider_key,
      external_account_reference
    )
    WHERE deleted_at IS NULL
      AND status <> 'disconnected';

  CREATE INDEX IF NOT EXISTS idx_accounting_feed_connection_status
    ON public.accounting_bank_feed_connections(company_id,status,last_synced_at)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_statement_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE CASCADE,
    feed_connection_id UUID
      REFERENCES public.accounting_bank_feed_connections(id) ON DELETE SET NULL,
    request_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    source_type VARCHAR(30) NOT NULL,
    source_filename VARCHAR(255),
    source_sha256 VARCHAR(64),
    statement_from DATE,
    statement_to DATE,
    opening_balance NUMERIC(19,2),
    closing_balance NUMERIC(19,2),
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'imported',
    imported_by UUID NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (source_type IN ('csv','ofx','qif','feed','manual')),
    CHECK (status IN ('imported','partial','rejected','cancelled')),
    CHECK (total_rows >= 0),
    CHECK (imported_rows >= 0),
    CHECK (duplicate_rows >= 0),
    CHECK (error_rows >= 0)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_statement_import_request
    ON public.accounting_statement_import_batches(company_id,request_key)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_statement_source_file
    ON public.accounting_statement_import_batches(
      company_id,
      bank_account_id,
      source_sha256
    )
    WHERE deleted_at IS NULL
      AND source_sha256 IS NOT NULL
      AND status <> 'cancelled';

  CREATE INDEX IF NOT EXISTS idx_accounting_statement_batches_account
    ON public.accounting_statement_import_batches(
      company_id,
      bank_account_id,
      imported_at DESC
    )
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_statement_import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL
      REFERENCES public.accounting_statement_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    transaction_date DATE,
    value_date DATE,
    description TEXT,
    external_reference VARCHAR(255),
    external_transaction_id VARCHAR(255),
    counterparty VARCHAR(255),
    amount NUMERIC(19,2),
    fingerprint VARCHAR(64),
    import_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    statement_line_id UUID
      REFERENCES public.accounting_bank_statement_lines(id) ON DELETE SET NULL,
    duplicate_of_line_id UUID
      REFERENCES public.accounting_bank_statement_lines(id) ON DELETE SET NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (row_number > 0),
    CHECK (import_status IN ('pending','imported','duplicate','error','ignored'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_statement_import_row
    ON public.accounting_statement_import_rows(company_id,batch_id,row_number)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_statement_rows_status
    ON public.accounting_statement_import_rows(company_id,batch_id,import_status,row_number)
    WHERE deleted_at IS NULL;

  ALTER TABLE public.accounting_bank_statement_lines
    ADD COLUMN IF NOT EXISTS import_batch_id UUID
      REFERENCES public.accounting_statement_import_batches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS import_row_id UUID
      REFERENCES public.accounting_statement_import_rows(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS external_transaction_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64),
    ADD COLUMN IF NOT EXISTS value_date DATE,
    ADD COLUMN IF NOT EXISTS counterparty VARCHAR(255),
    ADD COLUMN IF NOT EXISTS raw_details JSONB NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE public.accounting_bank_statement_lines
    DROP CONSTRAINT IF EXISTS accounting_bank_statement_lines_source_type_check;

  ALTER TABLE public.accounting_bank_statement_lines
    ADD CONSTRAINT accounting_bank_statement_lines_source_type_check
      CHECK (source_type IN ('csv','ofx','qif','feed','manual')) NOT VALID;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_statement_external_transaction
    ON public.accounting_bank_statement_lines(
      company_id,
      bank_account_id,
      external_transaction_id
    )
    WHERE deleted_at IS NULL
      AND external_transaction_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_statement_fingerprint
    ON public.accounting_bank_statement_lines(company_id,bank_account_id,fingerprint)
    WHERE deleted_at IS NULL
      AND fingerprint IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_statement_batch
    ON public.accounting_bank_statement_lines(company_id,import_batch_id,transaction_date)
    WHERE deleted_at IS NULL;
`;


export const ACCOUNTING_2_12_0_TO_2_13_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.12.0-to-2.13.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.12.0',
    toVersion:
      '2.13.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
