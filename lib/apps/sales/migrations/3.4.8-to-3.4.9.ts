import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_order_saved_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    status_view VARCHAR(40) NOT NULL DEFAULT 'all'
      CHECK (status_view IN (
        'all',
        'awaiting_fulfillment',
        'partially_fulfilled',
        'fulfilled',
        'not_invoiced',
        'partially_invoiced',
        'invoiced'
      )),
    search_query VARCHAR(120) NOT NULL DEFAULT '',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_saved_views_owner_name
    ON public.sales_order_saved_views(company_id, user_id, LOWER(name))
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_order_saved_views_owner
    ON public.sales_order_saved_views(company_id, user_id, created_at DESC)
    WHERE deleted_at IS NULL;
`;

export const SALES_3_4_8_TO_3_4_9:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.8-to-3.4.9',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.8',
    toVersion: '3.4.9',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
