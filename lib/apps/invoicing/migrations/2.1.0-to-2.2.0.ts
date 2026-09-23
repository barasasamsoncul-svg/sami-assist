import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';


const SQL = `
  ALTER TABLE public.invoicing_recurring_templates
    ADD COLUMN IF NOT EXISTS source_invoice_id UUID
      REFERENCES public.invoicing_invoices(id)
      ON DELETE SET NULL;

  ALTER TABLE public.invoicing_settings
    ADD COLUMN IF NOT EXISTS reminder_channels JSONB
      NOT NULL
      DEFAULT '["email"]'::jsonb;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_reminders_once
    ON public.invoicing_reminders(
      invoice_id,
      reminder_type,
      channel
    );
`;


export const INVOICING_2_1_0_TO_2_2_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.1.0-to-2.2.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.1.0',
    toVersion:
      '2.2.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
