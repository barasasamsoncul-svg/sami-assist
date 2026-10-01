import 'server-only';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { AccountingInputError, accountingDate, accountingId } from './validation';
import {
  calculateLocalizationBoxes,
  nextLocalizationDueDate,
  type LocalizationEntry,
  type LocalizationRule,
} from './international-rules';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

const PACK_KEY='generic_vat_reporting';
const PACK_VERSION='1.0.0';

function bodyOf(input:unknown):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AccountingInputError('Enter valid international localization data.');
  return input as Record<string,unknown>;
}
function text(value:unknown,max:number,label:string,required=false){
  if(value!=null&&typeof value!=='string')throw new AccountingInputError(label+' must contain text.');
  const result=typeof value==='string'?value.trim():'';
  if(required&&!result)throw new AccountingInputError(label+' is required.');
  if(result.length>max)throw new AccountingInputError(label+' must be at most '+max+' characters.');
  return result;
}
function country(value:unknown,label='Country code'){
  const result=text(value,2,label,true).toUpperCase();
  if(!/^[A-Z]{2}$/.test(result))throw new AccountingInputError(label+' must be a two-letter ISO country code.');
  return result;
}
function locale(value:unknown){
  const result=text(value,32,'Locale',true).replace(/_/g,'-');
  if(!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(result))throw new AccountingInputError('Locale is invalid.');
  return result;
}
function choice<T extends string>(value:unknown,allowed:readonly T[],label:string):T{
  if(typeof value!=='string'||!allowed.includes(value as T))throw new AccountingInputError('Choose a valid '+label+'.');
  return value as T;
}
function numberValue(value:unknown,min:number,max:number,label:string){
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max)throw new AccountingInputError(label+' must be between '+min+' and '+max+'.');
  return n;
}
function bool(value:unknown,fallback=false){
  if(value===undefined||value===null)return fallback;
  return value===true||value==='true'||value==='1'||value===1;
}
async function tableAvailable(context:Context,name:string){
  const result=await context.pool.query('SELECT to_regclass($1) IS NOT NULL AS present',['public.'+name]);
  return Boolean(result.rows[0]?.present);
}
async function audit(context:Context,action:string,summary:string,metadata:Record<string,unknown>={}){
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.localization.'+action,module:'accounting',
    resourceType:'accounting_localization_settings',resourceId:context.companyId,
    summary,result:'success',metadata,
  }).catch(error=>console.error('[Accounting] Localization audit failed',error));
}
function today(){return new Date().toISOString().slice(0,10);}
function monthStart(){return today().slice(0,8)+'01';}
function normalizeEntry(row:Record<string,unknown>):LocalizationEntry{
  return {
    taxCodeId:String(row.tax_code_id),
    direction:String(row.direction) as LocalizationEntry['direction'],
    entryEffect:Number(row.entry_effect||1),
    taxableAmount:String(row.taxable_amount||'0'),
    taxAmount:String(row.tax_amount||'0'),
    recoverableAmount:String(row.recoverable_amount||'0'),
    nonrecoverableAmount:String(row.nonrecoverable_amount||'0'),
  };
}
function normalizeRule(row:Record<string,unknown>):LocalizationRule{
  return {
    boxId:String(row.box_id),
    taxCodeId:String(row.tax_code_id),
    direction:String(row.direction) as LocalizationRule['direction'],
    amountField:String(row.amount_field) as LocalizationRule['amountField'],
    multiplier:String(row.multiplier),
  };
}

