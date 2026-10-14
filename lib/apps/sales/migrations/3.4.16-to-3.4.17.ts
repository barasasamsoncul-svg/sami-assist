import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(20) NOT NULL DEFAULT 'none'
      CHECK (deposit_type IN ('none','percent','fixed')),
    ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_value >= 0);

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(20) NOT NULL DEFAULT 'none'
      CHECK (deposit_type IN ('none','percent','fixed')),
    ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_value >= 0),
    ADD COLUMN IF NOT EXISTS deposit_required_amount NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_required_amount >= 0),
    ADD COLUMN IF NOT EXISTS deposit_received_amount NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_received_amount >= 0),
    ADD COLUMN IF NOT EXISTS deposit_retainer_id UUID,
    ADD COLUMN IF NOT EXISTS deposit_payment_id UUID,
    ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(30) NOT NULL DEFAULT 'none'
      CHECK (deposit_status IN ('none','pending','received','partially_applied','applied','refunded'));
`;

export const SALES_3_4_16_TO_3_4_17:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.16-to-3.4.17',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.16',
    toVersion: '3.4.17',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
