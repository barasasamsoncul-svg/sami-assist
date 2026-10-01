import 'server-only';

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { postBalancedLedgerJournal, reversePostedLedgerJournal } from './ledger-engine';
import { AccountingInputError, accountingDate, accountingId, decimalAmount, minorUnits } from './validation';
import {
  AccountingFxError,
  calculateRealizedFx,
  calculateRevaluation,
  centsDecimal,
  crossCurrencyTransfer,
  foreignDecimal,
  fxForeignUnits,
  fxMoney,
  normalizeFxRate,
} from './fx-rules';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

function bodyOf(input:unknown):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AccountingInputError('Enter valid foreign-currency data.');
  return input as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string,required=false){
  if(value!=null&&typeof value!=='string')throw new AccountingInputError(label+' must contain text.');
  const result=typeof value==='string'?value.trim():'';
  if(required&&!result)throw new AccountingInputError(label+' is required.');
  if(result.length>max)throw new AccountingInputError(label+' must be at most '+max+' characters.');
  return result;
}
function currency(value:unknown,label='Currency'){
  const result=text(value,3,label,true).toUpperCase();
  if(!/^[A-Z]{3}$/.test(result))throw new AccountingInputError(label+' must use a three-letter ISO currency code.');
  return result;
}
function choice<T extends string>(value:unknown,allowed:readonly T[],label:string):T{
  if(typeof value!=='string'||!allowed.includes(value as T))throw new AccountingInputError('Choose a valid '+label+'.');
  return value as T;
}
function bool(value:unknown,fallback=false){
  if(value===undefined||value===null)return fallback;
  return value===true||value==='true'||value==='1'||value===1;
}
function positiveForeign(value:unknown,label:string){
  try{
    const units=fxForeignUnits(value);
    if(units<=BigInt(0))throw new Error('nonpositive');
    return foreignDecimal(units);
  }catch{throw new AccountingInputError(label+' must be greater than zero with at most four decimal places.');}
}
function rate(value:unknown){
  try{return normalizeFxRate(value).text;}catch(error){throw new AccountingInputError(error instanceof Error?error.message:'Exchange rate is invalid.');}
}
async function audit(context:Context,action:string,resourceType:string,resourceId:string,summary:string,metadata:Record<string,unknown>={}){
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.fx.'+action,module:'accounting',resourceType,resourceId,summary,result:'success',metadata,
  }).catch(error=>console.error('[Accounting] FX audit failed',error));
}
async function tableAvailable(context:Context,name:string){
  const result=await context.pool.query('SELECT to_regclass($1) IS NOT NULL AS present',['public.'+name]);
  return Boolean(result.rows[0]?.present);
}
async function ensureBaseCurrency(context:Context){
  const base=String(context.company.currentCompany.currency).toUpperCase();
  await context.pool.query(`INSERT INTO accounting_fx_currencies(company_id,code,name,symbol,decimal_places,is_base,is_active,created_by,updated_by)
    VALUES($1,$2,$2,NULL,2,TRUE,TRUE,$3,$3)
    ON CONFLICT(company_id,code) DO UPDATE SET is_base=TRUE,is_active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
    context.companyId,base,context.userId,
  ]);
  await context.pool.query(`UPDATE accounting_fx_currencies SET is_base=FALSE,updated_at=NOW() WHERE company_id=$1 AND code<>$2 AND is_base=TRUE`,[context.companyId,base]);
  return base;
}
async function activeAccount(client:PoolClient,companyId:string,id:string,label:string){
  const result=await client.query(`SELECT id::text,code,name,account_type FROM accounts WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND is_active=TRUE LIMIT 1 FOR SHARE`,[companyId,id]);
  if(!result.rows[0])throw new AccountingInputError(label+' must be an active account in this company.');
  return result.rows[0];
}
async function fxAccounts(client:PoolClient,companyId:string){
  const result=await client.query(`SELECT fx_gain_account_id::text,fx_loss_account_id::text,fx_unrealized_gain_account_id::text,fx_unrealized_loss_account_id::text
    FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1`,[companyId]);
  const row=result.rows[0]||{};
  const realizedGain=row.fx_gain_account_id?String(row.fx_gain_account_id):null;
  const realizedLoss=row.fx_loss_account_id?String(row.fx_loss_account_id):null;
  const unrealizedGain=row.fx_unrealized_gain_account_id?String(row.fx_unrealized_gain_account_id):realizedGain;
  const unrealizedLoss=row.fx_unrealized_loss_account_id?String(row.fx_unrealized_loss_account_id):realizedLoss;
  if(!realizedGain||!realizedLoss)throw new AccountingInputError('Map FX Gain and FX Loss accounts in Accounting Setup before posting foreign-currency settlements.');
  return {realizedGain,realizedLoss,unrealizedGain,unrealizedLoss};
}
async function resolveRate(client:PoolClient,input:{
  companyId:string;baseCurrency:string;foreignCurrency:string;date:string;rateType?:'spot'|'closing'|'average';
}){
  if(input.foreignCurrency===input.baseCurrency)return {rate:'1.00000000',sourceType:'base',sourceName:'Company base currency',effectiveDate:input.date,rateType:input.rateType||'spot'};
  const requested=input.rateType||'spot';
  const result=await client.query(`SELECT rate_to_base::text,source_type,source_name,effective_date::text,rate_type
    FROM accounting_exchange_rates
    WHERE company_id=$1 AND currency=$2 AND base_currency=$3 AND is_active=TRUE
      AND effective_date<=$4 AND rate_type IN ($5,'spot')
    ORDER BY CASE WHEN rate_type=$5 THEN 0 ELSE 1 END,effective_date DESC,
      CASE source_type WHEN 'manual' THEN 0 WHEN 'provider' THEN 1 WHEN 'invoicing' THEN 2 ELSE 3 END,id DESC
    LIMIT 1`,[input.companyId,input.foreignCurrency,input.baseCurrency,input.date,requested]);
  if(!result.rows[0])throw new AccountingInputError('No '+requested+' exchange rate is available for '+input.foreignCurrency+'/'+input.baseCurrency+' on or before '+input.date+'. Add a rate first.');
  const row=result.rows[0];
  return {rate:String(row.rate_to_base),sourceType:String(row.source_type),sourceName:String(row.source_name||row.source_type),effectiveDate:String(row.effective_date).slice(0,10),rateType:String(row.rate_type)};
}
async function financialAccountForUpdate(client:PoolClient,companyId:string,id:string){
  const result=await client.query(`SELECT b.id::text,b.name,b.currency,b.ledger_account_id::text,b.status,b.allow_overdraft,b.overdraft_limit::text,
      COALESCE(v.book_balance,0)::text AS base_book_balance,COALESCE(v.foreign_balance,0)::text AS foreign_balance
    FROM accounting_bank_accounts b
    LEFT JOIN accounting_financial_account_balances v ON v.company_id=b.company_id AND v.bank_account_id=b.id
    WHERE b.company_id=$1 AND b.id=$2 AND b.deleted_at IS NULL LIMIT 1 FOR UPDATE OF b`,[companyId,id]);
  if(!result.rows[0])throw new AccountingInputError('Financial account not found.');
  return result.rows[0];
}
function signedCents(value:unknown){
  const raw=String(value??'0').trim();
  if(raw.startsWith('-'))return -minorUnits(raw.slice(1));
  return minorUnits(raw);
}
function checkForeignFunds(account:Record<string,unknown>,amount:string,baseCurrency:string){
  const accountCurrency=String(account.currency).toUpperCase();
  const available=accountCurrency===baseCurrency?signedCents(account.base_book_balance):fxForeignUnits(account.foreign_balance);
  const requested=accountCurrency===baseCurrency?minorUnits(amount):fxForeignUnits(amount);
  const overdraft=account.allow_overdraft
    ? (accountCurrency===baseCurrency?minorUnits(account.overdraft_limit||'0'):fxForeignUnits(account.overdraft_limit||'0'))
    : BigInt(0);
  if(available-requested < -overdraft)throw new AccountingInputError('This foreign-currency payment or transfer exceeds the available account balance and overdraft limit.');
}
async function recordFxMovement(client:PoolClient,input:{
  companyId:string;bankAccountId:string;sourceType:string;sourceId:string;eventKey:string;date:string;currency:string;
  foreignAmount:string;baseAmount:string;rate:string;userId:string;metadata?:Record<string,unknown>;
}){
  await client.query(`INSERT INTO accounting_fx_financial_movements(
      company_id,bank_account_id,source_type,source_id,source_event_key,movement_date,currency,
      foreign_amount,base_amount,rate_to_base,status,created_by,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'posted',$11,$12::jsonb)
    ON CONFLICT(company_id,bank_account_id,source_event_key) DO NOTHING`,[
      input.companyId,input.bankAccountId,input.sourceType,input.sourceId,input.eventKey,input.date,input.currency,
      input.foreignAmount,input.baseAmount,input.rate,input.userId,JSON.stringify(input.metadata||{}),
    ]);
}
async function refreshBills(client:PoolClient,companyId:string,userId:string,ids:string[]){
  if(!ids.length)return;
  await client.query(`UPDATE accounting_vendor_documents d SET status=CASE WHEN b.open_amount=0 THEN 'settled'
      WHEN b.applied_amount>0 THEN 'partially_settled' ELSE 'posted' END,updated_by=$3,updated_at=NOW()
    FROM accounting_vendor_document_balances b
    WHERE d.company_id=$1 AND d.id=ANY($2::uuid[]) AND b.company_id=d.company_id AND b.document_id=d.id`,[companyId,ids,userId]);
}
async function payableControlForBill(client:PoolClient,companyId:string,bill:Record<string,unknown>){
  const controls=await client.query(`SELECT l.account_id::text
    FROM journal_lines l JOIN journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    WHERE l.company_id=$1 AND l.journal_id=$2 AND l.credit>0 AND l.deleted_at IS NULL
      AND j.status='posted' AND j.deleted_at IS NULL AND j.reversed_by_journal_id IS NULL
      AND j.source_module='accounting' AND j.source_type='vendor_bill' AND j.source_id=$3`,[
      companyId,bill.posted_journal_id,bill.id,
    ]);
  if(controls.rows.length!==1)throw new AccountingInputError('The original bill payable account could not be verified.');
  return String(controls.rows[0].account_id);
}

export async function getAccountingFx(input:{asOf?:unknown}={}){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_exchange_rates','view');
  const baseCurrency=await ensureBaseCurrency(context);
  const asOf=input.asOf?accountingDate(input.asOf):new Date().toISOString().slice(0,10);
  const [settings,currencies,rates,accounts,runs,payments,transfers,setup]=await Promise.all([
    context.pool.query(`SELECT company_id::text,base_currency,rate_source_mode,default_rate_type,auto_reverse_revaluation,revaluation_reversal_days,
      unrealized_gain_account_id::text,unrealized_loss_account_id::text,provider_key,status,metadata
      FROM accounting_fx_settings WHERE company_id=$1 LIMIT 1`,[context.companyId]),
    context.pool.query(`SELECT id::text,code,name,symbol,decimal_places,is_base,is_active FROM accounting_fx_currencies WHERE company_id=$1 ORDER BY is_base DESC,is_active DESC,code`,[context.companyId]),
    context.pool.query(`SELECT id::text,currency,base_currency,rate_to_base::text,rate_type,effective_date::text,source_type,source_name,external_reference,is_active,created_at::text
      FROM accounting_exchange_rates WHERE company_id=$1 ORDER BY effective_date DESC,currency,rate_type LIMIT 250`,[context.companyId]),
    context.pool.query(`SELECT b.id::text,b.name,b.account_type,b.currency,b.ledger_account_id::text,a.code AS ledger_code,a.name AS ledger_name,
      b.status,b.allow_overdraft,b.overdraft_limit::text,COALESCE(v.book_balance,0)::text AS base_book_balance,COALESCE(v.foreign_balance,0)::text AS foreign_balance
      FROM accounting_bank_accounts b LEFT JOIN accounts a ON a.company_id=b.company_id AND a.id=b.ledger_account_id
      LEFT JOIN accounting_financial_account_balances v ON v.company_id=b.company_id AND v.bank_account_id=b.id
      WHERE b.company_id=$1 AND b.deleted_at IS NULL ORDER BY b.status,b.currency,b.name`,[context.companyId]),
    context.pool.query(`SELECT id::text,as_of_date::text,base_currency,rate_type,status,source_count,total_gain::text,total_loss::text,net_adjustment::text,
      posted_journal_id::text,reversal_journal_id::text,generated_at::text,posted_at::text,reversed_at::text
      FROM accounting_fx_revaluation_runs WHERE company_id=$1 ORDER BY as_of_date DESC,generated_at DESC LIMIT 30`,[context.companyId]),
    context.pool.query(`SELECT b.id::text,b.reference,b.payment_date::text,b.currency,b.gross_amount::text,b.base_gross_amount::text,b.exchange_rate::text,
      b.status,b.posted_journal_id::text,b.reversal_journal_id::text,s.name AS source_name,
      COALESCE((SELECT json_agg(json_build_object('billId',a.bill_document_id::text,'billNumber',d.document_number,'vendor',v.name,
        'billAmount',COALESCE(a.bill_amount,a.amount)::text,'paymentAmount',a.payment_amount::text,'realizedFx',a.realized_fx_amount::text))
        FROM accounting_payment_allocations a JOIN accounting_vendor_documents d ON d.company_id=a.company_id AND d.id=a.bill_document_id
        JOIN accounting_vendors v ON v.company_id=d.company_id AND v.id=d.vendor_id
        WHERE a.company_id=b.company_id AND a.batch_id=b.id AND a.deleted_at IS NULL),'[]'::json) AS allocations
      FROM accounting_payment_batches b JOIN accounting_bank_accounts s ON s.company_id=b.company_id AND s.id=b.source_account_id
      WHERE b.company_id=$1 AND b.deleted_at IS NULL AND b.fx_managed=TRUE
      ORDER BY b.payment_date DESC,b.created_at DESC LIMIT 30`,[context.companyId]),
    context.pool.query(`SELECT t.id::text,t.transfer_number,t.transfer_date::text,t.source_bank_account_id::text,s.name AS source_name,
      t.destination_bank_account_id::text,d.name AS destination_name,t.source_currency,t.destination_currency,
      t.source_amount::text,t.destination_amount::text,t.source_exchange_rate::text,t.destination_exchange_rate::text,
      t.base_amount::text,t.realized_fx_amount::text,t.status,t.posted_journal_id::text,t.reversal_journal_id::text
      FROM accounting_internal_transfers t JOIN accounting_bank_accounts s ON s.company_id=t.company_id AND s.id=t.source_bank_account_id
      JOIN accounting_bank_accounts d ON d.company_id=t.company_id AND d.id=t.destination_bank_account_id
      WHERE t.company_id=$1 AND t.deleted_at IS NULL AND t.fx_managed=TRUE ORDER BY t.transfer_date DESC,t.created_at DESC LIMIT 30`,[context.companyId]),
    context.pool.query(`SELECT fx_gain_account_id::text,fx_loss_account_id::text,fx_unrealized_gain_account_id::text,fx_unrealized_loss_account_id::text
      FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1`,[context.companyId]),
  ]);

  const positions=await getFxPositions(context,asOf,baseCurrency);
  const diagnostics:Array<{level:'info'|'warning'|'error';code:string;message:string}>=[];
  if(!setup.rows[0]?.fx_gain_account_id||!setup.rows[0]?.fx_loss_account_id)diagnostics.push({level:'error',code:'REALIZED_FX_ACCOUNTS_MISSING',message:'Map FX Gain and FX Loss accounts in Accounting Setup before posting foreign-currency settlements.'});
  const unrealizedGain=settings.rows[0]?.unrealized_gain_account_id||setup.rows[0]?.fx_unrealized_gain_account_id||setup.rows[0]?.fx_gain_account_id;
  const unrealizedLoss=settings.rows[0]?.unrealized_loss_account_id||setup.rows[0]?.fx_unrealized_loss_account_id||setup.rows[0]?.fx_loss_account_id;
  if(!unrealizedGain||!unrealizedLoss)diagnostics.push({level:'error',code:'UNREALIZED_FX_ACCOUNTS_MISSING',message:'Map unrealized FX gain/loss accounts before posting a revaluation.'});
  const missingRates=positions.filter(row=>!row.closingRate);
  if(missingRates.length)diagnostics.push({level:'error',code:'FX_RATES_MISSING',message:String(missingRates.length)+' foreign monetary position(s) have no usable closing/spot rate for '+asOf+'.'});
  const unreversed=runs.rows.find(row=>row.status==='posted'&&!row.reversal_journal_id);
  if(unreversed)diagnostics.push({level:'warning',code:'REVALUATION_STILL_POSTED',message:'A previous FX revaluation remains posted. Reverse it before posting another period revaluation.'});

  return {
    companyId:context.companyId,baseCurrency,asOf,
    settings:settings.rows[0]||{
      base_currency:baseCurrency,rate_source_mode:'mixed',default_rate_type:'spot',auto_reverse_revaluation:false,
      revaluation_reversal_days:1,unrealized_gain_account_id:null,unrealized_loss_account_id:null,provider_key:null,status:'active',metadata:{},
    },
    setup:setup.rows[0]||{},
    currencies:currencies.rows,rates:rates.rows,accounts:accounts.rows,
    positions,diagnostics,runs:runs.rows,fxPayments:payments.rows,fxTransfers:transfers.rows,
    invoicingRateImportAvailable:await tableAvailable(context,'invoicing_exchange_rates'),
  };
}
export type AccountingFxWorkspace=Awaited<ReturnType<typeof getAccountingFx>>;

async function getFxPositions(context:Context,asOf:string,baseCurrency:string){
  const client=await context.pool.connect();
  try{
    const positions:Array<Record<string,unknown>>=[];
    const setup=await client.query(`SELECT default_receivable_account_id::text,default_payable_account_id::text FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1`,[context.companyId]);
    let receivableAccount=setup.rows[0]?.default_receivable_account_id?String(setup.rows[0].default_receivable_account_id):'';
    let payableAccount=setup.rows[0]?.default_payable_account_id?String(setup.rows[0].default_payable_account_id):'';
    if(!receivableAccount){
      const r=await client.query(`SELECT id::text FROM accounts WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE AND (system_role='receivable_control' OR account_type='asset_receivable') ORDER BY CASE WHEN system_role='receivable_control' THEN 0 ELSE 1 END,code LIMIT 1`,[context.companyId]);
      receivableAccount=r.rows[0]?.id?String(r.rows[0].id):'';
    }
    if(!payableAccount){
      const r=await client.query(`SELECT id::text FROM accounts WHERE company_id=$1 AND deleted_at IS NULL AND is_active=TRUE AND (system_role='payable_control' OR account_type='liability_payable') ORDER BY CASE WHEN system_role='payable_control' THEN 0 ELSE 1 END,code LIMIT 1`,[context.companyId]);
      payableAccount=r.rows[0]?.id?String(r.rows[0].id):'';
    }

    if(receivableAccount&&await tableAvailable(context,'invoicing_invoices')&&await tableAvailable(context,'invoicing_aging')){
      const ar=await client.query(`SELECT i.id::text AS source_id,i.invoice_number AS source_reference,i.currency,
          aging.balance_due::text AS foreign_balance,ROUND(aging.balance_due*i.exchange_rate,2)::text AS historical_base_balance
        FROM invoicing_invoices i JOIN invoicing_aging aging ON aging.company_id=i.company_id AND aging.invoice_id=i.id
        WHERE i.company_id=$1 AND i.deleted_at IS NULL AND i.invoice_date<=$2 AND aging.balance_due>0
          AND UPPER(i.currency)<>$3 AND i.status NOT IN ('draft','cancelled','void') ORDER BY i.invoice_date,i.invoice_number`,[
          context.companyId,asOf,baseCurrency,
        ]);
      for(const row of ar.rows)positions.push({...row,sourceType:'receivable',positionNature:'asset',accountId:receivableAccount});
    }

    if(payableAccount){
      const ap=await client.query(`SELECT b.document_id::text AS source_id,b.document_number AS source_reference,b.currency,
          CASE WHEN b.document_type='credit_note' THEN (-b.open_amount)::text ELSE b.open_amount::text END AS foreign_balance,
          CASE WHEN b.document_type='credit_note' THEN (-b.base_open_amount)::text ELSE b.base_open_amount::text END AS historical_base_balance,
          b.document_type
        FROM accounting_vendor_document_balances b
        WHERE b.company_id=$1 AND b.document_date<=$2 AND b.open_amount>0 AND UPPER(b.currency)<>$3
        ORDER BY b.document_date,b.document_number`,[context.companyId,asOf,baseCurrency]);
      for(const row of ap.rows)positions.push({...row,sourceType:'payable',positionNature:'liability',accountId:payableAccount});
    }

    const banks=await client.query(`SELECT b.id::text AS source_id,b.name AS source_reference,b.currency,
        COALESCE(v.foreign_balance,0)::text AS foreign_balance,COALESCE(v.base_book_balance,0)::text AS historical_base_balance,
        b.ledger_account_id::text AS account_id
      FROM accounting_bank_accounts b LEFT JOIN accounting_financial_account_balances v ON v.company_id=b.company_id AND v.bank_account_id=b.id
      WHERE b.company_id=$1 AND b.deleted_at IS NULL AND b.status<>'closed' AND UPPER(b.currency)<>$2
        AND COALESCE(v.foreign_balance,0)<>0 ORDER BY b.currency,b.name`,[context.companyId,baseCurrency]);
    for(const row of banks.rows)if(row.account_id)positions.push({...row,sourceType:'bank',positionNature:'asset',accountId:String(row.account_id)});

    const rateCache=new Map<string,Awaited<ReturnType<typeof resolveRate>>|null>();
    for(const position of positions){
      const code=String(position.currency).toUpperCase();
      if(!rateCache.has(code)){
        try{rateCache.set(code,await resolveRate(client,{companyId:context.companyId,baseCurrency,foreignCurrency:code,date:asOf,rateType:'closing'}));}
        catch{rateCache.set(code,null);}
      }
      const resolved=rateCache.get(code);
      if(resolved){
        const calc=calculateRevaluation({
          foreignBalance:String(position.foreign_balance),
          historicalBaseBalance:String(position.historical_base_balance),
          closingRate:resolved.rate,
        });
        position.closingRate=resolved.rate;
        position.rateSource=resolved.sourceName;
        position.rateEffectiveDate=resolved.effectiveDate;
        position.rateType=resolved.rateType;
        position.revaluedBaseBalance=calc.revaluedBase;
        position.adjustmentAmount=calc.adjustment;
      }else{
        position.closingRate=null;position.rateSource=null;position.rateEffectiveDate=null;position.rateType=null;
        position.revaluedBaseBalance=null;position.adjustmentAmount=null;
      }
    }
    return positions;
  }finally{client.release();}
}

export async function saveFxSettings(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_fx_settings','edit');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  const base=await ensureBaseCurrency(context);
  const mode=choice(body.rateSourceMode,['manual','invoicing','provider','mixed'] as const,'rate source mode');
  const defaultRateType=choice(body.defaultRateType,['spot','closing','average'] as const,'default rate type');
  const autoReverse=bool(body.autoReverseRevaluation,false);
  const reversalDays=Math.trunc(Number(body.revaluationReversalDays??1));
  if(!Number.isInteger(reversalDays)||reversalDays<1||reversalDays>31)throw new AccountingInputError('Revaluation reversal days must be between 1 and 31.');
  const gainId=body.unrealizedGainAccountId?accountingId(body.unrealizedGainAccountId):null;
  const lossId=body.unrealizedLossAccountId?accountingId(body.unrealizedLossAccountId):null;
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    if(gainId)await activeAccount(client,context.companyId,gainId,'Unrealized FX gain account');
    if(lossId)await activeAccount(client,context.companyId,lossId,'Unrealized FX loss account');
    await client.query(`INSERT INTO accounting_fx_settings(company_id,base_currency,rate_source_mode,default_rate_type,auto_reverse_revaluation,
        revaluation_reversal_days,unrealized_gain_account_id,unrealized_loss_account_id,provider_key,status,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$10)
      ON CONFLICT(company_id) DO UPDATE SET base_currency=EXCLUDED.base_currency,rate_source_mode=EXCLUDED.rate_source_mode,
        default_rate_type=EXCLUDED.default_rate_type,auto_reverse_revaluation=EXCLUDED.auto_reverse_revaluation,
        revaluation_reversal_days=EXCLUDED.revaluation_reversal_days,unrealized_gain_account_id=EXCLUDED.unrealized_gain_account_id,
        unrealized_loss_account_id=EXCLUDED.unrealized_loss_account_id,provider_key=EXCLUDED.provider_key,status='active',
        updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
        context.companyId,base,mode,defaultRateType,autoReverse,reversalDays,gainId,lossId,text(body.providerKey,80,'Provider key')||null,context.userId,
      ]);
    await client.query(`UPDATE accounting_settings SET fx_unrealized_gain_account_id=$2,fx_unrealized_loss_account_id=$3,updated_by=$4,updated_at=NOW()
      WHERE company_id=$1 AND deleted_at IS NULL`,[context.companyId,gainId,lossId,context.userId]);
    await client.query('COMMIT');
    await audit(context,'settings_saved','accounting_fx_settings',context.companyId,'Foreign-currency Accounting settings updated',{mode,defaultRateType,autoReverse,reversalDays});
    return {base,mode,defaultRateType,autoReverse,reversalDays};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function saveFxCurrency(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_fx_currencies','edit');
  const body=bodyOf(input),code=currency(body.code);
  const base=await ensureBaseCurrency(context);
  const name=text(body.name,120,'Currency name',true);
  const decimals=Math.trunc(Number(body.decimalPlaces??2));
  if(!Number.isInteger(decimals)||decimals<0||decimals>6)throw new AccountingInputError('Currency decimal places must be between 0 and 6.');
  const result=await context.pool.query(`INSERT INTO accounting_fx_currencies(company_id,code,name,symbol,decimal_places,is_base,is_active,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$7)
    ON CONFLICT(company_id,code) DO UPDATE SET name=EXCLUDED.name,symbol=EXCLUDED.symbol,decimal_places=EXCLUDED.decimal_places,
      is_active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING id::text`,[
      context.companyId,code,name,text(body.symbol,16,'Currency symbol')||null,decimals,code===base,context.userId,
    ]);
  await audit(context,'currency_saved','accounting_fx_currencies',String(result.rows[0].id),'FX currency enabled',{code});
  return {id:String(result.rows[0].id),code};
}