async function buildInternationalState(
  context:Context,
  input:{from?:unknown;to?:unknown}={},
){
  const from=input.from?accountingDate(input.from):monthStart();
  const to=input.to?accountingDate(input.to):today();
  if(from>to)throw new AccountingInputError('Localization reporting start date cannot be after the end date.');

  const [companyResult,settingsResult,boxesResult,taxCodesResult,entriesResult,runsResult,packHistoryResult]=await Promise.all([
    context.pool.query(`SELECT id::text,name,legal_name,country,country_code,fiscal_country,currency,locale,timezone,tax_id,registration_number FROM companies WHERE id=$1 LIMIT 1`,[context.companyId]),
    context.pool.query(`SELECT company_id::text,enabled,country_code,jurisdiction_code,locale,accounting_framework,tax_authority_name,tax_identifier_label,filing_frequency,filing_day,e_invoice_policy,preferred_e_invoice_network,pack_key,pack_version,status,metadata FROM accounting_localization_settings WHERE company_id=$1 LIMIT 1`,[context.companyId]),
    context.pool.query(`SELECT b.id::text,b.code,b.label,b.description,b.sequence,b.status,
      COALESCE(json_agg(json_build_object(
        'id',r.id::text,'taxCodeId',r.tax_code_id::text,'taxCode',t.code,'taxName',t.name,
        'direction',r.direction,'amountField',r.amount_field,'multiplier',r.multiplier::text,'status',r.status
      ) ORDER BY t.code,r.direction,r.amount_field) FILTER(WHERE r.id IS NOT NULL AND r.deleted_at IS NULL),'[]'::json) AS rules
      FROM accounting_localization_report_boxes b
      LEFT JOIN accounting_localization_report_rules r ON r.company_id=b.company_id AND r.box_id=b.id AND r.deleted_at IS NULL
      LEFT JOIN accounting_tax_codes t ON t.company_id=r.company_id AND t.id=r.tax_code_id AND t.deleted_at IS NULL
      WHERE b.company_id=$1 AND b.deleted_at IS NULL
      GROUP BY b.id ORDER BY b.status,b.sequence,b.code`,[context.companyId]),
    context.pool.query(`SELECT id::text,code,name,scope,behavior,computation,rate::text,recoverable_percent::text,jurisdiction_code,reporting_code,effective_from::text,effective_to::text,status
      FROM accounting_tax_codes WHERE company_id=$1 AND deleted_at IS NULL ORDER BY status,sequence,code`,[context.companyId]),
    context.pool.query(`SELECT e.tax_code_id::text,e.direction,e.entry_effect,e.taxable_amount::text,e.tax_amount::text,e.recoverable_amount::text,e.nonrecoverable_amount::text
      FROM accounting_tax_ledger_entries e
      WHERE e.company_id=$1 AND e.deleted_at IS NULL AND e.transaction_date BETWEEN $2 AND $3`,[context.companyId,from,to]),
    context.pool.query(`SELECT id::text,period_start::text,period_end::text,country_code,jurisdiction_code,currency,pack_key,pack_version,status,totals,diagnostics,generated_at::text,finalized_at::text
      FROM accounting_localization_report_runs WHERE company_id=$1 ORDER BY generated_at DESC LIMIT 25`,[context.companyId]),
    context.pool.query(`SELECT id::text,pack_key,pack_version,country_code,action,metadata,created_at::text FROM accounting_localization_pack_history WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20`,[context.companyId]),
  ]);
  const company=companyResult.rows[0]||{};
  const settings=settingsResult.rows[0]||{
    enabled:false,country_code:company.country_code||null,jurisdiction_code:company.country_code||null,
    locale:company.locale||'en',accounting_framework:'local_gaap',tax_authority_name:null,tax_identifier_label:'Tax ID',
    filing_frequency:'monthly',filing_day:20,e_invoice_policy:'optional',preferred_e_invoice_network:null,
    pack_key:null,pack_version:null,status:'active',metadata:{},
  };

  const activeRules=boxesResult.rows.flatMap(box=>
    Array.isArray(box.rules)
      ? box.rules.filter((rule:Record<string,unknown>)=>rule.status==='active').map((rule:Record<string,unknown>)=>({
          boxId:String(box.id),taxCodeId:String(rule.taxCodeId),direction:String(rule.direction),
          amountField:String(rule.amountField),multiplier:String(rule.multiplier),
        }) as LocalizationRule)
      : []
  );
  const entries=entriesResult.rows.map(normalizeEntry);
  const boxTotals=calculateLocalizationBoxes(entries,activeRules);
  const boxes=boxesResult.rows.map(row=>({...row,total:boxTotals[String(row.id)]||'0.00'}));

  const usedTaxCodes=[...new Set(entries.map(entry=>entry.taxCodeId))];
  const mappedTaxCodes=new Set(activeRules.map(rule=>rule.taxCodeId));
  const unmappedUsedTaxCodes=taxCodesResult.rows.filter(row=>usedTaxCodes.includes(String(row.id))&&!mappedTaxCodes.has(String(row.id)));

  const eInvoiceTables=await Promise.all([
    tableAvailable(context,'invoicing_einvoice_profiles'),
    tableAvailable(context,'invoicing_einvoice_participants'),
    tableAvailable(context,'invoicing_einvoice_documents'),
    tableAvailable(context,'invoicing_invoices'),
    tableAvailable(context,'invoicing_credit_notes'),
  ]);
  const eInvoiceAvailable=eInvoiceTables.every(Boolean);
  let profiles:Array<Record<string,unknown>>=[];
  let participantCountries:Array<Record<string,unknown>>=[];
  let eInvoiceMetrics={issuedInvoices:0,validDocuments:0,acceptedOrExported:0,rejectedOrFailed:0,missingStrongEvidence:0};
  if(eInvoiceAvailable){
    const [profileRows,countries,metrics]=await Promise.all([
      context.pool.query(`SELECT id::text,name,network_key,provider_key,environment,status,syntax_key,supplier_country_code,supplier_endpoint_scheme,supplier_endpoint_id,customization_id,process_id,is_default,last_success_at::text,last_error_at::text,last_error_code,last_error_message
        FROM invoicing_einvoice_profiles WHERE company_id=$1 AND deleted_at IS NULL ORDER BY is_default DESC,name`,[context.companyId]),
      context.pool.query(`SELECT country_code,COUNT(*)::int AS participant_count FROM invoicing_einvoice_participants WHERE company_id=$1 AND is_active=TRUE GROUP BY country_code ORDER BY participant_count DESC,country_code LIMIT 30`,[context.companyId]),
      context.pool.query(`WITH issued AS (
          SELECT i.id,i.invoice_date
          FROM invoicing_invoices i
          WHERE i.company_id=$1 AND i.deleted_at IS NULL AND i.invoice_date BETWEEN $2 AND $3
            AND i.status IN ('confirmed','sent','viewed','partially_paid','paid','overdue','written_off')
        ), evidence AS (
          SELECT DISTINCT d.invoice_id,
            BOOL_OR(d.validation_status='valid') AS has_valid,
            BOOL_OR(d.transmission_status IN ('accepted','exported')) AS has_strong,
            BOOL_OR(d.transmission_status IN ('rejected','failed')) AS has_failure
          FROM invoicing_einvoice_documents d
          WHERE d.company_id=$1 AND d.invoice_id IS NOT NULL
          GROUP BY d.invoice_id
        )
        SELECT COUNT(*)::int AS issued_invoices,
          COUNT(*) FILTER(WHERE COALESCE(e.has_valid,FALSE))::int AS valid_documents,
          COUNT(*) FILTER(WHERE COALESCE(e.has_strong,FALSE))::int AS accepted_or_exported,
          COUNT(*) FILTER(WHERE COALESCE(e.has_failure,FALSE))::int AS rejected_or_failed,
          COUNT(*) FILTER(WHERE NOT COALESCE(e.has_strong,FALSE))::int AS missing_strong_evidence
        FROM issued i LEFT JOIN evidence e ON e.invoice_id=i.id`,[context.companyId,from,to]),
    ]);
    profiles=profileRows.rows;
    participantCountries=countries.rows;
    eInvoiceMetrics={
      issuedInvoices:Number(metrics.rows[0]?.issued_invoices||0),
      validDocuments:Number(metrics.rows[0]?.valid_documents||0),
      acceptedOrExported:Number(metrics.rows[0]?.accepted_or_exported||0),
      rejectedOrFailed:Number(metrics.rows[0]?.rejected_or_failed||0),
      missingStrongEvidence:Number(metrics.rows[0]?.missing_strong_evidence||0),
    };
  }

  const diagnostics:Array<{level:'info'|'warning'|'error';code:string;message:string}>=[];
  if(!settings.enabled)diagnostics.push({level:'warning',code:'LOCALIZATION_DISABLED',message:'International localization is not enabled for this company.'});
  if(!company.country_code)diagnostics.push({level:'warning',code:'COMPANY_COUNTRY_MISSING',message:'Set the company ISO country code in Organization settings.'});
  if(settings.country_code&&company.country_code&&settings.country_code!==company.country_code)diagnostics.push({level:'warning',code:'COUNTRY_MISMATCH',message:'Localization country differs from the company country profile.'});
  const activeTaxCodes=taxCodesResult.rows.filter(row=>row.status==='active');
  const noJurisdiction=activeTaxCodes.filter(row=>!row.jurisdiction_code);
  if(noJurisdiction.length)diagnostics.push({level:'warning',code:'TAX_JURISDICTION_MISSING',message:String(noJurisdiction.length)+' active tax code(s) have no jurisdiction code.'});
  if(unmappedUsedTaxCodes.length)diagnostics.push({level:'error',code:'USED_TAX_UNMAPPED',message:String(unmappedUsedTaxCodes.length)+' tax code(s) used in this period are not mapped to any localization report box.'});
  if(settings.e_invoice_policy==='required'&&!eInvoiceAvailable)diagnostics.push({level:'error',code:'EINVOICE_STACK_UNAVAILABLE',message:'E-invoicing is marked required but the Invoicing e-invoicing stack is not installed.'});
  if(settings.e_invoice_policy==='required'&&eInvoiceAvailable&&eInvoiceMetrics.missingStrongEvidence>0)diagnostics.push({level:'error',code:'EINVOICE_EVIDENCE_GAP',message:String(eInvoiceMetrics.missingStrongEvidence)+' issued invoice(s) in this period have no accepted/exported e-invoice evidence.'});
  if(profiles.some(row=>row.status==='error'))diagnostics.push({level:'error',code:'EINVOICE_PROFILE_ERROR',message:'At least one shared e-invoicing profile is in an error state.'});

  return {
    companyId:context.companyId,
    currency:String(company.currency||context.company.currentCompany.currency),
    from,to,company,settings,boxes,taxCodes:taxCodesResult.rows,
    diagnostics,unmappedUsedTaxCodes,
    nextDueDate:nextLocalizationDueDate({
      periodEnd:to,
      filingFrequency:String(settings.filing_frequency||'monthly') as 'monthly'|'quarterly'|'annual'|'custom',
      filingDay:Number(settings.filing_day||20),
    }),
    eInvoicing:{
      available:eInvoiceAvailable,
      profiles,
      participantCountries,
      metrics:eInvoiceMetrics,
      standards:{
        syntax:'UBL 2.1',
        network:'Peppol BIS Billing 3.0 / custom EDI',
        architecture:'Shared read-only evidence from Invoicing',
      },
    },
    runs:runsResult.rows,
    packHistory:packHistoryResult.rows,
    pack:{key:PACK_KEY,version:PACK_VERSION,name:'Generic VAT reporting control pack'},
  };
}

