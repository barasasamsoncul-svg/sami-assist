import 'server-only';

import { createHash } from 'node:crypto';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import {
  AccountingInputError,
  accountingId,
  decimalAmount,
} from '@/lib/apps/accounting/validation';
import { getAccountingFinancialStatements } from '@/lib/apps/accounting/financial-statements';
import { getAccountingFoundation } from '@/lib/apps/accounting/foundation';
import { getAccountingReceivables } from '@/lib/apps/accounting/receivables';
import { getAccountingPayables } from '@/lib/apps/accounting/payables';

type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;
type Severity='high'|'medium'|'low';
type Category='ledger'|'receivables'|'payables'|'banking'|'planning'|'reporting';

export type AccountingManagementException = {
  key:string;
  category:Category;
  severity:Severity;
  title:string;
  description:string;
  itemCount:number;
  amount:string|null;
  currency:string|null;
  href:string;
  resolved?:boolean;
};

function signedCents(value:unknown,label='Amount') {
  const raw=String(value ?? '0').trim();
  if (!/^[+-]?\d{1,18}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError(label+' is not a valid accounting amount.');
  }
  const negative=raw.startsWith('-');
  const unsigned=negative||raw.startsWith('+')?raw.slice(1):raw;
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let cents=BigInt(whole||'0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if (Number(padded[2]||'0')>=5) cents+=BigInt(1);
  return negative?-cents:cents;
}

function absoluteDecimal(value:unknown) {
  const amount=signedCents(value);
  return decimalAmount(amount<BigInt(0)?-amount:amount);
}

function ratioPercent(numerator:unknown,denominator:unknown) {
  const top=signedCents(numerator);
  const bottom=signedCents(denominator);
  if (bottom===BigInt(0)) return null;
  const basisPoints=(top*BigInt(10000))/(bottom<BigInt(0)?-bottom:bottom);
  const negative=basisPoints<BigInt(0);
  const absolute=negative?-basisPoints:basisPoints;
  return (negative?'-':'')+String(absolute/BigInt(100))+'.'+String(absolute%BigInt(100)).padStart(2,'0');
}

function variancePercent(current:unknown,comparative:unknown) {
  return ratioPercent(signedCents(current)-signedCents(comparative),comparative);
}

function cashLine(
  data:Awaited<ReturnType<typeof getAccountingFinancialStatements>>,
) {
  return data.cashFlow.lines.find(line=>line.key==='closing_cash') || {
    current:'0.00',
    comparative:'0.00',
  };
}

function exceptionOrder(value:Severity) {
  return value==='high'?0:value==='medium'?1:2;
}

async function audit(
  context:Context,
  action:string,
  id:string,
  summary:string,
  metadata:Record<string,unknown>={},
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:'accounting.management_reporting.'+action,
      module:'accounting',
      resourceType:'accounting_management_report_snapshot',
      resourceId:id,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Management reporting audit failed',error);
  }
}

