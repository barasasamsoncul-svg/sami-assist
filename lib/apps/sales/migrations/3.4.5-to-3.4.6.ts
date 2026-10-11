import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
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

  CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_due
    ON public.sales_lead_activities(company_id, lead_id, status, due_date)
    WHERE deleted_at IS NULL;
`;

export const SALES_3_4_5_TO_3_4_6:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.5-to-3.4.6',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.5',
    toVersion: '3.4.6',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };