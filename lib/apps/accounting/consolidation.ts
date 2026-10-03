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

type Context = Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

const RATE_SCALE = BigInt(100000000);
const OWNERSHIP_SCALE = BigInt(1000000);

function bodyOf(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid consolidation data.');
  }
  return input as Record<string,unknown>;
}

function shortText(value: unknown,max: number,label: string,required=true) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new AccountingInputError(label + ' must contain text.');
  }
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new AccountingInputError(label + ' is required.');
  if (result.length > max) throw new AccountingInputError(label + ' must not exceed ' + max + ' characters.');
  return result;
}

function bool(value: unknown,fallback=false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === false) return value;
  throw new AccountingInputError('Choose a valid enabled or disabled value.');
}

function currency(value: unknown,label='Currency') {
  const result=String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) throw new AccountingInputError(label + ' must use a three-letter ISO code.');
  return result;
}

function hashPayload(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function signedCents(value: unknown,label: string) {
  const raw=String(value ?? '').trim();
  if (!/^[+-]?\d{1,16}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError(label + ' must be a valid amount.');
  }
  const negative=raw.startsWith('-');
  const unsigned=raw.startsWith('-') || raw.startsWith('+') ? raw.slice(1) : raw;
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let result=BigInt(whole || '0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if (Number(padded[2]||'0')>=5) result+=BigInt(1);
  return negative ? -result : result;
}

function positiveCents(value: unknown,label: string) {
  const amount=signedCents(value,label);
  if (amount<=BigInt(0)) throw new AccountingInputError(label + ' must be greater than zero.');
  return amount;
}

function money(value: bigint) {
  const negative=value<BigInt(0);
  const absolute=negative ? -value : value;
  return (negative?'-':'')+String(absolute/BigInt(100))+'.'+String(absolute%BigInt(100)).padStart(2,'0');
}

function rateUnits(value: unknown) {
  const raw=String(value ?? '').trim();
  if (!/^\d{1,10}(?:\.\d{1,8})?$/.test(raw)) {
    throw new AccountingInputError('FX rate must be a positive decimal with up to eight decimal places.');
  }
  const [whole,fraction='']=raw.split('.');
  const units=BigInt(whole)*RATE_SCALE+BigInt(fraction.padEnd(8,'0'));
  if (units<=BigInt(0)) throw new AccountingInputError('FX rate must be greater than zero.');
  return units;
}

function rateDecimal(units: bigint) {
  return String(units/RATE_SCALE)+'.'+String(units%RATE_SCALE).padStart(8,'0');
}

function ownershipUnits(value: unknown) {
  const raw=String(value ?? '').trim();
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError('Ownership percent must be between 0 and 100.');
  }
  const [whole,fraction='']=raw.split('.');
  const units=BigInt(whole)*BigInt(10000)+BigInt(fraction.padEnd(4,'0'));
  if (units<=BigInt(0) || units>OWNERSHIP_SCALE) {
    throw new AccountingInputError('Ownership percent must be greater than 0 and no more than 100.');
  }
  return units;
}

function ownershipDecimal(units: bigint) {
  return String(units/BigInt(10000))+'.'+String(units%BigInt(10000)).padStart(4,'0');
}

function translate(amount: bigint,rate: bigint,ownership: bigint) {
  const numerator=amount*rate*ownership;
  const denominator=RATE_SCALE*OWNERSHIP_SCALE;
  const negative=numerator<BigInt(0);
  const absolute=negative ? -numerator : numerator;
  const rounded=(absolute+denominator/BigInt(2))/denominator;
  return negative ? -rounded : rounded;
}

function rateTypeForAccount(accountType: unknown) {
  const type=String(accountType || '').toLowerCase();
  if (type === 'income' || type.startsWith('income_') || type === 'revenue' || type.startsWith('revenue_') ||
      type === 'expense' || type.startsWith('expense_') || type === 'cost' || type.startsWith('cost_')) {
    return 'average';
  }
  if (type === 'equity' || type.startsWith('equity_')) return 'historical';
  return 'closing';
}

function method(value: unknown) {
  if (value === 'full' || value === 'proportional') return value;
  throw new AccountingInputError('Choose full or proportional consolidation.');
}

function rateType(value: unknown) {
  if (value === 'closing' || value === 'average' || value === 'historical') return value;
  throw new AccountingInputError('Choose closing, average or historical FX rate.');
}

function groupStatus(value: unknown) {
  if (value === 'draft' || value === 'active' || value === 'closed') return value;
  throw new AccountingInputError('Choose draft, active or closed consolidation status.');
}

async function audit(
  context: Context,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: string,
  metadata: Record<string,unknown> = {},
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:context.tenantId,
      companyId:context.companyId,
      userId:context.userId,
      action:'accounting.consolidation.'+action,
      module:'accounting',
      resourceType,
      resourceId,
      summary,
      metadata,
    });
  } catch (error) {
    console.error('[Accounting] Consolidation audit failed',error);
  }
}

