import 'server-only';

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
} from '@/lib/apps/accounting/validation';

type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

type AccountRow = {
  id:string;
  code:string;
  name:string;
  account_type:string;
  current_movement:string;
  comparative_movement:string;
  current_opening:string;
  comparative_opening:string;
  current_closing:string;
  comparative_closing:string;
};

export type FinancialStatementLine = {
  key:string;
  label:string;
  current:string;
  comparative:string;
  accountId?:string;
  accountCode?:string;
  accountType?:string;
  emphasis?:'normal'|'subtotal'|'total';
};

type StatementSection = {
  key:string;
  label:string;
  lines:FinancialStatementLine[];
  current:string;
  comparative:string;
};

function signedCents(value: unknown,label='Amount') {
  const raw=String(value ?? '0').trim();
  if (!/^[+-]?\d{1,18}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError(label+' is not a valid ledger amount.');
  }
  const negative=raw.startsWith('-');
  const unsigned=negative || raw.startsWith('+') ? raw.slice(1) : raw;
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let cents=BigInt(whole || '0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if (Number(padded[2]||'0')>=5) cents+=BigInt(1);
  return negative ? -cents : cents;
}

function parseInput(input: {
  from?:string;
  to?:string;
  compareFrom?:string;
  compareTo?:string;
}) {
  const to=accountingDate(input.to || new Date().toISOString().slice(0,10));
  const from=accountingDate(input.from || to.slice(0,4)+'-01-01');
  if (from>to) throw new AccountingInputError('The statement start date cannot be after the end date.');

  let compareFrom=input.compareFrom ? accountingDate(input.compareFrom) : '';
  let compareTo=input.compareTo ? accountingDate(input.compareTo) : '';
  if (Boolean(compareFrom)!==Boolean(compareTo)) {
    throw new AccountingInputError('Choose both comparative dates or leave both blank.');
  }
  if (compareFrom && compareFrom>compareTo) {
    throw new AccountingInputError('Comparative start date cannot be after comparative end date.');
  }
  if (!compareFrom) {
    const start=new Date(from+'T00:00:00Z');
    const end=new Date(to+'T00:00:00Z');
    const days=Math.round((end.getTime()-start.getTime())/86400000)+1;
    const priorEnd=new Date(start.getTime()-86400000);
    const priorStart=new Date(priorEnd.getTime()-(days-1)*86400000);
    compareFrom=priorStart.toISOString().slice(0,10);
    compareTo=priorEnd.toISOString().slice(0,10);
  }
  return {from,to,compareFrom,compareTo};
}

function sumRows(
  rows:AccountRow[],
  predicate:(row:AccountRow)=>boolean,
  field:keyof Pick<AccountRow,'current_movement'|'comparative_movement'|'current_opening'|'comparative_opening'|'current_closing'|'comparative_closing'>,
) {
  return rows.reduce((total,row)=>predicate(row)?total+signedCents(row[field]):total,BigInt(0));
}

function isIncome(type:string) {
  return type==='income' || type==='income_other' || type==='income_contra';
}
function isExpense(type:string) {
  return type==='expense_cost_of_sales' || type==='expense' || type==='expense_other';
}
function isAsset(type:string) { return type.startsWith('asset_'); }
function isLiability(type:string) { return type.startsWith('liability_'); }
function isEquity(type:string) { return type==='equity' || type==='equity_retained_earnings'; }

function movementDisplay(row:AccountRow,period:'current'|'comparative') {
  const value=signedCents(period==='current'?row.current_movement:row.comparative_movement);
  if (isIncome(row.account_type)) return -value;
  return value;
}

function closingDisplay(row:AccountRow,period:'current'|'comparative') {
  const value=signedCents(period==='current'?row.current_closing:row.comparative_closing);
  if (isLiability(row.account_type)||isEquity(row.account_type)) return -value;
  return value;
}

function openingDisplay(row:AccountRow,period:'current'|'comparative') {
  const value=signedCents(period==='current'?row.current_opening:row.comparative_opening);
  if (isLiability(row.account_type)||isEquity(row.account_type)) return -value;
  return value;
}

function section(
  rows:AccountRow[],
  key:string,
  label:string,
  predicate:(row:AccountRow)=>boolean,
  mode:'movement'|'closing',
  showDetail:boolean,
):StatementSection {
  const selected=rows.filter(predicate);
  const current=selected.reduce((total,row)=>total+(mode==='movement'?movementDisplay(row,'current'):closingDisplay(row,'current')),BigInt(0));
  const comparative=selected.reduce((total,row)=>total+(mode==='movement'?movementDisplay(row,'comparative'):closingDisplay(row,'comparative')),BigInt(0));
  const lines=showDetail
    ? selected.map(row=>({
        key:key+':'+row.id,
        label:row.code+' · '+row.name,
        current:decimalAmount(mode==='movement'?movementDisplay(row,'current'):closingDisplay(row,'current')),
        comparative:decimalAmount(mode==='movement'?movementDisplay(row,'comparative'):closingDisplay(row,'comparative')),
        accountId:row.id,
        accountCode:row.code,
        accountType:row.account_type,
        emphasis:'normal' as const,
      }))
    : [];
  return {key,label,lines,current:decimalAmount(current),comparative:decimalAmount(comparative)};
}

function makeProfitLoss(rows:AccountRow[],showDetail:boolean) {
  const revenue=section(rows,'revenue','Revenue',row=>row.account_type==='income'||row.account_type==='income_contra','movement',showDetail);
  const costOfSales=section(rows,'cost_of_sales','Cost of sales',row=>row.account_type==='expense_cost_of_sales','movement',showDetail);
  const operatingExpenses=section(rows,'operating_expenses','Operating expenses',row=>row.account_type==='expense','movement',showDetail);
  const otherIncome=section(rows,'other_income','Other income',row=>row.account_type==='income_other','movement',showDetail);
  const otherExpenses=section(rows,'other_expenses','Other expenses',row=>row.account_type==='expense_other','movement',showDetail);

  const curRevenue=signedCents(revenue.current);
  const cmpRevenue=signedCents(revenue.comparative);
  const curCos=signedCents(costOfSales.current);
  const cmpCos=signedCents(costOfSales.comparative);
  const curOpex=signedCents(operatingExpenses.current);
  const cmpOpex=signedCents(operatingExpenses.comparative);
  const curOtherIncome=signedCents(otherIncome.current);
  const cmpOtherIncome=signedCents(otherIncome.comparative);
  const curOtherExpense=signedCents(otherExpenses.current);
  const cmpOtherExpense=signedCents(otherExpenses.comparative);

  const grossCurrent=curRevenue-curCos;
  const grossComparative=cmpRevenue-cmpCos;
  const operatingCurrent=grossCurrent-curOpex;
  const operatingComparative=grossComparative-cmpOpex;
  const netCurrent=operatingCurrent+curOtherIncome-curOtherExpense;
  const netComparative=operatingComparative+cmpOtherIncome-cmpOtherExpense;

  return {
    sections:[revenue,costOfSales,operatingExpenses,otherIncome,otherExpenses],
    grossProfit:{current:decimalAmount(grossCurrent),comparative:decimalAmount(grossComparative)},
    operatingProfit:{current:decimalAmount(operatingCurrent),comparative:decimalAmount(operatingComparative)},
    netProfit:{current:decimalAmount(netCurrent),comparative:decimalAmount(netComparative)},
  };
}

function cumulativeEarnings(rows:AccountRow[],period:'current'|'comparative') {
  return rows.reduce((total,row)=>{
    if (!isIncome(row.account_type)&&!isExpense(row.account_type)) return total;
    const raw=signedCents(period==='current'?row.current_closing:row.comparative_closing);
    return total-raw;
  },BigInt(0));
}

function makeBalanceSheet(rows:AccountRow[],showDetail:boolean) {
  const currentAssets=section(rows,'current_assets','Current assets',row=>['asset_cash','asset_receivable','asset_current','asset_inventory'].includes(row.account_type),'closing',showDetail);
  const noncurrentAssets=section(rows,'noncurrent_assets','Non-current assets',row=>['asset_fixed','asset_other'].includes(row.account_type),'closing',showDetail);
  const currentLiabilities=section(rows,'current_liabilities','Current liabilities',row=>['liability_payable','liability_current'].includes(row.account_type),'closing',showDetail);
  const noncurrentLiabilities=section(rows,'noncurrent_liabilities','Long-term liabilities',row=>row.account_type==='liability_long_term','closing',showDetail);
  const equityAccounts=section(rows,'equity','Equity accounts',row=>isEquity(row.account_type),'closing',showDetail);

  const earningsCurrent=cumulativeEarnings(rows,'current');
  const earningsComparative=cumulativeEarnings(rows,'comparative');
  const totalAssetsCurrent=signedCents(currentAssets.current)+signedCents(noncurrentAssets.current);
  const totalAssetsComparative=signedCents(currentAssets.comparative)+signedCents(noncurrentAssets.comparative);
  const totalLiabilitiesCurrent=signedCents(currentLiabilities.current)+signedCents(noncurrentLiabilities.current);
  const totalLiabilitiesComparative=signedCents(currentLiabilities.comparative)+signedCents(noncurrentLiabilities.comparative);
  const totalEquityCurrent=signedCents(equityAccounts.current)+earningsCurrent;
  const totalEquityComparative=signedCents(equityAccounts.comparative)+earningsComparative;

  return {
    assetSections:[currentAssets,noncurrentAssets],
    liabilitySections:[currentLiabilities,noncurrentLiabilities],
    equitySections:[equityAccounts],
    currentEarnings:{current:decimalAmount(earningsCurrent),comparative:decimalAmount(earningsComparative)},
    totalAssets:{current:decimalAmount(totalAssetsCurrent),comparative:decimalAmount(totalAssetsComparative)},
    totalLiabilities:{current:decimalAmount(totalLiabilitiesCurrent),comparative:decimalAmount(totalLiabilitiesComparative)},
    totalEquity:{current:decimalAmount(totalEquityCurrent),comparative:decimalAmount(totalEquityComparative)},
    balanceCheck:{
      current:decimalAmount(totalAssetsCurrent-totalLiabilitiesCurrent-totalEquityCurrent),
      comparative:decimalAmount(totalAssetsComparative-totalLiabilitiesComparative-totalEquityComparative),
    },
  };
}

function accountTotal(rows:AccountRow[],types:string[],field:'current_opening'|'comparative_opening'|'current_closing'|'comparative_closing',creditPositive=false) {
  const total=sumRows(rows,row=>types.includes(row.account_type),field);
  return creditPositive ? -total : total;
}

function makeCashFlow(rows:AccountRow[],profitLoss:ReturnType<typeof makeProfitLoss>) {
  function period(which:'current'|'comparative') {
    const opening=which==='current'?'current_opening':'comparative_opening';
    const closing=which==='current'?'current_closing':'comparative_closing';
    const movement=which==='current'?'current_movement':'comparative_movement';
    const netProfit=signedCents(profitLoss.netProfit[which]);

    const openingCash=accountTotal(rows,['asset_cash'],opening);
    const closingCash=accountTotal(rows,['asset_cash'],closing);
    const cashChange=closingCash-openingCash;

    const receivableChange=accountTotal(rows,['asset_receivable'],opening)-accountTotal(rows,['asset_receivable'],closing);
    const inventoryChange=accountTotal(rows,['asset_inventory'],opening)-accountTotal(rows,['asset_inventory'],closing);
    const otherCurrentAssetChange=accountTotal(rows,['asset_current'],opening)-accountTotal(rows,['asset_current'],closing);
    const payableChange=accountTotal(rows,['liability_payable'],closing,true)-accountTotal(rows,['liability_payable'],opening,true);
    const otherCurrentLiabilityChange=accountTotal(rows,['liability_current'],closing,true)-accountTotal(rows,['liability_current'],opening,true);

    const operating=netProfit+receivableChange+inventoryChange+otherCurrentAssetChange+payableChange+otherCurrentLiabilityChange;

    const fixedAssetMovement=-(accountTotal(rows,['asset_fixed'],closing)-accountTotal(rows,['asset_fixed'],opening));
    const otherAssetMovement=-(accountTotal(rows,['asset_other'],closing)-accountTotal(rows,['asset_other'],opening));
    const investing=fixedAssetMovement+otherAssetMovement;

    const longTermLiabilityMovement=accountTotal(rows,['liability_long_term'],closing,true)-accountTotal(rows,['liability_long_term'],opening,true);
    const equityMovement=-sumRows(rows,row=>isEquity(row.account_type),movement);
    const financing=longTermLiabilityMovement+equityMovement;

    const classificationAdjustment=cashChange-operating-investing-financing;

    return {
      openingCash,closingCash,cashChange,netProfit,
      receivableChange,inventoryChange,otherCurrentAssetChange,payableChange,otherCurrentLiabilityChange,
      operating,fixedAssetMovement,otherAssetMovement,investing,longTermLiabilityMovement,equityMovement,financing,classificationAdjustment,
    };
  }

  const cur=period('current');
  const cmp=period('comparative');
  const line=(key:string,label:string,current:bigint,comparative:bigint,emphasis:'normal'|'subtotal'|'total'='normal'):FinancialStatementLine=>({
    key,label,current:decimalAmount(current),comparative:decimalAmount(comparative),emphasis,
  });
  return {
    method:'indirect' as const,
    lines:[
      line('net_profit','Net profit / (loss)',cur.netProfit,cmp.netProfit),
      line('change_receivables','Decrease / (increase) in receivables',cur.receivableChange,cmp.receivableChange),
      line('change_inventory','Decrease / (increase) in inventory',cur.inventoryChange,cmp.inventoryChange),
      line('change_other_current_assets','Decrease / (increase) in other current assets',cur.otherCurrentAssetChange,cmp.otherCurrentAssetChange),
      line('change_payables','Increase / (decrease) in payables',cur.payableChange,cmp.payableChange),
      line('change_other_current_liabilities','Increase / (decrease) in other current liabilities',cur.otherCurrentLiabilityChange,cmp.otherCurrentLiabilityChange),
      line('operating_cash','Cash from operating activities',cur.operating,cmp.operating,'subtotal'),
      line('fixed_asset_movement','Net fixed-asset movement',cur.fixedAssetMovement,cmp.fixedAssetMovement),
      line('other_asset_movement','Net other non-current asset movement',cur.otherAssetMovement,cmp.otherAssetMovement),
      line('investing_cash','Cash from investing activities',cur.investing,cmp.investing,'subtotal'),
      line('long_term_financing','Net long-term borrowing movement',cur.longTermLiabilityMovement,cmp.longTermLiabilityMovement),
      line('equity_financing','Net owner/equity movement',cur.equityMovement,cmp.equityMovement),
      line('financing_cash','Cash from financing activities',cur.financing,cmp.financing,'subtotal'),
      line('classification_adjustment','Other cash / non-cash classification adjustment',cur.classificationAdjustment,cmp.classificationAdjustment),
      line('net_cash_change','Net change in cash',cur.cashChange,cmp.cashChange,'total'),
      line('opening_cash','Opening cash',cur.openingCash,cmp.openingCash),
      line('closing_cash','Closing cash',cur.closingCash,cmp.closingCash,'total'),
    ],
    reconciled:{
      current:cur.openingCash+cur.cashChange===cur.closingCash,
      comparative:cmp.openingCash+cmp.cashChange===cmp.closingCash,
    },
  };
}

function makeChangesInEquity(rows:AccountRow[],profitLoss:ReturnType<typeof makeProfitLoss>) {
  function values(which:'current'|'comparative') {
    const openingField=which==='current'?'current_opening':'comparative_opening';
    const movementField=which==='current'?'current_movement':'comparative_movement';
    const opening=-sumRows(rows,row=>isEquity(row.account_type),openingField);
    const ownerMovement=-sumRows(rows,row=>isEquity(row.account_type),movementField);
    const profit=signedCents(profitLoss.netProfit[which]);
    return {opening,ownerMovement,profit,closing:opening+ownerMovement+profit};
  }
  const cur=values('current'),cmp=values('comparative');
  return {
    lines:[
      {key:'opening_equity',label:'Opening equity',current:decimalAmount(cur.opening),comparative:decimalAmount(cmp.opening),emphasis:'normal' as const},
      {key:'owner_movements',label:'Owner / equity movements',current:decimalAmount(cur.ownerMovement),comparative:decimalAmount(cmp.ownerMovement),emphasis:'normal' as const},
      {key:'period_profit',label:'Profit / (loss) for the period',current:decimalAmount(cur.profit),comparative:decimalAmount(cmp.profit),emphasis:'normal' as const},
      {key:'closing_equity',label:'Closing equity',current:decimalAmount(cur.closing),comparative:decimalAmount(cmp.closing),emphasis:'total' as const},
    ],
  };
}

async function loadRows(client:Pick<PoolClient,'query'>,companyId:string,filters:ReturnType<typeof parseInput>) {
  const result=await client.query<AccountRow>(`
    SELECT
      a.id::text,
      a.code,
      a.name,
      a.account_type,
      COALESCE(SUM(CASE WHEN j.journal_date BETWEEN $2::date AND $3::date THEN l.debit-l.credit ELSE 0 END),0)::text AS current_movement,
      COALESCE(SUM(CASE WHEN j.journal_date BETWEEN $4::date AND $5::date THEN l.debit-l.credit ELSE 0 END),0)::text AS comparative_movement,
      COALESCE(SUM(CASE WHEN j.journal_date < $2::date THEN l.debit-l.credit ELSE 0 END),0)::text AS current_opening,
      COALESCE(SUM(CASE WHEN j.journal_date < $4::date THEN l.debit-l.credit ELSE 0 END),0)::text AS comparative_opening,
      COALESCE(SUM(CASE WHEN j.journal_date <= $3::date THEN l.debit-l.credit ELSE 0 END),0)::text AS current_closing,
      COALESCE(SUM(CASE WHEN j.journal_date <= $5::date THEN l.debit-l.credit ELSE 0 END),0)::text AS comparative_closing
    FROM accounts a
    LEFT JOIN journal_lines l
      ON l.account_id=a.id
     AND l.company_id=a.company_id
     AND l.deleted_at IS NULL
    LEFT JOIN journals j
      ON j.id=l.journal_id
     AND j.company_id=l.company_id
     AND j.deleted_at IS NULL
     AND j.status='posted'
    WHERE a.company_id=$1
      AND a.deleted_at IS NULL
    GROUP BY a.id,a.code,a.name,a.account_type
    ORDER BY a.code,a.name
  `,[companyId,filters.from,filters.to,filters.compareFrom,filters.compareTo]);
  return result.rows;
}

async function compute(client:Pick<PoolClient,'query'>,context:Context,input:{from?:string;to?:string;compareFrom?:string;compareTo?:string}) {
  const filters=parseInput(input);
  const [rows,settings,snapshots]=await Promise.all([
    loadRows(client,context.companyId,filters),
    client.query(
      "SELECT comparative_mode,cash_flow_method,include_zero_lines,show_account_detail FROM accounting_financial_report_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [context.companyId],
    ),
    client.query(
      "SELECT id::text,period_start::text,period_end::text,comparative_start::text,comparative_end::text,currency,scope,status,generated_at,finalized_at FROM accounting_financial_statement_snapshots WHERE company_id=$1 AND deleted_at IS NULL ORDER BY generated_at DESC LIMIT 30",
      [context.companyId],
    ),
  ]);
  const config=settings.rows[0] || {
    comparative_mode:'prior_period',
    cash_flow_method:'indirect',
    include_zero_lines:false,
    show_account_detail:true,
  };
  const showDetail=config.show_account_detail!==false;
  const profitLoss=makeProfitLoss(rows,showDetail);
  const balanceSheet=makeBalanceSheet(rows,showDetail);
  const cashFlow=makeCashFlow(rows,profitLoss);
  const changesInEquity=makeChangesInEquity(rows,profitLoss);

  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    filters,
    settings:config,
    profitLoss,
    balanceSheet,
    cashFlow,
    changesInEquity,
    snapshots:snapshots.rows,
  };
}

