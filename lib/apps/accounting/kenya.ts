import 'server-only';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { AccountingInputError, accountingDate, accountingId, decimalAmount } from './validation';
import {
  KENYA_ETIMS_TAX_TYPES,
  KenyaTaxRuleError,
  summarizeKenyaVat,
  validateKenyaEtimsTaxMapping,
  type KenyaEtimsTaxType,
} from './kenya-rules';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

function bodyOf(input:unknown):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AccountingInputError('Enter valid Kenya localization data.');
  return input as Record<string,unknown>;
}
function bool(value:unknown,fallback=false){
  if(value===undefined||value===null)return fallback;
  return value===true||value==='true'||value==='1'||value===1;
}
function int(value:unknown,min:number,max:number,label:string){
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)throw new AccountingInputError(label+' must be between '+min+' and '+max+'.');
  return n;
}
function moneyCents(value:unknown){
  const raw=String(value??'0').trim();
  const negative=raw.startsWith('-'),unsigned=negative?raw.slice(1):raw;
  if(!/^\d{1,18}(?:\.\d{1,8})?$/.test(unsigned))throw new AccountingInputError('A Kenya tax amount is invalid.');
  const [whole,fraction='']=unsigned.split('.'),padded=fraction.padEnd(3,'0');
  let amount=BigInt(whole||'0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if(Number(padded[2]||'0')>=5)amount+=BigInt(1);
  return negative?-amount:amount;
}
function maskPin(value:unknown){
  const pin=String(value||'').trim();
  if(pin.length<5)return pin?'Configured':'';
  return pin.slice(0,2)+'••••••'+pin.slice(-3);
}
async function tableAvailable(context:Context,name:string){
  const result=await context.pool.query('SELECT to_regclass($1) IS NOT NULL AS present',['public.'+name]);
  return Boolean(result.rows[0]?.present);
}
async function audit(context:Context,action:string,summary:string,metadata:Record<string,unknown>={}){
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.kenya.'+action,module:'accounting',resourceType:'accounting_kenya_settings',
    resourceId:context.companyId,summary,result:'success',metadata,
  }).catch(error=>console.error('[Accounting] Kenya audit failed',error));
}
function today(){return new Date().toISOString().slice(0,10);}
function monthStart(){const d=today();return d.slice(0,8)+'01';}

