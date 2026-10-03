import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { postBalancedLedgerJournal, reversePostedLedgerJournal } from '@/lib/apps/accounting/ledger-engine';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { AccountingInputError, accountingDate, accountingId } from '@/lib/apps/accounting/validation';

type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

function bodyOf(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid payroll accounting data.');
  }
  return input as Record<string, unknown>;
}

function optionalId(value: unknown) {
  return value === undefined || value === null || value === '' ? null : accountingId(value);
}

function bool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  throw new AccountingInputError('Choose a valid enabled or disabled value.');
}

function cents(value: unknown,label: string) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,13}(?:\.\d{1,4})?$/.test(text)) {
    throw new AccountingInputError(label + ' must be a valid non-negative amount.');
  }
  const [whole,fraction=''] = text.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2,'0').slice(0,2));
}

function money(value: bigint) {
  return String(value / BigInt(100)) + '.' + String(value % BigInt(100)).padStart(2,'0');
}

async function audit(context: Context,action: string,resourceId: string,summary: string,metadata: Record<string,unknown> = {}) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId: context.tenantId,
      companyId: context.companyId,
      userId: context.userId,
      action: 'accounting.payroll.' + action,
      module: 'accounting',
      resourceType: 'payroll_accounting',
      resourceId,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Payroll integration audit failed',error);
  }
}

async function payrollAvailability(client: Pick<PoolClient,'query'>) {
  const result = await client.query(`
    SELECT
      to_regclass('public.payroll_runs') IS NOT NULL AS runs,
      to_regclass('public.payroll_run_lines') IS NOT NULL AS lines,
      to_regclass('public.payroll_employees') IS NOT NULL AS employees
  `);
  const row = result.rows[0] || {};
  return row.runs === true && row.lines === true && row.employees === true;
}

async function assertAccount(client: Pick<PoolClient,'query'>,companyId: string,accountId: string | null,label: string) {
  if (!accountId) throw new AccountingInputError(label + ' is required before payroll can post.');
  const result = await client.query(
    "SELECT id::text FROM accounts WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND is_active=TRUE LIMIT 1",
    [accountId,companyId],
  );
  if (!result.rows[0]) throw new AccountingInputError(label + ' must be an active account in this company.');
  return accountId;
}

