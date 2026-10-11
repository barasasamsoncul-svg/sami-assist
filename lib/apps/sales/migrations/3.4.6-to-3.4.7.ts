import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_quote_saved_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    status_view VARCHAR(40) NOT NULL DEFAULT 'all'
      CHECK (status_view IN (
        'all',
        'draft',
        'needs_approval',
        'awaiting_response',
        'accepted',
        'converted',
        'closed_without_sale'
      )),
    search_query VARCHAR(120) NOT NULL DEFAULT '',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_saved_views_owner_name
    ON public.sales_quote_saved_views(company_id, user_id, LOWER(name))
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_quote_saved_views_owner
    ON public.sales_quote_saved_views(company_id, user_id, created_at DESC)
    WHERE deleted_at IS NULL;
`;

export const SALES_3_4_6_TO_3_4_7:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.6-to-3.4.7',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.6',
    toVersion: '3.4.7',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
