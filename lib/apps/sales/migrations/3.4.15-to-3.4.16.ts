import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS public_portal_token_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS public_portal_token_created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS public_portal_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS public_portal_token_revoked_at TIMESTAMPTZ;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_v2_public_portal_token
    ON public.sales_orders_v2(public_portal_token_hash)
    WHERE public_portal_token_hash IS NOT NULL
      AND public_portal_token_revoked_at IS NULL;
`;

export const SALES_3_4_15_TO_3_4_16:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.15-to-3.4.16',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.15',
    toVersion: '3.4.16',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
