import 'server-only';

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
} from '@/lib/apps/accounting/validation';
import {
  applyBudgetGrowth,
  budgetMoneyCents,
  budgetMoneyDecimal,
  budgetVariance,
  buildBudgetMonths,
  parseGrowthPercentScaled,
  variancePercent,
} from './budgets-rules';

type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

function bodyOf(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid budget or forecast data.');
  }
  return input as Record<string, unknown>;
}

function textValue(value: unknown, max: number, label: string, required = false) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new AccountingInputError(label + ' must contain text.');
  }
  const valueText = typeof value === 'string' ? value.trim() : '';
  if ((required && !valueText) || valueText.length > max) {
    throw new AccountingInputError(
      label + (required ? ' is required' : '') + ' and must not exceed ' + max + ' characters.',
    );
  }
  return valueText;
}

function integer(value: unknown, min: number, max: number, label: string) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new AccountingInputError(label + ' must be between ' + min + ' and ' + max + '.');
  }
  return numeric;
}

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  throw new AccountingInputError('Choose a valid enabled or disabled value.');
}

function hashPayload(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function versionScenario(value: unknown) {
  if (value === 'base' || value === 'upside' || value === 'downside' || value === 'custom') {
    return value;
  }
  throw new AccountingInputError('Choose base, upside, downside or custom scenario.');
}

async function audit(
  context: Context,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: 'accounting.budget.' + action,
      module: 'accounting',
      resourceType,
      resourceId,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Budget audit event failed', error);
  }
}

async function activePlanForUpdate(client: PoolClient, companyId: string, planId: string) {
  const result = await client.query(
    "SELECT * FROM accounting_budget_plans WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
    [companyId, planId],
  );
  const row = result.rows[0];
  if (!row) throw new AccountingInputError('Budget plan could not be found.');
  if (String(row.status) !== 'open') {
    throw new AccountingInputError('This budget plan is closed and cannot be changed.');
  }
  return row;
}

async function editableVersionForUpdate(
  client: PoolClient,
  companyId: string,
  versionId: string,
) {
  const result = await client.query(
    "SELECT v.*,p.fiscal_year_start,p.fiscal_year_end,p.status AS plan_status,p.currency FROM accounting_budget_versions v INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL WHERE v.company_id=$1 AND v.id=$2 AND v.deleted_at IS NULL LIMIT 1 FOR UPDATE",
    [companyId, versionId],
  );
  const row = result.rows[0];
  if (!row) throw new AccountingInputError('Budget version could not be found.');
  if (String(row.plan_status) !== 'open') throw new AccountingInputError('This budget plan is closed.');
  if (String(row.status) !== 'draft') {
    throw new AccountingInputError('Only draft budget or forecast versions can be edited.');
  }
  return row;
}

async function assertPlanningAccount(
  client: PoolClient,
  companyId: string,
  accountId: string,
) {
  const result = await client.query(
    "SELECT id::text,code,name,account_type FROM accounts WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND is_active=TRUE LIMIT 1",
    [companyId, accountId],
  );
  const row = result.rows[0];
  if (!row) throw new AccountingInputError('Choose an active Accounting account.');
  const type = String(row.account_type);
  if (!(type === 'income' || type.startsWith('income_') || type === 'expense' || type.startsWith('expense_'))) {
    throw new AccountingInputError('Part 22 budgets use income and expense accounts. Balance-sheet planning is handled by later financial planning depth.');
  }
  return row;
}

export async function saveBudgetSettings(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_budget_settings',
    'edit',
  );
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError('The active company changed. Reload Accounting before saving budget settings.');
  }
  const enabled = bool(body.enabled, true);
  const horizon = integer(body.defaultHorizonMonths ?? 12, 1, 60, 'Default horizon');
  const rolling = integer(body.rollingForecastMonths ?? 12, 1, 60, 'Rolling forecast horizon');
  let variance: string;
  try {
    const scaled = parseGrowthPercentScaled(body.varianceAlertPercent ?? '10');
    if (scaled < BigInt(0)) throw new Error('negative');
    variance = (Number(scaled) / 10000).toFixed(4);
  } catch {
    throw new AccountingInputError('Variance alert percent must be between 0% and 1000%.');
  }

  await context.pool.query(
    "INSERT INTO accounting_budget_settings(company_id,enabled,default_horizon_months,rolling_forecast_months,variance_alert_percent,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled,default_horizon_months=EXCLUDED.default_horizon_months,rolling_forecast_months=EXCLUDED.rolling_forecast_months,variance_alert_percent=EXCLUDED.variance_alert_percent,updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL",
    [context.companyId, enabled, horizon, rolling, variance, context.userId],
  );

  await audit(context, 'settings.saved', 'accounting_budget_settings', context.companyId, 'Budget and forecast settings saved');
  return { saved: true };
}

