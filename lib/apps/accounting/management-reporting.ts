import 'server-only';

import { createHash } from 'node:crypto';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { AccountingInputError,accountingDate,accountingId,decimalAmount } from '@/lib/apps/accounting/validation';
import { getAccountingFinancialStatements } from '@/lib/apps/accounting/financial-statements';
import { getAccountingReceivables } from '@/lib/apps/accounting/receivables';
import { getAccountingPayables } from '@/lib/apps/accounting/payables';
import { getAccountingReconciliation } from '@/lib/apps/accounting/reconciliation';
import { getAccountingBankCash } from '@/lib/apps/accounting/bank-cash';
import { getAccountingBudgets } from '@/lib/apps/accounting/budgets';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

type ExceptionSeverity='info'|'warning'|'critical';

export type ManagementException={
  category:string;
  severity:ExceptionSeverity;
  code:string;
  title:string;
  message:string;
  sourceRoute:string;
  metricValue:string | null;
  thresholdValue:string | null;
  metadata:Record<string,unknown>;
};

function cents(value:unknown,label='Amount') {
  const raw=String(value ?? '0').trim();
  if (!/^[+-]?\d{1,18}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError(label+' is not a valid amount.');
  }
  const negative=raw.startsWith('-');
  const unsigned=negative || raw.startsWith('+') ? raw.slice(1) : raw;
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let result=BigInt(whole || '0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if (Number(padded[2]||'0')>=5) result+=BigInt(1);
  return negative ? -result : result;
}

function ratioPercent(numerator:bigint,denominator:bigint) {
  if (denominator===BigInt(0)) return null;
  const scaled=(numerator*BigInt(10000))/denominator;
  return Number(scaled)/100;
}

function decimalRatio(numerator:bigint,denominator:bigint) {
  if (denominator===BigInt(0)) return null;
  const scaled=(numerator*BigInt(10000))/denominator;
  return (Number(scaled)/10000).toFixed(2);
}

function percentage(value:number|null) {
  return value===null ? null : value.toFixed(2);
}

function parseDates(input:{from?:string;to?:string;compareFrom?:string;compareTo?:string}) {
  const to=accountingDate(input.to || new Date().toISOString().slice(0,10));
  const from=accountingDate(input.from || to.slice(0,4)+'-01-01');
  if (from>to) throw new AccountingInputError('Management report start date cannot be after its end date.');
  return {
    from,
    to,
    compareFrom:input.compareFrom ? accountingDate(input.compareFrom) : undefined,
    compareTo:input.compareTo ? accountingDate(input.compareTo) : undefined,
  };
}

function numberSetting(value:unknown,fallback:number) {
  const parsed=Number(value);
  return Number.isFinite(parsed) && parsed>=0 ? parsed : fallback;
}

async function loadSettings(context:Context) {
  const result=await context.pool.query(
    "SELECT enabled,current_ratio_warning::text,overdue_receivables_warning::text,overdue_payables_warning::text,unreconciled_lines_warning,budget_variance_alerts_warning,warn_negative_net_margin,warn_negative_cash FROM accounting_management_report_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
    [context.companyId],
  );
  return result.rows[0] || {
    enabled:true,
    current_ratio_warning:'1.0000',
    overdue_receivables_warning:'0.00',
    overdue_payables_warning:'0.00',
    unreconciled_lines_warning:5,
    budget_variance_alerts_warning:1,
    warn_negative_net_margin:true,
    warn_negative_cash:true,
  };
}

async function optional<T>(name:string,loader:()=>Promise<T>) {
  try {
    return {name,available:true as const,data:await loader(),error:null};
  } catch (error) {
    return {
      name,
      available:false as const,
      data:null,
      error:error instanceof Error?error.message:'Source could not be loaded.',
    };
  }
}

async function buildLiveReport(
  context:Context,
  dates:ReturnType<typeof parseDates>,
  settings:Record<string,unknown>,
) {
  const statements=await getAccountingFinancialStatements(dates);
  const [receivables,payables,reconciliation,bankCash,budgets]=await Promise.all([
    optional('receivables',()=>getAccountingReceivables()),
    optional('payables',()=>getAccountingPayables()),
    optional('reconciliation',()=>getAccountingReconciliation()),
    optional('bank_cash',()=>getAccountingBankCash()),
    optional('budgets',()=>getAccountingBudgets()),
  ]);

  const currentAssets=cents(statements.balanceSheet.assetSections.find(row=>row.key==='current_assets')?.current || '0');
  const currentLiabilities=cents(statements.balanceSheet.liabilitySections.find(row=>row.key==='current_liabilities')?.current || '0');
  const totalLiabilities=cents(statements.balanceSheet.totalLiabilities.current);
  const totalEquity=cents(statements.balanceSheet.totalEquity.current);
  const revenue=cents(statements.profitLoss.sections.find(row=>row.key==='revenue')?.current || '0');
  const grossProfit=cents(statements.profitLoss.grossProfit.current);
  const operatingProfit=cents(statements.profitLoss.operatingProfit.current);
  const netProfit=cents(statements.profitLoss.netProfit.current);

  const cash=bankCash.data
    ? cents(bankCash.data.metrics.bankBalance)+cents(bankCash.data.metrics.cashBalance)+cents(bankCash.data.metrics.mobileMoneyBalance)
    : cents(statements.cashFlow.lines.find(line=>line.key==='closing_cash')?.current || '0');

  const currentRatio=decimalRatio(currentAssets,currentLiabilities);
  const grossMargin=percentage(ratioPercent(grossProfit,revenue));
  const operatingMargin=percentage(ratioPercent(operatingProfit,revenue));
  const netMargin=percentage(ratioPercent(netProfit,revenue));
  const debtToEquity=decimalRatio(totalLiabilities,totalEquity);
  const workingCapital=currentAssets-currentLiabilities;

  const arOutstanding=receivables.data?.metrics.outstanding || '0.00';
  const arOverdue=receivables.data?.metrics.overdue || '0.00';
  const apOutstanding=payables.data?.metrics.netPayable || '0.00';
  const apOverdue=payables.data?.metrics.overdue || '0.00';
  const unreconciled=bankCash.data?.metrics.unreconciledLines
    ?? ((reconciliation.data?.metrics.unmatched || 0)+(reconciliation.data?.metrics.suggested || 0));
  const varianceAlerts=budgets.data?.metrics.variance_alerts || 0;

  const kpis={
    revenue:decimalAmount(revenue),
    grossProfit:decimalAmount(grossProfit),
    grossMarginPercent:grossMargin,
    operatingProfit:decimalAmount(operatingProfit),
    operatingMarginPercent:operatingMargin,
    netProfit:decimalAmount(netProfit),
    netMarginPercent:netMargin,
    cash:decimalAmount(cash),
    receivables:arOutstanding,
    overdueReceivables:arOverdue,
    payables:apOutstanding,
    overduePayables:apOverdue,
    workingCapital:decimalAmount(workingCapital),
    currentRatio,
    totalAssets:statements.balanceSheet.totalAssets.current,
    totalLiabilities:statements.balanceSheet.totalLiabilities.current,
    totalEquity:statements.balanceSheet.totalEquity.current,
    debtToEquity,
    unreconciledBankLines:unreconciled,
    budgetVarianceAlerts:varianceAlerts,
    dsoDays:receivables.data?.metrics.dsoDays ?? null,
  };

  const exceptions:ManagementException[]=[];
  const push=(row:ManagementException)=>exceptions.push(row);

  const balanceDifference=cents(statements.balanceSheet.balanceCheck.current);
  if (balanceDifference!==BigInt(0)) {
    push({
      category:'ledger',severity:'critical',code:'balance_sheet_out_of_balance',
      title:'Balance Sheet is out of balance',
      message:'Assets do not equal liabilities plus equity for the selected period.',
      sourceRoute:'/apps/accounting/financial-statements',
      metricValue:decimalAmount(balanceDifference),thresholdValue:'0.00',metadata:{},
    });
  }

  const classification=cents(statements.cashFlow.lines.find(line=>line.key==='classification_adjustment')?.current || '0');
  if (classification!==BigInt(0)) {
    push({
      category:'cash_flow',severity:'warning',code:'cash_flow_classification_adjustment',
      title:'Cash Flow has an unclassified adjustment',
      message:'Review non-cash or unmapped balance-sheet movements contributing to the cash-flow classification adjustment.',
      sourceRoute:'/apps/accounting/financial-statements',
      metricValue:decimalAmount(classification),thresholdValue:'0.00',metadata:{},
    });
  }

  if (receivables.data?.available && !receivables.data.receivableControl.reconciled) {
    push({
      category:'receivables',severity:'critical',code:'receivables_control_difference',
      title:'Accounts Receivable does not reconcile to the ledger',
      message:'Customer subledger receivables differ from the Accounts Receivable control account.',
      sourceRoute:'/apps/accounting/receivables',
      metricValue:receivables.data.receivableControl.difference,thresholdValue:'0.00',metadata:{},
    });
  }

  if (payables.data && !payables.data.control.reconciled) {
    push({
      category:'payables',severity:'critical',code:'payables_control_difference',
      title:'Accounts Payable does not reconcile to the ledger',
      message:'Vendor subledger payables differ from the Accounts Payable control account.',
      sourceRoute:'/apps/accounting/payables',
      metricValue:payables.data.control.difference,thresholdValue:'0.00',metadata:{},
    });
  }

  const overdueArThreshold=cents(settings.overdue_receivables_warning || '0');
  if (cents(arOverdue)>overdueArThreshold) {
    push({
      category:'receivables',severity:'warning',code:'overdue_receivables',
      title:'Customers have overdue balances',
      message:String(receivables.data?.metrics.overdueInvoiceCount || 0)+' invoice(s) are overdue.',
      sourceRoute:'/apps/accounting/receivables',
      metricValue:arOverdue,thresholdValue:decimalAmount(overdueArThreshold),
      metadata:{overdueInvoiceCount:receivables.data?.metrics.overdueInvoiceCount || 0},
    });
  }

  const overdueApThreshold=cents(settings.overdue_payables_warning || '0');
  if (cents(apOverdue)>overdueApThreshold) {
    push({
      category:'payables',severity:'warning',code:'overdue_payables',
      title:'Supplier bills are overdue',
      message:String(payables.data?.metrics.overdueBillCount || 0)+' bill(s) are overdue.',
      sourceRoute:'/apps/accounting/payables',
      metricValue:apOverdue,thresholdValue:decimalAmount(overdueApThreshold),
      metadata:{overdueBillCount:payables.data?.metrics.overdueBillCount || 0},
    });
  }

  const unreconciledThreshold=Math.trunc(numberSetting(settings.unreconciled_lines_warning,5));
  if (unreconciled>unreconciledThreshold) {
    push({
      category:'banking',severity:'warning',code:'bank_reconciliation_backlog',
      title:'Bank reconciliation backlog is above policy',
      message:String(unreconciled)+' bank statement line(s) still need matching or review.',
      sourceRoute:'/apps/accounting/reconciliation',
      metricValue:String(unreconciled),thresholdValue:String(unreconciledThreshold),metadata:{},
    });
  }

  const varianceThreshold=Math.trunc(numberSetting(settings.budget_variance_alerts_warning,1));
  if (varianceAlerts>=Math.max(1,varianceThreshold)) {
    push({
      category:'planning',severity:'warning',code:'budget_variance_alerts',
      title:'Budget variances need management attention',
      message:String(varianceAlerts)+' budget line(s) exceed the configured variance threshold.',
      sourceRoute:'/apps/accounting/budgets-forecasts',
      metricValue:String(varianceAlerts),thresholdValue:String(Math.max(1,varianceThreshold)),metadata:{},
    });
  }

  const currentRatioThreshold=numberSetting(settings.current_ratio_warning,1);
  if (currentRatio!==null && Number(currentRatio)<currentRatioThreshold) {
    push({
      category:'liquidity',severity:'warning',code:'low_current_ratio',
      title:'Current ratio is below policy',
      message:'Current assets may not provide enough cover for current liabilities.',
      sourceRoute:'/apps/accounting/financial-statements',
      metricValue:currentRatio,thresholdValue:currentRatioThreshold.toFixed(2),metadata:{},
    });
  }

  if (settings.warn_negative_cash!==false && cash<BigInt(0)) {
    push({
      category:'liquidity',severity:'critical',code:'negative_cash',
      title:'Cash position is negative',
      message:'Combined bank, cash and mobile-money ledger balances are below zero.',
      sourceRoute:'/apps/accounting/bank-cash',
      metricValue:decimalAmount(cash),thresholdValue:'0.00',metadata:{},
    });
  }

  if (settings.warn_negative_net_margin!==false && netMargin!==null && Number(netMargin)<0) {
    push({
      category:'profitability',severity:'warning',code:'negative_net_margin',
      title:'Net margin is negative',
      message:'The selected period is loss-making after operating and other income/expenses.',
      sourceRoute:'/apps/accounting/financial-statements',
      metricValue:netMargin+'%',thresholdValue:'0.00%',metadata:{},
    });
  }

  for (const source of [receivables,payables,reconciliation,bankCash,budgets]) {
    if (!source.available) {
      push({
        category:'source_health',severity:'warning',code:'source_unavailable:'+source.name,
        title:'A management-report source could not be loaded',
        message:source.name.replaceAll('_',' ')+' data is unavailable: '+String(source.error || 'unknown error'),
        sourceRoute:'/apps/accounting',metricValue:null,thresholdValue:null,metadata:{source:source.name},
      });
    }
  }

  const sourceHealth={
    receivables:receivables.available,
    payables:payables.available,
    reconciliation:reconciliation.available,
    bankCash:bankCash.available,
    budgets:budgets.available,
    invoicingReceivablesAvailable:receivables.data?.available ?? false,
  };

  exceptions.sort((a,b)=>{
    const rank:Record<ExceptionSeverity,number>={critical:0,warning:1,info:2};
    return rank[a.severity]-rank[b.severity] || a.category.localeCompare(b.category);
  });

  return {
    companyId:context.companyId,
    currency:String(context.company.currentCompany.currency).toUpperCase(),
    dates:statements.filters,
    kpis,
    exceptions,
    sourceHealth,
  };
}

export async function getAccountingManagementReporting(
  input:{from?:string;to?:string;compareFrom?:string;compareTo?:string}={},
) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_management_report_runs','report');
  const dates=parseDates(input);
  const [settings,runs]=await Promise.all([
    loadSettings(context),
    context.pool.query(
      "SELECT id::text,period_start::text,period_end::text,comparative_start::text,comparative_end::text,currency,status,exception_count,critical_count,warning_count,generated_at,finalized_at FROM accounting_management_report_runs WHERE company_id=$1 AND deleted_at IS NULL ORDER BY generated_at DESC LIMIT 30",
      [context.companyId],
    ),
  ]);
  const live=await buildLiveReport(context,dates,settings);
  return {...live,settings,runs:runs.rows};
}

