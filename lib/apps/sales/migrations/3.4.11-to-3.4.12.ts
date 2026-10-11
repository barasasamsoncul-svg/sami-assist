import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_opportunity_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    opportunity_id UUID NOT NULL REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
    activity_type VARCHAR(20) NOT NULL
      CHECK (activity_type IN ('call','email','meeting','task','note')),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'planned'
      CHECK (status IN ('planned','completed','cancelled')),
    assigned_user_id UUID,
    completed_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_sales_opportunity_activities_due
    ON public.sales_opportunity_activities(company_id, opportunity_id, status, due_date)
    WHERE deleted_at IS NULL;
`;

export const SALES_3_4_11_TO_3_4_12:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.11-to-3.4.12',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.11',
    toVersion: '3.4.12',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
