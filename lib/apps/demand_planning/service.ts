import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { EnterpriseModuleError, requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { calculateDemandPlan } from '@/lib/apps/demand_planning/forecast-math';

export class DemandPlanningInputError extends Error {
  constructor(message: string) { super(message); this.name = 'DemandPlanningInputError'; }
}
export class DemandPlanningConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'DemandPlanningConflictError'; }
}
type Operation = 'view' | 'create' | 'edit';
type Check = { moduleKey?: 'demand_planning' | 'inventory'; table: string; operation: Operation };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTBOUND_TYPES = ['out', 'outbound', 'issue', 'sale'];

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DemandPlanningInputError('Enter a valid Demand Planning request.');
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string, fallback: number, min: number, max: number): number {
  if (value == null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new DemandPlanningInputError(label + ' must be a whole number from ' + min + ' to ' + max + '.');
  return result;
}
function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) throw new DemandPlanningInputError(label + ' must be a valid identifier.');
  return value.trim();
}
function textValue(value: unknown, label: string, max = 180): string {
  if (typeof value !== 'string' || !value.trim()) throw new DemandPlanningInputError(label + ' is required.');
  const result = value.trim();
  if (result.length > max) throw new DemandPlanningInputError(label + ' is too long.');
  return result;
}
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function numeric(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) && result > 0 ? Math.min(result, 1_000_000_000) : 0;
}
async function getContext(checks: Check[]) {
  const contexts = await Promise.all(checks.map(({ moduleKey = 'demand_planning', table, operation }) =>
    requireEnterpriseModuleTableContext(moduleKey, table, operation)));
  const first = contexts[0];
  if (!first || contexts.some((item) => item.companyId !== first.companyId || item.tenantId !== first.tenantId || item.userId !== first.userId)) {
    throw new EnterpriseModuleError('WORKSPACE_CONTEXT_CHANGED', 'Your workspace or company changed. Reload Demand Planning and try again.');
  }
  return first;
}
async function transaction<T>(context: Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await context.pool.connect();
  try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
}

export type DemandForecastRow = { id: string; name: string; status: string; method: string; horizonStart: string; horizonEnd: string; lineCount: number; demandLines: number; createdAt: string };
export type DemandRecommendationRow = { id: string; forecastId: string | null; productId: string; productName: string; sku: string | null; recommendedQuantity: string; availableQuantity: string; neededBy: string | null; reason: string | null; status: string; createdAt: string };
export type DemandPlanningOverview = {
  summary: { productCount: number; forecastCount: number; suggestedCount: number; acceptedCount: number; historyMovementCount: number; productsAtRisk: number };
  forecasts: DemandForecastRow[]; recommendations: DemandRecommendationRow[];
};
const VIEW_CHECKS: Check[] = [
  { table: 'demand_forecasts', operation: 'view' }, { table: 'demand_forecast_lines', operation: 'view' },
  { table: 'replenishment_recommendations', operation: 'view' },
  { moduleKey: 'inventory', table: 'products', operation: 'view' },
  { moduleKey: 'inventory', table: 'stock_levels', operation: 'view' },
  { moduleKey: 'inventory', table: 'stock_reservations', operation: 'view' },
  { moduleKey: 'inventory', table: 'stock_movements', operation: 'view' },
];