export async function getAccountingPayroll() {
  const context = await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_payroll_run_postings',
    'view',
  );

  const available = await payrollAvailability(context.pool);
  const [
    company,
    settings,
    accounts,
    departments,
    projects,
    mappings,
    employeeDimensions,
    postings,
  ] = await Promise.all([
    context.pool.query("SELECT currency FROM companies WHERE id=$1 LIMIT 1",[context.companyId]),
    context.pool.query(`
      SELECT enabled,salary_expense_account_id::text,net_payable_account_id::text,
             deductions_payable_account_id::text,employer_cost_expense_account_id::text,
             employer_cost_payable_account_id::text,require_employee_dimension_mapping
      FROM accounting_payroll_settings
      WHERE company_id=$1 AND deleted_at IS NULL
      LIMIT 1
    `,[context.companyId]),
    context.pool.query(`
      SELECT id::text,code,name,account_type
      FROM accounts
      WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE
      ORDER BY code,name
      LIMIT 1500
    `,[context.companyId]),
    context.pool.query(`
      SELECT id::text,name,code,is_active
      FROM departments
      WHERE company_id=$1
      ORDER BY is_active DESC,name
      LIMIT 500
    `,[context.companyId]),
    context.pool.query(`
      SELECT id::text,name,code,status
      FROM accounting_analytic_projects
      WHERE company_id=$1 AND deleted_at IS NULL
      ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,name
      LIMIT 500
    `,[context.companyId]),
    context.pool.query(`
      SELECT id::text,component_code,component_name,component_type,
             debit_account_id::text,credit_account_id::text,enabled
      FROM accounting_payroll_component_mappings
      WHERE company_id=$1 AND deleted_at IS NULL
      ORDER BY component_type,component_code
      LIMIT 500
    `,[context.companyId]),
    context.pool.query(`
      SELECT d.id::text,d.payroll_employee_id::text,d.department_id::text,
             dep.name AS department_name,d.analytic_project_id::text,p.name AS project_name
      FROM accounting_payroll_employee_dimensions d
      LEFT JOIN departments dep ON dep.id=d.department_id AND dep.company_id=d.company_id
      LEFT JOIN accounting_analytic_projects p ON p.id=d.analytic_project_id AND p.company_id=d.company_id
      WHERE d.company_id=$1 AND d.deleted_at IS NULL
      ORDER BY dep.name NULLS LAST,p.name NULLS LAST
      LIMIT 1000
    `,[context.companyId]),
    context.pool.query(`
      SELECT p.id::text,p.payroll_run_id::text,p.journal_id::text,p.reversal_journal_id::text,
             p.total_gross::text,p.total_deductions::text,p.total_net::text,p.status,
             p.posted_at,p.reversed_at,j.journal_number,j.journal_date::text
      FROM accounting_payroll_run_postings p
      INNER JOIN journals j ON j.id=p.journal_id AND j.company_id=p.company_id
      WHERE p.company_id=$1 AND p.deleted_at IS NULL
      ORDER BY p.posted_at DESC
      LIMIT 100
    `,[context.companyId]),
  ]);

  let payrollRuns: Array<Record<string,unknown>> = [];
  let payrollEmployees: Array<Record<string,unknown>> = [];
  if (available) {
    const [runs,employees] = await Promise.all([
      context.pool.query(`
        SELECT r.id::text,r.run_number,r.total_gross::text,r.total_deductions::text,r.total_net::text,
               r.status,r.approved_at,r.approved_by::text,p.name AS period_name,p.period_start::text,
               p.period_end::text,p.pay_date::text,p.currency,
               post.id::text AS posting_id,post.status AS accounting_status,post.journal_id::text
        FROM payroll_runs r
        INNER JOIN payroll_periods p ON p.id=r.period_id AND p.company_id=r.company_id AND p.deleted_at IS NULL
        LEFT JOIN accounting_payroll_run_postings post
          ON post.company_id=r.company_id AND post.payroll_run_id=r.id AND post.deleted_at IS NULL
        WHERE r.company_id=$1 AND r.deleted_at IS NULL
        ORDER BY p.period_end DESC,r.created_at DESC
        LIMIT 100
      `,[context.companyId]),
      context.pool.query(`
        SELECT pe.id::text AS payroll_employee_id,pe.employee_reference::text,pe.payroll_number,
               pe.status,e.full_name,e.department,
               dim.department_id::text,dep.name AS department_name,
               dim.analytic_project_id::text,ap.name AS project_name
        FROM payroll_employees pe
        LEFT JOIN employees e ON e.id=pe.employee_reference
        LEFT JOIN accounting_payroll_employee_dimensions dim
          ON dim.company_id=pe.company_id AND dim.payroll_employee_id=pe.id AND dim.deleted_at IS NULL
        LEFT JOIN departments dep ON dep.id=dim.department_id AND dep.company_id=pe.company_id
        LEFT JOIN accounting_analytic_projects ap ON ap.id=dim.analytic_project_id AND ap.company_id=pe.company_id
        WHERE pe.company_id=$1 AND pe.deleted_at IS NULL
        ORDER BY COALESCE(e.full_name,pe.payroll_number,pe.id::text)
        LIMIT 1500
      `,[context.companyId]),
    ]);
    payrollRuns = runs.rows;
    payrollEmployees = employees.rows;
  }

  const unpostedApproved = payrollRuns.filter(row => row.approved_at && !row.posting_id).length;
  const unmappedEmployees = payrollEmployees.filter(row => !row.department_id && !row.analytic_project_id).length;

  return {
    companyId: context.companyId,
    currency: String(company.rows[0]?.currency || 'KES').toUpperCase(),
    payrollAvailable: available,
    settings: settings.rows[0] || {
      enabled: true,
      salary_expense_account_id: null,
      net_payable_account_id: null,
      deductions_payable_account_id: null,
      employer_cost_expense_account_id: null,
      employer_cost_payable_account_id: null,
      require_employee_dimension_mapping: false,
    },
    accounts: accounts.rows,
    departments: departments.rows,
    projects: projects.rows,
    mappings: mappings.rows,
    employeeDimensions: employeeDimensions.rows,
    payrollRuns,
    payrollEmployees,
    postings: postings.rows,
    metrics: {
      unpostedApproved,
      unmappedEmployees,
      postedRuns: postings.rows.filter(row => row.status === 'posted').length,
      reversedRuns: postings.rows.filter(row => row.status === 'reversed').length,
    },
  };
}