export async function saveExchangeRate(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_exchange_rates','edit');
  const body=bodyOf(input),base=await ensureBaseCurrency(context),code=currency(body.currency);
  if(code===base)throw new AccountingInputError('The base currency always has an exchange rate of 1 and does not need a rate row.');
  const value=rate(body.rateToBase),rateType=choice(body.rateType,['spot','closing','average'] as const,'rate type');
  const effectiveDate=accountingDate(body.effectiveDate),sourceType=choice(body.sourceType||'manual',['manual','provider','import'] as const,'rate source');
  const result=await context.pool.query(`INSERT INTO accounting_exchange_rates(company_id,currency,base_currency,rate_to_base,rate_type,effective_date,source_type,source_name,external_reference,is_active,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$10)
    ON CONFLICT(company_id,currency,base_currency,rate_type,effective_date,source_type)
    DO UPDATE SET rate_to_base=EXCLUDED.rate_to_base,source_name=EXCLUDED.source_name,external_reference=EXCLUDED.external_reference,
      is_active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING id::text`,[
      context.companyId,code,base,value,rateType,effectiveDate,sourceType,text(body.sourceName,120,'Source name')||null,
      text(body.externalReference,255,'External reference')||null,context.userId,
    ]);
  await saveFxCurrency({expectedCompanyId:context.companyId,code,name:code,symbol:'',decimalPlaces:2}).catch(()=>{});
  await audit(context,'rate_saved','accounting_exchange_rates',String(result.rows[0].id),'Exchange rate saved',{currency:code,base,rateType,effectiveDate,sourceType});
  return {id:String(result.rows[0].id)};
}