export async function getAccountingManagementReports(
  input:{from?:string;to?:string;compareFrom?:string;compareTo?:string}={},
) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_management_report_snapshots',
    'report',
  );

  const [
    financial,
    foundation,
    receivables,
    payables,
    settingsResult,
    snapshotsResult,
    reconciliationResult,
    budgetAlertResult,
  ]=await Promise.all([
    getAccountingFinancialStatements(input),
    getAccountingFoundation({from:input.from,to:input.to}),
    getAccountingReceivables(),
    getAccountingPayables(),
    context.pool.query(
      "SELECT stale_draft_days,show_zero_exceptions,reconciliation_alerts,budget_variance_alerts FROM accounting_management_report_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,period_start::text,period_end::text,comparative_start::text,comparative_end::text,currency,status,generated_at::text,finalized_at::text,exception_summary_json FROM accounting_management_report_snapshots WHERE company_id=$1 AND deleted_at IS NULL ORDER BY generated_at DESC LIMIT 30",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT COUNT(*) FILTER (WHERE reconciliation_status='unmatched')::int AS unmatched,COUNT(*) FILTER (WHERE reconciliation_status='suggested')::int AS suggested FROM accounting_bank_statement_lines WHERE company_id=$1 AND deleted_at IS NULL",
      [context.companyId],
    ),
    context.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM accounting_budget_variance_snapshots s
       WHERE s.company_id=$1
         AND s.deleted_at IS NULL
         AND s.run_id=(
           SELECT r.id
           FROM accounting_budget_runs r
           WHERE r.company_id=$1
             AND r.deleted_at IS NULL
             AND r.status='completed'
           ORDER BY r.completed_at DESC NULLS LAST,r.started_at DESC
           LIMIT 1
         )
         AND ABS(COALESCE(s.variance_percent,0)) >= COALESCE((
           SELECT b.variance_alert_percent
           FROM accounting_budget_settings b
           WHERE b.company_id=$1 AND b.deleted_at IS NULL
           LIMIT 1
         ),10)`,
      [context.companyId],
    ),
  ]);

  const settings=settingsResult.rows[0] || {
    stale_draft_days:7,
    show_zero_exceptions:false,
    reconciliation_alerts:true,
    budget_variance_alerts:true,
  };
  const staleDraftDays=Math.max(1,Math.min(365,Number(settings.stale_draft_days || 7)));

  const [staleDraftResult,trendResult]=await Promise.all([
    context.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM journals
       WHERE company_id=$1
         AND deleted_at IS NULL
         AND status='draft'
         AND created_at < NOW()-($2::int*INTERVAL '1 day')`,
      [context.companyId,staleDraftDays],
    ),
    context.pool.query(
      `WITH months AS (
         SELECT generate_series(
           date_trunc('month',$2::date)-INTERVAL '11 months',
           date_trunc('month',$2::date),
           INTERVAL '1 month'
         ) AS month_start
       ),
       movement AS (
         SELECT
           date_trunc('month',j.journal_date) AS month_start,
           COALESCE(SUM(CASE WHEN a.account_type='income' OR a.account_type LIKE 'income_%' THEN l.credit-l.debit ELSE 0 END),0) AS revenue,
           COALESCE(SUM(CASE WHEN a.account_type='expense' OR a.account_type LIKE 'expense_%' THEN l.debit-l.credit ELSE 0 END),0) AS expenses
         FROM journals j
         JOIN journal_lines l
           ON l.journal_id=j.id
          AND l.company_id=j.company_id
          AND l.deleted_at IS NULL
         JOIN accounts a
           ON a.id=l.account_id
          AND a.company_id=l.company_id
          AND a.deleted_at IS NULL
         WHERE j.company_id=$1
           AND j.deleted_at IS NULL
           AND j.status='posted'
           AND j.journal_date>=date_trunc('month',$2::date)-INTERVAL '11 months'
           AND j.journal_date<date_trunc('month',$2::date)+INTERVAL '1 month'
         GROUP BY 1
       )
       SELECT
         TO_CHAR(m.month_start,'YYYY-MM') AS period,
         COALESCE(x.revenue,0)::text AS revenue,
         COALESCE(x.expenses,0)::text AS expenses,
         (COALESCE(x.revenue,0)-COALESCE(x.expenses,0))::text AS profit
       FROM months m
       LEFT JOIN movement x ON x.month_start=m.month_start
       ORDER BY m.month_start`,
      [context.companyId,financial.filters.to],
    ),
  ]);

  const revenueSection=financial.profitLoss.sections.find(section=>section.key==='revenue');
  const revenue={
    current:revenueSection?.current || '0.00',
    comparative:revenueSection?.comparative || '0.00',
  };
  const cash=cashLine(financial);
  const trialDifference=foundation.accounts.reduce(
    (total,row)=>total+signedCents(row.balance),
    BigInt(0),
  );
  const classificationAdjustment=financial.cashFlow.lines.find(
    line=>line.key==='classification_adjustment',
  ) || {current:'0.00',comparative:'0.00'};

  const kpis={
    revenue:{
      ...revenue,
      variancePercent:variancePercent(revenue.current,revenue.comparative),
    },
    grossProfit:{
      ...financial.profitLoss.grossProfit,
      variancePercent:variancePercent(
        financial.profitLoss.grossProfit.current,
        financial.profitLoss.grossProfit.comparative,
      ),
      marginPercent:ratioPercent(financial.profitLoss.grossProfit.current,revenue.current),
    },
    netProfit:{
      ...financial.profitLoss.netProfit,
      variancePercent:variancePercent(
        financial.profitLoss.netProfit.current,
        financial.profitLoss.netProfit.comparative,
      ),
      marginPercent:ratioPercent(financial.profitLoss.netProfit.current,revenue.current),
    },
    cash:{
      current:cash.current,
      comparative:cash.comparative,
      variancePercent:variancePercent(cash.current,cash.comparative),
    },
    receivables:{
      outstanding:receivables.metrics.outstanding,
      overdue:receivables.metrics.overdue,
      overdueInvoiceCount:receivables.metrics.overdueInvoiceCount,
      dsoDays:receivables.metrics.dsoDays,
    },
    payables:{
      outstanding:payables.metrics.netPayable,
      overdue:payables.metrics.overdue,
      overdueBillCount:payables.metrics.overdueBillCount,
    },
    controls:{
      draftJournals:foundation.draftCount,
      staleDraftJournals:Number(staleDraftResult.rows[0]?.count || 0),
      unreconciledBankLines:
        Number(reconciliationResult.rows[0]?.unmatched || 0)+
        Number(reconciliationResult.rows[0]?.suggested || 0),
      budgetVarianceAlerts:Number(budgetAlertResult.rows[0]?.count || 0),
      trialBalanceDifference:decimalAmount(trialDifference),
    },
  };

  const exceptions:AccountingManagementException[]=[];
  const showZero=Boolean(settings.show_zero_exceptions);
  const push=(
    active:boolean,
    item:Omit<AccountingManagementException,'resolved'>,
  )=>{
    if (active || showZero) {
      exceptions.push({...item,resolved:!active});
    }
  };

  push(
    trialDifference!==BigInt(0),
    {
      key:'trial_balance_difference',
      category:'ledger',
      severity:'high',
      title:'Trial balance is out of balance',
      description:'Posted debit and credit balances do not net to zero. Review the Trial Balance before relying on management results.',
      itemCount:trialDifference===BigInt(0)?0:1,
      amount:absoluteDecimal(decimalAmount(trialDifference)),
      currency:financial.currency,
      href:'/apps/accounting/trial-balance?'+new URLSearchParams({
        from:financial.filters.from,
        to:financial.filters.to,
      }).toString(),
    },
  );

  push(
    receivables.available && !receivables.receivableControl.reconciled,
    {
      key:'receivables_control_difference',
      category:'receivables',
      severity:'high',
      title:'Receivables subledger does not match the ledger',
      description:'Customer open items and the receivables control account have a reconciliation difference.',
      itemCount:receivables.available && !receivables.receivableControl.reconciled?1:0,
      amount:receivables.available?absoluteDecimal(receivables.receivableControl.difference):null,
      currency:financial.currency,
      href:'/apps/accounting/receivables',
    },
  );

  push(
    !payables.control.reconciled,
    {
      key:'payables_control_difference',
      category:'payables',
      severity:'high',
      title:'Payables subledger does not match the ledger',
      description:'Vendor open items and the payables control account have a reconciliation difference.',
      itemCount:payables.control.reconciled?0:1,
      amount:absoluteDecimal(payables.control.difference),
      currency:financial.currency,
      href:'/apps/accounting/payables',
    },
  );

  const staleDrafts=Number(staleDraftResult.rows[0]?.count || 0);
  push(
    staleDrafts>0,
    {
      key:'stale_draft_journals',
      category:'ledger',
      severity:'medium',
      title:'Draft journals are waiting too long',
      description:'Draft journals older than '+staleDraftDays+' days may represent unfinished accounting work.',
      itemCount:staleDrafts,
      amount:null,
      currency:null,
      href:'/apps/accounting/journals',
    },
  );

  const bankExceptions=
    Number(reconciliationResult.rows[0]?.unmatched || 0)+
    Number(reconciliationResult.rows[0]?.suggested || 0);
  push(
    Boolean(settings.reconciliation_alerts) && bankExceptions>0,
    {
      key:'bank_reconciliation_gap',
      category:'banking',
      severity:'medium',
      title:'Bank items still need reconciliation',
      description:'Imported bank, cash or mobile-money statement lines remain unmatched or only suggested.',
      itemCount:bankExceptions,
      amount:null,
      currency:null,
      href:'/apps/accounting/reconciliation',
    },
  );

  push(
    receivables.available && receivables.metrics.overdueInvoiceCount>0,
    {
      key:'overdue_receivables',
      category:'receivables',
      severity:'medium',
      title:'Customers have overdue invoices',
      description:'Overdue customer balances can pressure cash flow. Review aging and collection priorities.',
      itemCount:receivables.metrics.overdueInvoiceCount,
      amount:receivables.metrics.overdue,
      currency:financial.currency,
      href:'/apps/accounting/receivables',
    },
  );

  push(
    payables.metrics.overdueBillCount>0,
    {
      key:'overdue_payables',
      category:'payables',
      severity:'medium',
      title:'Supplier bills are overdue',
      description:'Vendor obligations have passed their due dates and may need payment or dispute follow-up.',
      itemCount:payables.metrics.overdueBillCount,
      amount:payables.metrics.overdue,
      currency:financial.currency,
      href:'/apps/accounting/payables',
    },
  );

  const budgetAlerts=Number(budgetAlertResult.rows[0]?.count || 0);
  push(
    Boolean(settings.budget_variance_alerts) && budgetAlerts>0,
    {
      key:'budget_variance_alerts',
      category:'planning',
      severity:'medium',
      title:'Budget variances exceed the alert threshold',
      description:'Actual performance differs materially from the latest completed budget variance run.',
      itemCount:budgetAlerts,
      amount:null,
      currency:null,
      href:'/apps/accounting/budgets-forecasts',
    },
  );

  push(
    signedCents(classificationAdjustment.current)!==BigInt(0),
    {
      key:'cash_flow_classification',
      category:'reporting',
      severity:'low',
      title:'Cash Flow has a classification adjustment',
      description:'Some cash or non-cash ledger movement is not yet mapped cleanly into operating, investing or financing activity.',
      itemCount:signedCents(classificationAdjustment.current)===BigInt(0)?0:1,
      amount:absoluteDecimal(classificationAdjustment.current),
      currency:financial.currency,
      href:'/apps/accounting/financial-statements?'+new URLSearchParams({
        from:financial.filters.from,
        to:financial.filters.to,
        compareFrom:financial.filters.compareFrom,
        compareTo:financial.filters.compareTo,
      }).toString(),
    },
  );

  const generatedStatements=financial.snapshots.filter(row=>row.status==='generated').length;
  push(
    generatedStatements>0,
    {
      key:'unfinalized_financial_statements',
      category:'reporting',
      severity:'low',
      title:'Financial statement snapshots are not finalized',
      description:'Generated statement evidence is still editable as reporting status until it is finalized.',
      itemCount:generatedStatements,
      amount:null,
      currency:null,
      href:'/apps/accounting/financial-statements',
    },
  );

  exceptions.sort((a,b)=>exceptionOrder(a.severity)-exceptionOrder(b.severity) || a.title.localeCompare(b.title));
  const activeExceptions=exceptions.filter(row=>!row.resolved);
  const exceptionSummary={
    total:activeExceptions.length,
    high:activeExceptions.filter(row=>row.severity==='high').length,
    medium:activeExceptions.filter(row=>row.severity==='medium').length,
    low:activeExceptions.filter(row=>row.severity==='low').length,
  };

  return {
    companyId:context.companyId,
    currency:financial.currency,
    filters:financial.filters,
    settings:{
      staleDraftDays,
      showZeroExceptions:showZero,
      reconciliationAlerts:Boolean(settings.reconciliation_alerts),
      budgetVarianceAlerts:Boolean(settings.budget_variance_alerts),
    },
    kpis,
    trend:trendResult.rows.map(row=>({
      period:String(row.period),
      revenue:String(row.revenue || '0.00'),
      expenses:String(row.expenses || '0.00'),
      profit:String(row.profit || '0.00'),
    })),
    exceptions,
    exceptionSummary,
    snapshots:snapshotsResult.rows,
  };
}