async function groupForAccess(
  client: Pick<PoolClient,'query'>,
  companyId: string,
  groupId: string,
  lock=false,
) {
  const result=await client.query(
    "SELECT * FROM accounting_consolidation_groups WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL LIMIT 1"+(lock?" FOR UPDATE":""),
    [groupId,companyId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Consolidation group could not be found for the active company.');
  return result.rows[0];
}

function assertAllowedCompany(context: Context,companyId: string) {
  if (!context.company.allowedCompanyIds.includes(companyId)) {
    throw new AccountingInputError('You do not have access to one of the consolidation companies.');
  }
}

async function assertMember(
  client: Pick<PoolClient,'query'>,
  companyId: string,
  groupId: string,
  memberCompanyId: string,
) {
  const result=await client.query(
    "SELECT id::text FROM accounting_consolidation_members WHERE company_id=$1 AND group_id=$2 AND member_company_id=$3 AND deleted_at IS NULL AND enabled=TRUE LIMIT 1",
    [companyId,groupId,memberCompanyId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Add this company to the consolidation group first.');
}

export async function getAccountingConsolidation() {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_consolidation_groups',
    'view',
  );
  const allowedIds=context.company.allowedCompanyIds;
  const [settings,groups,members,mappings,rates,eliminations,runs,accounts]=await Promise.all([
    context.pool.query(
      "SELECT enabled,require_complete_mapping,default_presentation_currency FROM accounting_consolidation_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,name,code,presentation_currency,translation_adjustment_code,translation_adjustment_name,status,notes,created_at,closed_at FROM accounting_consolidation_groups WHERE company_id=$1 AND deleted_at IS NULL ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,LOWER(name)",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT m.id::text,m.group_id::text,m.member_company_id::text,c.name AS member_company_name,c.currency,m.consolidation_method,m.ownership_percent::text,m.effective_from::text,m.effective_to::text,m.enabled FROM accounting_consolidation_members m INNER JOIN companies c ON c.id=m.member_company_id WHERE m.company_id=$1 AND m.deleted_at IS NULL ORDER BY c.name",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT m.id::text,m.group_id::text,m.member_company_id::text,m.source_account_id::text,a.code AS source_code,a.name AS source_name,a.account_type AS source_type,m.consolidated_code,m.consolidated_name,m.consolidated_type,m.sign_multiplier FROM accounting_consolidation_account_mappings m INNER JOIN accounts a ON a.id=m.source_account_id AND a.company_id=m.member_company_id WHERE m.company_id=$1 AND m.deleted_at IS NULL ORDER BY m.consolidated_code,a.code",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,group_id::text,member_company_id::text,rate_date::text,rate_type,source_currency,presentation_currency,rate::text FROM accounting_consolidation_rates WHERE company_id=$1 AND deleted_at IS NULL ORDER BY rate_date DESC,rate_type",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT id::text,group_id::text,elimination_date::text,reference,name,debit_code,debit_name,debit_type,credit_code,credit_name,credit_type,amount::text,currency,status,finalized_at FROM accounting_consolidation_eliminations WHERE company_id=$1 AND deleted_at IS NULL ORDER BY elimination_date DESC,created_at DESC LIMIT 300",
      [context.companyId],
    ),
    context.pool.query(
      "SELECT r.id::text,r.group_id::text,g.name AS group_name,r.period_start::text,r.period_end::text,r.presentation_currency,r.status,r.source_companies,r.source_accounts,r.missing_mappings,r.missing_rates,r.total_debit::text,r.total_credit::text,r.translation_adjustment::text,r.completed_at,r.finalized_at FROM accounting_consolidation_runs r INNER JOIN accounting_consolidation_groups g ON g.id=r.group_id AND g.company_id=r.company_id WHERE r.company_id=$1 AND r.deleted_at IS NULL ORDER BY r.started_at DESC LIMIT 100",
      [context.companyId],
    ),
    allowedIds.length
      ? context.pool.query(
          "SELECT id::text,company_id::text,code,name,account_type,is_active FROM accounts WHERE company_id=ANY($1::uuid[]) AND deleted_at IS NULL AND is_active=TRUE ORDER BY company_id,code LIMIT 5000",
          [allowedIds],
        )
      : Promise.resolve({rows:[]} as {rows:Record<string,unknown>[]}),
  ]);

  const latestRun=runs.rows[0] || null;
  const summary=latestRun
    ? await context.pool.query(
        "SELECT consolidated_code,MAX(consolidated_name) AS consolidated_name,MAX(consolidated_type) AS consolidated_type,SUM(translated_opening)::text AS opening,SUM(translated_period)::text AS period,SUM(translated_closing)::text AS closing FROM accounting_consolidation_run_lines WHERE company_id=$1 AND run_id=$2 AND deleted_at IS NULL GROUP BY consolidated_code ORDER BY consolidated_code",
        [context.companyId,latestRun.id],
      )
    : {rows:[]} as {rows:Record<string,unknown>[]};

  return {
    companyId:context.companyId,
    currentCompany:context.company.currentCompany,
    selectedCompanyIds:[...context.company.selectedCompanyIds],
    companies:context.company.allowedCompanies,
    settings:settings.rows[0] || {
      enabled:true,
      require_complete_mapping:false,
      default_presentation_currency:context.company.currentCompany.currency,
    },
    groups:groups.rows,
    members:members.rows,
    mappings:mappings.rows,
    rates:rates.rows,
    eliminations:eliminations.rows,
    runs:runs.rows,
    accounts:accounts.rows,
    latestRun,
    latestSummary:summary.rows,
    metrics:{
      groups:groups.rows.length,
      activeGroups:groups.rows.filter(row=>row.status==='active').length,
      memberCompanies:new Set(members.rows.filter(row=>row.enabled).map(row=>String(row.member_company_id))).size,
      completedRuns:runs.rows.filter(row=>row.status==='completed'||row.status==='finalized').length,
    },
  };
}

export type AccountingConsolidationWorkspace = Awaited<ReturnType<typeof getAccountingConsolidation>>;

export async function saveConsolidationSettings(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_settings','edit');
  const body=bodyOf(input);
  const presentation=currency(body.defaultPresentationCurrency || context.company.currentCompany.currency,'Default presentation currency');
  await context.pool.query(
    "INSERT INTO accounting_consolidation_settings(company_id,enabled,require_complete_mapping,default_presentation_currency,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled,require_complete_mapping=EXCLUDED.require_complete_mapping,default_presentation_currency=EXCLUDED.default_presentation_currency,updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL",
    [context.companyId,bool(body.enabled,true),bool(body.requireCompleteMapping,false),presentation,context.userId],
  );
  await audit(context,'settings.saved','accounting_consolidation_settings',context.companyId,'Consolidation settings updated.');
  return {saved:true};
}

export async function createConsolidationGroup(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_groups','create');
  const body=bodyOf(input);
  const requestKey=accountingId(body.requestKey);
  const name=shortText(body.name,255,'Group name');
  const code=shortText(body.code,80,'Group code').toUpperCase();
  const presentation=currency(body.presentationCurrency || context.company.currentCompany.currency,'Presentation currency');
  const ctaCode=shortText(body.translationAdjustmentCode || 'CTA',80,'Translation adjustment code').toUpperCase();
  const ctaName=shortText(body.translationAdjustmentName || 'Cumulative translation adjustment',255,'Translation adjustment name');
  const notes=shortText(body.notes,4000,'Notes',false);
  const payload={name,code,presentation,ctaCode,ctaName,notes};
  const requestHash=hashPayload(payload);
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const replay=await client.query(
      "SELECT id::text,request_hash,name FROM accounting_consolidation_groups WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR SHARE",
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) throw new AccountingInputError('This request key was already used for another consolidation group.');
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),name:String(replay.rows[0].name),replayed:true};
    }
    const created=await client.query(
      "INSERT INTO accounting_consolidation_groups(company_id,name,code,presentation_currency,translation_adjustment_code,translation_adjustment_name,status,notes,request_key,request_hash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$10) RETURNING id::text,name",
      [context.companyId,name,code,presentation,ctaCode,ctaName,notes||null,requestKey,requestHash,context.userId],
    );
    await client.query('COMMIT');
    const result={id:String(created.rows[0].id),name:String(created.rows[0].name),replayed:false};
    await audit(context,'group.created','accounting_consolidation_groups',result.id,'Consolidation group created.',{presentation});
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveConsolidationMember(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_members','edit');
  const body=bodyOf(input);
  const groupId=accountingId(body.groupId);
  const memberCompanyId=accountingId(body.memberCompanyId);
  assertAllowedCompany(context,memberCompanyId);
  const consolidationMethod=method(body.consolidationMethod || 'full');
  const ownership=consolidationMethod==='full' ? OWNERSHIP_SCALE : ownershipUnits(body.ownershipPercent || '100');
  const effectiveFrom=body.effectiveFrom ? accountingDate(body.effectiveFrom) : null;
  const effectiveTo=body.effectiveTo ? accountingDate(body.effectiveTo) : null;
  if (effectiveFrom && effectiveTo && effectiveTo<effectiveFrom) throw new AccountingInputError('Member effective-to date cannot be before effective-from date.');
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const group=await groupForAccess(client,context.companyId,groupId,true);
    if (group.status==='closed') throw new AccountingInputError('Closed consolidation groups cannot be changed.');
    const company=await client.query("SELECT id::text FROM companies WHERE id=$1 AND is_active=TRUE AND archived_at IS NULL LIMIT 1",[memberCompanyId]);
    if (!company.rows[0]) throw new AccountingInputError('Choose an active company.');
    await client.query(
      "INSERT INTO accounting_consolidation_members(company_id,group_id,member_company_id,consolidation_method,ownership_percent,effective_from,effective_to,enabled,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) ON CONFLICT(group_id,member_company_id) WHERE deleted_at IS NULL DO UPDATE SET consolidation_method=EXCLUDED.consolidation_method,ownership_percent=EXCLUDED.ownership_percent,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()",
      [context.companyId,groupId,memberCompanyId,consolidationMethod,ownershipDecimal(ownership),effectiveFrom,effectiveTo,bool(body.enabled,true),context.userId],
    );
    await client.query('COMMIT');
    await audit(context,'member.saved','accounting_consolidation_members',memberCompanyId,'Consolidation member updated.',{groupId,method:consolidationMethod});
    return {saved:true};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveConsolidationMapping(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_account_mappings','edit');
  const body=bodyOf(input);
  const groupId=accountingId(body.groupId);
  const memberCompanyId=accountingId(body.memberCompanyId);
  const sourceAccountId=accountingId(body.sourceAccountId);
  assertAllowedCompany(context,memberCompanyId);
  const code=shortText(body.consolidatedCode,80,'Consolidated account code').toUpperCase();
  const name=shortText(body.consolidatedName,255,'Consolidated account name');
  const type=shortText(body.consolidatedType,50,'Consolidated account type').toLowerCase();
  const sign=Number(body.signMultiplier ?? 1);
  if (sign!==1 && sign!==-1) throw new AccountingInputError('Sign multiplier must be 1 or -1.');
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const group=await groupForAccess(client,context.companyId,groupId,true);
    if (group.status==='closed') throw new AccountingInputError('Closed consolidation groups cannot be changed.');
    await assertMember(client,context.companyId,groupId,memberCompanyId);
    const account=await client.query(
      "SELECT id::text FROM accounts WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND is_active=TRUE LIMIT 1",
      [sourceAccountId,memberCompanyId],
    );
    if (!account.rows[0]) throw new AccountingInputError('Choose an active source account belonging to the member company.');
    await client.query(
      "INSERT INTO accounting_consolidation_account_mappings(company_id,group_id,member_company_id,source_account_id,consolidated_code,consolidated_name,consolidated_type,sign_multiplier,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) ON CONFLICT(group_id,member_company_id,source_account_id) WHERE deleted_at IS NULL DO UPDATE SET consolidated_code=EXCLUDED.consolidated_code,consolidated_name=EXCLUDED.consolidated_name,consolidated_type=EXCLUDED.consolidated_type,sign_multiplier=EXCLUDED.sign_multiplier,updated_by=EXCLUDED.updated_by,updated_at=NOW()",
      [context.companyId,groupId,memberCompanyId,sourceAccountId,code,name,type,sign,context.userId],
    );
    await client.query('COMMIT');
    await audit(context,'mapping.saved','accounting_consolidation_account_mappings',sourceAccountId,'Consolidation account mapping updated.',{groupId,memberCompanyId,code});
    return {saved:true};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveConsolidationRate(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_rates','edit');
  const body=bodyOf(input);
  const groupId=accountingId(body.groupId);
  const memberCompanyId=accountingId(body.memberCompanyId);
  assertAllowedCompany(context,memberCompanyId);
  const date=accountingDate(body.rateDate);
  const kind=rateType(body.rateType);
  const units=rateUnits(body.rate);
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const group=await groupForAccess(client,context.companyId,groupId,true);
    if (group.status==='closed') throw new AccountingInputError('Closed consolidation groups cannot be changed.');
    await assertMember(client,context.companyId,groupId,memberCompanyId);
    const member=await client.query("SELECT currency FROM companies WHERE id=$1 LIMIT 1",[memberCompanyId]);
    const source=currency(member.rows[0]?.currency,'Member currency');
    const presentation=currency(group.presentation_currency,'Presentation currency');
    await client.query(
      "INSERT INTO accounting_consolidation_rates(company_id,group_id,member_company_id,rate_date,rate_type,source_currency,presentation_currency,rate,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) ON CONFLICT(group_id,member_company_id,rate_date,rate_type) WHERE deleted_at IS NULL DO UPDATE SET source_currency=EXCLUDED.source_currency,presentation_currency=EXCLUDED.presentation_currency,rate=EXCLUDED.rate,updated_by=EXCLUDED.updated_by,updated_at=NOW()",
      [context.companyId,groupId,memberCompanyId,date,kind,source,presentation,rateDecimal(units),context.userId],
    );
    await client.query('COMMIT');
    await audit(context,'rate.saved','accounting_consolidation_rates',memberCompanyId,'Consolidation FX rate updated.',{groupId,date,kind});
    return {saved:true};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createConsolidationElimination(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_eliminations','create');
  const body=bodyOf(input);
  const groupId=accountingId(body.groupId);
  const requestKey=accountingId(body.requestKey);
  const date=accountingDate(body.eliminationDate);
  const name=shortText(body.name,255,'Elimination name');
  const reference=shortText(body.reference,160,'Reference',false);
  const debitCode=shortText(body.debitCode,80,'Debit consolidated code').toUpperCase();
  const debitName=shortText(body.debitName,255,'Debit consolidated name');
  const debitType=shortText(body.debitType,50,'Debit consolidated type').toLowerCase();
  const creditCode=shortText(body.creditCode,80,'Credit consolidated code').toUpperCase();
  const creditName=shortText(body.creditName,255,'Credit consolidated name');
  const creditType=shortText(body.creditType,50,'Credit consolidated type').toLowerCase();
  if (debitCode===creditCode) throw new AccountingInputError('Debit and credit consolidated codes must be different.');
  const amount=positiveCents(body.amount,'Elimination amount');
  const notes=shortText(body.notes,4000,'Notes',false);
  const payload={groupId,date,name,reference,debitCode,debitName,debitType,creditCode,creditName,creditType,amount:money(amount),notes};
  const requestHash=hashPayload(payload);
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const group=await groupForAccess(client,context.companyId,groupId,true);
    if (group.status==='closed') throw new AccountingInputError('Closed consolidation groups cannot accept new eliminations.');
    const replay=await client.query(
      "SELECT id::text,request_hash,status FROM accounting_consolidation_eliminations WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR SHARE",
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) throw new AccountingInputError('This request key was already used for a different elimination.');
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),status:String(replay.rows[0].status),replayed:true};
    }
    const created=await client.query(
      "INSERT INTO accounting_consolidation_eliminations(company_id,group_id,elimination_date,reference,name,debit_code,debit_name,debit_type,credit_code,credit_name,credit_type,amount,currency,status,request_key,request_hash,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16,$17,$17) RETURNING id::text,status",
      [context.companyId,groupId,date,reference||null,name,debitCode,debitName,debitType,creditCode,creditName,creditType,money(amount),String(group.presentation_currency),requestKey,requestHash,notes||null,context.userId],
    );
    await client.query('COMMIT');
    const id=String(created.rows[0].id);
    await audit(context,'elimination.created','accounting_consolidation_eliminations',id,'Consolidation elimination drafted.',{groupId,amount:money(amount)});
    return {id,status:String(created.rows[0].status),replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeConsolidationElimination(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_eliminations','edit');
  const body=bodyOf(input);
  const eliminationId=accountingId(body.eliminationId);
  const result=await context.pool.query(
    "UPDATE accounting_consolidation_eliminations SET status='finalized',finalized_by=$3,finalized_at=NOW(),updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='draft' RETURNING id::text,status,group_id::text",
    [eliminationId,context.companyId,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Only a draft elimination can be finalized.');
  await audit(context,'elimination.finalized','accounting_consolidation_eliminations',eliminationId,'Consolidation elimination finalized.',{groupId:result.rows[0].group_id});
  return result.rows[0];
}

export async function setConsolidationGroupStatus(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_groups','edit');
  const body=bodyOf(input);
  const groupId=accountingId(body.groupId);
  const status=groupStatus(body.status);
  const client=await context.pool.connect();
  try {
    await client.query('BEGIN');
    const group=await groupForAccess(client,context.companyId,groupId,true);
    if (group.status==='closed' && status!=='closed') throw new AccountingInputError('Closed consolidation groups cannot be reopened.');
    if (status==='active') {
      const memberCount=await client.query(
        "SELECT COUNT(*)::int AS count FROM accounting_consolidation_members WHERE company_id=$1 AND group_id=$2 AND deleted_at IS NULL AND enabled=TRUE",
        [context.companyId,groupId],
      );
      if (Number(memberCount.rows[0]?.count||0)<2) throw new AccountingInputError('Add at least two active companies before activating a consolidation group.');
    }
    const updated=await client.query(
      "UPDATE accounting_consolidation_groups SET status=$3,closed_at=CASE WHEN $3='closed' THEN NOW() ELSE closed_at END,updated_by=$4,updated_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL RETURNING id::text,status",
      [groupId,context.companyId,status,context.userId],
    );
    await client.query('COMMIT');
    await audit(context,'group.status','accounting_consolidation_groups',groupId,'Consolidation group status changed.',{from:group.status,to:status});
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

type SourceLine = {
  memberCompanyId:string;
  sourceAccountId:string;
  sourceCurrency:string;
  consolidatedCode:string;
  consolidatedName:string;
  consolidatedType:string;
  sign:number;
  opening:bigint;
  period:bigint;
  closing:bigint;
  rate:bigint;
  ownership:bigint;
};

export async function runAccountingConsolidation(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_runs','create');
  const body=bodyOf(input);
  const groupId=accountingId(body.groupId);
  const requestKey=accountingId(body.requestKey);
  const periodStart=accountingDate(body.periodStart);
  const periodEnd=accountingDate(body.periodEnd);
  if (periodEnd<periodStart) throw new AccountingInputError('Consolidation period end cannot be before its start.');
  const requestHash=hashPayload({groupId,periodStart,periodEnd});
  const client=await context.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const replay=await client.query(
      "SELECT id::text,request_hash,status FROM accounting_consolidation_runs WHERE company_id=$1 AND request_key=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [context.companyId,requestKey],
    );
    if (replay.rows[0]) {
      if (String(replay.rows[0].request_hash)!==requestHash) throw new AccountingInputError('This consolidation request key was already used for another period.');
      await client.query('COMMIT');
      return {id:String(replay.rows[0].id),status:String(replay.rows[0].status),replayed:true};
    }

    const group=await groupForAccess(client,context.companyId,groupId,true);
    if (group.status!=='active') throw new AccountingInputError('Activate the consolidation group before running consolidation.');
    const presentation=currency(group.presentation_currency,'Presentation currency');

    const settingsResult=await client.query(
      "SELECT enabled,require_complete_mapping FROM accounting_consolidation_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1",
      [context.companyId],
    );
    const settings=settingsResult.rows[0] || {enabled:true,require_complete_mapping:false};
    if (settings.enabled===false) throw new AccountingInputError('Consolidation is disabled in Accounting settings.');

    const membersResult=await client.query(
      "SELECT m.member_company_id::text,m.consolidation_method,m.ownership_percent::text,c.name,c.currency FROM accounting_consolidation_members m INNER JOIN companies c ON c.id=m.member_company_id WHERE m.company_id=$1 AND m.group_id=$2 AND m.deleted_at IS NULL AND m.enabled=TRUE AND c.is_active=TRUE AND c.archived_at IS NULL AND (m.effective_from IS NULL OR m.effective_from<=$4) AND (m.effective_to IS NULL OR m.effective_to>=$3) ORDER BY c.name",
      [context.companyId,groupId,periodStart,periodEnd],
    );
    if (membersResult.rows.length<2) throw new AccountingInputError('At least two active member companies must overlap this consolidation period.');
    for (const member of membersResult.rows) assertAllowedCompany(context,String(member.member_company_id));

    const memberIds=membersResult.rows.map(row=>String(row.member_company_id));
    const memberById=new Map(membersResult.rows.map(row=>[String(row.member_company_id),row]));

    const sourceResult=await client.query(
      "SELECT a.company_id::text AS member_company_id,a.id::text AS account_id,a.code,a.name,a.account_type,c.currency,SUM(CASE WHEN j.journal_date<$2 THEN jl.debit-jl.credit ELSE 0 END)::text AS opening,SUM(CASE WHEN j.journal_date BETWEEN $2 AND $3 THEN jl.debit-jl.credit ELSE 0 END)::text AS period_amount FROM journal_lines jl INNER JOIN journals j ON j.id=jl.journal_id AND j.company_id=jl.company_id AND j.deleted_at IS NULL AND j.status='posted' INNER JOIN accounts a ON a.id=jl.account_id AND a.company_id=jl.company_id AND a.deleted_at IS NULL INNER JOIN companies c ON c.id=a.company_id WHERE jl.company_id=ANY($1::uuid[]) AND jl.deleted_at IS NULL AND j.journal_date<=$3 GROUP BY a.company_id,a.id,a.code,a.name,a.account_type,c.currency HAVING SUM(jl.debit-jl.credit)<>0 OR SUM(CASE WHEN j.journal_date BETWEEN $2 AND $3 THEN jl.debit-jl.credit ELSE 0 END)<>0 ORDER BY a.company_id,a.code",
      [memberIds,periodStart,periodEnd],
    );

    const mappingResult=await client.query(
      "SELECT member_company_id::text,source_account_id::text,consolidated_code,consolidated_name,consolidated_type,sign_multiplier FROM accounting_consolidation_account_mappings WHERE company_id=$1 AND group_id=$2 AND deleted_at IS NULL",
      [context.companyId,groupId],
    );
    const mappingByAccount=new Map(mappingResult.rows.map(row=>[String(row.member_company_id)+'|'+String(row.source_account_id),row]));

    const rateResult=await client.query(
      "SELECT member_company_id::text,rate_type,rate_date::text,rate::text FROM accounting_consolidation_rates WHERE company_id=$1 AND group_id=$2 AND deleted_at IS NULL AND rate_date<=$3 ORDER BY member_company_id,rate_type,rate_date DESC,created_at DESC",
      [context.companyId,groupId,periodEnd],
    );
    const rateByKey=new Map<string,bigint>();
    for (const row of rateResult.rows) {
      const key=String(row.member_company_id)+'|'+String(row.rate_type);
      if (!rateByKey.has(key)) rateByKey.set(key,rateUnits(row.rate));
    }

    const sourceLines:SourceLine[]=[];
    let missingMappings=0;
    const missingRateKeys=new Set<string>();

    for (const row of sourceResult.rows) {
      const memberCompanyId=String(row.member_company_id);
      const sourceAccountId=String(row.account_id);
      const sourceCurrency=currency(row.currency,'Source company currency');
      const member=memberById.get(memberCompanyId);
      if (!member) continue;
      const mapping=mappingByAccount.get(memberCompanyId+'|'+sourceAccountId);
      if (!mapping) missingMappings+=1;
      const kind=rateTypeForAccount(row.account_type);
      let rate=RATE_SCALE;
      if (sourceCurrency!==presentation) {
        const key=memberCompanyId+'|'+kind;
        const found=rateByKey.get(key);
        if (!found) {
          missingRateKeys.add(key);
          continue;
        }
        rate=found;
      }
      const ownership=String(member.consolidation_method)==='full'
        ? OWNERSHIP_SCALE
        : ownershipUnits(member.ownership_percent);
      const sign=Number(mapping?.sign_multiplier ?? 1);
      const opening=signedCents(row.opening,'Ledger opening balance')*BigInt(sign);
      const period=signedCents(row.period_amount,'Ledger period balance')*BigInt(sign);
      sourceLines.push({
        memberCompanyId,
        sourceAccountId,
        sourceCurrency,
        consolidatedCode:String(mapping?.consolidated_code || row.code).toUpperCase(),
        consolidatedName:String(mapping?.consolidated_name || row.name),
        consolidatedType:String(mapping?.consolidated_type || row.account_type).toLowerCase(),
        sign,
        opening,
        period,
        closing:opening+period,
        rate,
        ownership,
      });
    }

    if (missingRateKeys.size>0) {
      throw new AccountingInputError('Add closing, average or historical FX rates for every foreign-currency member before running consolidation.');
    }
    if (settings.require_complete_mapping===true && missingMappings>0) {
      throw new AccountingInputError(String(missingMappings)+' source account(s) still need an explicit consolidation mapping.');
    }

    const run=await client.query(
      "INSERT INTO accounting_consolidation_runs(company_id,group_id,period_start,period_end,presentation_currency,status,request_key,request_hash,source_companies,source_accounts,missing_mappings,missing_rates,generated_by,started_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'running',$6,$7,$8,$9,$10,0,$11,NOW(),NOW(),NOW()) RETURNING id::text",
      [context.companyId,groupId,periodStart,periodEnd,presentation,requestKey,requestHash,membersResult.rows.length,sourceLines.length,missingMappings,context.userId],
    );
    const runId=String(run.rows[0].id);

    let openingTotal=BigInt(0);
    let periodTotal=BigInt(0);
    for (const line of sourceLines) {
      const translatedOpening=translate(line.opening,line.rate,line.ownership);
      const translatedPeriod=translate(line.period,line.rate,line.ownership);
      const translatedClosing=translatedOpening+translatedPeriod;
      openingTotal+=translatedOpening;
      periodTotal+=translatedPeriod;
      await client.query(
        "INSERT INTO accounting_consolidation_run_lines(company_id,run_id,group_id,line_kind,member_company_id,source_account_id,consolidated_code,consolidated_name,consolidated_type,source_currency,source_opening,source_period,source_closing,applied_rate,ownership_percent,translated_opening,translated_period,translated_closing) VALUES($1,$2,$3,'source',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
        [context.companyId,runId,groupId,line.memberCompanyId,line.sourceAccountId,line.consolidatedCode,line.consolidatedName,line.consolidatedType,line.sourceCurrency,money(line.opening),money(line.period),money(line.closing),rateDecimal(line.rate),ownershipDecimal(line.ownership),money(translatedOpening),money(translatedPeriod),money(translatedClosing)],
      );
    }

    const eliminations=await client.query(
      "SELECT * FROM accounting_consolidation_eliminations WHERE company_id=$1 AND group_id=$2 AND deleted_at IS NULL AND status='finalized' AND elimination_date<=$3 ORDER BY elimination_date,id",
      [context.companyId,groupId,periodEnd],
    );
    for (const elimination of eliminations.rows) {
      if (currency(elimination.currency)!==presentation) throw new AccountingInputError('A finalized elimination uses a currency different from the group presentation currency.');
      const amount=positiveCents(elimination.amount,'Elimination amount');
      const opening=String(elimination.elimination_date)<periodStart ? amount : BigInt(0);
      const period=String(elimination.elimination_date)>=periodStart ? amount : BigInt(0);
      for (const direction of [
        {code:String(elimination.debit_code),name:String(elimination.debit_name),type:String(elimination.debit_type),sign:BigInt(1)},
        {code:String(elimination.credit_code),name:String(elimination.credit_name),type:String(elimination.credit_type),sign:BigInt(-1)},
      ]) {
        const lineOpening=opening*direction.sign;
        const linePeriod=period*direction.sign;
        openingTotal+=lineOpening;
        periodTotal+=linePeriod;
        await client.query(
          "INSERT INTO accounting_consolidation_run_lines(company_id,run_id,group_id,line_kind,consolidated_code,consolidated_name,consolidated_type,source_currency,source_opening,source_period,source_closing,applied_rate,ownership_percent,translated_opening,translated_period,translated_closing) VALUES($1,$2,$3,'elimination',$4,$5,$6,$7,$8,$9,$10,1,100,$8,$9,$10)",
          [context.companyId,runId,groupId,direction.code,direction.name,direction.type,presentation,money(lineOpening),money(linePeriod),money(lineOpening+linePeriod)],
        );
      }
    }

    const ctaOpening=-openingTotal;
    const ctaPeriod=-periodTotal;
    const ctaClosing=ctaOpening+ctaPeriod;
    if (ctaOpening!==BigInt(0) || ctaPeriod!==BigInt(0)) {
      await client.query(
        "INSERT INTO accounting_consolidation_run_lines(company_id,run_id,group_id,line_kind,consolidated_code,consolidated_name,consolidated_type,source_currency,source_opening,source_period,source_closing,applied_rate,ownership_percent,translated_opening,translated_period,translated_closing) VALUES($1,$2,$3,'translation_adjustment',$4,$5,'equity',$6,$7,$8,$9,1,100,$7,$8,$9)",
        [context.companyId,runId,groupId,String(group.translation_adjustment_code),String(group.translation_adjustment_name),presentation,money(ctaOpening),money(ctaPeriod),money(ctaClosing)],
      );
    }

    const totals=await client.query(
      "SELECT COALESCE(SUM(CASE WHEN translated_closing>0 THEN translated_closing ELSE 0 END),0)::text AS debit,COALESCE(SUM(CASE WHEN translated_closing<0 THEN -translated_closing ELSE 0 END),0)::text AS credit,COALESCE(SUM(translated_closing),0)::text AS difference FROM accounting_consolidation_run_lines WHERE company_id=$1 AND run_id=$2 AND deleted_at IS NULL",
      [context.companyId,runId],
    );
    if (signedCents(totals.rows[0].difference,'Consolidated difference')!==BigInt(0)) {
      throw new AccountingInputError('The consolidation snapshot is not balanced after translation adjustment.');
    }

    await client.query(
      "UPDATE accounting_consolidation_runs SET status='completed',total_debit=$3,total_credit=$4,translation_adjustment=$5,completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
      [runId,context.companyId,String(totals.rows[0].debit),String(totals.rows[0].credit),money(ctaClosing)],
    );
    await client.query('COMMIT');
    await audit(context,'run.completed','accounting_consolidation_runs',runId,'Multi-company consolidation completed.',{
      groupId,periodStart,periodEnd,companies:membersResult.rows.length,accounts:sourceLines.length,missingMappings,translationAdjustment:money(ctaClosing),
    });
    return {id:runId,status:'completed',companies:membersResult.rows.length,accounts:sourceLines.length,missingMappings,translationAdjustment:money(ctaClosing),replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeAccountingConsolidationRun(input: unknown) {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_consolidation_runs','edit');
  const body=bodyOf(input);
  const runId=accountingId(body.runId);
  const result=await context.pool.query(
    "UPDATE accounting_consolidation_runs SET status='finalized',finalized_by=$3,finalized_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL AND status='completed' RETURNING id::text,status,group_id::text",
    [runId,context.companyId,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError('Only a completed consolidation run can be finalized.');
  await audit(context,'run.finalized','accounting_consolidation_runs',runId,'Consolidation snapshot finalized.',{groupId:result.rows[0].group_id});
  return result.rows[0];
}
