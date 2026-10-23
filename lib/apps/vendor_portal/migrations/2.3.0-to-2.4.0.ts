import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

/** Additive supplier invitation, response uniqueness and company-boundary guards. */
export const VENDOR_PORTAL_2_3_0_TO_2_4_0: SamiModuleMigrationDefinition = {
  key: 'vendor-portal-2.3.0-to-2.4.0-secure-rfq-invitations',
  moduleKey: 'vendor_portal',
  namespace: 'vendor_portal',
  fromVersion: '2.3.0',
  toVersion: '2.4.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, `
ALTER TABLE public.vendor_portal_rfqs
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS public_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS public_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_email_status VARCHAR(40) NOT NULL DEFAULT 'not_sent';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_accounts_company_id_id
  ON public.vendor_portal_accounts(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_rfqs_company_id_id
  ON public.vendor_portal_rfqs(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfqs_company_id_id
  ON public.supplier_rfqs(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_company_id_id
  ON public.suppliers(company_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_accounts_company_supplier
  ON public.vendor_portal_accounts(company_id, vendor_reference)
  WHERE vendor_reference IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_rfq_responses_company_rfq
  ON public.vendor_portal_rfq_responses(company_id, portal_rfq_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_rfqs_company_supplier_source_active
  ON public.vendor_portal_rfqs(company_id, purchase_rfq_id, vendor_account_id)
  WHERE deleted_at IS NULL AND purchase_rfq_id IS NOT NULL
    AND status NOT IN ('cancelled','delivery_failed','expired');
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_rfqs_public_token
  ON public.vendor_portal_rfqs(public_token_hash)
  WHERE public_token_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_portal_rfqs_company_status_due
  ON public.vendor_portal_rfqs(company_id, status, due_at, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_portal_responses_company_review
  ON public.vendor_portal_rfq_responses(company_id, status, submitted_at DESC)
  WHERE deleted_at IS NULL;

DO $sami_vendor_portal_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendor_portal_accounts_company_supplier'
      AND conrelid = 'public.vendor_portal_accounts'::regclass
  ) THEN
    ALTER TABLE public.vendor_portal_accounts
      ADD CONSTRAINT fk_vendor_portal_accounts_company_supplier
      FOREIGN KEY (company_id, vendor_reference)
      REFERENCES public.suppliers(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendor_portal_rfqs_company_account'
      AND conrelid = 'public.vendor_portal_rfqs'::regclass
  ) THEN
    ALTER TABLE public.vendor_portal_rfqs
      ADD CONSTRAINT fk_vendor_portal_rfqs_company_account
      FOREIGN KEY (company_id, vendor_account_id)
      REFERENCES public.vendor_portal_accounts(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendor_portal_rfqs_company_purchase_rfq'
      AND conrelid = 'public.vendor_portal_rfqs'::regclass
  ) THEN
    ALTER TABLE public.vendor_portal_rfqs
      ADD CONSTRAINT fk_vendor_portal_rfqs_company_purchase_rfq
      FOREIGN KEY (company_id, purchase_rfq_id)
      REFERENCES public.supplier_rfqs(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendor_portal_responses_company_rfq'
      AND conrelid = 'public.vendor_portal_rfq_responses'::regclass
  ) THEN
    ALTER TABLE public.vendor_portal_rfq_responses
      ADD CONSTRAINT fk_vendor_portal_responses_company_rfq
      FOREIGN KEY (company_id, portal_rfq_id)
      REFERENCES public.vendor_portal_rfqs(company_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendor_portal_documents_company_account'
      AND conrelid = 'public.vendor_portal_documents'::regclass
  ) THEN
    ALTER TABLE public.vendor_portal_documents
      ADD CONSTRAINT fk_vendor_portal_documents_company_account
      FOREIGN KEY (company_id, vendor_account_id)
      REFERENCES public.vendor_portal_accounts(company_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendor_portal_messages_company_account'
      AND conrelid = 'public.vendor_portal_messages'::regclass
  ) THEN
    ALTER TABLE public.vendor_portal_messages
      ADD CONSTRAINT fk_vendor_portal_messages_company_account
      FOREIGN KEY (company_id, vendor_account_id)
      REFERENCES public.vendor_portal_accounts(company_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END
$sami_vendor_portal_constraints$;
`);
  },
};