export async function getAccountingFinancialStatements(input:{from?:string;to?:string;compareFrom?:string;compareTo?:string}={}) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_financial_statement_snapshots','report');
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await compute(client,context,input);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type AccountingFinancialStatementsWorkspace=Awaited<ReturnType<typeof getAccountingFinancialStatements>>;

function flatten(result:AccountingFinancialStatementsWorkspace) {
  const lines:Array<{statementType:string;sectionKey:string;lineKey:string;label:string;current:string;comparative:string;accountId?:string;displayOrder:number;metadata?:Record<string,unknown>}>=[];

  let order=10;
  for (const sectionRow of result.profitLoss.sections) {
    for (const line of sectionRow.lines) {
      lines.push({statementType:'profit_loss',sectionKey:sectionRow.key,lineKey:line.key,label:line.label,current:line.current,comparative:line.comparative,accountId:line.accountId,displayOrder:order++});
    }
    lines.push({statementType:'profit_loss',sectionKey:sectionRow.key,lineKey:sectionRow.key+':total',label:'Total '+sectionRow.label,current:sectionRow.current,comparative:sectionRow.comparative,displayOrder:order++});
  }
  lines.push({statementType:'profit_loss',sectionKey:'totals',lineKey:'net_profit',label:'Net profit / (loss)',current:result.profitLoss.netProfit.current,comparative:result.profitLoss.netProfit.comparative,displayOrder:order++});

  order=10;
  for (const sectionRow of [...result.balanceSheet.assetSections,...result.balanceSheet.liabilitySections,...result.balanceSheet.equitySections]) {
    for (const line of sectionRow.lines) {
      lines.push({statementType:'balance_sheet',sectionKey:sectionRow.key,lineKey:line.key,label:line.label,current:line.current,comparative:line.comparative,accountId:line.accountId,displayOrder:order++});
    }
    lines.push({statementType:'balance_sheet',sectionKey:sectionRow.key,lineKey:sectionRow.key+':total',label:'Total '+sectionRow.label,current:sectionRow.current,comparative:sectionRow.comparative,displayOrder:order++});
  }
  lines.push({statementType:'balance_sheet',sectionKey:'equity',lineKey:'current_earnings',label:'Current earnings',current:result.balanceSheet.currentEarnings.current,comparative:result.balanceSheet.currentEarnings.comparative,displayOrder:order++});

  order=10;
  for (const line of result.cashFlow.lines) {
    lines.push({statementType:'cash_flow',sectionKey:'indirect',lineKey:line.key,label:line.label,current:line.current,comparative:line.comparative,displayOrder:order++});
  }
  order=10;
  for (const line of result.changesInEquity.lines) {
    lines.push({statementType:'changes_equity',sectionKey:'equity',lineKey:line.key,label:line.label,current:line.current,comparative:line.comparative,displayOrder:order++});
  }
  return lines;
}