export async function getDemandPlanningOverview(): Promise<DemandPlanningOverview> {
  const context = await getContext(VIEW_CHECKS);
  const [summary, forecasts, recommendations] = await Promise.all([
    context.pool.query([
      'SELECT',
      ' (SELECT COUNT(*)::int FROM public.products p WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.is_active=TRUE AND p.track_inventory=TRUE AND p.product_type=\'stockable\') AS product_count,',
      ' (SELECT COUNT(*)::int FROM public.demand_forecasts f WHERE f.company_id=$1 AND f.deleted_at IS NULL) AS forecast_count,',
      ' (SELECT COUNT(*)::int FROM public.replenishment_recommendations r WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status=\'suggested\') AS suggested_count,',
      ' (SELECT COUNT(*)::int FROM public.replenishment_recommendations r WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status=\'accepted\') AS accepted_count,',
      ' (SELECT COUNT(*)::int FROM public.stock_movements m WHERE m.company_id=$1 AND m.deleted_at IS NULL AND m.created_at>=NOW()-INTERVAL \'90 days\' AND m.movement_type=ANY($2::text[])) AS history_movement_count,',
      ' (SELECT COUNT(DISTINCT z.product_id)::int FROM (SELECT sl.product_id, SUM(sl.quantity) AS on_hand, MAX(sl.reorder_level) AS reorder_level FROM public.stock_levels sl WHERE sl.company_id=$1 AND sl.deleted_at IS NULL GROUP BY sl.product_id) z WHERE z.on_hand<=z.reorder_level) AS products_at_risk',
    ].join('\n'), [context.companyId, OUTBOUND_TYPES]),
    context.pool.query([
      'SELECT f.id::text, f.name, f.status, f.method, f.horizon_start::text, f.horizon_end::text, f.created_at::text,',
      ' COUNT(l.id)::int AS line_count, COUNT(l.id) FILTER (WHERE l.forecast_quantity>0)::int AS demand_lines',
      'FROM public.demand_forecasts f LEFT JOIN public.demand_forecast_lines l ON l.forecast_id=f.id AND l.company_id=f.company_id AND l.deleted_at IS NULL',
      'WHERE f.company_id=$1 AND f.deleted_at IS NULL GROUP BY f.id ORDER BY f.created_at DESC,f.id DESC LIMIT 25',
    ].join('\n'), [context.companyId]),
    context.pool.query([
      'SELECT r.id::text, r.forecast_id::text, r.product_reference::text AS product_id, p.name AS product_name, p.sku,',
      ' r.recommended_quantity::text, GREATEST(COALESCE(st.on_hand,0)-COALESCE(rs.reserved,0),0)::text AS available_quantity,',
      ' r.needed_by::text, r.reason, r.status, r.created_at::text',
      'FROM public.replenishment_recommendations r JOIN public.products p ON p.id=r.product_reference AND p.company_id=r.company_id AND p.deleted_at IS NULL',
      'LEFT JOIN (SELECT company_id,product_id,SUM(quantity) AS on_hand FROM public.stock_levels WHERE deleted_at IS NULL GROUP BY company_id,product_id) st ON st.company_id=r.company_id AND st.product_id=p.id',
      'LEFT JOIN (SELECT company_id,product_id,SUM(quantity) AS reserved FROM public.stock_reservations WHERE deleted_at IS NULL AND status IN (\'active\',\'allocated\') GROUP BY company_id,product_id) rs ON rs.company_id=r.company_id AND rs.product_id=p.id',
      'WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status IN (\'suggested\',\'accepted\',\'rejected\')',
      'ORDER BY CASE r.status WHEN \'suggested\' THEN 0 WHEN \'accepted\' THEN 1 ELSE 2 END,r.needed_by NULLS LAST,r.created_at DESC,r.id DESC LIMIT 100',
    ].join('\n'), [context.companyId]),
  ]);
  const s = summary.rows[0] || {};
  return {
    summary: { productCount: Number(s.product_count || 0), forecastCount: Number(s.forecast_count || 0), suggestedCount: Number(s.suggested_count || 0), acceptedCount: Number(s.accepted_count || 0), historyMovementCount: Number(s.history_movement_count || 0), productsAtRisk: Number(s.products_at_risk || 0) },
    forecasts: forecasts.rows.map((r) => ({ id: String(r.id), name: String(r.name), status: String(r.status), method: String(r.method), horizonStart: String(r.horizon_start), horizonEnd: String(r.horizon_end), lineCount: Number(r.line_count || 0), demandLines: Number(r.demand_lines || 0), createdAt: String(r.created_at) })),
    recommendations: recommendations.rows.map((r) => ({ id: String(r.id), forecastId: r.forecast_id == null ? null : String(r.forecast_id), productId: String(r.product_id), productName: String(r.product_name), sku: r.sku == null ? null : String(r.sku), recommendedQuantity: String(r.recommended_quantity), availableQuantity: String(r.available_quantity), neededBy: r.needed_by == null ? null : String(r.needed_by), reason: r.reason == null ? null : String(r.reason), status: String(r.status), createdAt: String(r.created_at) })),
  };
}

