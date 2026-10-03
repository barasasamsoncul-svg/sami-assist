import 'server-only';

import type { Pool,PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { accountingId,AccountingInputError } from '@/lib/apps/accounting/validation';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

type HealthStatus='pass'|'warn'|'fail';

export type AccountingHealthCheck={
  key:string;
  title:string;
  status:HealthStatus;
  summary:string;
  detail:string;
  href:string;
  recoverable:boolean;
};

type HealthSnapshot={
  overall:'healthy'|'attention'|'critical';
  counts:{
    activeAccounts:number;
    configuredMappings:number;
    openPeriods:number;
    closedPeriods:number;
    draftJournals:number;
    staleDrafts:number;
    pendingApprovals:number;
    unreconciledBankLines:number;
    failedStatementImports:number;
  };
  checks:AccountingHealthCheck[];
  raw:{
    settingsPresent:boolean;
    requireOpenPeriod:boolean;
    globalLockDate:string|null;
    latestClosedEnd:string|null;
    postedTrialDifference:string;
    invalidMappings:string[];
    orphanLedgerLines:number;
    brokenPendingApprovals:number;
    latestAccountingMigration:string|null;
  };
};

const SETTINGS_AREAS=[
  {
    key:'core',
    title:'Core books',
    description:'Fiscal year, control accounts, locks and opening policy.',
    href:'/apps/accounting/setup',
    table:'accounting_settings',
  },
  {
    key:'approval',
    title:'Approvals & audit',
    description:'Maker-checker, approval bands and posting separation.',
    href:'/apps/accounting/approval-controls',
    table:'accounting_approval_settings',
  },
  {
    key:'tax',
    title:'Taxes',
    description:'Tax codes, groups and ledger mappings.',
    href:'/apps/accounting/taxes',
    table:'accounting_tax_codes',
  },
  {
    key:'kenya',
    title:'Kenya accounting',
    description:'Kenya VAT controls and eTIMS evidence.',
    href:'/apps/accounting/kenya',
    table:'accounting_kenya_settings',
  },
  {
    key:'international',
    title:'International localization',
    description:'Country packs, report boxes and shared e-invoice evidence.',
    href:'/apps/accounting/international',
    table:'accounting_localization_settings',
  },
  {
    key:'fx',
    title:'Foreign currency',
    description:'Exchange-rate policy, currencies and revaluation.',
    href:'/apps/accounting/fx',
    table:'accounting_fx_settings',
  },
  {
    key:'inventory',
    title:'Inventory valuation',
    description:'Inventory mappings, movement rules and GL reconciliation.',
    href:'/apps/accounting/inventory-valuation',
    table:'accounting_inventory_settings',
  },
  {
    key:'accruals',
    title:'Accruals & deferrals',
    description:'Recognition defaults and controlled schedule behavior.',
    href:'/apps/accounting/accruals-deferrals',
    table:'accounting_accrual_settings',
  },
  {
    key:'financing',
    title:'Loans & financing',
    description:'Financing defaults and accounting classifications.',
    href:'/apps/accounting/loans-financing',
    table:'accounting_financing_settings',
  },
  {
    key:'budget',
    title:'Budgets & forecasts',
    description:'Planning assumptions and variance alerts.',
    href:'/apps/accounting/budgets-forecasts',
    table:'accounting_budget_settings',
  },
  {
    key:'dimensions',
    title:'Projects & departments',
    description:'Analytic dimensions, allocation rules and budgets.',
    href:'/apps/accounting/project-departmental',
    table:'accounting_dimension_settings',
  },
  {
    key:'payroll',
    title:'Payroll integration',
    description:'Payroll mappings and posting controls.',
    href:'/apps/accounting/payroll-integration',
    table:'accounting_payroll_settings',
  },
  {
    key:'consolidation',
    title:'Consolidation',
    description:'Multi-company translation and elimination controls.',
    href:'/apps/accounting/multi-company-consolidation',
    table:'accounting_consolidation_settings',
  },
  {
    key:'financial-reporting',
    title:'Financial reporting',
    description:'Statement presentation and snapshot controls.',
    href:'/apps/accounting/financial-statements',
    table:'accounting_financial_report_settings',
  },
  {
    key:'management-reporting',
    title:'Management reporting',
    description:'Exception thresholds and management-report policy.',
    href:'/apps/accounting/management-reporting',
    table:'accounting_management_report_settings',
  },
] as const;

function cents(value:string) {
  const text=String(value||'0').trim();
  const negative=text.startsWith('-');
  const clean=negative?text.slice(1):text;
  const [wholeRaw='0',fractionRaw='']=clean.split('.');
  const whole=/^\d+$/.test(wholeRaw)?BigInt(wholeRaw):BigInt(0);
  const fraction=BigInt((fractionRaw+'00').slice(0,2).replace(/\D/g,'')||'0');
  const amount=whole*BigInt(100)+fraction;
  return negative?-amount:amount;
}

async function collectHealth(
  pool:Pool,
  companyId:string,
):Promise<HealthSnapshot> {
  const result=await pool.query(
    `SELECT
      EXISTS(
        SELECT 1 FROM accounting_settings s
        WHERE s.company_id=$1 AND s.deleted_at IS NULL
      ) AS settings_present,
      COALESCE((
        SELECT s.require_open_period
        FROM accounting_settings s
        WHERE s.company_id=$1 AND s.deleted_at IS NULL
        LIMIT 1
      ),TRUE) AS require_open_period,
      (
        SELECT s.global_lock_date::text
        FROM accounting_settings s
        WHERE s.company_id=$1 AND s.deleted_at IS NULL
        LIMIT 1
      ) AS global_lock_date,
      (
        SELECT MAX(p.ends_on)::text
        FROM accounting_fiscal_periods p
        WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.status='closed'
      ) AS latest_closed_end,
      (
        SELECT COUNT(*)::int
        FROM accounts a
        WHERE a.company_id=$1 AND a.deleted_at IS NULL AND a.is_active=TRUE
      ) AS active_accounts,
      (
        SELECT
          (CASE WHEN s.default_receivable_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.default_payable_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.retained_earnings_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.output_tax_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.input_tax_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.default_cash_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.fx_gain_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.fx_loss_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.write_off_account_id IS NOT NULL THEN 1 ELSE 0 END)+
          (CASE WHEN s.rounding_account_id IS NOT NULL THEN 1 ELSE 0 END)
        FROM accounting_settings s
        WHERE s.company_id=$1 AND s.deleted_at IS NULL
        LIMIT 1
      ) AS configured_mappings,
      (
        SELECT COALESCE(
          ARRAY_AGG(mapped.label ORDER BY mapped.label)
            FILTER (WHERE mapped.account_id IS NOT NULL AND (a.id IS NULL OR a.deleted_at IS NOT NULL OR a.is_active IS NOT TRUE)),
          ARRAY[]::text[]
        )
        FROM accounting_settings s
        CROSS JOIN LATERAL (
          VALUES
            (s.default_receivable_account_id,'Accounts receivable'),
            (s.default_payable_account_id,'Accounts payable'),
            (s.retained_earnings_account_id,'Retained earnings'),
            (s.output_tax_account_id,'Output tax'),
            (s.input_tax_account_id,'Input tax'),
            (s.default_cash_account_id,'Default cash / bank'),
            (s.fx_gain_account_id,'FX gain'),
            (s.fx_loss_account_id,'FX loss'),
            (s.write_off_account_id,'Write-off'),
            (s.rounding_account_id,'Rounding')
        ) AS mapped(account_id,label)
        LEFT JOIN accounts a
          ON a.id=mapped.account_id AND a.company_id=s.company_id
        WHERE s.company_id=$1 AND s.deleted_at IS NULL
      ) AS invalid_mappings,
      (
        SELECT COUNT(*)::int
        FROM accounting_fiscal_periods p
        WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.status='open'
      ) AS open_periods,
      (
        SELECT COUNT(*)::int
        FROM accounting_fiscal_periods p
        WHERE p.company_id=$1 AND p.deleted_at IS NULL AND p.status='closed'
      ) AS closed_periods,
      (
        SELECT COUNT(*)::int
        FROM journals j
        WHERE j.company_id=$1 AND j.deleted_at IS NULL AND j.status='draft'
      ) AS draft_journals,
      (
        SELECT COUNT(*)::int
        FROM journals j
        WHERE j.company_id=$1
          AND j.deleted_at IS NULL
          AND j.status='draft'
          AND j.created_at < NOW() - (
            COALESCE((
              SELECT mr.stale_draft_days
              FROM accounting_management_report_settings mr
              WHERE mr.company_id=$1 AND mr.deleted_at IS NULL
              LIMIT 1
            ),7)::int * INTERVAL '1 day'
          )
      ) AS stale_drafts,
      (
        SELECT COUNT(*)::int
        FROM accounting_approval_requests r
        WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status='pending'
      ) AS pending_approvals,
      (
        SELECT COUNT(*)::int
        FROM accounting_approval_requests r
        LEFT JOIN journals j
          ON j.id=r.journal_id AND j.company_id=r.company_id AND j.deleted_at IS NULL
        WHERE r.company_id=$1
          AND r.deleted_at IS NULL
          AND r.status='pending'
          AND (j.id IS NULL OR j.status<>'draft')
      ) AS broken_pending_approvals,
      (
        SELECT COUNT(*)::int
        FROM accounting_bank_statement_lines s
        WHERE s.company_id=$1
          AND s.deleted_at IS NULL
          AND s.reconciliation_status IN ('unmatched','suggested')
      ) AS unreconciled_bank_lines,
      (
        SELECT COUNT(*)::int
        FROM accounting_statement_import_batches b
        WHERE b.company_id=$1 AND b.deleted_at IS NULL AND b.status='failed'
      ) AS failed_statement_imports,
      (
        SELECT COALESCE(SUM(l.debit-l.credit),0)::text
        FROM journals j
        JOIN journal_lines l
          ON l.journal_id=j.id
         AND l.company_id=j.company_id
         AND l.deleted_at IS NULL
        WHERE j.company_id=$1 AND j.deleted_at IS NULL AND j.status='posted'
      ) AS posted_trial_difference,
      (
        SELECT COUNT(*)::int
        FROM journal_lines l
        LEFT JOIN journals j ON j.id=l.journal_id
        LEFT JOIN accounts a ON a.id=l.account_id
        WHERE l.company_id=$1
          AND l.deleted_at IS NULL
          AND (
            j.id IS NULL OR
            a.id IS NULL OR
            j.company_id<>l.company_id OR
            a.company_id<>l.company_id
          )
      ) AS orphan_ledger_lines,
      (
        SELECT m.migration_key
        FROM sami_module_migrations m
        WHERE m.module_key='accounting'
        ORDER BY m.applied_at DESC,m.migration_key DESC
        LIMIT 1
      ) AS latest_accounting_migration`,
    [companyId],
  );

  const row=result.rows[0]||{};
  const settingsPresent=row.settings_present===true;
  const requireOpenPeriod=row.require_open_period!==false;
  const globalLockDate=row.global_lock_date?String(row.global_lock_date).slice(0,10):null;
  const latestClosedEnd=row.latest_closed_end?String(row.latest_closed_end).slice(0,10):null;
  const activeAccounts=Number(row.active_accounts||0);
  const configuredMappings=Number(row.configured_mappings||0);
  const invalidMappings=Array.isArray(row.invalid_mappings)
    ? row.invalid_mappings.map(String)
    : [];
  const openPeriods=Number(row.open_periods||0);
  const closedPeriods=Number(row.closed_periods||0);
  const draftJournals=Number(row.draft_journals||0);
  const staleDrafts=Number(row.stale_drafts||0);
  const pendingApprovals=Number(row.pending_approvals||0);
  const brokenPendingApprovals=Number(row.broken_pending_approvals||0);
  const unreconciledBankLines=Number(row.unreconciled_bank_lines||0);
  const failedStatementImports=Number(row.failed_statement_imports||0);
  const postedTrialDifference=String(row.posted_trial_difference||'0');
  const orphanLedgerLines=Number(row.orphan_ledger_lines||0);
  const lockBehind=Boolean(latestClosedEnd && (!globalLockDate || globalLockDate<latestClosedEnd));

  const checks:AccountingHealthCheck[]=[
    {
      key:'ledger-balance',
      title:'Posted ledger balance',
      status:cents(postedTrialDifference)===BigInt(0)?'pass':'fail',
      summary:cents(postedTrialDifference)===BigInt(0)?'Posted debits and credits balance.':'Posted ledger is out of balance.',
      detail:'Trial-balance difference: '+postedTrialDifference,
      href:'/apps/accounting/trial-balance',
      recoverable:false,
    },
    {
      key:'ledger-boundary',
      title:'Ledger company boundary',
      status:orphanLedgerLines===0?'pass':'fail',
      summary:orphanLedgerLines===0?'Journal lines remain attached to the correct company records.':'Ledger rows have broken company or parent references.',
      detail:orphanLedgerLines+' suspect ledger line(s).',
      href:'/apps/accounting/general-ledger',
      recoverable:false,
    },
    {
      key:'core-settings',
      title:'Core Accounting settings',
      status:settingsPresent?'pass':'fail',
      summary:settingsPresent?'A company Accounting policy row is saved.':'Core Accounting defaults have not been initialized for this company.',
      detail:settingsPresent
        ? configuredMappings+' of 10 optional/control mappings are configured.'
        : 'Safe recovery can initialize the settings row without inventing control-account mappings.',
      href:'/apps/accounting/setup',
      recoverable:!settingsPresent,
    },
    {
      key:'account-mappings',
      title:'Control-account mappings',
      status:invalidMappings.length>0?'fail':configuredMappings>=6?'pass':'warn',
      summary:invalidMappings.length>0
        ? 'One or more configured mappings point to missing or inactive accounts.'
        : configuredMappings>=6
          ? 'Core control-account coverage is well configured.'
          : 'Several specialist postings still need explicit account mappings.',
      detail:invalidMappings.length
        ? 'Invalid: '+invalidMappings.join(', ')
        : configuredMappings+' of 10 mappings configured.',
      href:'/apps/accounting/setup',
      recoverable:false,
    },
    {
      key:'fiscal-periods',
      title:'Fiscal-period readiness',
      status:requireOpenPeriod && openPeriods===0?'fail':openPeriods===0?'warn':'pass',
      summary:openPeriods>0
        ? 'At least one fiscal period is open for posting.'
        : requireOpenPeriod
          ? 'Open-period enforcement is enabled but no fiscal period is open.'
          : 'No fiscal period is open; posting policy currently allows dates without an open period.',
      detail:openPeriods+' open · '+closedPeriods+' closed.',
      href:'/apps/accounting/period-closing',
      recoverable:false,
    },
    {
      key:'close-lock',
      title:'Closed-period lock integrity',
      status:lockBehind?'fail':'pass',
      summary:lockBehind?'The global lock is behind the latest closed fiscal period.':'The global lock does not undercut completed fiscal-period closes.',
      detail:'Global lock: '+(globalLockDate||'none')+' · Latest closed period: '+(latestClosedEnd||'none'),
      href:'/apps/accounting/period-closing',
      recoverable:lockBehind,
    },
    {
      key:'approval-integrity',
      title:'Approval workflow integrity',
      status:brokenPendingApprovals>0?'fail':pendingApprovals>0?'warn':'pass',
      summary:brokenPendingApprovals>0
        ? 'Pending approval evidence is inconsistent with journal state.'
        : pendingApprovals>0
          ? 'Accounting approvals are waiting for action.'
          : 'No pending Accounting approval blocker is present.',
      detail:pendingApprovals+' pending · '+brokenPendingApprovals+' inconsistent.',
      href:'/apps/accounting/approval-controls',
      recoverable:false,
    },
    {
      key:'stale-drafts',
      title:'Stale journal drafts',
      status:staleDrafts>0?'warn':'pass',
      summary:staleDrafts>0?'Old journal drafts need review before close.':'No stale journal drafts are currently flagged.',
      detail:staleDrafts+' stale · '+draftJournals+' total draft(s).',
      href:'/apps/accounting/journals',
      recoverable:false,
    },
    {
      key:'bank-reconciliation',
      title:'Bank reconciliation',
      status:unreconciledBankLines>0?'warn':'pass',
      summary:unreconciledBankLines>0?'Bank, cash or mobile-money lines still need reconciliation.':'No unmatched or suggested bank lines remain.',
      detail:unreconciledBankLines+' line(s) outstanding.',
      href:'/apps/accounting/reconciliation',
      recoverable:false,
    },
    {
      key:'statement-imports',
      title:'Statement import failures',
      status:failedStatementImports>0?'warn':'pass',
      summary:failedStatementImports>0?'One or more statement-import batches failed and need review.':'No failed statement-import batch is currently recorded.',
      detail:failedStatementImports+' failed batch(es).',
      href:'/apps/accounting/statements',
      recoverable:false,
    },
  ];

  const overall=checks.some(check=>check.status==='fail')
    ? 'critical'
    : checks.some(check=>check.status==='warn')
      ? 'attention'
      : 'healthy';

  return {
    overall,
    counts:{
      activeAccounts,
      configuredMappings,
      openPeriods,
      closedPeriods,
      draftJournals,
      staleDrafts,
      pendingApprovals,
      unreconciledBankLines,
      failedStatementImports,
    },
    checks,
    raw:{
      settingsPresent,
      requireOpenPeriod,
      globalLockDate,
      latestClosedEnd,
      postedTrialDifference,
      invalidMappings,
      orphanLedgerLines,
      brokenPendingApprovals,
      latestAccountingMigration:row.latest_accounting_migration
        ? String(row.latest_accounting_migration)
        : null,
    },
  };
}

async function settingsAreas(pool:Pool,companyId:string) {
  const result=await pool.query(
    `SELECT
      EXISTS(SELECT 1 FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL) AS core,
      EXISTS(SELECT 1 FROM accounting_approval_settings WHERE company_id=$1 AND deleted_at IS NULL) AS approval,
      EXISTS(SELECT 1 FROM accounting_tax_codes WHERE company_id=$1 AND deleted_at IS NULL) AS tax,
      EXISTS(SELECT 1 FROM accounting_kenya_settings WHERE company_id=$1 AND deleted_at IS NULL) AS kenya,
      EXISTS(SELECT 1 FROM accounting_localization_settings WHERE company_id=$1 AND deleted_at IS NULL) AS international,
      EXISTS(SELECT 1 FROM accounting_fx_settings WHERE company_id=$1 AND deleted_at IS NULL) AS fx,
      EXISTS(SELECT 1 FROM accounting_inventory_settings WHERE company_id=$1 AND deleted_at IS NULL) AS inventory,
      EXISTS(SELECT 1 FROM accounting_accrual_settings WHERE company_id=$1 AND deleted_at IS NULL) AS accruals,
      EXISTS(SELECT 1 FROM accounting_financing_settings WHERE company_id=$1 AND deleted_at IS NULL) AS financing,
      EXISTS(SELECT 1 FROM accounting_budget_settings WHERE company_id=$1 AND deleted_at IS NULL) AS budget,
      EXISTS(SELECT 1 FROM accounting_dimension_settings WHERE company_id=$1 AND deleted_at IS NULL) AS dimensions,
      EXISTS(SELECT 1 FROM accounting_payroll_settings WHERE company_id=$1 AND deleted_at IS NULL) AS payroll,
      EXISTS(SELECT 1 FROM accounting_consolidation_settings WHERE company_id=$1 AND deleted_at IS NULL) AS consolidation,
      EXISTS(SELECT 1 FROM accounting_financial_report_settings WHERE company_id=$1 AND deleted_at IS NULL) AS "financial-reporting",
      EXISTS(SELECT 1 FROM accounting_management_report_settings WHERE company_id=$1 AND deleted_at IS NULL) AS "management-reporting"`,
    [companyId],
  );
  const row=result.rows[0]||{};
  return SETTINGS_AREAS.map(area=>({
    key:area.key,
    title:area.title,
    description:area.description,
    href:area.href,
    configured:row[area.key]===true,
  }));
}

export async function getAccountingOperationalRecovery() {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_recovery_runs',
    'report',
  );

  const [health,areas,history]=await Promise.all([
    collectHealth(context.pool,context.companyId),
    settingsAreas(context.pool,context.companyId),
    context.pool.query(
      `SELECT
        id::text,request_key::text,action_key,status,summary,failure_message,
        requested_by::text,started_at::text,completed_at::text,created_at::text,
        before_json,after_json
       FROM accounting_recovery_runs
       WHERE company_id=$1
       ORDER BY created_at DESC,id DESC
       LIMIT 30`,
      [context.companyId],
    ),
  ]);

  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    generatedAt:new Date().toISOString(),
    health,
    settingsAreas:areas,
    recoveryHistory:history.rows.map(row=>({
      id:String(row.id),
      requestKey:String(row.request_key),
      actionKey:String(row.action_key),
      status:String(row.status),
      summary:row.summary?String(row.summary):null,
      failureMessage:row.failure_message?String(row.failure_message):null,
      requestedBy:row.requested_by?String(row.requested_by):null,
      startedAt:row.started_at?String(row.started_at):null,
      completedAt:row.completed_at?String(row.completed_at):null,
      createdAt:String(row.created_at),
      before:row.before_json&&typeof row.before_json==='object'?row.before_json:{},
      after:row.after_json&&typeof row.after_json==='object'?row.after_json:{},
    })),
    safeRecoveryActions:[
      {
        key:'capture_diagnostics',
        name:'Capture diagnostic snapshot',
        description:'Record the current Accounting health state for audit/support without changing financial data.',
        available:true,
      },
      {
        key:'initialize_core_settings',
        name:'Initialize safe core settings',
        description:'Create or restore the company Accounting settings row with conservative defaults. No account mapping or fiscal period is invented.',
        available:!health.raw.settingsPresent,
      },
      {
        key:'sync_lock_forward',
        name:'Sync closed-period lock forward',
        description:'Raise the global lock to at least the latest closed fiscal-period end. This action never lowers or removes a lock.',
        available:Boolean(
          health.raw.latestClosedEnd &&
          (
            !health.raw.globalLockDate ||
            health.raw.globalLockDate<health.raw.latestClosedEnd
          )
        ),
      },
    ],
  };
}