export async function getAccountingInternational(input:{from?:unknown;to?:unknown}={}){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_settings','view');
  return buildInternationalState(context,input);
}
export type AccountingInternationalWorkspace=Awaited<ReturnType<typeof getAccountingInternational>>;

export async function saveAccountingInternationalSettings(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_settings','edit');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  const enabled=bool(body.enabled,true);
  const countryCode=country(body.countryCode);
  const jurisdictionCode=text(body.jurisdictionCode,80,'Jurisdiction code',true).toUpperCase();
  const normalizedLocale=locale(body.locale||'en');
  const framework=choice(body.accountingFramework,['ifrs','local_gaap','us_gaap','other'] as const,'accounting framework');
  const frequency=choice(body.filingFrequency,['monthly','quarterly','annual','custom'] as const,'filing frequency');
  const filingDay=Math.trunc(numberValue(body.filingDay??20,1,28,'Filing day'));
  const policy=choice(body.eInvoicePolicy,['none','optional','required'] as const,'e-invoice policy');
  const network=body.preferredEInvoiceNetwork
    ? choice(body.preferredEInvoiceNetwork,['peppol','custom_edi'] as const,'e-invoice network')
    : null;
  await context.pool.query(`INSERT INTO accounting_localization_settings(
      company_id,enabled,country_code,jurisdiction_code,locale,accounting_framework,tax_authority_name,tax_identifier_label,
      filing_frequency,filing_day,e_invoice_policy,preferred_e_invoice_network,status,created_by,updated_by
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,$13)
    ON CONFLICT(company_id) DO UPDATE SET
      enabled=EXCLUDED.enabled,country_code=EXCLUDED.country_code,jurisdiction_code=EXCLUDED.jurisdiction_code,
      locale=EXCLUDED.locale,accounting_framework=EXCLUDED.accounting_framework,tax_authority_name=EXCLUDED.tax_authority_name,
      tax_identifier_label=EXCLUDED.tax_identifier_label,filing_frequency=EXCLUDED.filing_frequency,
      filing_day=EXCLUDED.filing_day,e_invoice_policy=EXCLUDED.e_invoice_policy,
      preferred_e_invoice_network=EXCLUDED.preferred_e_invoice_network,status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
      context.companyId,enabled,countryCode,jurisdictionCode,normalizedLocale,framework,
      text(body.taxAuthorityName,180,'Tax authority')||null,text(body.taxIdentifierLabel,80,'Tax identifier label')||'Tax ID',
      frequency,filingDay,policy,network,context.userId,
    ]);
  await audit(context,'settings_saved','International localization settings updated',{countryCode,jurisdictionCode,frequency,policy});
  return {enabled,countryCode,jurisdictionCode,locale:normalizedLocale,framework,frequency,filingDay,policy,network};
}

export async function installGenericVatLocalizationPack(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_settings','edit');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before installing a localization pack.');
  const profile=await context.pool.query(`SELECT country_code,locale FROM companies WHERE id=$1 LIMIT 1`,[context.companyId]);
  const countryCode=country(body.countryCode||profile.rows[0]?.country_code);
  const jurisdictionCode=text(body.jurisdictionCode||countryCode,80,'Jurisdiction code',true).toUpperCase();
  const normalizedLocale=locale(body.locale||profile.rows[0]?.locale||'en');
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const prior=await client.query(`SELECT pack_key,pack_version FROM accounting_localization_settings WHERE company_id=$1 FOR UPDATE`,[context.companyId]);
    const action=prior.rows[0]?.pack_key===PACK_KEY?'reinstalled':'installed';
    await client.query(`INSERT INTO accounting_localization_settings(company_id,enabled,country_code,jurisdiction_code,locale,pack_key,pack_version,status,created_by,updated_by)
      VALUES($1,TRUE,$2,$3,$4,$5,$6,'active',$7,$7)
      ON CONFLICT(company_id) DO UPDATE SET enabled=TRUE,country_code=EXCLUDED.country_code,jurisdiction_code=EXCLUDED.jurisdiction_code,
        locale=EXCLUDED.locale,pack_key=EXCLUDED.pack_key,pack_version=EXCLUDED.pack_version,status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
      context.companyId,countryCode,jurisdictionCode,normalizedLocale,PACK_KEY,PACK_VERSION,context.userId,
    ]);
    const boxes=[
      ['SALES_NET','Taxable sales / supplies','Net taxable sales or supplies before tax',10],
      ['OUTPUT_TAX','Output tax','Tax charged on sales or supplies',20],
      ['PURCHASE_NET','Taxable purchases','Net taxable purchases before tax',30],
      ['INPUT_TAX','Input tax','Tax charged on purchases',40],
      ['RECOVERABLE_INPUT','Recoverable input tax','Purchase tax eligible for recovery',50],
      ['NONRECOVERABLE_INPUT','Nonrecoverable input tax','Purchase tax expensed or capitalized rather than recovered',60],
      ['WITHHOLDING_TAX','Withholding tax','Withholding tax recorded in the tax register',70],
      ['NET_TAX_DUE','Net tax due control','Output tax less recoverable input tax',80],
    ] as const;
    const ids=new Map<string,string>();
    for(const [code,label,description,sequence] of boxes){
      const saved=await client.query(`INSERT INTO accounting_localization_report_boxes(company_id,code,label,description,sequence,status,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,'active',$6,$6)
        ON CONFLICT(company_id,code) WHERE deleted_at IS NULL DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,sequence=EXCLUDED.sequence,status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()
        RETURNING id::text`,[context.companyId,code,label,description,sequence,context.userId]);
      ids.set(code,String(saved.rows[0].id));
    }
    const taxCodes=await client.query(`SELECT id::text,scope,behavior,jurisdiction_code FROM accounting_tax_codes
      WHERE company_id=$1 AND deleted_at IS NULL AND status='active'
        AND (jurisdiction_code IS NULL OR jurisdiction_code=$2 OR jurisdiction_code=$3)
      ORDER BY sequence,code FOR SHARE`,[context.companyId,jurisdictionCode,countryCode]);
    let ruleCount=0;
    async function addRule(boxCode:string,taxCodeId:string,direction:string,amountField:string,multiplier:number){
      const boxId=ids.get(boxCode);if(!boxId)return;
      await client.query(`INSERT INTO accounting_localization_report_rules(company_id,box_id,tax_code_id,direction,amount_field,multiplier,status,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,'active',$7,$7)
        ON CONFLICT(company_id,box_id,tax_code_id,direction,amount_field) WHERE deleted_at IS NULL
        DO UPDATE SET multiplier=EXCLUDED.multiplier,status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[
        context.companyId,boxId,taxCodeId,direction,amountField,multiplier,context.userId,
      ]);
      ruleCount+=1;
    }
    for(const tax of taxCodes.rows){
      const id=String(tax.id),scope=String(tax.scope),behavior=String(tax.behavior);
      if(behavior==='add'&&(scope==='sale'||scope==='both')){
        await addRule('SALES_NET',id,'sale','taxable',1);
        await addRule('OUTPUT_TAX',id,'sale','tax',1);
        await addRule('NET_TAX_DUE',id,'sale','tax',1);
      }
      if(behavior==='add'&&(scope==='purchase'||scope==='both')){
        await addRule('PURCHASE_NET',id,'purchase','taxable',1);
        await addRule('INPUT_TAX',id,'purchase','tax',1);
        await addRule('RECOVERABLE_INPUT',id,'purchase','recoverable',1);
        await addRule('NONRECOVERABLE_INPUT',id,'purchase','nonrecoverable',1);
        await addRule('NET_TAX_DUE',id,'purchase','recoverable',-1);
      }
      if(behavior==='withhold'||scope==='withholding'){
        await addRule('WITHHOLDING_TAX',id,'withholding','tax',1);
      }
    }
    await client.query(`INSERT INTO accounting_localization_pack_history(company_id,pack_key,pack_version,country_code,action,installed_by,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[
      context.companyId,PACK_KEY,PACK_VERSION,countryCode,action,context.userId,
      JSON.stringify({jurisdictionCode,boxCount:boxes.length,ruleCount,taxCodeCount:taxCodes.rows.length}),
    ]);
    await client.query('COMMIT');
    await audit(context,'pack_installed','Generic international VAT reporting pack installed',{countryCode,jurisdictionCode,boxCount:boxes.length,ruleCount});
    return {packKey:PACK_KEY,packVersion:PACK_VERSION,boxCount:boxes.length,ruleCount,taxCodeCount:taxCodes.rows.length};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function createLocalizationReportBox(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_report_boxes','create');
  const body=bodyOf(input);
  if(accountingId(body.expectedCompanyId)!==context.companyId)throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  const code=text(body.code,60,'Box code',true).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]{0,59}$/.test(code))throw new AccountingInputError('Box code can contain uppercase letters, numbers, underscores and hyphens.');
  const label=text(body.label,180,'Box label',true);
  const result=await context.pool.query(`INSERT INTO accounting_localization_report_boxes(company_id,code,label,description,sequence,status,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,'active',$6,$6) RETURNING id::text`,[
    context.companyId,code,label,text(body.description,1000,'Description')||null,
    Math.max(0,Math.min(100000,Math.trunc(Number(body.sequence??100)||100))),context.userId,
  ]).catch(error=>{if((error as {code?:string})?.code==='23505')throw new AccountingInputError('This reporting box code already exists.');throw error;});
  await audit(context,'box_created','Localization reporting box created',{code});
  return {id:String(result.rows[0].id)};
}

