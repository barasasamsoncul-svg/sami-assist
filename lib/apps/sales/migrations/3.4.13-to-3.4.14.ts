import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  CREATE TABLE IF NOT EXISTS public.sales_lead_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    source_match VARCHAR(120),
    sales_team_id UUID NOT NULL REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 10000),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_lead_assignment_rules_name
    ON public.sales_lead_assignment_rules(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_lead_assignment_rules_source
    ON public.sales_lead_assignment_rules(company_id, LOWER(BTRIM(COALESCE(source_match,''))))
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_lead_assignment_rules_route
    ON public.sales_lead_assignment_rules(company_id, is_active, priority, created_at)
    WHERE deleted_at IS NULL;

  ALTER TABLE public.sales_leads
    ADD COLUMN IF NOT EXISTS assignment_rule_id UUID
      REFERENCES public.sales_lead_assignment_rules(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_leads_assignment_rule
    ON public.sales_leads(company_id, assignment_rule_id)
    WHERE assignment_rule_id IS NOT NULL AND deleted_at IS NULL;
`;

export const SALES_3_4_13_TO_3_4_14:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.13-to-3.4.14',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.13',
    toVersion: '3.4.14',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
