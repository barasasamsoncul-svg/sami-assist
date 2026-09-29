import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_templates
    ADD COLUMN IF NOT EXISTS design_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS density VARCHAR(20) NOT NULL DEFAULT 'comfortable',
    ADD COLUMN IF NOT EXISTS header_style VARCHAR(20) NOT NULL DEFAULT 'band',
    ADD COLUMN IF NOT EXISTS document_title VARCHAR(80) NOT NULL DEFAULT 'Invoice',
    ADD COLUMN IF NOT EXISTS from_label VARCHAR(40) NOT NULL DEFAULT 'From',
    ADD COLUMN IF NOT EXISTS bill_to_label VARCHAR(40) NOT NULL DEFAULT 'Bill to',
    ADD COLUMN IF NOT EXISTS notes_label VARCHAR(40) NOT NULL DEFAULT 'Notes',
    ADD COLUMN IF NOT EXISTS terms_label VARCHAR(40) NOT NULL DEFAULT 'Terms',
    ADD COLUMN IF NOT EXISTS payment_label VARCHAR(60) NOT NULL DEFAULT 'Payment instructions',
    ADD COLUMN IF NOT EXISTS footer_alignment VARCHAR(10) NOT NULL DEFAULT 'left',
    ADD COLUMN IF NOT EXISTS show_status BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_page_numbers BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_sku BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_unit BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_quantity BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_unit_price BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_line_tax BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_line_discount BOOLEAN NOT NULL DEFAULT TRUE;

  ALTER TABLE public.invoicing_templates
    DROP CONSTRAINT IF EXISTS invoicing_templates_design_version_check,
    DROP CONSTRAINT IF EXISTS invoicing_templates_density_check,
    DROP CONSTRAINT IF EXISTS invoicing_templates_header_style_check,
    DROP CONSTRAINT IF EXISTS invoicing_templates_footer_alignment_check;

  ALTER TABLE public.invoicing_templates
    ADD CONSTRAINT invoicing_templates_design_version_check
      CHECK (design_version > 0),
    ADD CONSTRAINT invoicing_templates_density_check
      CHECK (density IN ('compact','comfortable','spacious')),
    ADD CONSTRAINT invoicing_templates_header_style_check
      CHECK (header_style IN ('band','minimal','split')),
    ADD CONSTRAINT invoicing_templates_footer_alignment_check
      CHECK (footer_alignment IN ('left','center','right'));
`;


export const INVOICING_2_10_0_TO_2_11_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.10.0-to-2.11.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.10.0',
    toVersion:
      '2.11.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