export async function importFxRates(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_exchange_rates','edit');
  const body=bodyOf(input),base=await ensureBaseCurrency(context);
  if(!Array.isArray(body.rates)||body.rates.length<1||body.rates.length>500)throw new AccountingInputError('Import between 1 and 500 exchange rates at a time.');
  const sourceType=choice(body.sourceType||'provider',['provider','import'] as const,'rate source');
  const sourceName=text(body.sourceName,120,'Source name',true);
  const rows=body.rates.map(item=>{
    const row=bodyOf(item),code=currency(row.currency);
    if(code===base)throw new AccountingInputError('Do not import a rate for the company base currency.');
    return {code,rate:rate(row.rateToBase),rateType:choice(row.rateType||'spot',['spot','closing','average'] as const,'rate type'),date:accountingDate(row.effectiveDate),ref:text(row.externalReference,255,'External reference')||null};
  });
  const client=await context.pool.connect();let imported=0;
  try{
    await client.query('BEGIN');
    for(const row of rows){
      await client.query(`INSERT INTO accounting_fx_currencies(company_id,code,name,decimal_places,is_base,is_active,created_by,updated_by)
        VALUES($1,$2,$2,2,FALSE,TRUE,$3,$3) ON CONFLICT(company_id,code) DO UPDATE SET is_active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[context.companyId,row.code,context.userId]);
      await client.query(`INSERT INTO accounting_exchange_rates(company_id,currency,base_currency,rate_to_base,rate_type,effective_date,source_type,source_name,external_reference,is_active,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$10)
        ON CONFLICT(company_id,currency,base_currency,rate_type,effective_date,source_type)
        DO UPDATE SET rate_to_base=EXCLUDED.rate_to_base,source_name=EXCLUDED.source_name,external_reference=EXCLUDED.external_reference,is_active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
        context.companyId,row.code,base,row.rate,row.rateType,row.date,sourceType,sourceName,row.ref,context.userId,
      ]);
      imported+=1;
    }
    await client.query('COMMIT');
    await audit(context,'rates_imported','accounting_exchange_rates',context.companyId,'Exchange-rate batch imported',{imported,sourceType,sourceName});
    return {imported};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function importInvoicingRates(){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_exchange_rates','edit');
  const base=await ensureBaseCurrency(context);
  if(!await tableAvailable(context,'invoicing_exchange_rates'))throw new AccountingInputError('Invoicing exchange rates are not installed in this workspace.');
  const client=await context.pool.connect();let imported=0;
  try{
    await client.query('BEGIN');
    const source=await client.query(`SELECT currency,base_currency,rate_to_base::text,effective_date::text,source_type,source_name,id::text
      FROM invoicing_exchange_rates WHERE company_id=$1 AND is_active=TRUE AND base_currency=$2 ORDER BY effective_date,currency`,[context.companyId,base]);
    for(const row of source.rows){
      await client.query(`INSERT INTO accounting_fx_currencies(company_id,code,name,decimal_places,is_base,is_active,created_by,updated_by)
        VALUES($1,$2,$2,2,FALSE,TRUE,$3,$3) ON CONFLICT(company_id,code) DO UPDATE SET is_active=TRUE,updated_at=NOW()`,[context.companyId,row.currency,context.userId]);
      await client.query(`INSERT INTO accounting_exchange_rates(company_id,currency,base_currency,rate_to_base,rate_type,effective_date,source_type,source_name,external_reference,is_active,created_by,updated_by)
        VALUES($1,$2,$3,$4,'spot',$5,'invoicing',$6,$7,TRUE,$8,$8)
        ON CONFLICT(company_id,currency,base_currency,rate_type,effective_date,source_type)
        DO UPDATE SET rate_to_base=EXCLUDED.rate_to_base,source_name=EXCLUDED.source_name,external_reference=EXCLUDED.external_reference,is_active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
        context.companyId,row.currency,base,row.rate_to_base,String(row.effective_date).slice(0,10),row.source_name||'Invoicing exchange-rate table','invoicing-rate:'+row.id,context.userId,
      ]);
      imported+=1;
    }
    await client.query('COMMIT');
    await audit(context,'invoicing_rates_imported','accounting_exchange_rates',context.companyId,'Invoicing exchange rates imported into Accounting FX',{imported});
    return {imported};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function generateFxRevaluation(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_fx_revaluation_runs','create');
  const body=bodyOf(input),asOf=accountingDate(body.asOf),rateType=choice(body.rateType||'closing',['closing','spot','average'] as const,'revaluation rate type');
  const base=await ensureBaseCurrency(context),positions=await getFxPositions(context,asOf,base);
  if(!positions.length)throw new AccountingInputError('No open foreign monetary positions require revaluation on this date.');
  const missing=positions.filter(row=>!row.closingRate);
  if(missing.length)throw new AccountingInputError(String(missing.length)+' foreign monetary position(s) are missing an exchange rate for '+asOf+'.');
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const priorPosted=await client.query(`SELECT id::text FROM accounting_fx_revaluation_runs WHERE company_id=$1 AND status='posted' AND reversal_journal_id IS NULL LIMIT 1 FOR SHARE`,[context.companyId]);
    if(priorPosted.rows[0])throw new AccountingInputError('Reverse the currently posted FX revaluation before generating another posting run.');
    const existing=await client.query(`SELECT id::text,status FROM accounting_fx_revaluation_runs WHERE company_id=$1 AND as_of_date=$2 AND rate_type=$3 LIMIT 1 FOR UPDATE`,[context.companyId,asOf,rateType]);
    let runId:string;
    if(existing.rows[0]){
      if(existing.rows[0].status!=='draft')throw new AccountingInputError('A non-draft FX revaluation already exists for this date and rate type.');
      runId=String(existing.rows[0].id);
      await client.query(`DELETE FROM accounting_fx_revaluation_lines WHERE company_id=$1 AND run_id=$2`,[context.companyId,runId]);
    }else{
      const run=await client.query(`INSERT INTO accounting_fx_revaluation_runs(company_id,as_of_date,base_currency,rate_type,status,generated_by)
        VALUES($1,$2,$3,$4,'draft',$5) RETURNING id::text`,[context.companyId,asOf,base,rateType,context.userId]);
      runId=String(run.rows[0].id);
    }
    let totalGain=BigInt(0),totalLoss=BigInt(0),net=BigInt(0),count=0;
    for(const p of positions){
      const adjustment=fxMoney(String(p.adjustmentAmount));
      if(adjustment===BigInt(0))continue;
      const nature=String(p.positionNature) as 'asset'|'liability';
      const gain=(nature==='asset'&&adjustment>0)||(nature==='liability'&&adjustment<0);
      if(gain)totalGain+=adjustment<0?-adjustment:adjustment;
      else totalLoss+=adjustment<0?-adjustment:adjustment;
      net+=adjustment;count+=1;
      await client.query(`INSERT INTO accounting_fx_revaluation_lines(company_id,run_id,source_type,source_id,source_reference,account_id,
          position_nature,currency,foreign_balance,historical_base_balance,closing_rate,revalued_base_balance,adjustment_amount,created_by,metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,[
        context.companyId,runId,p.sourceType,p.source_id,p.source_reference,p.accountId,p.positionNature,p.currency,p.foreign_balance,
        p.historical_base_balance,p.closingRate,p.revaluedBaseBalance,p.adjustmentAmount,context.userId,
        JSON.stringify({rateSource:p.rateSource,rateEffectiveDate:p.rateEffectiveDate,rateType:p.rateType,documentType:p.document_type||null}),
      ]);
    }
    if(!count)throw new AccountingInputError('Foreign monetary positions are already equal to their closing-rate carrying values.');
    await client.query(`UPDATE accounting_fx_revaluation_runs SET source_count=$3,total_gain=$4,total_loss=$5,net_adjustment=$6,generated_by=$7,generated_at=NOW(),metadata=$8::jsonb
      WHERE company_id=$1 AND id=$2`,[context.companyId,runId,count,centsDecimal(totalGain),centsDecimal(totalLoss),centsDecimal(net),context.userId,JSON.stringify({positionCount:positions.length})]);
    await client.query('COMMIT');
    await audit(context,'revaluation_generated','accounting_fx_revaluation_runs',runId,'FX revaluation preview generated',{asOf,rateType,count});
    return {id:runId,count,totalGain:centsDecimal(totalGain),totalLoss:centsDecimal(totalLoss)};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function postFxRevaluation(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_fx_revaluation_runs','edit');
  const body=bodyOf(input),runId=accountingId(body.runId);
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const runResult=await client.query(`SELECT * FROM accounting_fx_revaluation_runs WHERE company_id=$1 AND id=$2 LIMIT 1 FOR UPDATE`,[context.companyId,runId]);
    const run=runResult.rows[0];if(!run)throw new AccountingInputError('FX revaluation run not found.');
    if(run.status==='posted'&&run.posted_journal_id){await client.query('COMMIT');return {journalId:String(run.posted_journal_id),replayed:true};}
    if(run.status!=='draft')throw new AccountingInputError('Only a draft FX revaluation can be posted.');
    const prior=await client.query(`SELECT id FROM accounting_fx_revaluation_runs WHERE company_id=$1 AND id<>$2 AND status='posted' AND reversal_journal_id IS NULL LIMIT 1 FOR SHARE`,[context.companyId,runId]);
    if(prior.rows[0])throw new AccountingInputError('Reverse the previously posted FX revaluation before posting this run.');
    const accounts=await fxAccounts(client,context.companyId);
    const settings=await client.query(`SELECT unrealized_gain_account_id::text,unrealized_loss_account_id::text FROM accounting_fx_settings WHERE company_id=$1 LIMIT 1`,[context.companyId]);
    const gainId=settings.rows[0]?.unrealized_gain_account_id?String(settings.rows[0].unrealized_gain_account_id):accounts.unrealizedGain;
    const lossId=settings.rows[0]?.unrealized_loss_account_id?String(settings.rows[0].unrealized_loss_account_id):accounts.unrealizedLoss;
    if(!gainId||!lossId)throw new AccountingInputError('Map unrealized FX gain and loss accounts before posting revaluation.');
    await activeAccount(client,context.companyId,gainId,'Unrealized FX gain account');
    await activeAccount(client,context.companyId,lossId,'Unrealized FX loss account');
    const lines=await client.query(`SELECT account_id::text,position_nature,adjustment_amount::text FROM accounting_fx_revaluation_lines WHERE company_id=$1 AND run_id=$2 ORDER BY account_id,id FOR SHARE`,[context.companyId,runId]);
    if(!lines.rows.length)throw new AccountingInputError('This FX revaluation has no adjustment lines.');
    const accountAdjustments=new Map<string,{nature:string;amount:bigint}>();
    let gains=BigInt(0),losses=BigInt(0);
    for(const row of lines.rows){
      const amount=fxMoney(row.adjustment_amount),nature=String(row.position_nature),id=String(row.account_id);
      const current=accountAdjustments.get(id)||{nature,amount:BigInt(0)};current.amount+=amount;accountAdjustments.set(id,current);
      const isGain=(nature==='asset'&&amount>0)||(nature==='liability'&&amount<0);
      if(isGain)gains+=amount<0?-amount:amount;else losses+=amount<0?-amount:amount;
    }
    const journalLines:Array<{accountId:string;description:string;debit:string;credit:string}>=[];
    for(const [accountId,item] of accountAdjustments){
      if(item.amount===BigInt(0))continue;
      const increase=item.amount>BigInt(0),abs=item.amount<0?-item.amount:item.amount;
      const debit=item.nature==='asset'?increase:!increase;
      journalLines.push({accountId,description:'FX revaluation · '+String(run.as_of_date).slice(0,10),debit:debit?centsDecimal(abs):'0.00',credit:debit?'0.00':centsDecimal(abs)});
    }
    if(gains>BigInt(0))journalLines.push({accountId:gainId,description:'Unrealized foreign exchange gain',debit:'0.00',credit:centsDecimal(gains)});
    if(losses>BigInt(0))journalLines.push({accountId:lossId,description:'Unrealized foreign exchange loss',debit:centsDecimal(losses),credit:'0.00'});
    const journal=await postBalancedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,journalDate:String(run.as_of_date).slice(0,10),
      description:'Foreign currency revaluation · '+String(run.as_of_date).slice(0,10),
      reference:'FX-REVAL-'+runId.slice(0,8),sourceModule:'accounting',sourceType:'fx_revaluation',sourceId:runId,
      sourceEventKey:'accounting:fx-revaluation:'+runId,postingKind:'system',lines:journalLines,
    });
    await client.query(`UPDATE accounting_fx_revaluation_runs SET status='posted',posted_journal_id=$3,posted_by=$4,posted_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,runId,journal.journalId,context.userId]);
    await client.query('COMMIT');
    await audit(context,'revaluation_posted','accounting_fx_revaluation_runs',runId,'FX revaluation posted',{journalId:journal.journalId,gains:centsDecimal(gains),losses:centsDecimal(losses)});
    return {journalId:journal.journalId,replayed:journal.reused};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function reverseFxRevaluation(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_fx_revaluation_runs','edit');
  const body=bodyOf(input),runId=accountingId(body.runId),reversalDate=accountingDate(body.reversalDate);
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(`SELECT id::text,status,posted_journal_id::text,reversal_journal_id::text,as_of_date::text FROM accounting_fx_revaluation_runs WHERE company_id=$1 AND id=$2 LIMIT 1 FOR UPDATE`,[context.companyId,runId]);
    const run=result.rows[0];if(!run||!run.posted_journal_id)throw new AccountingInputError('Only a posted FX revaluation can be reversed.');
    if(run.reversal_journal_id){await client.query('COMMIT');return {journalId:String(run.reversal_journal_id),replayed:true};}
    const reversal=await reversePostedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,originalJournalId:String(run.posted_journal_id),journalDate:reversalDate,
      description:'Reverse FX revaluation · '+String(run.as_of_date).slice(0,10),sourceModule:'accounting',sourceType:'fx_revaluation_reversal',
      sourceId:runId,sourceEventKey:'accounting:fx-revaluation-reversal:'+runId,
    });
    await client.query(`UPDATE accounting_fx_revaluation_runs SET status='reversed',reversal_journal_id=$3,reversed_by=$4,reversed_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,runId,reversal.journalId,context.userId]);
    await client.query('COMMIT');
    await audit(context,'revaluation_reversed','accounting_fx_revaluation_runs',runId,'FX revaluation reversed',{journalId:reversal.journalId,reversalDate});
    return {journalId:reversal.journalId,replayed:reversal.reused};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function postForeignVendorPayment(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_payment_batches','create');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before posting.');
  const requestKey=accountingId(body.requestKey),paymentDate=accountingDate(body.paymentDate),sourceAccountId=accountingId(body.sourceAccountId);
  const reference=text(body.reference,255,'Payment reference',true);
  if(!Array.isArray(body.allocations)||body.allocations.length<1||body.allocations.length>50)throw new AccountingInputError('Choose between 1 and 50 vendor bill allocations.');
  const allocations=body.allocations.map(value=>{
    const row=bodyOf(value);
    return {billId:accountingId(row.billId),billAmount:positiveForeign(row.billAmount,'Bill amount'),sourceAmount:positiveForeign(row.sourceAmount,'Source account amount')};
  });
  if(new Set(allocations.map(row=>row.billId)).size!==allocations.length)throw new AccountingInputError('A bill can appear only once in an FX payment.');
  const hash=createHash('sha256').update(JSON.stringify({paymentDate,sourceAccountId,reference,allocations})).digest('hex');
  const base=await ensureBaseCurrency(context),client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[context.companyId+':fx-vendor-payment:'+requestKey]);
    const replay=await client.query(`SELECT id::text,request_hash,posted_journal_id::text FROM accounting_payment_batches WHERE company_id=$1 AND request_key=$2 LIMIT 1`,[context.companyId,requestKey]);
    if(replay.rows[0]){
      if(replay.rows[0].request_hash!==hash)throw new AccountingInputError('This FX payment request key was already used with different content.');
      await client.query('COMMIT');return {id:String(replay.rows[0].id),journalId:String(replay.rows[0].posted_journal_id||''),replayed:true};
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['accounting:financial-account:'+sourceAccountId]);
    const source=await financialAccountForUpdate(client,context.companyId,sourceAccountId);
    if(source.status!=='active'||!source.ledger_account_id)throw new AccountingInputError('Choose an active source financial account with a linked ledger account.');
    const sourceCurrency=String(source.currency).toUpperCase(),sourceRate=await resolveRate(client,{companyId:context.companyId,baseCurrency:base,foreignCurrency:sourceCurrency,date:paymentDate,rateType:'spot'});
    const bills=await client.query(`SELECT d.* FROM accounting_vendor_documents d WHERE d.company_id=$1 AND d.id=ANY($2::uuid[]) AND d.deleted_at IS NULL ORDER BY d.id FOR UPDATE`,[context.companyId,allocations.map(row=>row.billId)]);
    if(bills.rows.length!==allocations.length)throw new AccountingInputError('A selected vendor bill could not be found.');
    const apByAccount=new Map<string,bigint>();
    let sourceForeign=BigInt(0),sourceBase=BigInt(0),billBase=BigInt(0),realized=BigInt(0);
    const calcRows:Array<Record<string,unknown>>=[];
    for(const bill of bills.rows){
      if(bill.document_type!=='bill'||!['posted','partially_settled'].includes(String(bill.status)))throw new AccountingInputError('Choose only open posted vendor bills.');
      const allocation=allocations.find(row=>row.billId===String(bill.id))!;
      const balance=await client.query(`SELECT open_amount::text FROM accounting_vendor_document_balances WHERE company_id=$1 AND document_id=$2`,[context.companyId,bill.id]);
      if(!balance.rows[0]||fxForeignUnits(allocation.billAmount)>fxForeignUnits(balance.rows[0].open_amount))throw new AccountingInputError('An FX payment exceeds a bill’s current outstanding balance.');
      const calculated=calculateRealizedFx({paymentAmount:allocation.sourceAmount,paymentRate:sourceRate.rate,billAmount:allocation.billAmount,billRate:String(bill.exchange_rate)});
      const paymentBaseCents=fxMoney(calculated.paymentBase),billBaseCents=fxMoney(calculated.billBase),realizedCents=fxMoney(calculated.realized);
      const ap=await payableControlForBill(client,context.companyId,bill);
      apByAccount.set(ap,(apByAccount.get(ap)||BigInt(0))+billBaseCents);
      sourceForeign+=fxForeignUnits(allocation.sourceAmount);sourceBase+=paymentBaseCents;billBase+=billBaseCents;realized+=realizedCents;
      calcRows.push({bill,allocation,paymentBase:calculated.paymentBase,billBase:calculated.billBase,realized:calculated.realized,ap});
    }
    checkForeignFunds(source,foreignDecimal(sourceForeign),base);
    const fx=await fxAccounts(client,context.companyId);
    const lines:Array<{accountId:string;description:string;debit:string;credit:string}>=[];
    for(const [accountId,amount] of apByAccount)lines.push({accountId,description:'Foreign vendor payment · '+reference,debit:centsDecimal(amount),credit:'0.00'});
    lines.push({accountId:String(source.ledger_account_id),description:'Foreign payment source · '+reference,debit:'0.00',credit:centsDecimal(sourceBase)});
    if(realized>BigInt(0))lines.push({accountId:fx.realizedLoss,description:'Realized foreign exchange loss',debit:centsDecimal(realized),credit:'0.00'});
    else if(realized<BigInt(0))lines.push({accountId:fx.realizedGain,description:'Realized foreign exchange gain',debit:'0.00',credit:centsDecimal(-realized)});
    const journal=await postBalancedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,journalDate:paymentDate,description:'Foreign vendor payment · '+reference,reference,
      sourceModule:'accounting',sourceType:'fx_vendor_payment',sourceId:requestKey,sourceEventKey:'accounting:fx-vendor-payment:'+requestKey,postingKind:'system',lines,
    });
    const batch=await client.query(`INSERT INTO accounting_payment_batches(company_id,request_key,request_hash,kind,reference,payment_date,currency,
        source_account_id,gross_amount,fee_amount,net_amount,status,posted_journal_id,posted_by,posted_at,created_by,updated_by,
        exchange_rate,base_currency,base_gross_amount,rate_source,rate_date,fx_managed)
      VALUES($1,$2,$3,'vendor_payment',$4,$5,$6,$7,$8,0,$8,'posted',$9,$10,NOW(),$10,$10,$11,$12,$13,$14,$15,TRUE)
      RETURNING id::text`,[
      context.companyId,requestKey,hash,reference,paymentDate,sourceCurrency,sourceAccountId,foreignDecimal(sourceForeign),
      journal.journalId,context.userId,sourceRate.rate,base,centsDecimal(sourceBase),sourceRate.sourceName,sourceRate.effectiveDate,
    ]);
    const batchId=String(batch.rows[0].id);
    for(const row of calcRows){
      const bill=row.bill as Record<string,unknown>,allocation=row.allocation as {billId:string;billAmount:string;sourceAmount:string};
      await client.query(`INSERT INTO accounting_payment_allocations(company_id,batch_id,bill_document_id,amount,payment_amount,bill_amount,
          payment_exchange_rate,bill_exchange_rate,base_payment_amount,base_bill_amount,realized_fx_amount,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$4,$6,$7,$8,$9,$10,$11,$11)`,[
        context.companyId,batchId,allocation.billId,allocation.billAmount,allocation.sourceAmount,sourceRate.rate,String(bill.exchange_rate),
        row.paymentBase,row.billBase,row.realized,context.userId,
      ]);
    }
    await recordFxMovement(client,{
      companyId:context.companyId,bankAccountId:sourceAccountId,sourceType:'fx_vendor_payment',sourceId:batchId,
      eventKey:'fx-vendor-payment:'+batchId+':source',date:paymentDate,currency:sourceCurrency,
      foreignAmount:foreignDecimal(-sourceForeign),baseAmount:centsDecimal(-sourceBase),rate:sourceRate.rate,userId:context.userId,
      metadata:{reference},
    });
    await refreshBills(client,context.companyId,context.userId,allocations.map(row=>row.billId));
    await client.query('COMMIT');
    await audit(context,'vendor_payment_posted','accounting_payment_batches',batchId,'Foreign-currency vendor payment posted',{reference,sourceCurrency,baseCurrency:base,realizedFx:centsDecimal(realized),journalId:journal.journalId});
    return {id:batchId,journalId:journal.journalId,realizedFx:centsDecimal(realized),replayed:false};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function reverseForeignVendorPayment(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_payment_batches','edit');
  const body=bodyOf(input),batchId=accountingId(body.batchId),reversalDate=accountingDate(body.reversalDate);
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(`SELECT * FROM accounting_payment_batches WHERE company_id=$1 AND id=$2 AND fx_managed=TRUE AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,[context.companyId,batchId]);
    const batch=result.rows[0];if(!batch||!batch.posted_journal_id)throw new AccountingInputError('Foreign vendor payment not found.');
    if(batch.status==='reversed'&&batch.reversal_journal_id){await client.query('COMMIT');return {journalId:String(batch.reversal_journal_id),replayed:true};}
    if(batch.status!=='posted')throw new AccountingInputError('Only a posted foreign vendor payment can be reversed.');
    const allocations=await client.query(`SELECT bill_document_id::text FROM accounting_payment_allocations WHERE company_id=$1 AND batch_id=$2 AND deleted_at IS NULL`,[context.companyId,batchId]);
    const reversal=await reversePostedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,originalJournalId:String(batch.posted_journal_id),journalDate:reversalDate,
      description:'Reverse foreign vendor payment · '+String(batch.reference),sourceModule:'accounting',sourceType:'fx_vendor_payment_reversal',
      sourceId:batchId,sourceEventKey:'accounting:fx-vendor-payment-reversal:'+batchId,
    });
    await recordFxMovement(client,{
      companyId:context.companyId,bankAccountId:String(batch.source_account_id),sourceType:'fx_vendor_payment_reversal',sourceId:batchId,
      eventKey:'fx-vendor-payment:'+batchId+':source:reverse',date:reversalDate,currency:String(batch.currency),
      foreignAmount:String(batch.gross_amount),baseAmount:String(batch.base_gross_amount),rate:String(batch.exchange_rate),userId:context.userId,
      metadata:{reversalOf:batchId},
    });
    await client.query(`UPDATE accounting_payment_batches SET status='reversed',reversal_journal_id=$3,reversed_by=$4,reversed_at=NOW(),updated_by=$4,updated_at=NOW()
      WHERE company_id=$1 AND id=$2`,[context.companyId,batchId,reversal.journalId,context.userId]);
    await refreshBills(client,context.companyId,context.userId,allocations.rows.map(row=>String(row.bill_document_id)));
    await client.query('COMMIT');
    await audit(context,'vendor_payment_reversed','accounting_payment_batches',batchId,'Foreign-currency vendor payment reversed',{journalId:reversal.journalId,reversalDate});
    return {journalId:reversal.journalId,replayed:reversal.reused};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function postCrossCurrencyTransfer(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_internal_transfers','edit');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before posting.');
  const requestKey=accountingId(body.requestKey),date=accountingDate(body.transferDate),sourceId=accountingId(body.sourceAccountId),destinationId=accountingId(body.destinationAccountId);
  if(sourceId===destinationId)throw new AccountingInputError('Choose different source and destination accounts.');
  const sourceAmount=positiveForeign(body.sourceAmount,'Source amount'),destinationAmount=positiveForeign(body.destinationAmount,'Destination amount');
  const reference=text(body.reference,255,'Reference')||'FX transfer';
  const hash=createHash('sha256').update(JSON.stringify({date,sourceId,destinationId,sourceAmount,destinationAmount,reference})).digest('hex');
  const base=await ensureBaseCurrency(context),client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[context.companyId+':fx-transfer:'+requestKey]);
    const replay=await client.query(`SELECT id::text,request_hash,posted_journal_id::text,transfer_number FROM accounting_internal_transfers WHERE company_id=$1 AND request_key=$2 LIMIT 1`,[context.companyId,requestKey]);
    if(replay.rows[0]){
      if(replay.rows[0].request_hash!==hash)throw new AccountingInputError('This FX transfer request key was already used with different content.');
      await client.query('COMMIT');return {id:String(replay.rows[0].id),transferNumber:String(replay.rows[0].transfer_number),journalId:String(replay.rows[0].posted_journal_id),replayed:true};
    }
    for(const id of [sourceId,destinationId].sort())await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['accounting:financial-account:'+id]);
    const source=await financialAccountForUpdate(client,context.companyId,sourceId),destination=await financialAccountForUpdate(client,context.companyId,destinationId);
    if(source.status!=='active'||destination.status!=='active'||!source.ledger_account_id||!destination.ledger_account_id)throw new AccountingInputError('Cross-currency transfers require active financial accounts with linked ledger accounts.');
    const sourceCurrency=String(source.currency).toUpperCase(),destinationCurrency=String(destination.currency).toUpperCase();
    if(sourceCurrency===destinationCurrency)throw new AccountingInputError('Use the normal Internal Transfer workflow when both financial accounts use the same currency.');
    const sourceRate=await resolveRate(client,{companyId:context.companyId,baseCurrency:base,foreignCurrency:sourceCurrency,date,rateType:'spot'});
    const destinationRate=await resolveRate(client,{companyId:context.companyId,baseCurrency:base,foreignCurrency:destinationCurrency,date,rateType:'spot'});
    const calc=crossCurrencyTransfer({sourceAmount,sourceRate:sourceRate.rate,destinationAmount,destinationRate:destinationRate.rate});
    checkForeignFunds(source,sourceAmount,base);
    const sourceBase=fxMoney(calc.sourceBase),destinationBase=fxMoney(calc.destinationBase),realized=fxMoney(calc.realized);
    const fx=await fxAccounts(client,context.companyId);
    const lines:Array<{accountId:string;description:string;debit:string;credit:string}>=[
      {accountId:String(destination.ledger_account_id),description:'Cross-currency transfer received · '+reference,debit:centsDecimal(destinationBase),credit:'0.00'},
      {accountId:String(source.ledger_account_id),description:'Cross-currency transfer sent · '+reference,debit:'0.00',credit:centsDecimal(sourceBase)},
    ];
    if(realized>BigInt(0))lines.push({accountId:fx.realizedLoss,description:'Realized FX loss on currency conversion',debit:centsDecimal(realized),credit:'0.00'});
    else if(realized<BigInt(0))lines.push({accountId:fx.realizedGain,description:'Realized FX gain on currency conversion',debit:'0.00',credit:centsDecimal(-realized)});
    const numberResult=await client.query(`SELECT COALESCE(MAX(NULLIF(regexp_replace(transfer_number,'\\D','','g'),'')::bigint),0)+1 AS next_number FROM accounting_internal_transfers WHERE company_id=$1`,[context.companyId]);
    const number='TRF-'+String(numberResult.rows[0]?.next_number||1).padStart(6,'0');
    const journal=await postBalancedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,journalDate:date,description:'Cross-currency transfer · '+number,reference,
      sourceModule:'accounting',sourceType:'fx_internal_transfer',sourceId:requestKey,sourceEventKey:'accounting:fx-transfer:'+requestKey,postingKind:'system',lines,
    });
    const inserted=await client.query(`INSERT INTO accounting_internal_transfers(company_id,transfer_number,request_key,request_hash,transfer_date,
        source_bank_account_id,destination_bank_account_id,currency,amount,reference,notes,status,posted_journal_id,posted_by,created_by,updated_by,
        source_currency,destination_currency,source_amount,destination_amount,source_exchange_rate,destination_exchange_rate,base_amount,realized_fx_amount,fx_managed)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'posted',$12,$13,$13,$13,$8,$14,$9,$15,$16,$17,$18,$19,TRUE) RETURNING id::text`,[
      context.companyId,number,requestKey,hash,date,sourceId,destinationId,sourceCurrency,sourceAmount,reference,text(body.notes,2000,'Notes'),
      journal.journalId,context.userId,destinationCurrency,destinationAmount,sourceRate.rate,destinationRate.rate,calc.sourceBase,calc.realized,
    ]);
    const id=String(inserted.rows[0].id);
    await recordFxMovement(client,{companyId:context.companyId,bankAccountId:sourceId,sourceType:'fx_internal_transfer',sourceId:id,eventKey:'fx-transfer:'+id+':source',date,currency:sourceCurrency,foreignAmount:foreignDecimal(-fxForeignUnits(sourceAmount)),baseAmount:centsDecimal(-sourceBase),rate:sourceRate.rate,userId:context.userId,metadata:{transferNumber:number}});
    await recordFxMovement(client,{companyId:context.companyId,bankAccountId:destinationId,sourceType:'fx_internal_transfer',sourceId:id,eventKey:'fx-transfer:'+id+':destination',date,currency:destinationCurrency,foreignAmount:destinationAmount,baseAmount:centsDecimal(destinationBase),rate:destinationRate.rate,userId:context.userId,metadata:{transferNumber:number}});
    await client.query('COMMIT');
    await audit(context,'transfer_posted','accounting_internal_transfers',id,'Cross-currency internal transfer posted',{transferNumber:number,sourceCurrency,destinationCurrency,realizedFx:calc.realized,journalId:journal.journalId});
    return {id,transferNumber:number,journalId:journal.journalId,realizedFx:calc.realized,replayed:false};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function reverseCrossCurrencyTransfer(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_internal_transfers','edit');
  const body=bodyOf(input),id=accountingId(body.id),reversalDate=accountingDate(body.reversalDate);
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(`SELECT * FROM accounting_internal_transfers WHERE company_id=$1 AND id=$2 AND fx_managed=TRUE AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,[context.companyId,id]);
    const transfer=result.rows[0];if(!transfer||!transfer.posted_journal_id)throw new AccountingInputError('Cross-currency transfer not found.');
    if(transfer.reversal_journal_id){await client.query('COMMIT');return {journalId:String(transfer.reversal_journal_id),replayed:true};}
    const reversal=await reversePostedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,originalJournalId:String(transfer.posted_journal_id),journalDate:reversalDate,
      description:'Reverse cross-currency transfer · '+String(transfer.transfer_number),sourceModule:'accounting',sourceType:'fx_internal_transfer_reversal',
      sourceId:id,sourceEventKey:'accounting:fx-transfer-reversal:'+id,
    });
    await recordFxMovement(client,{companyId:context.companyId,bankAccountId:String(transfer.source_bank_account_id),sourceType:'fx_internal_transfer_reversal',sourceId:id,eventKey:'fx-transfer:'+id+':source:reverse',date:reversalDate,currency:String(transfer.source_currency),foreignAmount:String(transfer.source_amount),baseAmount:String(transfer.base_amount),rate:String(transfer.source_exchange_rate),userId:context.userId,metadata:{reversalOf:id}});
    const destBase=crossCurrencyTransfer({sourceAmount:transfer.source_amount,sourceRate:transfer.source_exchange_rate,destinationAmount:transfer.destination_amount,destinationRate:transfer.destination_exchange_rate}).destinationBase;
    await recordFxMovement(client,{companyId:context.companyId,bankAccountId:String(transfer.destination_bank_account_id),sourceType:'fx_internal_transfer_reversal',sourceId:id,eventKey:'fx-transfer:'+id+':destination:reverse',date:reversalDate,currency:String(transfer.destination_currency),foreignAmount:foreignDecimal(-fxForeignUnits(transfer.destination_amount)),baseAmount:centsDecimal(-fxMoney(destBase)),rate:String(transfer.destination_exchange_rate),userId:context.userId,metadata:{reversalOf:id}});
    await client.query(`UPDATE accounting_internal_transfers SET status='reversed',reversal_journal_id=$3,reversed_by=$4,reversed_at=NOW(),updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,id,reversal.journalId,context.userId]);
    await client.query('COMMIT');
    await audit(context,'transfer_reversed','accounting_internal_transfers',id,'Cross-currency internal transfer reversed',{journalId:reversal.journalId,reversalDate});
    return {journalId:reversal.journalId,replayed:reversal.reused};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}