export async function runDemandForecast(input: unknown) {
  const body = objectInput(input);
  const horizonDays = integer(body.horizonDays, 'Forecast horizon', 30, 7, 365);
  const historyDays = integer(body.historyDays, 'Demand history', 90, 30, 730);
  const safetyStockDays = integer(body.safetyStockDays, 'Safety stock coverage', 14, 0, 180);
  const leadTimeDays = integer(body.leadTimeDays, 'Replenishment lead time', 14, 0, 180);
  const requestKey = uuid(body.idempotencyKey, 'Request key');
  const config = { horizonDays, historyDays, safetyStockDays, leadTimeDays, method: 'moving_average_stock_outbound' };
  const configHash = hash(config);
  const context = await getContext([
    { table: 'demand_forecasts', operation: 'create' }, { table: 'demand_forecast_lines', operation: 'create' },
    { table: 'replenishment_recommendations', operation: 'create' },
    { moduleKey: 'inventory', table: 'products', operation: 'view' },
    { moduleKey: 'inventory', table: 'stock_levels', operation: 'view' },
    { moduleKey: 'inventory', table: 'stock_reservations', operation: 'view' },
    { moduleKey: 'inventory', table: 'stock_movements', operation: 'view' },
  ]);
  return transaction(context, async (client) => {
    const prior = await client.query('SELECT id::text,request_hash FROM public.demand_forecasts WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL FOR UPDATE', [context.companyId, requestKey]);
    if (prior.rows.length) {
      if (String(prior.rows[0].request_hash || '') !== configHash) throw new DemandPlanningConflictError('This request key was already used for a different forecast configuration.');
      return { forecastId: String(prior.rows[0].id), duplicate: true, message: 'This forecast was already recorded.' };
    }
    const created = await client.query([
      'INSERT INTO public.demand_forecasts',
      ' (company_id,name,horizon_start,horizon_end,method,status,request_key,request_hash,metadata,created_by,updated_by)',
      ' VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE+$3::int,$4,\'ready\',$5,$6,$7::jsonb,$8,$8)',
      ' ON CONFLICT (company_id,request_key) WHERE request_key IS NOT NULL DO NOTHING RETURNING id::text',
    ].join('\n'), [context.companyId, 'Moving-average forecast (' + horizonDays + ' days)', horizonDays, config.method, requestKey, configHash, JSON.stringify(config), context.userId]);
    if (!created.rows.length) {
      const raced = await client.query('SELECT id::text,request_hash FROM public.demand_forecasts WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL', [context.companyId, requestKey]);
      if (!raced.rows.length || String(raced.rows[0].request_hash || '') !== configHash) throw new DemandPlanningConflictError('The request key conflicts with another forecast run.');
      return { forecastId: String(raced.rows[0].id), duplicate: true, message: 'This forecast was already recorded.' };
    }
    const forecastId = String(created.rows[0].id);
    const [products, movementRows] = await Promise.all([
      client.query([
        'SELECT p.id::text,p.name,p.sku,p.unit_of_measure,COALESCE(st.on_hand,0)::text AS on_hand,',
        ' COALESCE(st.reorder_level,0)::text AS reorder_level,',
        ' GREATEST(COALESCE(st.on_hand,0)-COALESCE(rs.reserved,0),0)::text AS available',
        'FROM public.products p',
        'LEFT JOIN (SELECT company_id,product_id,SUM(quantity) AS on_hand,MAX(reorder_level) AS reorder_level FROM public.stock_levels WHERE company_id=$1 AND deleted_at IS NULL GROUP BY company_id,product_id) st ON st.company_id=p.company_id AND st.product_id=p.id',
        'LEFT JOIN (SELECT company_id,product_id,SUM(quantity) AS reserved FROM public.stock_reservations WHERE company_id=$1 AND deleted_at IS NULL AND status IN (\'active\',\'allocated\') GROUP BY company_id,product_id) rs ON rs.company_id=p.company_id AND rs.product_id=p.id',
        'WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.is_active=TRUE AND p.track_inventory=TRUE AND p.product_type=\'stockable\' ORDER BY p.name,p.id LIMIT 500',
      ].join('\n'), [context.companyId]),
      client.query('SELECT product_id::text,SUM(quantity)::text AS total_quantity,COUNT(DISTINCT created_at::date)::int AS demand_days FROM public.stock_movements WHERE company_id=$1 AND deleted_at IS NULL AND created_at>=NOW()-make_interval(days => $2::int) AND movement_type=ANY($3::text[]) GROUP BY product_id', [context.companyId,historyDays,OUTBOUND_TYPES]),
    ]);
    const history = new Map(movementRows.rows.map((r) => [String(r.product_id), { total: numeric(r.total_quantity), days: Number(r.demand_days || 0) }]));
    let recommendationsCreated = 0;
    for (const product of products.rows) {
      const past = history.get(String(product.id)) || { total: 0, days: 0 };
      const plan = calculateDemandPlan({ historicalQuantity: past.total, historyDays, horizonDays, availableQuantity: numeric(product.available), reorderLevel: numeric(product.reorder_level), safetyStockDays, demandDays: past.days });
      await client.query('INSERT INTO public.demand_forecast_lines (company_id,forecast_id,product_reference,period_start,period_end,forecast_quantity,confidence,status,metadata,created_by,updated_by) VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+$4::int,$5,$6,\'active\',$7::jsonb,$8,$8)', [
        context.companyId,forecastId,String(product.id),horizonDays,plan.forecastQuantity.toFixed(4),plan.signalStrength,
        JSON.stringify({ historyDays,horizonDays,safetyStockDays,historyQuantity:past.total,demandDays:past.days,dailyAverage:plan.dailyAverage }),context.userId,
      ]);
      if (plan.recommendedQuantity > 0) {
        await client.query('INSERT INTO public.replenishment_recommendations (company_id,forecast_id,product_reference,recommended_quantity,needed_by,reason,status,metadata,created_by,updated_by) VALUES ($1,$2,$3,$4,CURRENT_DATE+$5::int,$6,\'suggested\',$7::jsonb,$8,$8)', [
          context.companyId,forecastId,String(product.id),plan.recommendedQuantity.toFixed(4),leadTimeDays,
          plan.rationale + ' Demand is based on ' + historyDays + ' calendar days of outbound stock movements.',
          JSON.stringify({ availableQuantity:numeric(product.available),reorderLevel:numeric(product.reorder_level),forecastQuantity:plan.forecastQuantity,safetyStockQuantity:plan.safetyStockQuantity,leadTimeDays }),context.userId,
        ]);
        recommendationsCreated += 1;
      }
    }
    return { forecastId, duplicate:false, productsAnalysed:products.rows.length, recommendationsCreated, historyDays, horizonDays, message:'Forecast uses actual recorded outbound Inventory movements. Recommendations need a separate user decision; no purchase order was created.' };
  });
}

export async function decideDemandRecommendation(input: unknown) {
  const body = objectInput(input);
  const recommendationId = uuid(body.recommendationId, 'Recommendation');
  const decision = textValue(body.decision, 'Decision', 16);
  if (decision !== 'accept' && decision !== 'reject') throw new DemandPlanningInputError('Choose accept or reject.');
  const context = await getContext([{ table: 'replenishment_recommendations', operation: 'edit' }]);
  return transaction(context, async (client) => {
    const found = await client.query('SELECT id::text,status FROM public.replenishment_recommendations WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE', [recommendationId,context.companyId]);
    if (!found.rows.length) throw new DemandPlanningConflictError('The replenishment recommendation was not found in the selected company.');
    const current = String(found.rows[0].status);
    const next = decision === 'accept' ? 'accepted' : 'rejected';
    if (current === next) return { recommendationId,status:next,duplicate:true };
    if (current !== 'suggested') throw new DemandPlanningConflictError('Only suggested recommendations can be accepted or rejected.');
    await client.query('UPDATE public.replenishment_recommendations SET status=$3,updated_by=$4,updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status=\'suggested\'', [recommendationId,context.companyId,next,context.userId]);
    return { recommendationId,status:next,duplicate:false };
  });
}
