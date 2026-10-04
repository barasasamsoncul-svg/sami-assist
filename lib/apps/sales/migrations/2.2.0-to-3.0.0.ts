import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS current_revision INTEGER NOT NULL DEFAULT 1;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS pricelist_id UUID;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_quote_items
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_quote_items
    ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_quote_items
    ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_quote_items
    ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS pricelist_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS public.sales_pricelists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    currency VARCHAR(3) NOT NULL,
    billing_customer_id UUID,
    valid_from DATE,
    valid_until DATE,
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pricelists_name
    ON public.sales_pricelists(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pricelists_code
    ON public.sales_pricelists(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_pricelists_active
    ON public.sales_pricelists(company_id, is_active, priority, name)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_pricelist_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    pricelist_id UUID NOT NULL REFERENCES public.sales_pricelists(id) ON DELETE CASCADE,
    catalog_item_id UUID,
    min_quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    calculation VARCHAR(30) NOT NULL
      CHECK (calculation IN ('fixed','discount_percent','markup_percent')),
    amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    priority INTEGER NOT NULL DEFAULT 100,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_pricelist_rules_lookup
    ON public.sales_pricelist_rules(
      company_id,
      pricelist_id,
      catalog_item_id,
      min_quantity DESC,
      priority
    );

  CREATE TABLE IF NOT EXISTS public.sales_quote_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    company_id UUID NOT NULL,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    reason TEXT,
    snapshot JSONB NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(quote_id, revision_number)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_revisions_quote
    ON public.sales_quote_revisions(quote_id, revision_number DESC);

  CREATE TABLE IF NOT EXISTS public.sales_quote_optional_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
    company_id UUID NOT NULL,
    catalog_item_id UUID,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    sku_snapshot VARCHAR(180),
    unit VARCHAR(60) NOT NULL DEFAULT 'unit',
    quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    tax_name_snapshot VARCHAR(180),
    tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
    is_selected BOOLEAN NOT NULL DEFAULT FALSE,
    selected_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_quote_optional_items_quote
    ON public.sales_quote_optional_items(quote_id, sort_order, id);
`;

export const SALES_2_2_0_TO_3_0_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-2.2.0-to-3.0.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '2.2.0',
    toVersion:
      '3.0.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
