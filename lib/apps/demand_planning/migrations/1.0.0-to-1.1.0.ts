import 'server-only';
import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

/** Adds retry-safe run identifiers and indexes without rewriting existing planning history. */
export const DEMAND_PLANNING_1_0_0_TO_1_1_0: SamiModuleMigrationDefinition = {
  key: 'demand-planning-1.0.0-to-1.1.0-idempotent-forecast-runs',
  moduleKey: 'demand_planning',
  namespace: 'demand_planning',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, [
      'ALTER TABLE public.demand_forecasts ADD COLUMN IF NOT EXISTS request_key UUID;',
      'ALTER TABLE public.demand_forecasts ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_demand_forecasts_company_request_key ON public.demand_forecasts(company_id,request_key) WHERE request_key IS NOT NULL;',
      'CREATE INDEX IF NOT EXISTS idx_demand_forecast_lines_company_forecast_product ON public.demand_forecast_lines(company_id,forecast_id,product_reference) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_replenishment_recommendations_company_status_due ON public.replenishment_recommendations(company_id,status,needed_by,created_at DESC) WHERE deleted_at IS NULL;',
      'CREATE INDEX IF NOT EXISTS idx_stock_movements_company_demand_history ON public.stock_movements(company_id,movement_type,created_at DESC,product_id) WHERE deleted_at IS NULL;',
    ].join('\n'));
  },
};