export async function setLocalizationBoxStatus(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_report_boxes','edit');
  const body=bodyOf(input),boxId=accountingId(body.boxId);
  const status=choice(body.status,['active','archived'] as const,'box status');
  const result=await context.pool.query(`UPDATE accounting_localization_report_boxes SET status=$3,updated_by=$4,updated_at=NOW() WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id::text,code`,[
    context.companyId,boxId,status,context.userId,
  ]);
  if(!result.rows[0])throw new AccountingInputError('Localization reporting box not found.');
  await audit(context,'box_status','Localization reporting box status changed',{boxId,status,code:result.rows[0].code});
  return {id:boxId,status};
}

export async function saveLocalizationReportRule(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_report_rules','edit');
  const body=bodyOf(input),boxId=accountingId(body.boxId),taxCodeId=accountingId(body.taxCodeId);
  const direction=choice(body.direction,['sale','purchase','withholding','any'] as const,'reporting direction');
  const amountField=choice(body.amountField,['taxable','tax','recoverable','nonrecoverable'] as const,'amount source');
  const multiplier=numberValue(body.multiplier??1,-1000,1000,'Multiplier');
  if(multiplier===0)throw new AccountingInputError('Multiplier cannot be zero.');
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const valid=await client.query(`SELECT b.id AS box_id,t.id AS tax_id FROM accounting_localization_report_boxes b
      CROSS JOIN accounting_tax_codes t WHERE b.company_id=$1 AND b.id=$2 AND b.deleted_at IS NULL AND b.status='active'
      AND t.company_id=$1 AND t.id=$3 AND t.deleted_at IS NULL AND t.status='active' LIMIT 1 FOR SHARE`,[context.companyId,boxId,taxCodeId]);
    if(!valid.rows[0])throw new AccountingInputError('Choose an active localization box and active Accounting tax code.');
    const result=await client.query(`INSERT INTO accounting_localization_report_rules(company_id,box_id,tax_code_id,direction,amount_field,multiplier,status,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,'active',$7,$7)
      ON CONFLICT(company_id,box_id,tax_code_id,direction,amount_field) WHERE deleted_at IS NULL
      DO UPDATE SET multiplier=EXCLUDED.multiplier,status='active',updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING id::text`,[context.companyId,boxId,taxCodeId,direction,amountField,multiplier,context.userId]);
    await client.query('COMMIT');
    await audit(context,'rule_saved','Localization reporting rule saved',{boxId,taxCodeId,direction,amountField,multiplier});
    return {id:String(result.rows[0].id)};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}

