import 'server-only';

import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
} from '@/lib/apps/accounting/validation';
import {
  budgetMoneyCents,
  budgetMoneyDecimal,
} from '@/lib/apps/accounting/budgets-rules';

type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

function bodyOf(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid project or departmental accounting data.');
  }
  return input as Record<string, unknown>;
}

function textValue(value: unknown, max: number, label: string, required = false) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new AccountingInputError(label + ' must contain text.');
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > max) {
    throw new AccountingInputError(
      label + (required ? ' is required' : '') + ' and must not exceed ' + max + ' characters.',
    );
  }
  return text;
}

function optionalId(value: unknown) {
  return value === undefined || value === null || value === '' ? null : accountingId(value);
}

function bool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  throw new AccountingInputError('Choose a valid enabled or disabled value.');
}

function basisPoints(value: unknown) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 10000) {
    throw new AccountingInputError('Allocation percentages must be between 0.01% and 100%.');
  }
  return numeric;
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
      action: 'accounting.dimension.' + action,
      module: 'accounting',
      resourceType,
      resourceId,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Dimension audit event failed', error);
  }
}

async function projectIntegration(
  client: Pick<PoolClient,'query'>,
  companyId: string,
) {
  const table = await client.query(
    "SELECT to_regclass('public.projects') IS NOT NULL AS present",
  );
  if (table.rows[0]?.present !== true) {
    return {
      status: 'not_installed' as const,
      available: [] as Array<Record<string, unknown>>,
      message: 'Projects is not installed in this tenant. Accounting-owned project dimensions remain available.',
    };
  }

  const scope = await client.query(
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='company_id') AS company_scoped",
  );
  if (scope.rows[0]?.company_scoped !== true) {
    return {
      status: 'unscoped' as const,
      available: [] as Array<Record<string, unknown>>,
      message: 'Projects exists but is not company-scoped yet, so Accounting will not import it into a multi-company ledger.',
    };
  }

  const result = await client.query(
    `SELECT p.id::text,p.name,p.status,p.start_date::text,p.due_date::text
       FROM projects p
       WHERE p.company_id=$1
       ORDER BY p.name
       LIMIT 250`,
    [companyId],
  );

  return {
    status: 'ready' as const,
    available: result.rows,
    message: 'Company-scoped Projects records can be linked into Accounting without duplicating project operations.',
  };
}