async function audit(context:Context,action:string,id:string,summary:string,metadata:Record<string,unknown>={}) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:'accounting.financial_statements.'+action,
      module:'accounting',
      resourceType:'accounting_financial_statement_snapshot',
      resourceId:id,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Financial statement audit failed',error);
  }
}

export async function generateFinancialStatementSnapshot(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new AccountingInputError('Enter valid financial statement dates.');
  const body=input as Record<string,unknown>;
  const requestKey=accountingId(body.requestKey);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_financial_statement_snapshots','create');
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const filters=parseInput({
      from:typeof body.from==='string'?body.from:undefined,
      to:typeof body.to==='string'?body.to:undefined,
      compareFrom:typeof body.compareFrom==='string'?body.compareFrom:undefined,
      compareTo:typeof body.compareTo==='string'?body.compareTo:undefined,
    });
    const requestHash=createHash('sha256').update(JSON.stringify(filters)).digest('hex');
    const replay=await client.query(
      "SELECT id::text,request_hash,status FROM accounting_financial_statement_snapshots WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) throw new AccountingInputError('This snapshot request key was already used for another date range.');
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),status:String(replay.rows[0].status),replayed:true};
    }

    const result=await compute(client,context,filters);
    const summary={
      netProfit:result.profitLoss.netProfit,
      totalAssets:result.balanceSheet.totalAssets,
      totalLiabilities:result.balanceSheet.totalLiabilities,
      totalEquity:result.balanceSheet.totalEquity,
      closingCash:result.cashFlow.lines.find(line=>line.key==='closing_cash') || null,
      balanceCheck:result.balanceSheet.balanceCheck,
    };
    const snapshot=await client.query(
      "INSERT INTO accounting_financial_statement_snapshots(company_id,period_start,period_end,comparative_start,comparative_end,currency,scope,status,request_key,request_hash,summary_json,generated_by,generated_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'company','generated',$7,$8,$9::jsonb,$10,NOW(),NOW(),NOW()) RETURNING id::text,status",
      [context.companyId,filters.from,filters.to,filters.compareFrom,filters.compareTo,result.currency,requestKey,requestHash,JSON.stringify(summary),context.userId],
    );
    const snapshotId=String(snapshot.rows[0].id);
    for (const line of flatten(result)) {
      await client.query(
        "INSERT INTO accounting_financial_statement_snapshot_lines(company_id,snapshot_id,statement_type,section_key,line_key,label,account_id,display_order,current_amount,comparative_amount,metadata_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
        [context.companyId,snapshotId,line.statementType,line.sectionKey,line.lineKey,line.label,line.accountId||null,line.displayOrder,line.current,line.comparative,JSON.stringify(line.metadata||{})],
      );
    }
    await client.query('COMMIT');
    await audit(context,'snapshot_generated',snapshotId,'Financial statement snapshot generated.',filters);
    return {id:snapshotId,status:String(snapshot.rows[0].status),replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeFinancialStatementSnapshot(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new AccountingInputError('Choose a financial statement snapshot.');
  const body=input as Record<string,unknown>;
  const snapshotId=accountingId(body.snapshotId);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_financial_statement_snapshots','edit');
  const result=await context.pool.query(
    "UPDATE accounting_financial_statement_snapshots SET status='finalized',finalized_by=$3,finalized_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='generated' RETURNING id::text,status",
    [snapshotId,context.companyId,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Only a generated financial statement snapshot can be finalized.');
  await audit(context,'snapshot_finalized',snapshotId,'Financial statement snapshot finalized.');
  return result.rows[0];
}
