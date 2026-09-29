import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_document_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    document_type VARCHAR(30) NOT NULL DEFAULT 'invoice'
      CHECK (document_type IN ('invoice')),
    version_no INTEGER NOT NULL CHECK (version_no > 0),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot_reason VARCHAR(40) NOT NULL
      CHECK (snapshot_reason IN ('confirmed','delivery','legacy_backfill','manual')),
    invoice_status VARCHAR(30) NOT NULL,
    renderer_version VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    payload_sha256 VARCHAR(64) NOT NULL,
    pdf_bytes BYTEA NOT NULL,
    pdf_sha256 VARCHAR(64) NOT NULL,
    pdf_size_bytes INTEGER NOT NULL
      CHECK (pdf_size_bytes BETWEEN 1 AND 20971520),
    created_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(invoice_id, version_no),
    UNIQUE(invoice_id, pdf_sha256)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_document_snapshot_primary
    ON public.invoicing_document_snapshots(invoice_id)
    WHERE is_primary = TRUE;

  CREATE INDEX IF NOT EXISTS idx_invoicing_document_snapshots_invoice
    ON public.invoicing_document_snapshots(
      company_id,
      invoice_id,
      version_no DESC
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_document_snapshots_hash
    ON public.invoicing_document_snapshots(
      company_id,
      pdf_sha256
    );

  ALTER TABLE public.invoicing_delivery_log
    ADD COLUMN IF NOT EXISTS document_snapshot_id UUID
      REFERENCES public.invoicing_document_snapshots(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_invoicing_delivery_snapshot
    ON public.invoicing_delivery_log(document_snapshot_id)
    WHERE document_snapshot_id IS NOT NULL;
`;


export const INVOICING_2_9_0_TO_2_10_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.9.0-to-2.10.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.9.0',
    toVersion:
      '2.10.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