export type AccountingPayrollWorkspace = Awaited<ReturnType<typeof getAccountingPayroll>>;

export async function saveAccountingPayrollSettings(input: unknown) {
  const body = bodyOf(input);
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_payroll_settings','edit');
  const salaryExpense = optionalId(body.salaryExpenseAccountId);
  const netPayable = optionalId(body.netPayableAccountId);
  const deductionsPayable = optionalId(body.deductionsPayableAccountId);
  const employerExpense = optionalId(body.employerCostExpenseAccountId);
  const employerPayable = optionalId(body.employerCostPayableAccountId);

  for (const [id,label] of [
    [salaryExpense,'Salary expense account'],
    [netPayable,'Net pay payable account'],
    [deductionsPayable,'Deductions payable account'],
    [employerExpense,'Employer cost expense account'],
    [employerPayable,'Employer cost payable account'],
  ] as const) {
    if (id) await assertAccount(context.pool,context.companyId,id,label);
  }

  const saved = await context.pool.query(`
    INSERT INTO accounting_payroll_settings (
      company_id,enabled,salary_expense_account_id,net_payable_account_id,
      deductions_payable_account_id,employer_cost_expense_account_id,
      employer_cost_payable_account_id,require_employee_dimension_mapping,
      created_by,updated_by,created_at,updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,NOW(),NOW())
    ON CONFLICT (company_id)
    DO UPDATE SET
      enabled=EXCLUDED.enabled,
      salary_expense_account_id=EXCLUDED.salary_expense_account_id,
      net_payable_account_id=EXCLUDED.net_payable_account_id,
      deductions_payable_account_id=EXCLUDED.deductions_payable_account_id,
      employer_cost_expense_account_id=EXCLUDED.employer_cost_expense_account_id,
      employer_cost_payable_account_id=EXCLUDED.employer_cost_payable_account_id,
      require_employee_dimension_mapping=EXCLUDED.require_employee_dimension_mapping,
      updated_by=EXCLUDED.updated_by,
      updated_at=NOW(),
      deleted_at=NULL
    RETURNING *
  `,[
    context.companyId,
    bool(body.enabled,true),
    salaryExpense,
    netPayable,
    deductionsPayable,
    employerExpense,
    employerPayable,
    bool(body.requireEmployeeDimensionMapping,false),
    context.userId,
  ]);
  await audit(context,'settings_saved',context.companyId,'Payroll accounting settings updated.');
  return saved.rows[0];
}