export async function archiveLocalizationReportRule(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_report_rules','edit');
  const body=bodyOf(input),ruleId=accountingId(body.ruleId);
  const result=await context.pool.query(`UPDATE accounting_localization_report_rules SET status='archived',updated_by=$3,updated_at=NOW() WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id::text`,[
    context.companyId,ruleId,context.userId,
  ]);
  if(!result.rows[0])throw new AccountingInputError('Localization reporting rule not found.');
  await audit(context,'rule_archived','Localization reporting rule archived',{ruleId});
  return {id:ruleId,status:'archived'};
}

export async function createLocalizationReportRun(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_report_runs','create');
  const body=bodyOf(input);
  const from=accountingDate(body.from),to=accountingDate(body.to);
  const state=await buildInternationalState(context,{from,to});
  const totals=Object.fromEntries(state.boxes.filter(row=>row.status==='active').map(row=>[String(row.code),String(row.total)]));
  const result=await context.pool.query(`INSERT INTO accounting_localization_report_runs(
      company_id,period_start,period_end,country_code,jurisdiction_code,currency,pack_key,pack_version,status,totals,diagnostics,generated_by,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9::jsonb,$10::jsonb,$11,$12::jsonb) RETURNING id::text`,[
      context.companyId,from,to,state.settings.country_code||null,state.settings.jurisdiction_code||null,state.currency,
      state.settings.pack_key||null,state.settings.pack_version||null,JSON.stringify(totals),JSON.stringify(state.diagnostics),context.userId,
      JSON.stringify({nextDueDate:state.nextDueDate,eInvoiceMetrics:state.eInvoicing.metrics,unmappedUsedTaxCodes:state.unmappedUsedTaxCodes.map(row=>row.code)}),
    ]);
  await audit(context,'report_snapshot','Localization report snapshot generated',{reportRunId:result.rows[0].id,from,to});
  return {id:String(result.rows[0].id),status:'draft'};
}