export async function getAccountingKenya(input:{from?:unknown;to?:unknown}={}){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_kenya_settings','view');
  const from=input.from?accountingDate(input.from):monthStart();
  const to=input.to?accountingDate(input.to):today();
  if(from>to)throw new AccountingInputError('Kenya reporting start date cannot be after the end date.');

  const [settings,codes,mappings,ledger,syncRuns]=await Promise.all([
    context.pool.query(`SELECT company_id::text,enabled,vat_registered,vat_return_day,etims_sync_enabled,last_etims_sync_at::text,last_sync_status,last_sync_inserted,last_sync_unmapped,last_sync_error FROM accounting_kenya_settings WHERE company_id=$1 LIMIT 1`,[context.companyId]),
    context.pool.query(`SELECT id::text,code,name,scope,rate::text,effective_from::text,effective_to::text,status,reporting_code FROM accounting_tax_codes WHERE company_id=$1 AND deleted_at IS NULL AND jurisdiction_code='KE' ORDER BY status,sequence,code`,[context.companyId]),
    context.pool.query(`SELECT m.id::text,m.tax_code_id::text,m.etims_tax_type_code,m.effective_from::text,m.effective_to::text,m.status,m.is_legacy,t.code,t.name,t.rate::text,t.scope FROM accounting_kenya_tax_mappings m JOIN accounting_tax_codes t ON t.company_id=m.company_id AND t.id=m.tax_code_id WHERE m.company_id=$1 AND m.deleted_at IS NULL ORDER BY m.etims_tax_type_code,m.created_at`,[context.companyId]),
    context.pool.query(`SELECT direction,entry_effect,taxable_amount::text,tax_amount::text,recoverable_amount::text FROM accounting_tax_ledger_entries WHERE company_id=$1 AND deleted_at IS NULL AND transaction_date BETWEEN $2 AND $3`,[context.companyId,from,to]),
    context.pool.query(`SELECT id::text,started_at::text,completed_at::text,status,inserted_count,replayed_count,unmapped_count,source_count,error_message FROM accounting_kenya_sync_runs WHERE company_id=$1 ORDER BY started_at DESC LIMIT 20`,[context.companyId]),
  ]);

  const invoicingTables=await Promise.all([
    tableAvailable(context,'invoicing_etims_profiles'),
    tableAvailable(context,'invoicing_etims_submissions'),
    tableAvailable(context,'invoicing_etims_tax_mappings'),
  ]);
  const etimsAvailable=invoicingTables.every(Boolean);
  let profile:null|Record<string,unknown>=null;
  let invoicingTaxMappings:Array<Record<string,unknown>>=[];
  let submissionMetrics={sales:0,credits:0,failed:0,pending:0};
  if(etimsAvailable){
    const [profileResult,taxMapResult,metricsResult]=await Promise.all([
      context.pool.query(`SELECT solution_type,environment,taxpayer_pin,branch_id,status,kra_sdc_id,kra_mrc_no,last_device_init_at::text,last_reference_sync_at::text,last_success_at::text,last_error_at::text,last_error_code,last_error_message FROM invoicing_etims_profiles WHERE company_id=$1 LIMIT 1`,[context.companyId]),
      context.pool.query(`SELECT tax_type_code,kra_rate::text,COUNT(*)::int AS mapping_count FROM invoicing_etims_tax_mappings WHERE company_id=$1 AND is_active=TRUE GROUP BY tax_type_code,kra_rate ORDER BY tax_type_code`,[context.companyId]),
      context.pool.query(`SELECT COUNT(*) FILTER(WHERE status='succeeded' AND submission_type='sale')::int AS sales,COUNT(*) FILTER(WHERE status='succeeded' AND submission_type='credit_note')::int AS credits,COUNT(*) FILTER(WHERE status='failed')::int AS failed,COUNT(*) FILTER(WHERE status IN ('pending','retry'))::int AS pending FROM invoicing_etims_submissions WHERE company_id=$1`,[context.companyId]),
    ]);
    if(profileResult.rows[0]){
      const row=profileResult.rows[0];
      profile={...row,taxpayer_pin:undefined,taxpayerPinMasked:maskPin(row.taxpayer_pin)};
    }
    invoicingTaxMappings=taxMapResult.rows;
    submissionMetrics={
      sales:Number(metricsResult.rows[0]?.sales||0),credits:Number(metricsResult.rows[0]?.credits||0),
      failed:Number(metricsResult.rows[0]?.failed||0),pending:Number(metricsResult.rows[0]?.pending||0),
    };
  }

  const summary=summarizeKenyaVat(ledger.rows.map(row=>({
    direction:String(row.direction) as 'sale'|'purchase'|'withholding',
    entryEffect:Number(row.entry_effect||1),
    taxableAmount:String(row.taxable_amount||'0'),
    taxAmount:String(row.tax_amount||'0'),
    recoverableAmount:String(row.recoverable_amount||'0'),
  })));

  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    from,to,
    settings:settings.rows[0]||{
      enabled:false,vat_registered:true,vat_return_day:20,etims_sync_enabled:true,
      last_etims_sync_at:null,last_sync_status:'idle',last_sync_inserted:0,last_sync_unmapped:0,last_sync_error:null,
    },
    taxCodes:codes.rows,
    mappings:mappings.rows,
    taxTypes:KENYA_ETIMS_TAX_TYPES,
    vatSummary:summary,
    etims:{available:etimsAvailable,profile,invoicingTaxMappings,submissions:submissionMetrics},
    syncRuns:syncRuns.rows,
  };
}
export type AccountingKenyaWorkspace=Awaited<ReturnType<typeof getAccountingKenya>>;