export async function savePayrollEmployeeDimension(input: unknown) {
  const body = bodyOf(input);
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_payroll_employee_dimensions','edit');
  if (!(await payrollAvailability(context.pool))) {
    throw new AccountingInputError('Payroll is not installed in this workspace.');
  }
  const payrollEmployeeId = accountingId(body.payrollEmployeeId);
  const departmentId = optionalId(body.departmentId);
  const projectId = optionalId(body.projectId);
  if (!departmentId && !projectId) {
    throw new AccountingInputError('Choose a department, project, or both.');
  }

  const employee = await context.pool.query(
    "SELECT id::text FROM payroll_employees WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL LIMIT 1",
    [payrollEmployeeId,context.companyId],
  );
  if (!employee.rows[0]) throw new AccountingInputError('Choose a payroll employee from this company.');

  if (departmentId) {
    const department = await context.pool.query(
      "SELECT id::text FROM departments WHERE id=$1 AND company_id=$2 AND is_active=TRUE LIMIT 1",
      [departmentId,context.companyId],
    );
    if (!department.rows[0]) throw new AccountingInputError('Choose an active department from this company.');
  }
  if (projectId) {
    const project = await context.pool.query(
      "SELECT id::text FROM accounting_analytic_projects WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='open' LIMIT 1",
      [projectId,context.companyId],
    );
    if (!project.rows[0]) throw new AccountingInputError('Choose an open Accounting project from this company.');
  }

  const saved = await context.pool.query(`
    INSERT INTO accounting_payroll_employee_dimensions (
      company_id,payroll_employee_id,department_id,analytic_project_id,
      created_by,updated_by,created_at,updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$5,NOW(),NOW())
    ON CONFLICT (company_id,payroll_employee_id)
    WHERE deleted_at IS NULL
    DO UPDATE SET
      department_id=EXCLUDED.department_id,
      analytic_project_id=EXCLUDED.analytic_project_id,
      updated_by=EXCLUDED.updated_by,
      updated_at=NOW()
    RETURNING id::text
  `,[context.companyId,payrollEmployeeId,departmentId,projectId,context.userId]);
  await audit(context,'employee_dimension_saved',payrollEmployeeId,'Payroll employee analytic mapping updated.');
  return saved.rows[0];
}