export async function createBudgetPlan(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_budget_plans',
    'create',
  );
  const body = bodyOf(input);
  const requestKey = accountingId(body.requestKey);
  const name = textValue(body.name, 255, 'Budget plan name', true);
  const startDate = accountingDate(body.startDate);
  const endDate = accountingDate(body.endDate);
  const notes = textValue(body.notes, 4000, 'Notes');
  const scenario = versionScenario(body.scenario || 'base');
  let months;
  try {
    months = buildBudgetMonths(startDate, endDate);
  } catch (error) {
    throw new AccountingInputError(error instanceof Error ? error.message : 'Budget period is invalid.');
  }
  if (!months.length) throw new AccountingInputError('Budget period must include at least one month.');

  const payload = { name, startDate, endDate, notes, scenario, currency: context.company.currentCompany.currency };
  const requestHash = hashPayload(payload);
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');
    const replay = await client.query(
      "SELECT v.id::text AS version_id,v.request_hash,p.id::text AS plan_id,p.name FROM accounting_budget_versions v INNER JOIN accounting_budget_plans p ON p.id=v.plan_id WHERE v.company_id=$1 AND v.request_key=$2 AND v.deleted_at IS NULL LIMIT 1 FOR SHARE",
      [context.companyId, requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash) !== requestHash) {
        throw new AccountingInputError('This request key was already used for a different budget plan.');
      }
      await client.query('COMMIT');
      return {
        planId: String(replay.rows[0].plan_id),
        versionId: String(replay.rows[0].version_id),
        name: String(replay.rows[0].name),
        replayed: true,
      };
    }

    const plan = await client.query(
      "INSERT INTO accounting_budget_plans(company_id,name,fiscal_year_start,fiscal_year_end,currency,status,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'open',$6,$7,$7) RETURNING id::text",
      [context.companyId, name, startDate, endDate, String(context.company.currentCompany.currency).toUpperCase(), notes || null, context.userId],
    );
    const planId = String(plan.rows[0].id);
    const version = await client.query(
      "INSERT INTO accounting_budget_versions(company_id,plan_id,version_number,version_type,scenario,name,status,request_key,request_hash,notes,created_by,updated_by) VALUES($1,$2,1,'budget',$3,$4,'draft',$5,$6,$7,$8,$8) RETURNING id::text",
      [context.companyId, planId, scenario, name + ' · Budget v1', requestKey, requestHash, notes || null, context.userId],
    );
    await client.query('COMMIT');

    const versionId = String(version.rows[0].id);
    await audit(context, 'plan.created', 'accounting_budget_plans', planId, 'Budget plan created', { versionId, months: months.length });
    return { planId, versionId, months: months.length, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveBudgetLines(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_budget_lines',
    'edit',
  );
  const body = bodyOf(input);
  const versionId = accountingId(body.versionId);
  if (!Array.isArray(body.lines) || body.lines.length > 1000) {
    throw new AccountingInputError('Budget lines must be an array with at most 1,000 rows per save.');
  }
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');
    const version = await editableVersionForUpdate(client, context.companyId, versionId);
    const allowedPeriods = new Map(
      buildBudgetMonths(String(version.fiscal_year_start).slice(0, 10), String(version.fiscal_year_end).slice(0, 10))
        .map(period => [period.periodStart, period.periodEnd]),
    );

    const normalized: Array<{
      accountId: string;
      periodStart: string;
      periodEnd: string;
      amount: string;
      notes: string | null;
    }> = [];
    const uniqueLines = new Set<string>();

    for (const raw of body.lines) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new AccountingInputError('Enter valid budget lines.');
      }
      const line = raw as Record<string, unknown>;
      const accountId = accountingId(line.accountId);
      const periodStart = accountingDate(line.periodStart);
      const periodEnd = allowedPeriods.get(periodStart);
      if (!periodEnd) throw new AccountingInputError('A budget line period is outside the plan horizon.');
      const uniqueKey = accountId + '|' + periodStart;
      if (uniqueLines.has(uniqueKey)) {
        throw new AccountingInputError(
          'Each account can appear only once in a budget month.',
        );
      }
      uniqueLines.add(uniqueKey);
      await assertPlanningAccount(client, context.companyId, accountId);
      let cents: bigint;
      try {
        cents = budgetMoneyCents(line.amount, 'Budget amount');
      } catch (error) {
        throw new AccountingInputError(error instanceof Error ? error.message : 'Budget amount is invalid.');
      }
      normalized.push({
        accountId,
        periodStart,
        periodEnd,
        amount: budgetMoneyDecimal(cents),
        notes: textValue(line.notes, 1000, 'Budget line notes') || null,
      });
    }

    await client.query(
      "UPDATE accounting_budget_lines SET deleted_at=NOW(),updated_at=NOW(),updated_by=$3 WHERE company_id=$1 AND version_id=$2 AND deleted_at IS NULL AND line_kind='planned'",
      [context.companyId, versionId, context.userId],
    );

    for (const line of normalized) {
      await client.query(
        "INSERT INTO accounting_budget_lines(company_id,version_id,account_id,period_start,period_end,amount,line_kind,source,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'planned','manual',$7,$8,$8)",
        [context.companyId, versionId, line.accountId, line.periodStart, line.periodEnd, line.amount, line.notes, context.userId],
      );
    }

    await client.query('COMMIT');
    await audit(context, 'lines.saved', 'accounting_budget_versions', versionId, 'Budget lines replaced', { lines: normalized.length });
    return { saved: normalized.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveBudgetAssumption(input: unknown) {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_budget_assumptions',
    'edit',
  );
  const body = bodyOf(input);
  const versionId = accountingId(body.versionId);
  const accountId = body.accountId ? accountingId(body.accountId) : null;
  const assumptionType = String(body.assumptionType || '');
  if (!['fixed','growth_percent','prior_year_growth','run_rate','manual'].includes(assumptionType)) {
    throw new AccountingInputError('Choose a supported forecast assumption type.');
  }
  const name = textValue(body.name, 255, 'Assumption name', true);
  const notes = textValue(body.notes, 4000, 'Assumption notes');
  const effectiveFrom = body.effectiveFrom ? accountingDate(body.effectiveFrom) : null;
  const effectiveTo = body.effectiveTo ? accountingDate(body.effectiveTo) : null;
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    throw new AccountingInputError('Assumption end date cannot be before its start date.');
  }
  let value = '0';
  if (assumptionType === 'growth_percent' || assumptionType === 'prior_year_growth') {
    try {
      value = (Number(parseGrowthPercentScaled(body.value)) / 10000).toFixed(4);
    } catch (error) {
      throw new AccountingInputError(error instanceof Error ? error.message : 'Growth assumption is invalid.');
    }
  } else {
    const numeric = Number(body.value ?? 0);
    if (!Number.isFinite(numeric) || Math.abs(numeric) > 9999999999999) {
      throw new AccountingInputError('Assumption value is outside the supported range.');
    }
    value = numeric.toFixed(6);
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    await editableVersionForUpdate(client, context.companyId, versionId);
    if (accountId) await assertPlanningAccount(client, context.companyId, accountId);
    const result = await client.query(
      "INSERT INTO accounting_budget_assumptions(company_id,version_id,account_id,assumption_type,value,effective_from,effective_to,name,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id::text",
      [context.companyId, versionId, accountId, assumptionType, value, effectiveFrom, effectiveTo, name, notes || null, context.userId],
    );
    await client.query('COMMIT');
    const id = String(result.rows[0].id);
    await audit(context, 'assumption.saved', 'accounting_budget_assumptions', id, 'Budget forecast assumption saved', { versionId, assumptionType });
    return { id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createBudgetRevision(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_budget_versions','create');
  const body = bodyOf(input);
  const sourceVersionId = accountingId(body.sourceVersionId);
  const requestKey = accountingId(body.requestKey);
  const notes = textValue(body.notes, 4000, 'Revision notes');
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');
    const sourceResult = await client.query(
      "SELECT v.*,p.status AS plan_status FROM accounting_budget_versions v INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL WHERE v.company_id=$1 AND v.id=$2 AND v.deleted_at IS NULL LIMIT 1 FOR SHARE",
      [context.companyId, sourceVersionId],
    );
    const source = sourceResult.rows[0];
    if (!source) throw new AccountingInputError('Source budget version could not be found.');
    if (String(source.version_type) !== 'budget') {
      throw new AccountingInputError(
        'Create a new rolling forecast from the published budget instead of revising a forecast in place.',
      );
    }
    if (String(source.plan_status) !== 'open') throw new AccountingInputError('This budget plan is closed.');
    const requestHash = hashPayload({ sourceVersionId, notes });
    const replay = await client.query(
      "SELECT id::text,request_hash FROM accounting_budget_versions WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1",
      [context.companyId, requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash) !== requestHash) throw new AccountingInputError('This request key was already used for another revision.');
      await client.query('COMMIT');
      return { versionId: String(replay.rows[0].id), replayed: true };
    }
    const next = await client.query(
      "SELECT COALESCE(MAX(version_number),0)+1 AS next_version FROM accounting_budget_versions WHERE company_id=$1 AND plan_id=$2 AND version_type=$3 AND scenario=$4 AND deleted_at IS NULL",
      [context.companyId, source.plan_id, source.version_type, source.scenario],
    );
    const versionNumber = Number(next.rows[0].next_version || 1);
    const inserted = await client.query(
      "INSERT INTO accounting_budget_versions(company_id,plan_id,version_number,version_type,scenario,name,status,as_of_date,source_version_id,request_key,request_hash,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$12) RETURNING id::text",
      [
        context.companyId,
        source.plan_id,
        versionNumber,
        source.version_type,
        source.scenario,
        String(source.name).replace(/ · v\d+$/,'') + ' · v' + versionNumber,
        source.as_of_date,
        sourceVersionId,
        requestKey,
        requestHash,
        notes || source.notes || null,
        context.userId,
      ],
    );
    const versionId = String(inserted.rows[0].id);
    await client.query(
      "INSERT INTO accounting_budget_assumptions(company_id,version_id,account_id,assumption_type,value,effective_from,effective_to,name,notes,created_by,updated_by) SELECT company_id,$1,account_id,assumption_type,value,effective_from,effective_to,name,notes,$2,$2 FROM accounting_budget_assumptions WHERE company_id=$3 AND version_id=$4 AND deleted_at IS NULL",
      [versionId, context.userId, context.companyId, sourceVersionId],
    );
    await client.query(
      "INSERT INTO accounting_budget_lines(company_id,version_id,account_id,period_start,period_end,amount,line_kind,source,notes,created_by,updated_by) SELECT company_id,$1,account_id,period_start,period_end,amount,line_kind,'copied',notes,$2,$2 FROM accounting_budget_lines WHERE company_id=$3 AND version_id=$4 AND deleted_at IS NULL",
      [versionId, context.userId, context.companyId, sourceVersionId],
    );
    await client.query('COMMIT');
    await audit(context, 'version.revised', 'accounting_budget_versions', versionId, 'Budget version revised', { sourceVersionId, versionNumber });
    return { versionId, versionNumber, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function transitionBudgetVersion(input: unknown, target: 'approved' | 'published') {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_budget_versions','edit');
  const body = bodyOf(input);
  const versionId = accountingId(body.versionId);
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN');
    const version = await client.query(
      "SELECT v.*,p.status AS plan_status FROM accounting_budget_versions v INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL WHERE v.company_id=$1 AND v.id=$2 AND v.deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId, versionId],
    );
    const row = version.rows[0];
    if (!row) throw new AccountingInputError('Budget version could not be found.');
    if (String(row.plan_status) !== 'open') throw new AccountingInputError('This budget plan is closed.');

    if (target === 'approved') {
      if (String(row.status) !== 'draft') throw new AccountingInputError('Only a draft version can be approved.');
      const count = await client.query(
        "SELECT COUNT(*)::int AS count FROM accounting_budget_lines WHERE company_id=$1 AND version_id=$2 AND deleted_at IS NULL",
        [context.companyId, versionId],
      );
      if (Number(count.rows[0].count || 0) === 0) throw new AccountingInputError('Add at least one planning line before approval.');
      await client.query(
        "UPDATE accounting_budget_versions SET status='approved',approved_by=$3,approved_at=NOW(),updated_by=$3,updated_at=NOW() WHERE company_id=$1 AND id=$2",
        [context.companyId, versionId, context.userId],
      );
    } else {
      if (String(row.status) !== 'approved') throw new AccountingInputError('Approve the version before publishing it.');
      await client.query(
        "UPDATE accounting_budget_versions SET status='superseded',superseded_at=NOW(),updated_by=$5,updated_at=NOW() WHERE company_id=$1 AND plan_id=$2 AND version_type=$3 AND scenario=$4 AND status='published' AND id<>$6 AND deleted_at IS NULL",
        [context.companyId, row.plan_id, row.version_type, row.scenario, context.userId, versionId],
      );
      await client.query(
        "UPDATE accounting_budget_versions SET status='published',published_by=$3,published_at=NOW(),updated_by=$3,updated_at=NOW() WHERE company_id=$1 AND id=$2",
        [context.companyId, versionId, context.userId],
      );
    }

    await client.query('COMMIT');
    await audit(context, 'version.' + target, 'accounting_budget_versions', versionId, 'Budget version ' + target);
    return { versionId, status: target };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const approveBudgetVersion = (input: unknown) => transitionBudgetVersion(input, 'approved');
export const publishBudgetVersion = (input: unknown) => transitionBudgetVersion(input, 'published');

async function actualByMonth(
  client: Pick<PoolClient,'query'>,
  companyId: string,
  startDate: string,
  endDate: string,
) {
  const result = await client.query(
    "SELECT jl.account_id::text AS account_id,date_trunc('month',j.journal_date)::date::text AS period_start,SUM(CASE WHEN a.account_type='income' OR a.account_type LIKE 'income_%' THEN jl.credit-jl.debit ELSE jl.debit-jl.credit END)::text AS actual_amount FROM journal_lines jl INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id INNER JOIN accounts a ON a.id=jl.account_id AND a.company_id=jl.company_id WHERE jl.company_id=$1 AND jl.deleted_at IS NULL AND j.deleted_at IS NULL AND a.deleted_at IS NULL AND j.status='posted' AND j.journal_date BETWEEN $2 AND $3 AND (a.account_type='income' OR a.account_type LIKE 'income_%' OR a.account_type='expense' OR a.account_type LIKE 'expense_%') GROUP BY jl.account_id,date_trunc('month',j.journal_date)",
    [companyId, startDate, endDate],
  );
  return new Map(result.rows.map(row => [
    String(row.account_id) + '|' + String(row.period_start).slice(0,10),
    String(row.actual_amount || '0.00'),
  ]));
}

export async function generateBudgetForecast(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_budget_versions','create');
  const body = bodyOf(input);
  const sourceVersionId = accountingId(body.sourceVersionId);
  const requestKey = accountingId(body.requestKey);
  const asOfDate = accountingDate(body.asOfDate);
  const scenario = versionScenario(body.scenario || 'base');
  let growthScaled: bigint;
  try {
    growthScaled = parseGrowthPercentScaled(body.growthPercent || '0');
  } catch (error) {
    throw new AccountingInputError(error instanceof Error ? error.message : 'Growth percent is invalid.');
  }
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const sourceResult = await client.query(
      "SELECT v.*,p.fiscal_year_start,p.fiscal_year_end,p.currency,p.status AS plan_status FROM accounting_budget_versions v INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL WHERE v.company_id=$1 AND v.id=$2 AND v.deleted_at IS NULL LIMIT 1 FOR SHARE",
      [context.companyId, sourceVersionId],
    );
    const source = sourceResult.rows[0];
    if (!source || String(source.version_type) !== 'budget') throw new AccountingInputError('Choose a budget version as the forecast baseline.');
    if (String(source.status) !== 'published') throw new AccountingInputError('Publish the baseline budget before generating a forecast.');
    if (String(source.plan_status) !== 'open') throw new AccountingInputError('This budget plan is closed.');
    const startDate = String(source.fiscal_year_start).slice(0,10);
    const endDate = String(source.fiscal_year_end).slice(0,10);
    if (asOfDate < startDate || asOfDate > endDate) throw new AccountingInputError('Forecast as-of date must be inside the budget plan period.');

    const requestHash = hashPayload({ sourceVersionId, asOfDate, scenario, growthPercent: String(body.growthPercent || '0') });
    const replay = await client.query(
      "SELECT id::text,request_hash FROM accounting_budget_versions WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1",
      [context.companyId, requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash) !== requestHash) throw new AccountingInputError('This request key was already used for another forecast.');
      await client.query('COMMIT');
      return { versionId: String(replay.rows[0].id), replayed: true };
    }

    const lines = await client.query(
      "SELECT account_id::text,period_start::text,period_end::text,amount::text FROM accounting_budget_lines WHERE company_id=$1 AND version_id=$2 AND deleted_at IS NULL AND line_kind='planned' ORDER BY period_start,account_id",
      [context.companyId, sourceVersionId],
    );
    if (!lines.rows.length) throw new AccountingInputError('The published baseline budget has no planning lines.');

    const actuals = await actualByMonth(client, context.companyId, startDate, asOfDate);
    const next = await client.query(
      "SELECT COALESCE(MAX(version_number),0)+1 AS next_version FROM accounting_budget_versions WHERE company_id=$1 AND plan_id=$2 AND version_type='forecast' AND scenario=$3 AND deleted_at IS NULL",
      [context.companyId, source.plan_id, scenario],
    );
    const versionNumber = Number(next.rows[0].next_version || 1);
    const inserted = await client.query(
      "INSERT INTO accounting_budget_versions(company_id,plan_id,version_number,version_type,scenario,name,status,as_of_date,source_version_id,request_key,request_hash,created_by,updated_by) VALUES($1,$2,$3,'forecast',$4,$5,'draft',$6,$7,$8,$9,$10,$10) RETURNING id::text",
      [context.companyId, source.plan_id, versionNumber, scenario, 'Rolling forecast · ' + scenario + ' · v' + versionNumber, asOfDate, sourceVersionId, requestKey, requestHash, context.userId],
    );
    const versionId = String(inserted.rows[0].id);

    let actualCount = 0;
    let forecastCount = 0;
    for (const row of lines.rows) {
      const periodStart = String(row.period_start).slice(0,10);
      const periodEnd = String(row.period_end).slice(0,10);
      const accountId = String(row.account_id);
      const isActual = periodEnd <= asOfDate;
      const sourceCents = budgetMoneyCents(row.amount);
      const amount = isActual
        ? actuals.get(accountId + '|' + periodStart) || '0.00'
        : budgetMoneyDecimal(applyBudgetGrowth(sourceCents, growthScaled));
      await client.query(
        "INSERT INTO accounting_budget_lines(company_id,version_id,account_id,period_start,period_end,amount,line_kind,source,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)",
        [context.companyId, versionId, accountId, periodStart, periodEnd, amount, isActual ? 'actual_locked' : 'forecast', isActual ? 'actuals' : 'assumption', context.userId],
      );
      if (isActual) actualCount += 1; else forecastCount += 1;
    }

    await client.query(
      "INSERT INTO accounting_budget_assumptions(company_id,version_id,assumption_type,value,effective_from,name,notes,created_by,updated_by) VALUES($1,$2,'growth_percent',$3,$4,$5,$6,$7,$7)",
      [context.companyId, versionId, (Number(growthScaled) / 10000).toFixed(4), asOfDate, 'Forecast growth against published budget', 'Actuals are locked through the selected as-of date; future periods apply this growth assumption.', context.userId],
    );
    const run = await client.query(
      "INSERT INTO accounting_budget_runs(company_id,plan_id,version_id,run_type,as_of_date,status,processed_accounts,processed_lines,completed_at,generated_by,created_by,updated_by,metadata) VALUES($1,$2,$3,'forecast_generation',$4,'completed',$5,$6,NOW(),$7,$7,$7,$8::jsonb) RETURNING id::text",
      [
        context.companyId,
        source.plan_id,
        versionId,
        asOfDate,
        new Set(lines.rows.map(row => String(row.account_id))).size,
        lines.rows.length,
        context.userId,
        JSON.stringify({ sourceVersionId, scenario, growthPercent: Number(growthScaled) / 10000, actualCount, forecastCount }),
      ],
    );
    await client.query('COMMIT');
    await audit(context, 'forecast.generated', 'accounting_budget_versions', versionId, 'Rolling forecast generated', { sourceVersionId, asOfDate, actualCount, forecastCount });
    return { versionId, runId: String(run.rows[0].id), actualCount, forecastCount, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createBudgetVarianceSnapshot(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_budget_variance_snapshots','create');
  const body = bodyOf(input);
  const versionId = accountingId(body.versionId);
  const asOfDate = accountingDate(body.asOfDate);
  const client = await context.pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const versionResult = await client.query(
      "SELECT v.*,p.fiscal_year_start,p.fiscal_year_end FROM accounting_budget_versions v INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL WHERE v.company_id=$1 AND v.id=$2 AND v.deleted_at IS NULL LIMIT 1 FOR SHARE",
      [context.companyId, versionId],
    );
    const version = versionResult.rows[0];
    if (!version) throw new AccountingInputError('Budget or forecast version could not be found.');
    if (!['approved','published','superseded'].includes(String(version.status))) {
      throw new AccountingInputError('Approve the version before taking an immutable variance snapshot.');
    }
    const startDate = String(version.fiscal_year_start).slice(0,10);
    const endDate = String(version.fiscal_year_end).slice(0,10);
    const through = asOfDate < endDate ? asOfDate : endDate;
    const actuals = await actualByMonth(client, context.companyId, startDate, through);
    const lines = await client.query(
      "SELECT l.account_id::text,l.period_start::text,l.period_end::text,l.amount::text,a.account_type FROM accounting_budget_lines l INNER JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.company_id=$1 AND l.version_id=$2 AND l.deleted_at IS NULL AND l.period_start<=$3 ORDER BY l.period_start,l.account_id",
      [context.companyId, versionId, through],
    );
    const run = await client.query(
      "INSERT INTO accounting_budget_runs(company_id,plan_id,version_id,run_type,as_of_date,status,processed_accounts,processed_lines,generated_by,created_by,updated_by) VALUES($1,$2,$3,'variance_snapshot',$4,'running',$5,$6,$7,$7,$7) RETURNING id::text",
      [context.companyId, version.plan_id, versionId, asOfDate, new Set(lines.rows.map(row => String(row.account_id))).size, lines.rows.length, context.userId],
    );
    const runId = String(run.rows[0].id);
    let alerts = 0;
    const settings = await client.query(
      "SELECT variance_alert_percent::text FROM accounting_budget_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [context.companyId],
    );
    const threshold = Number(settings.rows[0]?.variance_alert_percent || 10);

    for (const row of lines.rows) {
      const periodStart = String(row.period_start).slice(0,10);
      const planned = budgetMoneyCents(row.amount);
      const actual = budgetMoneyCents(actuals.get(String(row.account_id) + '|' + periodStart) || '0.00');
      const variance = budgetVariance(String(row.account_type), planned, actual);
      const percent = variancePercent(planned, variance.amount);
      if (percent !== null && Math.abs(percent) >= threshold) alerts += 1;
      await client.query(
        "INSERT INTO accounting_budget_variance_snapshots(company_id,run_id,plan_id,version_id,account_id,period_start,period_end,planned_amount,actual_amount,variance_amount,variance_percent,favorable) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          context.companyId,
          runId,
          version.plan_id,
          versionId,
          row.account_id,
          periodStart,
          String(row.period_end).slice(0,10),
          budgetMoneyDecimal(planned),
          budgetMoneyDecimal(actual),
          budgetMoneyDecimal(variance.amount),
          percent,
          variance.favorable,
        ],
      );
    }

    await client.query(
      "UPDATE accounting_budget_runs SET status='completed',completed_at=NOW(),metadata=$3::jsonb,updated_at=NOW() WHERE company_id=$1 AND id=$2",
      [context.companyId, runId, JSON.stringify({ alerts, thresholdPercent: threshold })],
    );
    await client.query('COMMIT');
    await audit(context, 'variance.snapshotted', 'accounting_budget_runs', runId, 'Budget variance snapshot created', { versionId, asOfDate, alerts });
    return { runId, lines: lines.rows.length, alerts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeBudgetPlan(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_budget_plans','edit');
  const body = bodyOf(input);
  const planId = accountingId(body.planId);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    await activePlanForUpdate(client, context.companyId, planId);
    const drafts = await client.query(
      "SELECT COUNT(*)::int AS count FROM accounting_budget_versions WHERE company_id=$1 AND plan_id=$2 AND deleted_at IS NULL AND status IN ('draft','approved')",
      [context.companyId, planId],
    );
    if (Number(drafts.rows[0].count || 0) > 0) {
      throw new AccountingInputError('Publish or supersede all draft/approved versions before closing the plan.');
    }
    await client.query(
      "UPDATE accounting_budget_plans SET status='closed',closed_at=NOW(),updated_by=$3,updated_at=NOW() WHERE company_id=$1 AND id=$2",
      [context.companyId, planId, context.userId],
    );
    await client.query('COMMIT');
    await audit(context, 'plan.closed', 'accounting_budget_plans', planId, 'Budget plan closed');
    return { planId, status: 'closed' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getAccountingBudgets() {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_budget_plans',
    'view',
  );
  const companyId = context.companyId;
  const today = new Date().toISOString().slice(0,10);
  const [
    settings,
    accounts,
    plans,
    versions,
    lines,
    assumptions,
    runs,
    snapshots,
  ] = await Promise.all([
    context.pool.query(
      "SELECT company_id::text,enabled,default_horizon_months,rolling_forecast_months,variance_alert_percent::text FROM accounting_budget_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [companyId],
    ),
    context.pool.query(
      "SELECT id::text,code,name,account_type FROM accounts WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE AND (account_type='income' OR account_type LIKE 'income_%' OR account_type='expense' OR account_type LIKE 'expense_%') ORDER BY account_type,code,name",
      [companyId],
    ),
    context.pool.query(
      "SELECT id::text,name,fiscal_year_start::text,fiscal_year_end::text,currency,status,notes,created_at::text,closed_at::text FROM accounting_budget_plans WHERE company_id=$1 AND deleted_at IS NULL ORDER BY fiscal_year_start DESC,created_at DESC LIMIT 24",
      [companyId],
    ),
    context.pool.query(
      "SELECT id::text,plan_id::text,version_number,version_type,scenario,name,status,as_of_date::text,source_version_id::text,approved_at::text,published_at::text,superseded_at::text,created_at::text FROM accounting_budget_versions WHERE company_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 120",
      [companyId],
    ),
    context.pool.query(
      "SELECT id::text,version_id::text,account_id::text,period_start::text,period_end::text,amount::text,line_kind,source,notes FROM accounting_budget_lines WHERE company_id=$1 AND deleted_at IS NULL ORDER BY period_start,account_id LIMIT 5000",
      [companyId],
    ),
    context.pool.query(
      "SELECT id::text,version_id::text,account_id::text,assumption_type,value::text,effective_from::text,effective_to::text,name,notes FROM accounting_budget_assumptions WHERE company_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",
      [companyId],
    ),
    context.pool.query(
      "SELECT id::text,plan_id::text,version_id::text,run_type,as_of_date::text,status,processed_accounts,processed_lines,started_at::text,completed_at::text,metadata FROM accounting_budget_runs WHERE company_id=$1 AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 50",
      [companyId],
    ),
    context.pool.query(
      "SELECT s.id::text,s.run_id::text,s.plan_id::text,s.version_id::text,s.account_id::text,s.period_start::text,s.period_end::text,s.planned_amount::text,s.actual_amount::text,s.variance_amount::text,s.variance_percent::text,s.favorable,a.code,a.name,a.account_type FROM accounting_budget_variance_snapshots s INNER JOIN accounts a ON a.id=s.account_id AND a.company_id=s.company_id WHERE s.company_id=$1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC,s.period_start DESC,a.code LIMIT 1000",
      [companyId],
    ),
  ]);

  const planRows = plans.rows;
  const versionRows = versions.rows;
  const currentPlan = planRows.find(row => String(row.status) === 'open') || planRows[0] || null;
  const currentPlanId = currentPlan ? String(currentPlan.id) : null;
  const publishedBudget = currentPlanId
    ? versionRows.find(row => String(row.plan_id) === currentPlanId && String(row.version_type) === 'budget' && String(row.status) === 'published' && String(row.scenario) === 'base') || null
    : null;
  const publishedForecast = currentPlanId
    ? versionRows.find(row => String(row.plan_id) === currentPlanId && String(row.version_type) === 'forecast' && String(row.status) === 'published' && String(row.scenario) === 'base') || null
    : null;

  let currentVariance: Array<Record<string, unknown>> = [];
  if (currentPlan && publishedBudget) {
    const startDate = String(currentPlan.fiscal_year_start).slice(0,10);
    const endDate = String(currentPlan.fiscal_year_end).slice(0,10);
    const through = today < endDate ? today : endDate;
    const actuals = await actualByMonth(
      context.pool,
      companyId,
      startDate,
      through,
    );
    const accountById = new Map(accounts.rows.map(row => [String(row.id), row]));
    currentVariance = lines.rows
      .filter(row => String(row.version_id) === String(publishedBudget.id) && String(row.line_kind) === 'planned' && String(row.period_start).slice(0,10) <= through)
      .map(row => {
        const account = accountById.get(String(row.account_id));
        const planned = budgetMoneyCents(row.amount);
        const actual = budgetMoneyCents(actuals.get(String(row.account_id) + '|' + String(row.period_start).slice(0,10)) || '0.00');
        const variance = budgetVariance(String(account?.account_type || ''), planned, actual);
        return {
          account_id: String(row.account_id),
          code: String(account?.code || ''),
          name: String(account?.name || ''),
          account_type: String(account?.account_type || ''),
          period_start: String(row.period_start).slice(0,10),
          planned_amount: budgetMoneyDecimal(planned),
          actual_amount: budgetMoneyDecimal(actual),
          variance_amount: budgetMoneyDecimal(variance.amount),
          variance_percent: variancePercent(planned, variance.amount),
          favorable: variance.favorable,
        };
      });
  }

  const total = (rows: Array<Record<string, unknown>>, key: string) =>
    rows.reduce((sum, row) => sum + budgetMoneyCents(row[key] || '0.00'), BigInt(0));

  return {
    companyId,
    currency: String(context.company.currentCompany.currency).toUpperCase(),
    today,
    settings: settings.rows[0] || {
      enabled: true,
      default_horizon_months: 12,
      rolling_forecast_months: 12,
      variance_alert_percent: '10.0000',
    },
    accounts: accounts.rows,
    plans: planRows,
    versions: versionRows,
    lines: lines.rows,
    assumptions: assumptions.rows,
    runs: runs.rows,
    snapshots: snapshots.rows,
    currentPlan,
    publishedBudget,
    publishedForecast,
    currentVariance,
    metrics: {
      open_plans: planRows.filter(row => String(row.status) === 'open').length,
      draft_versions: versionRows.filter(row => String(row.status) === 'draft').length,
      published_versions: versionRows.filter(row => String(row.status) === 'published').length,
      current_budget: budgetMoneyDecimal(total(
        lines.rows.filter(row => publishedBudget && String(row.version_id) === String(publishedBudget.id) && String(row.line_kind) === 'planned'),
        'amount',
      )),
      current_forecast: budgetMoneyDecimal(total(
        lines.rows.filter(row => publishedForecast && String(row.version_id) === String(publishedForecast.id)),
        'amount',
      )),
      current_actual: budgetMoneyDecimal(total(currentVariance, 'actual_amount')),
      variance_alerts: currentVariance.filter(row => {
        const percent = Number(row.variance_percent ?? 0);
        return Math.abs(percent) >= Number(settings.rows[0]?.variance_alert_percent || 10);
      }).length,
    },
  };
}

export type AccountingBudgetsWorkspace = Awaited<ReturnType<typeof getAccountingBudgets>>;
