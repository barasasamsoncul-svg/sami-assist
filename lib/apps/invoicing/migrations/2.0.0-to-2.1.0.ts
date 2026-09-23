import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';


const SQL = `
  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS bill_to_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS bill_to_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS bill_to_phone VARCHAR(60),
    ADD COLUMN IF NOT EXISTS bill_to_address TEXT,
    ADD COLUMN IF NOT EXISTS bill_to_tax_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS payment_terms_name_snapshot VARCHAR(140),
    ADD COLUMN IF NOT EXISTS tax_calculation VARCHAR(20) NOT NULL DEFAULT 'exclusive';

  UPDATE public.invoicing_invoices i
  SET
    bill_to_name =
      COALESCE(
        i.bill_to_name,
        c.name
      ),
    bill_to_email =
      COALESCE(
        i.bill_to_email,
        c.email
      ),
    bill_to_phone =
      COALESCE(
        i.bill_to_phone,
        c.phone
      ),
    bill_to_address =
      COALESCE(
        i.bill_to_address,
        c.billing_address
      ),
    bill_to_tax_id =
      COALESCE(
        i.bill_to_tax_id,
        c.tax_id
      )
  FROM public.invoicing_customers c
  WHERE c.id =
        i.customer_id;

  UPDATE public.invoicing_invoices i
  SET
    payment_terms_name_snapshot =
      COALESCE(
        i.payment_terms_name_snapshot,
        pt.name
      )
  FROM public.invoicing_customers c
  INNER JOIN public.invoicing_payment_terms pt
    ON pt.id =
       c.payment_terms_id
  WHERE c.id =
        i.customer_id;

  UPDATE public.invoicing_invoices i
  SET
    tax_calculation =
      CASE
        WHEN s.tax_calculation =
             'inclusive'
        THEN 'inclusive'
        ELSE 'exclusive'
      END
  FROM public.invoicing_settings s
  WHERE s.company_id =
        i.company_id;
`;


export const INVOICING_2_0_0_TO_2_1_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.0.0-to-2.1.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.0.0',
    toVersion:
      '2.1.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