export async function saveAccountingKenyaSettings(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_kenya_settings','edit');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  const enabled=bool(body.enabled,true),vatRegistered=bool(body.vatRegistered,true),etimsSyncEnabled=bool(body.etimsSyncEnabled,true);
  const vatReturnDay=int(body.vatReturnDay??20,1,28,'VAT return day');
  await context.pool.query(`INSERT INTO accounting_kenya_settings(company_id,enabled,vat_registered,vat_return_day,etims_sync_enabled,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled,vat_registered=EXCLUDED.vat_registered,vat_return_day=EXCLUDED.vat_return_day,etims_sync_enabled=EXCLUDED.etims_sync_enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[context.companyId,enabled,vatRegistered,vatReturnDay,etimsSyncEnabled,context.userId]);
  await audit(context,'settings_saved','Kenya accounting settings updated',{enabled,vatRegistered,vatReturnDay,etimsSyncEnabled});
  return {enabled,vatRegistered,vatReturnDay,etimsSyncEnabled};
}

export async function installAccountingKenyaDefaults(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_kenya_settings','edit');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before installing Kenya defaults.');
  const vatRegistered=bool(body.vatRegistered,true);
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const setup=await client.query(`SELECT output_tax_account_id::text,input_tax_account_id::text FROM accounting_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1 FOR SHARE`,[context.companyId]);
    const outputTax=setup.rows[0]?.output_tax_account_id?String(setup.rows[0].output_tax_account_id):null;
    const inputTax=setup.rows[0]?.input_tax_account_id?String(setup.rows[0].input_tax_account_id):null;
    if(vatRegistered&&(!outputTax||!inputTax))throw new AccountingInputError('Map both Output Tax and Input Tax accounts in Accounting Setup before installing Kenya VAT defaults.');

    await client.query(`INSERT INTO accounting_kenya_settings(company_id,enabled,vat_registered,vat_return_day,etims_sync_enabled,created_by,updated_by) VALUES($1,TRUE,$2,20,TRUE,$3,$3) ON CONFLICT(company_id) DO UPDATE SET enabled=TRUE,vat_registered=EXCLUDED.vat_registered,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[context.companyId,vatRegistered,context.userId]);

    const definitions=[
      {code:'KE-VAT-16-OUTPUT',name:'Kenya VAT 16% · Output',scope:'sale',rate:'16.0000',recover:'0.0000',tax:outputTax,input:null,report:'VAT_OUTPUT_STANDARD',sequence:10},
      {code:'KE-VAT-16-INPUT',name:'Kenya VAT 16% · Input',scope:'purchase',rate:'16.0000',recover:'100.0000',tax:null,input:inputTax,report:'VAT_INPUT_STANDARD',sequence:20},
      {code:'KE-VAT-0-OUTPUT',name:'Kenya VAT 0% · Zero-rated sales',scope:'sale',rate:'0.0000',recover:'0.0000',tax:null,input:null,report:'VAT_OUTPUT_ZERO',sequence:30},
      {code:'KE-VAT-0-INPUT',name:'Kenya VAT 0% · Zero-rated purchases',scope:'purchase',rate:'0.0000',recover:'0.0000',tax:null,input:null,report:'VAT_INPUT_ZERO',sequence:40},
      {code:'KE-VAT-EXEMPT',name:'Kenya VAT · Exempt sales',scope:'sale',rate:'0.0000',recover:'0.0000',tax:null,input:null,report:'VAT_OUTPUT_EXEMPT',sequence:50},
      {code:'KE-VAT-EXEMPT-PURCHASE',name:'Kenya VAT · Exempt purchases',scope:'purchase',rate:'0.0000',recover:'0.0000',tax:null,input:null,report:'VAT_INPUT_EXEMPT',sequence:60},
      {code:'KE-NONVAT',name:'Kenya · Non-VAT sales',scope:'sale',rate:'0.0000',recover:'0.0000',tax:null,input:null,report:'NON_VAT_SALE',sequence:70},
      {code:'KE-NONVAT-PURCHASE',name:'Kenya · Non-VAT purchases',scope:'purchase',rate:'0.0000',recover:'0.0000',tax:null,input:null,report:'NON_VAT_PURCHASE',sequence:80},
    ];
    for(const d of definitions){
      await client.query(`INSERT INTO accounting_tax_codes(company_id,code,name,scope,behavior,computation,rate,fixed_amount,price_included,include_base_amount,recoverable_percent,tax_account_id,recoverable_account_id,jurisdiction_code,reporting_code,sequence,status,created_by,updated_by) VALUES($1,$2,$3,$4,'add','percent',$5,0,FALSE,FALSE,$6,$7,$8,'KE',$9,$10,'active',$11,$11) ON CONFLICT(company_id,code) WHERE deleted_at IS NULL DO UPDATE SET name=EXCLUDED.name,scope=EXCLUDED.scope,behavior='add',computation='percent',rate=EXCLUDED.rate,recoverable_percent=EXCLUDED.recoverable_percent,tax_account_id=EXCLUDED.tax_account_id,recoverable_account_id=EXCLUDED.recoverable_account_id,jurisdiction_code='KE',reporting_code=EXCLUDED.reporting_code,sequence=EXCLUDED.sequence,status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[context.companyId,d.code,d.name,d.scope,d.rate,d.recover,d.tax,d.input,d.report,d.sequence,context.userId]);
    }
    const source=await client.query(`SELECT id::text,code FROM accounting_tax_codes WHERE company_id=$1 AND deleted_at IS NULL AND code=ANY($2::text[])`,[context.companyId,definitions.map(d=>d.code)]);
    const idByCode=new Map(source.rows.map(row=>[String(row.code),String(row.id)]));
    const maps:[KenyaEtimsTaxType,string][]=[['A','KE-VAT-EXEMPT'],['B','KE-VAT-16-OUTPUT'],['C','KE-VAT-0-OUTPUT'],['D','KE-NONVAT']];
    for(const [type,code] of maps){
      const taxCodeId=idByCode.get(code);
      if(!taxCodeId)throw new AccountingInputError('SaMi could not resolve the installed Kenya tax code '+code+'.');
      await client.query(`UPDATE accounting_kenya_tax_mappings SET status='archived',updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND etims_tax_type_code=$2 AND tax_code_id<>$3 AND deleted_at IS NULL AND status='active'`,[context.companyId,type,taxCodeId,context.userId]);
      await client.query(`INSERT INTO accounting_kenya_tax_mappings(company_id,tax_code_id,etims_tax_type_code,status,is_legacy,created_by,updated_by) VALUES($1,$2,$3,'active',FALSE,$4,$4) ON CONFLICT(company_id,tax_code_id) WHERE deleted_at IS NULL DO UPDATE SET etims_tax_type_code=EXCLUDED.etims_tax_type_code,status='active',is_legacy=FALSE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[context.companyId,taxCodeId,type,context.userId]);
    }
    await client.query('COMMIT');
    await audit(context,'defaults_installed','Current Kenya VAT defaults installed',{vatRegistered});
    return {installed:definitions.length,mapped:maps.length};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function saveAccountingKenyaTaxMapping(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_kenya_tax_mappings','edit');
  const body=bodyOf(input),taxCodeId=accountingId(body.taxCodeId);
  const taxType=String(body.etimsTaxTypeCode||'').toUpperCase() as KenyaEtimsTaxType;
  if(!Object.prototype.hasOwnProperty.call(KENYA_ETIMS_TAX_TYPES,taxType))throw new AccountingInputError('Choose KRA tax type A, B, C, D or E.');
  const tax=await context.pool.query(`SELECT id::text,code,name,scope,behavior,computation,rate::text,effective_from::text,effective_to::text,status FROM accounting_tax_codes WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1`,[context.companyId,taxCodeId]);
  const row=tax.rows[0];
  if(!row||row.status!=='active')throw new AccountingInputError('Choose an active Accounting tax code.');
  if(!['sale','both'].includes(String(row.scope))||row.behavior!=='add'||row.computation!=='percent')throw new AccountingInputError('KRA A-E mappings require an active percentage sales tax code.');
  try{validateKenyaEtimsTaxMapping({taxType,rate:Number(row.rate),effectiveTo:row.effective_to?String(row.effective_to).slice(0,10):null});}
  catch(error){if(error instanceof KenyaTaxRuleError)throw new AccountingInputError(error.message);throw error;}
  const rule=KENYA_ETIMS_TAX_TYPES[taxType];
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`UPDATE accounting_kenya_tax_mappings SET status='archived',updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND etims_tax_type_code=$2 AND tax_code_id<>$3 AND deleted_at IS NULL AND status='active'`,[context.companyId,taxType,taxCodeId,context.userId]);
    const saved=await client.query(`INSERT INTO accounting_kenya_tax_mappings(company_id,tax_code_id,etims_tax_type_code,effective_from,effective_to,status,is_legacy,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'active',$6,$7,$7) ON CONFLICT(company_id,tax_code_id) WHERE deleted_at IS NULL DO UPDATE SET etims_tax_type_code=EXCLUDED.etims_tax_type_code,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,status='active',is_legacy=EXCLUDED.is_legacy,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING id::text`,[context.companyId,taxCodeId,taxType,row.effective_from||null,row.effective_to||null,!rule.current,context.userId]);
    await client.query('COMMIT');
    await audit(context,'mapping_saved','Kenya eTIMS tax mapping updated',{taxCodeId,taxType,legacy:!rule.current});
    return {id:String(saved.rows[0].id)};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function syncAccountingKenyaEtimsRegister(){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_kenya_settings','edit');
  if(String(context.company.currentCompany.currency).toUpperCase()!=='KES')throw new AccountingInputError('Kenya eTIMS tax-register sync currently requires KES as the Accounting company currency. Foreign-currency tax accounting is handled in Accounting Part 17.');
  const settings=await context.pool.query(`SELECT enabled,etims_sync_enabled FROM accounting_kenya_settings WHERE company_id=$1 LIMIT 1`,[context.companyId]);
  if(!settings.rows[0]?.enabled)throw new AccountingInputError('Enable Kenya accounting before synchronizing eTIMS.');
  if(!settings.rows[0]?.etims_sync_enabled)throw new AccountingInputError('Enable shared eTIMS register sync in Kenya accounting settings.');
  for(const table of ['invoicing_etims_submissions','invoicing_etims_tax_mappings','invoicing_invoices','invoicing_invoice_items','invoicing_credit_notes','invoicing_credit_note_items']){
    if(!(await tableAvailable(context,table)))throw new AccountingInputError('The Invoicing eTIMS integration is not installed for this workspace. Install/upgrade Invoicing before synchronizing.');
  }

  const client=await context.pool.connect();
  let runId='';
  try{
    await client.query('BEGIN');
    const run=await client.query(`INSERT INTO accounting_kenya_sync_runs(company_id,status,created_by) VALUES($1,'running',$2) RETURNING id::text`,[context.companyId,context.userId]);
    runId=String(run.rows[0].id);

    const sales=await client.query(`
      SELECT s.id::text AS submission_id,i.id::text AS source_id,i.invoice_date::text AS transaction_date,i.currency,
             s.receipt_no::text,s.sdc_id,s.mrc_no,s.solution_type,s.environment,tm.tax_type_code,
             km.tax_code_id::text,
             COALESCE(SUM(CASE WHEN jsonb_array_length(COALESCE(item.tax_components,'[]'::jsonb))=1
               AND COALESCE(item.tax_components->0->>'taxableAmount','') ~ '^\\d+(\\.\\d+)?$'
               THEN (item.tax_components->0->>'taxableAmount')::numeric
               ELSE GREATEST(item.subtotal-item.discount_amount,0) END),0)::text AS taxable_amount,
             COALESCE(SUM(item.tax_amount),0)::text AS tax_amount
      FROM invoicing_etims_submissions s
      JOIN invoicing_invoices i ON i.company_id=s.company_id AND i.id=s.invoice_id
      JOIN invoicing_invoice_items item ON item.company_id=i.company_id AND item.invoice_id=i.id
      LEFT JOIN invoicing_etims_tax_mappings tm ON tm.company_id=item.company_id AND tm.is_active=TRUE
       AND ((item.tax_rate_id IS NOT NULL AND tm.tax_rate_id=item.tax_rate_id)
         OR (item.tax_group_id IS NOT NULL AND tm.tax_group_id=item.tax_group_id))
      LEFT JOIN accounting_kenya_tax_mappings km ON km.company_id=s.company_id AND km.etims_tax_type_code=tm.tax_type_code
       AND km.status='active' AND km.deleted_at IS NULL
       AND (km.effective_from IS NULL OR km.effective_from<=i.invoice_date)
       AND (km.effective_to IS NULL OR km.effective_to>=i.invoice_date)
      WHERE s.company_id=$1 AND s.status='succeeded' AND s.submission_type='sale'
        AND (tm.tax_type_code IS NULL OR km.tax_code_id IS NULL OR NOT EXISTS(
          SELECT 1 FROM accounting_tax_ledger_entries e
          WHERE e.company_id=s.company_id AND e.source_module='invoicing'
            AND e.source_event_key=('etims:sale:'||s.id::text||':'||tm.tax_type_code)
            AND e.tax_code_id=km.tax_code_id AND e.deleted_at IS NULL))
      GROUP BY s.id,i.id,i.invoice_date,i.currency,s.receipt_no,s.sdc_id,s.mrc_no,s.solution_type,s.environment,tm.tax_type_code,km.tax_code_id
      ORDER BY i.invoice_date,s.id
    `,[context.companyId]);

    const credits=await client.query(`
      SELECT s.id::text AS submission_id,c.id::text AS source_id,c.issue_date::text AS transaction_date,c.currency,
             s.receipt_no::text,s.sdc_id,s.mrc_no,s.solution_type,s.environment,tm.tax_type_code,
             km.tax_code_id::text,
             COALESCE(SUM(CASE WHEN source_invoice.tax_calculation='inclusive'
               THEN GREATEST(ci.line_total-ci.tax_amount,0)
               ELSE GREATEST(ci.subtotal-ci.discount_amount,0) END),0)::text AS taxable_amount,
             COALESCE(SUM(ci.tax_amount),0)::text AS tax_amount
      FROM invoicing_etims_submissions s
      JOIN invoicing_credit_notes c ON c.company_id=s.company_id AND c.id=s.credit_note_id
      JOIN invoicing_credit_note_items ci ON ci.company_id=c.company_id AND ci.credit_note_id=c.id
      JOIN invoicing_invoices source_invoice ON source_invoice.company_id=c.company_id AND source_invoice.id=c.invoice_id
      LEFT JOIN invoicing_invoice_items source_item ON source_item.company_id=ci.company_id AND source_item.id=ci.invoice_item_id
      LEFT JOIN invoicing_etims_tax_mappings tm ON tm.company_id=ci.company_id AND tm.is_active=TRUE
       AND ((source_item.tax_rate_id IS NOT NULL AND tm.tax_rate_id=source_item.tax_rate_id)
         OR (source_item.tax_group_id IS NOT NULL AND tm.tax_group_id=source_item.tax_group_id))
      LEFT JOIN accounting_kenya_tax_mappings km ON km.company_id=s.company_id AND km.etims_tax_type_code=tm.tax_type_code
       AND km.status='active' AND km.deleted_at IS NULL
       AND (km.effective_from IS NULL OR km.effective_from<=c.issue_date)
       AND (km.effective_to IS NULL OR km.effective_to>=c.issue_date)
      WHERE s.company_id=$1 AND s.status='succeeded' AND s.submission_type='credit_note'
        AND (tm.tax_type_code IS NULL OR km.tax_code_id IS NULL OR NOT EXISTS(
          SELECT 1 FROM accounting_tax_ledger_entries e
          WHERE e.company_id=s.company_id AND e.source_module='invoicing'
            AND e.source_event_key=('etims:credit:'||s.id::text||':'||tm.tax_type_code)
            AND e.tax_code_id=km.tax_code_id AND e.deleted_at IS NULL))
      GROUP BY s.id,c.id,c.issue_date,c.currency,s.receipt_no,s.sdc_id,s.mrc_no,s.solution_type,s.environment,tm.tax_type_code,km.tax_code_id
      ORDER BY c.issue_date,s.id
    `,[context.companyId]);

    let inserted=0,replayed=0,unmapped=0;
    const rows=[...sales.rows.map(row=>({...row,effect:1,sourceType:'etims_sale',eventPrefix:'sale'})),...credits.rows.map(row=>({...row,effect:-1,sourceType:'etims_credit_note',eventPrefix:'credit'}))];
    for(const row of rows){
      const type=String(row.tax_type_code||'');
      if(!row.tax_code_id||!type){unmapped+=1;continue;}
      const result=await client.query(`INSERT INTO accounting_tax_ledger_entries(company_id,tax_code_id,source_module,source_type,source_id,source_event_key,transaction_date,taxable_amount,tax_amount,recoverable_amount,nonrecoverable_amount,currency,direction,entry_effect,authority,authority_reference,metadata,created_by)
        VALUES($1,$2,'invoicing',$3,$4,$5,$6,$7,$8,0,$8,'KES','sale',$9,'KRA_ETIMS',$10,$11::jsonb,$12)
        ON CONFLICT(company_id,source_module,source_event_key,tax_code_id) WHERE deleted_at IS NULL DO NOTHING RETURNING id`,[
        context.companyId,String(row.tax_code_id),String(row.sourceType),String(row.source_id),
        'etims:'+String(row.eventPrefix)+':'+String(row.submission_id)+':'+type,String(row.transaction_date).slice(0,10),
        decimalAmount(moneyCents(row.taxable_amount)),decimalAmount(moneyCents(row.tax_amount)),Number(row.effect),
        row.receipt_no?String(row.receipt_no):null,JSON.stringify({submissionId:row.submission_id,etimsTaxType:type,sdcId:row.sdc_id||null,mrcNo:row.mrc_no||null,solutionType:row.solution_type,environment:row.environment}),context.userId,
      ]);
      if(result.rowCount)inserted+=1;else replayed+=1;
    }
    const status=unmapped>0?'partial':'success';
    await client.query(`UPDATE accounting_kenya_sync_runs SET completed_at=NOW(),status=$3,inserted_count=$4,replayed_count=$5,unmapped_count=$6,source_count=$7 WHERE company_id=$1 AND id=$2`,[context.companyId,runId,status,inserted,replayed,unmapped,rows.length]);
    await client.query(`UPDATE accounting_kenya_settings SET last_etims_sync_at=NOW(),last_sync_status=$2,last_sync_inserted=$3,last_sync_unmapped=$4,last_sync_error=NULL,updated_by=$5,updated_at=NOW() WHERE company_id=$1`,[context.companyId,status,inserted,unmapped,context.userId]);
    await client.query('COMMIT');
    await audit(context,'etims_synced','Shared eTIMS fiscal records synchronized to the Accounting tax register',{inserted,replayed,unmapped,sourceCount:rows.length});
    return {inserted,replayed,unmapped,sourceCount:rows.length,status};
  }catch(error){
    try{await client.query('ROLLBACK');}catch{}
    const message=error instanceof Error?error.message:'Unknown eTIMS register synchronization error.';
    await context.pool.query(`UPDATE accounting_kenya_settings SET last_sync_status='error',last_sync_error=$2,updated_by=$3,updated_at=NOW() WHERE company_id=$1`,[context.companyId,message.slice(0,2000),context.userId]).catch(()=>{});
    throw error;
  }finally{client.release();}
}