export async function postApprovedPayrollRun(input: unknown) {
  const body = bodyOf(input);
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_payroll_run_postings','create');
  if (!(await payrollAvailability(context.pool))) {
    throw new AccountingInputError('Payroll is not installed in this workspace.');
  }

  const payrollRunId = accountingId(body.payrollRunId);
  const requestKey = body.requestKey ? accountingId(body.requestKey) : randomUUID();
  const postingDate = accountingDate(String(body.postingDate || new Date().toISOString().slice(0,10)));

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');

    const existingRequest = await client.query(
      "SELECT id::text,payroll_run_id::text,journal_id::text FROM accounting_payroll_run_postings WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId,requestKey],
    );
    if (existingRequest.rows[0]) {
      if (String(existingRequest.rows[0].payroll_run_id) !== payrollRunId) {
        throw new AccountingInputError('This payroll posting request key was already used for another run.');
      }
      await client.query('COMMIT');
      return existingRequest.rows[0];
    }

    const run = await client.query(`
      SELECT r.id::text,r.run_number,r.total_gross::text,r.total_deductions::text,r.total_net::text,
             r.status,r.approved_at,p.pay_date::text,p.period_end::text,p.currency
      FROM payroll_runs r
      INNER JOIN payroll_periods p ON p.id=r.period_id AND p.company_id=r.company_id AND p.deleted_at IS NULL
      WHERE r.id=$1 AND r.company_id=$2 AND r.deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,[payrollRunId,context.companyId]);
    const payrollRun = run.rows[0];
    if (!payrollRun) throw new AccountingInputError('Choose an existing payroll run from this company.');
    if (!payrollRun.approved_at) {
      throw new AccountingInputError('Only an approved payroll run can be posted to Accounting.');
    }

    const existingRun = await client.query(
      "SELECT id::text,journal_id::text,status FROM accounting_payroll_run_postings WHERE company_id=$1 AND payroll_run_id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId,payrollRunId],
    );
    if (existingRun.rows[0]) {
      await client.query('COMMIT');
      return existingRun.rows[0];
    }

    const settingsResult = await client.query(`
      SELECT enabled,salary_expense_account_id::text,net_payable_account_id::text,
             deductions_payable_account_id::text,require_employee_dimension_mapping
      FROM accounting_payroll_settings
      WHERE company_id=$1 AND deleted_at IS NULL
      LIMIT 1
      FOR SHARE
    `,[context.companyId]);
    const settings = settingsResult.rows[0];
    if (!settings || settings.enabled !== true) {
      throw new AccountingInputError('Enable Payroll Accounting and configure its control accounts first.');
    }

    const salaryExpense = await assertAccount(client,context.companyId,String(settings.salary_expense_account_id || ''),'Salary expense account');
    const netPayable = await assertAccount(client,context.companyId,String(settings.net_payable_account_id || ''),'Net pay payable account');
    const deductionsPayable = await assertAccount(client,context.companyId,String(settings.deductions_payable_account_id || ''),'Deductions payable account');

    const gross = cents(payrollRun.total_gross,'Payroll gross total');
    const deductions = cents(payrollRun.total_deductions,'Payroll deductions total');
    const net = cents(payrollRun.total_net,'Payroll net total');
    if (gross <= BigInt(0) || gross !== deductions + net) {
      throw new AccountingInputError('The approved payroll run does not reconcile: gross must equal net pay plus deductions.');
    }

    const employeeRows = await client.query(`
      SELECT l.payroll_employee_id::text,l.gross_amount::text,
             dim.department_id::text,dim.analytic_project_id::text
      FROM payroll_run_lines l
      LEFT JOIN accounting_payroll_employee_dimensions dim
        ON dim.company_id=l.company_id AND dim.payroll_employee_id=l.payroll_employee_id AND dim.deleted_at IS NULL
      WHERE l.company_id=$1 AND l.payroll_run_id=$2 AND l.deleted_at IS NULL
      ORDER BY l.id
      FOR SHARE OF l
    `,[context.companyId,payrollRunId]);

    if (settings.require_employee_dimension_mapping === true &&
        employeeRows.rows.some(row => !row.department_id && !row.analytic_project_id)) {
      throw new AccountingInputError('Map every payroll employee to a department or project before posting this run.');
    }

    const grouped = new Map<string,{departmentId:string|null;projectId:string|null;amount:bigint}>();
    for (const row of employeeRows.rows) {
      const amount = cents(row.gross_amount,'Payroll employee gross amount');
      const departmentId = row.department_id ? String(row.department_id) : null;
      const projectId = row.analytic_project_id ? String(row.analytic_project_id) : null;
      const key = (departmentId || '') + ':' + (projectId || '');
      const current = grouped.get(key) || {departmentId,projectId,amount:BigInt(0)};
      current.amount += amount;
      grouped.set(key,current);
    }

    const groupedGross = [...grouped.values()].reduce((total,row)=>total+row.amount,BigInt(0));
    if (employeeRows.rows.length > 0 && groupedGross !== gross) {
      throw new AccountingInputError('Payroll employee gross lines do not reconcile to the approved run total.');
    }

    const expenseGroups = grouped.size > 0
      ? [...grouped.values()]
      : [{departmentId:null,projectId:null,amount:gross}];

    const lines = [
      ...expenseGroups.filter(group=>group.amount>BigInt(0)).map((group,index)=>({
        accountId: salaryExpense,
        description: 'Payroll gross expense ' + String(index + 1),
        debit: money(group.amount),
        credit: '0.00',
      })),
      ...(deductions > BigInt(0) ? [{
        accountId: deductionsPayable,
        description: 'Payroll deductions payable',
        debit: '0.00',
        credit: money(deductions),
      }] : []),
      {
        accountId: netPayable,
        description: 'Payroll net pay payable',
        debit: '0.00',
        credit: money(net),
      },
    ];

    const journal = await postBalancedLedgerJournal(client,{
      companyId: context.companyId,
      userId: context.userId,
      journalDate: postingDate,
      description: 'Payroll ' + String(payrollRun.run_number || payrollRunId),
      reference: String(payrollRun.run_number || payrollRunId),
      sourceModule: 'payroll',
      sourceType: 'payroll_run',
      sourceId: payrollRunId,
      sourceEventKey: 'payroll-run:' + payrollRunId + ':accounting',
      postingKind: 'system',
      lines,
    });

    const requestHash = createHash('sha256').update(JSON.stringify({
      payrollRunId,
      postingDate,
      gross: money(gross),
      deductions: money(deductions),
      net: money(net),
    })).digest('hex');

    const posting = await client.query(`
      INSERT INTO accounting_payroll_run_postings (
        company_id,payroll_run_id,journal_id,total_gross,total_deductions,total_net,
        status,request_key,request_hash,posted_by,posted_at,created_at,updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,'posted',$7,$8,$9,NOW(),NOW(),NOW())
      RETURNING id::text,journal_id::text,status
    `,[
      context.companyId,payrollRunId,journal.journalId,money(gross),money(deductions),money(net),
      requestKey,requestHash,context.userId,
    ]);

    const journalLines = await client.query(`
      SELECT id::text,description,debit::text
      FROM journal_lines
      WHERE company_id=$1 AND journal_id=$2 AND account_id=$3 AND deleted_at IS NULL
      ORDER BY created_at,id
    `,[context.companyId,journal.journalId,salaryExpense]);

    for (let index=0; index<expenseGroups.length; index+=1) {
      const group = expenseGroups[index];
      const journalLine = journalLines.rows[index];
      if (!journalLine || (!group.departmentId && !group.projectId) || group.amount <= BigInt(0)) continue;
      const allocationSetId = randomUUID();
      await client.query(`
        INSERT INTO accounting_journal_line_dimensions (
          company_id,journal_line_id,allocation_set_id,revision_number,
          department_id,analytic_project_id,basis_points,line_net_amount,
          allocation_amount,origin,active,created_by,created_at
        )
        VALUES ($1,$2,$3,1,$4,$5,10000,$6,$6,'import',TRUE,$7,NOW())
      `,[
        context.companyId,String(journalLine.id),allocationSetId,
        group.departmentId,group.projectId,money(group.amount),context.userId,
      ]);
    }

    const postingId = String(posting.rows[0].id);
    for (const row of employeeRows.rows) {
      await client.query(`
        INSERT INTO accounting_payroll_run_posting_allocations (
          company_id,run_posting_id,payroll_employee_id,department_id,
          analytic_project_id,gross_amount,created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,NOW())
      `,[
        context.companyId,postingId,String(row.payroll_employee_id),
        row.department_id || null,row.analytic_project_id || null,
        money(cents(row.gross_amount,'Payroll employee gross amount')),
      ]);
    }

    await client.query('COMMIT');
    await audit(context,'run_posted',payrollRunId,'Approved payroll run posted to Accounting.',{
      journalId: journal.journalId,
      gross: money(gross),
      deductions: money(deductions),
      net: money(net),
    });
    return posting.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reversePayrollRunPosting(input: unknown) {
  const body = bodyOf(input);
  const context = await requireEnterpriseModuleTableContext('accounting','accounting_payroll_run_postings','edit');
  const payrollRunId = accountingId(body.payrollRunId);
  const reversalDate = accountingDate(String(body.reversalDate || new Date().toISOString().slice(0,10)));

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT id::text,journal_id::text,reversal_journal_id::text,status
      FROM accounting_payroll_run_postings
      WHERE company_id=$1 AND payroll_run_id=$2 AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,[context.companyId,payrollRunId]);
    const posting = result.rows[0];
    if (!posting) throw new AccountingInputError('This payroll run has not been posted to Accounting.');
    if (posting.status === 'reversed' && posting.reversal_journal_id) {
      await client.query('COMMIT');
      return posting;
    }

    const reversal = await reversePostedLedgerJournal(client,{
      companyId: context.companyId,
      userId: context.userId,
      originalJournalId: String(posting.journal_id),
      journalDate: reversalDate,
      description: 'Reverse payroll run ' + payrollRunId,
      sourceModule: 'payroll',
      sourceType: 'payroll_run_reversal',
      sourceId: payrollRunId,
      sourceEventKey: 'payroll-run:' + payrollRunId + ':accounting:reversal',
    });

    const updated = await client.query(`
      UPDATE accounting_payroll_run_postings
      SET status='reversed',reversal_journal_id=$3,reversed_by=$4,reversed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND company_id=$2
      RETURNING id::text,journal_id::text,reversal_journal_id::text,status
    `,[posting.id,context.companyId,reversal.journalId,context.userId]);
    await client.query('COMMIT');
    await audit(context,'run_reversed',payrollRunId,'Payroll Accounting posting reversed.',{
      reversalJournalId: reversal.journalId,
    });
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