export type AccountingManagementReportsWorkspace=
  Awaited<ReturnType<typeof getAccountingManagementReports>>;

export async function generateManagementReportSnapshot(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid management report dates.');
  }
  const body=input as Record<string,unknown>;
  const requestKey=accountingId(body.requestKey);
  const report=await getAccountingManagementReports({
    from:typeof body.from==='string'?body.from:undefined,
    to:typeof body.to==='string'?body.to:undefined,
    compareFrom:typeof body.compareFrom==='string'?body.compareFrom:undefined,
    compareTo:typeof body.compareTo==='string'?body.compareTo:undefined,
  });
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_management_report_snapshots',
    'create',
  );
  const requestHash=createHash('sha256').update(JSON.stringify(report.filters)).digest('hex');
  const client=await context.pool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const replay=await client.query(
      "SELECT id::text,request_hash,status FROM accounting_management_report_snapshots WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) {
        throw new AccountingInputError('This management-report request key was already used for another period.');
      }
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),status:String(replay.rows[0].status),replayed:true};
    }

    const snapshot=await client.query(
      `INSERT INTO accounting_management_report_snapshots(
         company_id,period_start,period_end,comparative_start,comparative_end,currency,status,
         request_key,request_hash,kpi_json,trend_json,exception_summary_json,generated_by,generated_at,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,'generated',$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,NOW(),NOW(),NOW())
       RETURNING id::text,status`,
      [
        context.companyId,
        report.filters.from,
        report.filters.to,
        report.filters.compareFrom,
        report.filters.compareTo,
        report.currency,
        requestKey,
        requestHash,
        JSON.stringify(report.kpis),
        JSON.stringify(report.trend),
        JSON.stringify(report.exceptionSummary),
        context.userId,
      ],
    );
    const snapshotId=String(snapshot.rows[0].id);

    for (const row of report.exceptions.filter(item=>!item.resolved)) {
      await client.query(
        `INSERT INTO accounting_management_report_snapshot_exceptions(
           company_id,snapshot_id,exception_key,category,severity,title,description,item_count,
           amount,currency,href,metadata_json
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}'::jsonb)`,
        [
          context.companyId,
          snapshotId,
          row.key,
          row.category,
          row.severity,
          row.title,
          row.description,
          row.itemCount,
          row.amount,
          row.currency,
          row.href,
        ],
      );
    }

    await client.query('COMMIT');
    await audit(
      context,
      'snapshot_generated',
      snapshotId,
      'Management and exception report snapshot generated.',
      report.filters,
    );
    return {id:snapshotId,status:String(snapshot.rows[0].status),replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeManagementReportSnapshot(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) {
    throw new AccountingInputError('Choose a management report snapshot.');
  }
  const body=input as Record<string,unknown>;
  const snapshotId=accountingId(body.snapshotId);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_management_report_snapshots',
    'edit',
  );
  const result=await context.pool.query(
    "UPDATE accounting_management_report_snapshots SET status='finalized',finalized_by=$3,finalized_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='generated' RETURNING id::text,status",
    [snapshotId,context.companyId,context.userId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError('Only a generated management report snapshot can be finalized.');
  }
  await audit(
    context,
    'snapshot_finalized',
    snapshotId,
    'Management and exception report snapshot finalized.',
  );
  return result.rows[0];
}