export type AccountingManagementReportingWorkspace=Awaited<ReturnType<typeof getAccountingManagementReporting>>;

export async function saveManagementReportingSettings(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new AccountingInputError('Enter valid management reporting settings.');
  const body=input as Record<string,unknown>;
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_management_report_settings','edit');
  const currentRatio=numberSetting(body.currentRatioWarning,1);
  const overdueReceivables=cents(body.overdueReceivablesWarning || '0');
  const overduePayables=cents(body.overduePayablesWarning || '0');
  const unreconciled=Math.trunc(numberSetting(body.unreconciledLinesWarning,5));
  const variance=Math.trunc(numberSetting(body.budgetVarianceAlertsWarning,1));
  const enabled=body.enabled!==false;
  const negativeMargin=body.warnNegativeNetMargin!==false;
  const negativeCash=body.warnNegativeCash!==false;

  await context.pool.query(
    "INSERT INTO accounting_management_report_settings(company_id,enabled,current_ratio_warning,overdue_receivables_warning,overdue_payables_warning,unreconciled_lines_warning,budget_variance_alerts_warning,warn_negative_net_margin,warn_negative_cash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled,current_ratio_warning=EXCLUDED.current_ratio_warning,overdue_receivables_warning=EXCLUDED.overdue_receivables_warning,overdue_payables_warning=EXCLUDED.overdue_payables_warning,unreconciled_lines_warning=EXCLUDED.unreconciled_lines_warning,budget_variance_alerts_warning=EXCLUDED.budget_variance_alerts_warning,warn_negative_net_margin=EXCLUDED.warn_negative_net_margin,warn_negative_cash=EXCLUDED.warn_negative_cash,updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL",
    [context.companyId,enabled,currentRatio.toFixed(4),decimalAmount(overdueReceivables),decimalAmount(overduePayables),unreconciled,variance,negativeMargin,negativeCash,context.userId],
  );
  return {saved:true};
}