export type AccountingOperationalRecoveryWorkspace=
  Awaited<ReturnType<typeof getAccountingOperationalRecovery>>;

function runSnapshot(health:HealthSnapshot) {
  return {
    overall:health.overall,
    counts:health.counts,
    checks:health.checks.map(check=>({
      key:check.key,
      status:check.status,
      summary:check.summary,
    })),
    raw:health.raw,
  };
}

export async function runAccountingRecovery(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter a valid Accounting recovery request.');
  }
  const body=input as Record<string,unknown>;
  const requestKey=accountingId(body.requestKey);
  const actionKey=
    body.actionKey==='capture_diagnostics' ||
    body.actionKey==='initialize_core_settings' ||
    body.actionKey==='sync_lock_forward'
      ? body.actionKey
      : null;

  if (!actionKey) {
    throw new AccountingInputError('Choose a supported non-destructive Accounting recovery action.');
  }

  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_recovery_runs',
    'settings',
  );

  const reserved=await context.pool.query(
    `INSERT INTO accounting_recovery_runs(
      company_id,request_key,action_key,status,requested_by,started_at,created_at,updated_at
     ) VALUES($1,$2,$3,'started',$4,NOW(),NOW(),NOW())
     ON CONFLICT(company_id,request_key) DO NOTHING
     RETURNING id::text`,
    [context.companyId,requestKey,actionKey,context.userId],
  );

  if (!reserved.rows[0]) {
    const existing=await context.pool.query(
      `SELECT id::text,action_key,status,summary,failure_message,completed_at::text
       FROM accounting_recovery_runs
       WHERE company_id=$1 AND request_key=$2
       LIMIT 1`,
      [context.companyId,requestKey],
    );
    if (!existing.rows[0]) {
      throw new AccountingInputError('The Accounting recovery request could not be reserved.');
    }
    return {
      id:String(existing.rows[0].id),
      actionKey:String(existing.rows[0].action_key),
      status:String(existing.rows[0].status),
      summary:existing.rows[0].summary?String(existing.rows[0].summary):null,
      failureMessage:existing.rows[0].failure_message?String(existing.rows[0].failure_message):null,
      completedAt:existing.rows[0].completed_at?String(existing.rows[0].completed_at):null,
      replayed:true,
    };
  }

  const runId=String(reserved.rows[0].id);
  const before=await collectHealth(context.pool,context.companyId);
  const client=await context.pool.connect();
  let summary='';
  let status:'completed'|'noop'='completed';

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['accounting:recovery:'+context.companyId+':'+actionKey],
    );

    if (actionKey==='initialize_core_settings') {
      const result=await client.query(
        `INSERT INTO accounting_settings(
          company_id,created_by,updated_by,created_at,updated_at,deleted_at
         ) VALUES($1,$2,$2,NOW(),NOW(),NULL)
         ON CONFLICT(company_id) DO UPDATE SET
           deleted_at=NULL,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()
         RETURNING company_id`,
        [context.companyId,context.userId],
      );
      summary=result.rows[0]
        ? 'Core Accounting settings are initialized. Review control-account mappings and fiscal periods next.'
        : 'Core Accounting settings were already initialized.';
    }

    if (actionKey==='sync_lock_forward') {
      const latest=await client.query(
        `SELECT MAX(ends_on)::text AS latest_closed_end
         FROM accounting_fiscal_periods
         WHERE company_id=$1 AND deleted_at IS NULL AND status='closed'`,
        [context.companyId],
      );
      const latestClosedEnd=latest.rows[0]?.latest_closed_end
        ? String(latest.rows[0].latest_closed_end).slice(0,10)
        : null;

      if (!latestClosedEnd) {
        status='noop';
        summary='No closed fiscal period exists, so no lock adjustment was required.';
      } else {
        await client.query(
          `INSERT INTO accounting_settings(
            company_id,global_lock_date,created_by,updated_by,created_at,updated_at,deleted_at
           ) VALUES($1,$2,$3,$3,NOW(),NOW(),NULL)
           ON CONFLICT(company_id) DO UPDATE SET
             global_lock_date=CASE
               WHEN accounting_settings.global_lock_date IS NULL THEN EXCLUDED.global_lock_date
               WHEN accounting_settings.global_lock_date<EXCLUDED.global_lock_date THEN EXCLUDED.global_lock_date
               ELSE accounting_settings.global_lock_date
             END,
             deleted_at=NULL,
             updated_by=EXCLUDED.updated_by,
             updated_at=NOW()`,
          [context.companyId,latestClosedEnd,context.userId],
        );
        summary='Global Accounting lock synchronized forward to protect all completed fiscal-period closes.';
      }
    }

    if (actionKey==='capture_diagnostics') {
      summary='Accounting diagnostic snapshot captured without changing financial data.';
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    const message=error instanceof Error
      ? error.message.slice(0,1000)
      : 'Accounting recovery failed.';

    await context.pool.query(
      `UPDATE accounting_recovery_runs
       SET status='failed',failure_message=$3,completed_at=NOW(),updated_at=NOW(),
           before_json=$4::jsonb
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,runId,message,JSON.stringify(runSnapshot(before))],
    ).catch(()=>undefined);

    throw error;
  } finally {
    client.release();
  }

  const after=await collectHealth(context.pool,context.companyId);

  await context.pool.query(
    `UPDATE accounting_recovery_runs
     SET status=$3,summary=$4,before_json=$5::jsonb,after_json=$6::jsonb,
         completed_at=NOW(),updated_at=NOW()
     WHERE company_id=$1 AND id=$2`,
    [
      context.companyId,
      runId,
      status,
      summary,
      JSON.stringify(runSnapshot(before)),
      JSON.stringify(runSnapshot(after)),
    ],
  );

  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,
    companyId:context.companyId,
    userId:context.userId,
    action:'accounting.recovery.'+actionKey,
    module:'accounting',
    resourceType:'accounting_recovery_run',
    resourceId:runId,
    summary,
    result:status==='completed'?'success':'noop',
    metadata:{
      requestKey,
      actionKey,
      beforeOverall:before.overall,
      afterOverall:after.overall,
      nonDestructive:true,
    },
  }).catch(()=>undefined);

  return {
    id:runId,
    actionKey,
    status,
    summary,
    health:after,
    replayed:false,
  };
}
