import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    base_catalog_item_id UUID NOT NULL,
    variant_catalog_item_id UUID NOT NULL,
    variant_label VARCHAR(180) NOT NULL,
    sku VARCHAR(120) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attributes) = 'array'),
    unit_price NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_product_variants_catalog_item
    ON public.sales_product_variants(company_id, variant_catalog_item_id) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_product_variants_sku
    ON public.sales_product_variants(company_id, LOWER(BTRIM(sku))) WHERE deleted_at IS NULL AND is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_sales_product_variants_parent
    ON public.sales_product_variants(company_id, base_catalog_item_id, is_active, variant_label) WHERE deleted_at IS NULL;
`;

export const SALES_3_4_18_TO_3_4_19: SamiModuleMigrationDefinition = {
  key: 'sales-3.4.18-to-3.4.19',
  moduleKey: 'sales',
  namespace: 'sales',
  fromVersion: '3.4.18',
  toVersion: '3.4.19',
  run: async client => { await executeSafeSamiModuleMigrationSql(client, SQL); },
};