export async function finalizeLocalizationReportRun(input:unknown){
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_localization_report_runs','edit');
  const body=bodyOf(input),runId=accountingId(body.runId);
  const client=await context.pool.connect();
  try{
    await client.query('BEGIN');
    const run=await client.query(`SELECT id::text,status,diagnostics FROM accounting_localization_report_runs WHERE company_id=$1 AND id=$2 LIMIT 1 FOR UPDATE`,[context.companyId,runId]);
    if(!run.rows[0])throw new AccountingInputError('Localization report snapshot not found.');
    if(run.rows[0].status==='finalized'){await client.query('COMMIT');return{id:runId,status:'finalized',replayed:true};}
    if(run.rows[0].status!=='draft')throw new AccountingInputError('Only a draft localization report snapshot can be finalized.');
    const diagnostics=Array.isArray(run.rows[0].diagnostics)?run.rows[0].diagnostics:[];
    if(diagnostics.some((item:Record<string,unknown>)=>item.level==='error'))throw new AccountingInputError('Resolve localization report errors before finalizing this snapshot.');
    await client.query(`UPDATE accounting_localization_report_runs SET status='finalized',finalized_by=$3,finalized_at=NOW() WHERE company_id=$1 AND id=$2`,[context.companyId,runId,context.userId]);
    await client.query('COMMIT');
    await audit(context,'report_finalized','Localization report snapshot finalized',{reportRunId:runId});
    return {id:runId,status:'finalized',replayed:false};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}
