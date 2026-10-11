import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_lead_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    lead_id UUID NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
    previous_salesperson_user_id UUID,
    new_salesperson_user_id UUID,
    previous_sales_team_id UUID,
    new_sales_team_id UUID,
    previous_territory_id UUID,
    new_territory_id UUID,
    changed_by UUID NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_lead_assignment_history_timeline
    ON public.sales_lead_assignment_history(company_id, lead_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sales_lead_assignment_history_actor
    ON public.sales_lead_assignment_history(company_id, changed_by, created_at DESC);
`;

export const SALES_3_4_14_TO_3_4_15:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.14-to-3.4.15',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.14',
    toVersion: '3.4.15',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
