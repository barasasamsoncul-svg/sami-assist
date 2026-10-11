import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = \`
  CREATE TABLE IF NOT EXISTS public.sales_pipeline_saved_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    view_type VARCHAR(30) NOT NULL
      CHECK (view_type IN ('leads','opportunities')),
    name VARCHAR(80) NOT NULL,
    status_view VARCHAR(30) NOT NULL DEFAULT 'all'
      CHECK (status_view IN (
        'all','new','contacted','qualified','disqualified','converted','open','won','lost'
      )),
    search_query VARCHAR(120) NOT NULL DEFAULT '',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipeline_saved_views_owner_name
    ON public.sales_pipeline_saved_views(company_id, user_id, view_type, LOWER(name))
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_pipeline_saved_views_owner
    ON public.sales_pipeline_saved_views(company_id, user_id, view_type, created_at DESC)
    WHERE deleted_at IS NULL;
\`;

export const SALES_3_4_10_TO_3_4_11:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.10-to-3.4.11',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.10',
    toVersion: '3.4.11',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