export async function getAccountingDimensions(input: {
  from?: string;
  to?: string;
} = {}) {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_journal_line_dimensions',
    'view',
  );
  const today = new Date().toISOString().slice(0,10);
  const to = accountingDate(input.to || today);
  const from = accountingDate(input.from || to.slice(0,4) + '-01-01');
  if (from > to) throw new AccountingInputError('The start date must not be after the end date.');

  const [
    company,
    settings,
    accounts,
    departments,
    projects,
    rules,
    recentLines,
    departmentSummary,
    projectSummary,
    unassigned,
    budgetVersions,
    dimensionBudgets,
    integration,
  ] = await Promise.all([
    context.pool.query(
      "SELECT currency FROM companies WHERE id=$1 LIMIT 1",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT enabled,require_department_on_expense,require_project_on_income,auto_apply_rules FROM accounting_dimension_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,code,name,account_type FROM accounts WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE AND (account_type='income' OR account_type LIKE 'income_%' OR account_type='expense' OR account_type LIKE 'expense_%') ORDER BY code,name LIMIT 1000",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,name,code,parent_id::text,is_active FROM departments WHERE company_id=$1 ORDER BY is_active DESC,name LIMIT 500",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,source_project_id::text,code,name,description,status,starts_on::text,ends_on::text FROM accounting_analytic_projects WHERE company_id=$1 AND deleted_at IS NULL ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'closed' THEN 1 ELSE 2 END,name LIMIT 500",
      [context.companyId],
    ),
    context.pool.query(
      `SELECT r.id::text,r.name,r.account_id::text,a.code AS account_code,a.name AS account_name,
              r.source_module,r.department_id::text,d.name AS department_name,
              r.analytic_project_id::text,p.name AS project_name,
              r.basis_points,r.priority,r.enabled
       FROM accounting_dimension_rules r
       LEFT JOIN accounts a ON a.id=r.account_id AND a.company_id=r.company_id
       LEFT JOIN departments d ON d.id=r.department_id AND d.company_id=r.company_id
       LEFT JOIN accounting_analytic_projects p ON p.id=r.analytic_project_id AND p.company_id=r.company_id
       WHERE r.company_id=$1 AND r.deleted_at IS NULL
       ORDER BY r.enabled DESC,r.priority,r.created_at DESC
       LIMIT 250`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT jl.id::text AS journal_line_id,j.id::text AS journal_id,j.journal_number,
              j.journal_date::text,j.status,j.source_module,a.id::text AS account_id,
              a.code AS account_code,a.name AS account_name,a.account_type,
              jl.description,jl.debit::text,jl.credit::text,
              COALESCE(SUM(CASE WHEN dim.active THEN dim.basis_points ELSE 0 END),0)::int AS allocated_basis_points,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'departmentId',dim.department_id::text,
                    'departmentName',d.name,
                    'projectId',dim.analytic_project_id::text,
                    'projectName',p.name,
                    'basisPoints',dim.basis_points,
                    'origin',dim.origin,
                    'revision',dim.revision_number
                  ) ORDER BY dim.created_at,dim.id
                ) FILTER (WHERE dim.id IS NOT NULL AND dim.active=TRUE),
                '[]'::json
              ) AS allocations
       FROM journal_lines jl
       INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id
       INNER JOIN accounts a ON a.id=jl.account_id AND a.company_id=jl.company_id
       LEFT JOIN accounting_journal_line_dimensions dim ON dim.journal_line_id=jl.id AND dim.company_id=jl.company_id AND dim.active=TRUE
       LEFT JOIN departments d ON d.id=dim.department_id AND d.company_id=jl.company_id
       LEFT JOIN accounting_analytic_projects p ON p.id=dim.analytic_project_id AND p.company_id=jl.company_id
       WHERE jl.company_id=$1
         AND jl.deleted_at IS NULL
         AND j.deleted_at IS NULL
         AND j.status IN ('draft','approved','posted')
       GROUP BY jl.id,j.id,j.journal_number,j.journal_date,j.status,j.source_module,a.id,a.code,a.name,a.account_type,jl.description,jl.debit,jl.credit
       ORDER BY j.journal_date DESC,j.created_at DESC,jl.created_at DESC
       LIMIT 120`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT d.id::text AS dimension_id,d.name,d.code,
              SUM(CASE WHEN a.account_type='income' OR a.account_type LIKE 'income_%'
                       THEN (jl.credit-jl.debit) * dim.basis_points / 10000.0 ELSE 0 END)::text AS income,
              SUM(CASE WHEN a.account_type='expense' OR a.account_type LIKE 'expense_%'
                       THEN (jl.debit-jl.credit) * dim.basis_points / 10000.0 ELSE 0 END)::text AS expense
       FROM accounting_journal_line_dimensions dim
       INNER JOIN journal_lines jl ON jl.id=dim.journal_line_id AND jl.company_id=dim.company_id AND jl.deleted_at IS NULL
       INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id AND j.deleted_at IS NULL AND j.status='posted'
       INNER JOIN accounts a ON a.id=jl.account_id AND a.company_id=jl.company_id AND a.deleted_at IS NULL
       INNER JOIN departments d ON d.id=dim.department_id AND d.company_id=dim.company_id
       WHERE dim.company_id=$1 AND dim.active=TRUE AND j.journal_date BETWEEN $2 AND $3
       GROUP BY d.id,d.name,d.code
       ORDER BY d.name`,
      [context.companyId,from,to],
    ),
    context.pool.query(
      `SELECT p.id::text AS dimension_id,p.name,p.code,
              SUM(CASE WHEN a.account_type='income' OR a.account_type LIKE 'income_%'
                       THEN (jl.credit-jl.debit) * dim.basis_points / 10000.0 ELSE 0 END)::text AS income,
              SUM(CASE WHEN a.account_type='expense' OR a.account_type LIKE 'expense_%'
                       THEN (jl.debit-jl.credit) * dim.basis_points / 10000.0 ELSE 0 END)::text AS expense
       FROM accounting_journal_line_dimensions dim
       INNER JOIN journal_lines jl ON jl.id=dim.journal_line_id AND jl.company_id=dim.company_id AND jl.deleted_at IS NULL
       INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id AND j.deleted_at IS NULL AND j.status='posted'
       INNER JOIN accounts a ON a.id=jl.account_id AND a.company_id=jl.company_id AND a.deleted_at IS NULL
       INNER JOIN accounting_analytic_projects p ON p.id=dim.analytic_project_id AND p.company_id=dim.company_id AND p.deleted_at IS NULL
       WHERE dim.company_id=$1 AND dim.active=TRUE AND j.journal_date BETWEEN $2 AND $3
       GROUP BY p.id,p.name,p.code
       ORDER BY p.name`,
      [context.companyId,from,to],
    ),
    context.pool.query(
      `WITH allocated AS (
         SELECT journal_line_id,LEAST(10000,SUM(basis_points))::int AS bps
         FROM accounting_journal_line_dimensions
         WHERE company_id=$1 AND active=TRUE
         GROUP BY journal_line_id
       )
       SELECT
         COUNT(*)::int AS line_count,
         COALESCE(SUM(
           CASE WHEN a.account_type='income' OR a.account_type LIKE 'income_%'
             THEN (jl.credit-jl.debit) * (10000-COALESCE(x.bps,0)) / 10000.0
             WHEN a.account_type='expense' OR a.account_type LIKE 'expense_%'
             THEN (jl.debit-jl.credit) * (10000-COALESCE(x.bps,0)) / 10000.0
             ELSE 0 END
         ),0)::text AS unassigned_amount
       FROM journal_lines jl
       INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id AND j.deleted_at IS NULL AND j.status='posted'
       INNER JOIN accounts a ON a.id=jl.account_id AND a.company_id=jl.company_id AND a.deleted_at IS NULL
       LEFT JOIN allocated x ON x.journal_line_id=jl.id
       WHERE jl.company_id=$1 AND jl.deleted_at IS NULL
         AND j.journal_date BETWEEN $2 AND $3
         AND (a.account_type='income' OR a.account_type LIKE 'income_%' OR a.account_type='expense' OR a.account_type LIKE 'expense_%')
         AND COALESCE(x.bps,0)<10000`,
      [context.companyId,from,to],
    ),
    context.pool.query(
      `SELECT v.id::text,v.name,v.version_type,v.scenario,v.status,p.name AS plan_name,
              p.fiscal_year_start::text,p.fiscal_year_end::text
       FROM accounting_budget_versions v
       INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL
       WHERE v.company_id=$1 AND v.deleted_at IS NULL AND v.status IN ('draft','published')
       ORDER BY p.fiscal_year_start DESC,v.created_at DESC
       LIMIT 100`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT b.id::text,b.version_id::text,b.account_id::text,a.code AS account_code,a.name AS account_name,
              b.period_start::text,b.period_end::text,b.department_id::text,d.name AS department_name,
              b.analytic_project_id::text,p.name AS project_name,b.amount::text,b.notes
       FROM accounting_dimension_budget_lines b
       INNER JOIN accounts a ON a.id=b.account_id AND a.company_id=b.company_id
       LEFT JOIN departments d ON d.id=b.department_id AND d.company_id=b.company_id
       LEFT JOIN accounting_analytic_projects p ON p.id=b.analytic_project_id AND p.company_id=b.company_id
       WHERE b.company_id=$1 AND b.deleted_at IS NULL
       ORDER BY b.period_start DESC,a.code
       LIMIT 250`,
      [context.companyId],
    ),
    (async () => {
      const client = await context.pool.connect();
      try { return await projectIntegration(client,context.companyId); }
      finally { client.release(); }
    })(),
  ]);

  const normalizeSummary = (rows: Array<Record<string, unknown>>) =>
    rows.map(row => {
      const income = Number(row.income || 0);
      const expense = Number(row.expense || 0);
      return {
        ...row,
        income: income.toFixed(2),
        expense: expense.toFixed(2),
        net: (income-expense).toFixed(2),
      };
    });

  return {
    companyId: context.companyId,
    currency: String(company.rows[0]?.currency || 'KES').toUpperCase(),
    filters: { from, to },
    settings: settings.rows[0] || {
      enabled: true,
      require_department_on_expense: false,
      require_project_on_income: false,
      auto_apply_rules: true,
    },
    accounts: accounts.rows,
    departments: departments.rows,
    projects: projects.rows,
    rules: rules.rows,
    recentLines: recentLines.rows,
    departmentSummary: normalizeSummary(departmentSummary.rows),
    projectSummary: normalizeSummary(projectSummary.rows),
    unassigned: unassigned.rows[0] || { line_count: 0, unassigned_amount: '0.00' },
    budgetVersions: budgetVersions.rows,
    dimensionBudgets: dimensionBudgets.rows,
    projectsIntegration: integration,
  };
}

export type AccountingDimensionsWorkspace = Awaited<ReturnType<typeof getAccountingDimensions>>;

export async function saveDimensionSettings(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_dimension_settings','edit');
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError('The active company changed. Reload Accounting before saving analytic settings.');
  }
  const values = {
    enabled: bool(body.enabled,true),
    requireDepartmentOnExpense: bool(body.requireDepartmentOnExpense,false),
    requireProjectOnIncome: bool(body.requireProjectOnIncome,false),
    autoApplyRules: bool(body.autoApplyRules,true),
  };
  await context.pool.query(
    `INSERT INTO accounting_dimension_settings(
       company_id,enabled,require_department_on_expense,require_project_on_income,auto_apply_rules,created_by,updated_by
     ) VALUES($1,$2,$3,$4,$5,$6,$6)
     ON CONFLICT(company_id) DO UPDATE SET
       enabled=EXCLUDED.enabled,
       require_department_on_expense=EXCLUDED.require_department_on_expense,
       require_project_on_income=EXCLUDED.require_project_on_income,
       auto_apply_rules=EXCLUDED.auto_apply_rules,
       updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL`,
    [context.companyId,values.enabled,values.requireDepartmentOnExpense,values.requireProjectOnIncome,values.autoApplyRules,context.userId],
  );
  await audit(context,'settings.saved','accounting_dimension_settings',context.companyId,'Project and departmental accounting settings saved');
  return { saved: true };
}

export async function createAnalyticProject(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_analytic_projects','create');
  const body = bodyOf(input);
  const name = textValue(body.name,255,'Project name',true);
  const code = textValue(body.code,50,'Project code') || null;
  const description = textValue(body.description,4000,'Project description') || null;
  const startsOn = body.startsOn ? accountingDate(body.startsOn) : null;
  const endsOn = body.endsOn ? accountingDate(body.endsOn) : null;
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new AccountingInputError('Project end date cannot be before its start date.');
  }
  const result = await context.pool.query(
    `INSERT INTO accounting_analytic_projects(
       company_id,code,name,description,status,starts_on,ends_on,created_by,updated_by
     ) VALUES($1,$2,$3,$4,'open',$5,$6,$7,$7) RETURNING id::text`,
    [context.companyId,code,name,description,startsOn,endsOn,context.userId],
  );
  const id = String(result.rows[0].id);
  await audit(context,'project.created','accounting_analytic_projects',id,'Accounting analytic project created',{name,code});
  return { id };
}

export async function importProjectDimension(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_analytic_projects','create');
  const body = bodyOf(input);
  const sourceProjectId = accountingId(body.sourceProjectId);
  const client = await context.pool.connect();
  try {
    const integration = await projectIntegration(client,context.companyId);
    if (integration.status !== 'ready') {
      throw new AccountingInputError(integration.message);
    }
    const source = await client.query(
      "SELECT id::text,name,status,start_date::text,due_date::text FROM projects WHERE company_id=$1 AND id=$2 LIMIT 1",
      [context.companyId,sourceProjectId],
    );
    if (!source.rows[0]) throw new AccountingInputError('This Projects record could not be found for the active company.');
    const row = source.rows[0];
    const inserted = await client.query(
      `INSERT INTO accounting_analytic_projects(
         company_id,source_project_id,name,status,starts_on,ends_on,created_by,updated_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$7)
       ON CONFLICT(company_id,source_project_id) WHERE source_project_id IS NOT NULL AND deleted_at IS NULL
       DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,starts_on=EXCLUDED.starts_on,ends_on=EXCLUDED.ends_on,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING id::text`,
      [
        context.companyId,
        sourceProjectId,
        String(row.name),
        String(row.status || '').toLowerCase() === 'active' ? 'open' : 'closed',
        row.start_date || null,
        row.due_date || null,
        context.userId,
      ],
    );
    const id = String(inserted.rows[0].id);
    await audit(context,'project.imported','accounting_analytic_projects',id,'Projects record linked to Accounting',{sourceProjectId});
    return { id };
  } finally {
    client.release();
  }
}

async function validateAllocationTargets(
  client: PoolClient,
  companyId: string,
  allocations: Array<{departmentId:string|null;projectId:string|null;basisPoints:number}>,
) {
  const departmentIds = [...new Set(allocations.flatMap(row => row.departmentId ? [row.departmentId] : []))];
  const projectIds = [...new Set(allocations.flatMap(row => row.projectId ? [row.projectId] : []))];
  if (departmentIds.length) {
    const rows = await client.query(
      "SELECT id::text FROM departments WHERE company_id=$1 AND id=ANY($2::uuid[]) AND is_active=TRUE",
      [companyId,departmentIds],
    );
    if (rows.rows.length !== departmentIds.length) {
      throw new AccountingInputError('Every department allocation must use an active department in this company.');
    }
  }
  if (projectIds.length) {
    const rows = await client.query(
      "SELECT id::text FROM accounting_analytic_projects WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status='open' AND deleted_at IS NULL",
      [companyId,projectIds],
    );
    if (rows.rows.length !== projectIds.length) {
      throw new AccountingInputError('Every project allocation must use an open Accounting project in this company.');
    }
  }
}

export async function saveJournalLineDimensions(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_journal_line_dimensions','edit');
  const body = bodyOf(input);
  const journalLineId = accountingId(body.journalLineId);
  if (!Array.isArray(body.allocations) || body.allocations.length < 1 || body.allocations.length > 20) {
    throw new AccountingInputError('Add between 1 and 20 analytic allocations.');
  }

  const allocations = body.allocations.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AccountingInputError('Enter valid analytic allocation rows.');
    }
    const row = raw as Record<string, unknown>;
    const departmentId = optionalId(row.departmentId);
    const projectId = optionalId(row.projectId);
    if (!departmentId && !projectId) {
      throw new AccountingInputError('Each allocation needs a department, project, or both.');
    }
    return {
      departmentId,
      projectId,
      basisPoints: basisPoints(row.basisPoints),
    };
  });
  const total = allocations.reduce((sum,row) => sum + row.basisPoints,0);
  if (total !== 10000) {
    throw new AccountingInputError('Analytic allocation percentages must total exactly 100%.');
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const lineResult = await client.query(
      `SELECT jl.id::text,jl.debit::text,jl.credit::text,j.status
       FROM journal_lines jl
       INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id
       WHERE jl.company_id=$1 AND jl.id=$2 AND jl.deleted_at IS NULL AND j.deleted_at IS NULL
       LIMIT 1 FOR UPDATE OF jl`,
      [context.companyId,journalLineId],
    );
    const line = lineResult.rows[0];
    if (!line) throw new AccountingInputError('This journal line could not be found.');
    await validateAllocationTargets(client,context.companyId,allocations);

    const previous = await client.query(
      "SELECT COALESCE(MAX(revision_number),0)::int AS revision FROM accounting_journal_line_dimensions WHERE company_id=$1 AND journal_line_id=$2",
      [context.companyId,journalLineId],
    );
    const revision = Number(previous.rows[0]?.revision || 0) + 1;
    await client.query(
      "UPDATE accounting_journal_line_dimensions SET active=FALSE,superseded_at=NOW() WHERE company_id=$1 AND journal_line_id=$2 AND active=TRUE",
      [context.companyId,journalLineId],
    );

    const lineNet = budgetMoneyCents(line.debit) - budgetMoneyCents(line.credit);
    const allocationSetId = randomUUID();
    let remaining = lineNet;

    for (let index=0; index<allocations.length; index += 1) {
      const allocation = allocations[index];
      const allocated =
        index === allocations.length - 1
          ? remaining
          : (lineNet * BigInt(allocation.basisPoints)) / BigInt(10000);
      remaining -= allocated;
      await client.query(
        `INSERT INTO accounting_journal_line_dimensions(
          company_id,journal_line_id,allocation_set_id,revision_number,
          department_id,analytic_project_id,basis_points,line_net_amount,
          allocation_amount,origin,active,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',TRUE,$10)`,
        [
          context.companyId,journalLineId,allocationSetId,revision,
          allocation.departmentId,allocation.projectId,allocation.basisPoints,
          budgetMoneyDecimal(lineNet),budgetMoneyDecimal(allocated),context.userId,
        ],
      );
    }

    await client.query('COMMIT');
    await audit(context,'allocation.revised','journal_lines',journalLineId,'Journal line analytic allocation revised',{
      revision,
      journalStatus: line.status,
      allocations: allocations.length,
    });
    return { journalLineId,revision,allocations: allocations.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDimensionRule(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_dimension_rules','create');
  const body = bodyOf(input);
  const name = textValue(body.name,255,'Rule name',true);
  const accountId = optionalId(body.accountId);
  const sourceModule = textValue(body.sourceModule,80,'Source module') || null;
  const departmentId = optionalId(body.departmentId);
  const projectId = optionalId(body.projectId);
  if (!departmentId && !projectId) throw new AccountingInputError('Choose a department, project, or both for the rule.');
  const bps = basisPoints(body.basisPoints ?? 10000);
  const priority = Number(body.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 1 || priority > 100000) {
    throw new AccountingInputError('Rule priority must be between 1 and 100000.');
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    await validateAllocationTargets(client,context.companyId,[{departmentId,projectId,basisPoints:bps}]);
    if (accountId) {
      const account = await client.query(
        "SELECT id FROM accounts WHERE company_id=$1 AND id=$2 AND is_active=TRUE AND deleted_at IS NULL LIMIT 1",
        [context.companyId,accountId],
      );
      if (!account.rows[0]) throw new AccountingInputError('Choose an active account in this company.');
    }
    const result = await client.query(
      `INSERT INTO accounting_dimension_rules(
         company_id,name,account_id,source_module,department_id,analytic_project_id,
         basis_points,priority,enabled,created_by,updated_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$9) RETURNING id::text`,
      [context.companyId,name,accountId,sourceModule,departmentId,projectId,bps,priority,context.userId],
    );
    await client.query('COMMIT');
    const id = String(result.rows[0].id);
    await audit(context,'rule.created','accounting_dimension_rules',id,'Automatic analytic allocation rule created',{name});
    return { id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDimensionBudgetLine(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_dimension_budget_lines','edit');
  const body = bodyOf(input);
  const versionId = accountingId(body.versionId);
  const accountId = accountingId(body.accountId);
  const periodStart = accountingDate(body.periodStart);
  const departmentId = optionalId(body.departmentId);
  const projectId = optionalId(body.projectId);
  if (!departmentId && !projectId) throw new AccountingInputError('Choose a department, project, or both for the dimensional budget line.');
  let amount: string;
  try { amount = budgetMoneyDecimal(budgetMoneyCents(body.amount,'Dimension budget amount')); }
  catch (error) { throw new AccountingInputError(error instanceof Error ? error.message : 'Budget amount is invalid.'); }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    await validateAllocationTargets(client,context.companyId,[{departmentId,projectId,basisPoints:10000}]);
    const version = await client.query(
      `SELECT v.id,p.fiscal_year_start::text,p.fiscal_year_end::text
       FROM accounting_budget_versions v
       INNER JOIN accounting_budget_plans p ON p.id=v.plan_id AND p.company_id=v.company_id AND p.deleted_at IS NULL
       WHERE v.company_id=$1 AND v.id=$2 AND v.status='draft' AND v.deleted_at IS NULL AND p.status='open'
       LIMIT 1 FOR SHARE`,
      [context.companyId,versionId],
    );
    if (!version.rows[0]) throw new AccountingInputError('Choose an editable draft budget or forecast version.');
    const start = String(version.rows[0].fiscal_year_start).slice(0,10);
    const end = String(version.rows[0].fiscal_year_end).slice(0,10);
    if (periodStart < start || periodStart > end || !/^\d{4}-\d{2}-01$/.test(periodStart)) {
      throw new AccountingInputError('Dimension budget periods must start on the first day of a month inside the plan.');
    }
    const date = new Date(periodStart + 'T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth()+1,0);
    const periodEnd = date.toISOString().slice(0,10);
    const account = await client.query(
      "SELECT account_type FROM accounts WHERE company_id=$1 AND id=$2 AND is_active=TRUE AND deleted_at IS NULL LIMIT 1",
      [context.companyId,accountId],
    );
    const type = String(account.rows[0]?.account_type || '');
    if (!(type === 'income' || type.startsWith('income_') || type === 'expense' || type.startsWith('expense_'))) {
      throw new AccountingInputError('Dimensional budgets use active income and expense accounts.');
    }

    await client.query(
      `UPDATE accounting_dimension_budget_lines SET deleted_at=NOW(),updated_at=NOW(),updated_by=$7
       WHERE company_id=$1 AND version_id=$2 AND account_id=$3 AND period_start=$4
         AND COALESCE(department_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE($5::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND COALESCE(analytic_project_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE($6::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND deleted_at IS NULL`,
      [context.companyId,versionId,accountId,periodStart,departmentId,projectId,context.userId],
    );
    const inserted = await client.query(
      `INSERT INTO accounting_dimension_budget_lines(
         company_id,version_id,account_id,period_start,period_end,department_id,analytic_project_id,amount,notes,created_by,updated_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id::text`,
      [
        context.companyId,versionId,accountId,periodStart,periodEnd,departmentId,projectId,amount,
        textValue(body.notes,1000,'Budget notes') || null,context.userId,
      ],
    );
    await client.query('COMMIT');
    const id = String(inserted.rows[0].id);
    await audit(context,'budget.saved','accounting_dimension_budget_lines',id,'Dimensional budget line saved',{versionId,periodStart});
    return { id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


export async function setAnalyticProjectStatus(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_analytic_projects','edit');
  const body = bodyOf(input);
  const projectId = accountingId(body.projectId);
  const status = textValue(body.status,20,'Project status',true).toLowerCase();
  if (!['open','closed','archived'].includes(status)) {
    throw new AccountingInputError('Choose open, closed, or archived for the project status.');
  }

  const result = await context.pool.query(
    `UPDATE accounting_analytic_projects
     SET status=$3,
         closed_at=CASE WHEN $3='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END,
         updated_by=$4,
         updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
     RETURNING id::text,name,status`,
    [context.companyId,projectId,status,context.userId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError('This Accounting project could not be found in the active company.');
  }
  await audit(
    context,
    'project.status_changed',
    'accounting_analytic_projects',
    projectId,
    'Accounting analytic project status changed',
    { status },
  );
  return result.rows[0];
}

export async function setDimensionRuleEnabled(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_dimension_rules','edit');
  const body = bodyOf(input);
  const ruleId = accountingId(body.ruleId);
  const enabled = bool(body.enabled,true);
  const result = await context.pool.query(
    `UPDATE accounting_dimension_rules
     SET enabled=$3,updated_by=$4,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
     RETURNING id::text,name,enabled`,
    [context.companyId,ruleId,enabled,context.userId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError('This allocation rule could not be found in the active company.');
  }
  await audit(
    context,
    'rule.enabled_changed',
    'accounting_dimension_rules',
    ruleId,
    enabled ? 'Analytic allocation rule enabled' : 'Analytic allocation rule disabled',
    { enabled },
  );
  return result.rows[0];
}
