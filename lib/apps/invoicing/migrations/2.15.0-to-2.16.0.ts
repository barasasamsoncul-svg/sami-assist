import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_tax_rates
    ADD COLUMN IF NOT EXISTS code VARCHAR(80),
    ADD COLUMN IF NOT EXISTS jurisdiction_code VARCHAR(80),
    ADD COLUMN IF NOT EXISTS price_included BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS valid_from DATE,
    ADD COLUMN IF NOT EXISTS valid_to DATE;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_rate_code
    ON public.invoicing_tax_rates(company_id, LOWER(code))
    WHERE code IS NOT NULL
      AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_tax_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    code VARCHAR(80),
    description TEXT,
    tax_type VARCHAR(40) NOT NULL DEFAULT 'vat',
    country_code VARCHAR(2),
    jurisdiction_code VARCHAR(80),
    calculation_mode VARCHAR(20) NOT NULL DEFAULT 'sum'
      CHECK (calculation_mode IN ('sum','compound')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_group_name
    ON public.invoicing_tax_groups(company_id, LOWER(name))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_group_code
    ON public.invoicing_tax_groups(company_id, LOWER(code))
    WHERE code IS NOT NULL
      AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_tax_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
    tax_rate_id UUID NOT NULL REFERENCES public.invoicing_tax_rates(id) ON DELETE RESTRICT,
    sequence_no INTEGER NOT NULL DEFAULT 10 CHECK (sequence_no > 0),
    compound BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, tax_rate_id)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_tax_group_members_group
    ON public.invoicing_tax_group_members(company_id, group_id, sequence_no, id);

  CREATE TABLE IF NOT EXISTS public.invoicing_fiscal_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    code VARCHAR(80),
    description TEXT,
    country_code VARCHAR(2),
    customer_type VARCHAR(30),
    priority INTEGER NOT NULL DEFAULT 100,
    auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_fiscal_position_name
    ON public.invoicing_fiscal_positions(company_id, LOWER(name))
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_fiscal_position_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    fiscal_position_id UUID NOT NULL REFERENCES public.invoicing_fiscal_positions(id) ON DELETE CASCADE,
    source_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE CASCADE,
    source_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
    destination_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE RESTRICT,
    destination_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE RESTRICT,
    exempt BOOLEAN NOT NULL DEFAULT FALSE,
    label VARCHAR(180),
    sequence_no INTEGER NOT NULL DEFAULT 100,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      source_tax_rate_id IS NOT NULL
      OR source_tax_group_id IS NOT NULL
    ),
    CHECK (
      exempt = TRUE
      OR destination_tax_rate_id IS NOT NULL
      OR destination_tax_group_id IS NOT NULL
    )
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_fiscal_position_mappings
    ON public.invoicing_fiscal_position_mappings(company_id, fiscal_position_id, sequence_no, id);

  CREATE TABLE IF NOT EXISTS public.invoicing_tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    country_code VARCHAR(2),
    customer_type VARCHAR(30),
    tax_category VARCHAR(80),
    source_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE CASCADE,
    source_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
    destination_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE RESTRICT,
    destination_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL DEFAULT 'map'
      CHECK (action IN ('map','exempt','keep')),
    valid_from DATE,
    valid_to DATE,
    stop_processing BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_tax_rules_match
    ON public.invoicing_tax_rules(
      company_id,
      is_active,
      priority,
      country_code,
      customer_type,
      tax_category
    )
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_tax_exemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
    exemption_type VARCHAR(80) NOT NULL DEFAULT 'customer',
    certificate_number VARCHAR(180),
    tax_type VARCHAR(40),
    country_code VARCHAR(2),
    valid_from DATE,
    valid_to DATE,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','revoked','expired')),
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_tax_exemptions_customer
    ON public.invoicing_tax_exemptions(company_id, customer_id, status, valid_to);

  CREATE TABLE IF NOT EXISTS public.invoicing_tax_localizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    jurisdiction_code VARCHAR(80),
    tax_registration_number VARCHAR(180),
    default_tax_type VARCHAR(40) NOT NULL DEFAULT 'vat',
    filing_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'
      CHECK (filing_frequency IN ('monthly','quarterly','annual','custom')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_localization_name
    ON public.invoicing_tax_localizations(company_id, LOWER(name))
    WHERE deleted_at IS NULL;

  ALTER TABLE public.invoicing_customers
    ADD COLUMN IF NOT EXISTS fiscal_position_id UUID;

  ALTER TABLE public.invoicing_catalog_items
    ADD COLUMN IF NOT EXISTS tax_category VARCHAR(80),
    ADD COLUMN IF NOT EXISTS default_tax_group_id UUID;

  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS fiscal_position_id UUID,
    ADD COLUMN IF NOT EXISTS tax_localization_id UUID,
    ADD COLUMN IF NOT EXISTS tax_context JSONB NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE public.invoicing_invoice_items
    ADD COLUMN IF NOT EXISTS tax_group_id UUID,
    ADD COLUMN IF NOT EXISTS tax_components JSONB NOT NULL DEFAULT '[]'::jsonb;

  CREATE OR REPLACE VIEW public.invoicing_tax_rate_usage AS
  SELECT
    rate.company_id,
    rate.id AS tax_rate_id,
    rate.name,
    rate.code,
    rate.tax_type,
    rate.country_code,
    rate.rate,
    rate.is_active,
    COUNT(item.id)::int AS invoice_line_count,
    COALESCE(SUM(item.tax_amount),0)::numeric(19,4) AS tax_amount
  FROM public.invoicing_tax_rates rate
  LEFT JOIN public.invoicing_invoice_items item
    ON item.tax_rate_id = rate.id
   AND item.company_id = rate.company_id
  WHERE rate.deleted_at IS NULL
  GROUP BY
    rate.company_id,
    rate.id,
    rate.name,
    rate.code,
    rate.tax_type,
    rate.country_code,
    rate.rate,
    rate.is_active;
`;


export const INVOICING_2_15_0_TO_2_16_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.15.0-to-2.16.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.15.0',
    toVersion:
      '2.16.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