async function audit(context:Context,action:string,id:string,summary:string,metadata:Record<string,unknown>={}) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
      action:'accounting.management.'+action,module:'accounting',
      resourceType:'accounting_management_report_run',resourceId:id,summary,metadata,
    });
  } catch (error) {
    console.error('[Accounting] Management reporting audit failed',error);
  }
}

export async function generateManagementReportSnapshot(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new AccountingInputError('Enter valid management report dates.');
  const body=input as Record<string,unknown>;
  const requestKey=accountingId(body.requestKey);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_management_report_runs','create');
  const dates=parseDates({
    from:typeof body.from==='string'?body.from:undefined,
    to:typeof body.to==='string'?body.to:undefined,
    compareFrom:typeof body.compareFrom==='string'?body.compareFrom:undefined,
    compareTo:typeof body.compareTo==='string'?body.compareTo:undefined,
  });
  const settings=await loadSettings(context);
  if (settings.enabled===false) throw new AccountingInputError('Enable Management Reporting in Accounting settings first.');
  const live=await buildLiveReport(context,dates,settings);
  const requestHash=createHash('sha256').update(JSON.stringify(live.dates)).digest('hex');

  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const replay=await client.query(
      "SELECT id::text,request_hash,status FROM accounting_management_report_runs WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) throw new AccountingInputError('This management-report request key was already used for another period.');
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),status:String(replay.rows[0].status),replayed:true};
    }

    const critical=live.exceptions.filter(row=>row.severity==='critical').length;
    const warning=live.exceptions.filter(row=>row.severity==='warning').length;
    const run=await client.query(
      "INSERT INTO accounting_management_report_runs(company_id,period_start,period_end,comparative_start,comparative_end,currency,status,request_key,request_hash,kpis_json,source_health_json,exception_count,critical_count,warning_count,generated_by,generated_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'generated',$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,NOW(),NOW(),NOW()) RETURNING id::text,status",
      [context.companyId,live.dates.from,live.dates.to,live.dates.compareFrom,live.dates.compareTo,live.currency,requestKey,requestHash,JSON.stringify(live.kpis),JSON.stringify(live.sourceHealth),live.exceptions.length,critical,warning,context.userId],
    );
    const runId=String(run.rows[0].id);
    for (const row of live.exceptions) {
      await client.query(
        "INSERT INTO accounting_management_report_exceptions(company_id,run_id,category,severity,exception_code,title,message,source_route,metric_value,threshold_value,metadata_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
        [context.companyId,runId,row.category,row.severity,row.code,row.title,row.message,row.sourceRoute,row.metricValue,row.thresholdValue,JSON.stringify(row.metadata)],
      );
    }
    await client.query('COMMIT');
    await audit(context,'snapshot_generated',runId,'Management and exception report snapshot generated.',{exceptions:live.exceptions.length,critical,warning});
    return {id:runId,status:String(run.rows[0].status),replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeManagementReportSnapshot(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new AccountingInputError('Choose a management report snapshot.');
  const body=input as Record<string,unknown>;
  const runId=accountingId(body.runId);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_management_report_runs','edit');
  const result=await context.pool.query(
    "UPDATE accounting_management_report_runs SET status='finalized',finalized_by=$3,finalized_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='generated' RETURNING id::text,status",
    [runId,context.companyId,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Only a generated management report can be finalized.');
  await audit(context,'snapshot_finalized',runId,'Management and exception report snapshot finalized.');
  return result.rows[0];
}
