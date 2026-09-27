import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_accounting_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    event_key VARCHAR(220) NOT NULL,
    source_type VARCHAR(60) NOT NULL,
    source_id UUID NOT NULL,
    journal_id UUID NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, event_key)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_accounting_links_source
    ON public.invoicing_accounting_links(
      company_id,
      source_type,
      source_id
    );
`;


export const INVOICING_2_2_0_TO_2_3_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.2.0-to-2.3.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.2.0',
    toVersion:
      '2.3.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
