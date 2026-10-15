import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

const SQL = `
  -- Earlier Sales 3.4 schema generations created pipeline stages before all
  -- runtime fields had been introduced. Keep upgrades additive and safe for
  -- tenants that already have some or all of these columns.
  ALTER TABLE public.sales_pipeline_stages
    ADD COLUMN IF NOT EXISTS code VARCHAR(60),
    ADD COLUMN IF NOT EXISTS is_won BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS fold_in_kanban BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS color VARCHAR(20),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipeline_stages_code
    ON public.sales_pipeline_stages(company_id, LOWER(BTRIM(code)))
    WHERE deleted_at IS NULL AND code IS NOT NULL;
`;

export const SALES_3_4_19_TO_3_4_20: SamiModuleMigrationDefinition = {
  key: 'sales-3.4.19-to-3.4.20',
  moduleKey: 'sales',
  namespace: 'sales',
  fromVersion: '3.4.19',
  toVersion: '3.4.20',
  run: async client => {
    await executeSafeSamiModuleMigrationSql(client, SQL);
  },
};
