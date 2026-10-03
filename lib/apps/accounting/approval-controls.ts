import 'server-only';

import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { queryControl } from '@/lib/db/control';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import {
  AccountingInputError,
  accountingId,
} from '@/lib/apps/accounting/validation';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

type ApprovalPolicySnapshot={
  policyId:string|null;
  policyName:string;
  approverMode:'any_authorized'|'owner'|'specific_user';
  approverUserId:string|null;
  requireNote:boolean;
  requiredApprovals:number;
  enforceMakerChecker:boolean;
};

const DEFAULT_SETTINGS={
  enforce_maker_checker:false,
  require_posting_separation:false,
  require_reversal_reason:true,
  default_required_approvals:1,
};

function bodyOf(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid Accounting approval-control data.');
  }
  return input as Record<string,unknown>;
}

function bool(value:unknown, fallback=false) {
  return typeof value==='boolean'?value:fallback;
}

function textValue(value:unknown,max:number,label:string,required=false) {
  const text=typeof value==='string'?value.trim():'';
  if (required && !text) throw new AccountingInputError(label+' is required.');
  if (text.length>max) throw new AccountingInputError(label+' must not exceed '+max+' characters.');
  return text;
}

function integer(value:unknown,min:number,max:number,label:string) {
  const number=Number(value);
  if (!Number.isInteger(number)||number<min||number>max) {
    throw new AccountingInputError(label+' must be between '+min+' and '+max+'.');
  }
  return number;
}

function money(value:unknown,label:string,allowBlank=false) {
  if ((value===null||value===undefined||value==='')&&allowBlank) return null;
  const text=String(value??'').trim();
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) {
    throw new AccountingInputError(label+' must be a valid non-negative amount with at most two decimal places.');
  }
  const [whole,fraction='']=text.split('.');
  return whole+'.'+fraction.padEnd(2,'0');
}

function moneyCents(value:string) {
  const [whole,fraction='00']=value.split('.');
  return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0').slice(0,2));
}

function snapshot(value:unknown):ApprovalPolicySnapshot {
  const source=value && typeof value==='object' && !Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
  const mode=
    source.approverMode==='owner'||source.approverMode==='specific_user'
      ? source.approverMode
      : 'any_authorized';
  return {
    policyId:typeof source.policyId==='string'?source.policyId:null,
    policyName:typeof source.policyName==='string'?source.policyName:'Default approval control',
    approverMode:mode,
    approverUserId:typeof source.approverUserId==='string'?source.approverUserId:null,
    requireNote:source.requireNote===true,
    requiredApprovals:Math.max(1,Math.min(3,Number(source.requiredApprovals||1))),
    enforceMakerChecker:source.enforceMakerChecker===true,
  };
}

async function workspaceMembers(tenantId:string) {
  const result=await queryControl(
    `SELECT
      u.id::text AS user_id,
      COALESCE(NULLIF(TRIM(u.full_name),''),NULLIF(TRIM(CONCAT_WS(' ',u.first_name,u.last_name)),''),u.email) AS name,
      u.email,
      tu.is_owner
     FROM tenant_users tu
     JOIN users u ON u.id=tu.user_id AND u.deleted_at IS NULL
     WHERE tu.tenant_id=$1
       AND tu.deleted_at IS NULL
       AND LOWER(COALESCE(tu.status,'active'))='active'
       AND COALESCE(tu.member_type,'internal')='internal'
     ORDER BY tu.is_owner DESC,LOWER(COALESCE(u.full_name,u.email)),u.id`,
    [tenantId],
  );
  return result.rows.map(row=>({
    userId:String(row.user_id),
    name:String(row.name||row.email||'Workspace user'),
    email:String(row.email||''),
    isOwner:row.is_owner===true,
  }));
}

async function currentSettings(client:PoolClient,companyId:string) {
  const result=await client.query(
    `SELECT enforce_maker_checker,require_posting_separation,require_reversal_reason,default_required_approvals
     FROM accounting_approval_settings
     WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1 FOR SHARE`,
    [companyId],
  );
  return result.rows[0]||DEFAULT_SETTINGS;
}

async function matchingPolicy(
  client:PoolClient,
  companyId:string,
  postingKind:string,
  amount:string,
) {
  const result=await client.query(
    `SELECT id::text,name,posting_kind,min_amount::text,max_amount::text,required_approvals,
      approver_mode,approver_user_id::text,require_note,priority
     FROM accounting_approval_policies
     WHERE company_id=$1
       AND deleted_at IS NULL
       AND is_active=TRUE
       AND (posting_kind='any' OR posting_kind=$2)
       AND min_amount<=$3::numeric
       AND (max_amount IS NULL OR max_amount>=$3::numeric)
     ORDER BY priority ASC,min_amount DESC,created_at ASC,id ASC
     LIMIT 1
     FOR SHARE`,
    [companyId,postingKind,amount],
  );
  return result.rows[0]||null;
}

async function assertEligibleApprover(
  context:Context,
  policy:ApprovalPolicySnapshot,
) {
  if (policy.approverMode==='specific_user' && policy.approverUserId!==context.userId) {
    throw new AccountingInputError('This approval band is assigned to another specific approver.');
  }
  if (policy.approverMode==='owner') {
    const owner=await queryControl(
      `SELECT 1 FROM tenant_users
       WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL
         AND is_owner=TRUE AND LOWER(COALESCE(status,'active'))='active'
       LIMIT 1`,
      [context.tenantId,context.userId],
    );
    if (!owner.rows[0]) throw new AccountingInputError('This approval band requires a workspace owner.');
  }
}

async function decideRequest(
  context:Context,
  client:PoolClient,
  requestId:string,
  decision:'approved'|'rejected',
  note:string,
) {
  const requestResult=await client.query(
    `SELECT
      r.id::text,r.journal_id::text,r.status,r.required_approvals,r.policy_snapshot_json,
      j.status AS journal_status,j.created_by::text
     FROM accounting_approval_requests r
     JOIN journals j ON j.id=r.journal_id AND j.company_id=r.company_id AND j.deleted_at IS NULL
     WHERE r.company_id=$1 AND r.id=$2 AND r.deleted_at IS NULL
     LIMIT 1 FOR UPDATE OF r,j`,
    [context.companyId,requestId],
  );
  const request=requestResult.rows[0];
  if (!request) throw new AccountingInputError('This Accounting approval request could not be found.');
  if (request.status==='approved') {
    return {requestId,status:'approved',journalId:String(request.journal_id),replayed:true,approvals:Number(request.required_approvals)};
  }
  if (request.status!=='pending') {
    throw new AccountingInputError('This Accounting approval request is no longer pending.');
  }
  if (String(request.journal_status)!=='draft') {
    throw new AccountingInputError('Only a draft journal can receive approval decisions.');
  }

  const policy=snapshot(request.policy_snapshot_json);
  await assertEligibleApprover(context,policy);

  if (policy.enforceMakerChecker && String(request.created_by||'')===context.userId) {
    throw new AccountingInputError('Maker-checker is enabled. The journal creator cannot approve this entry.');
  }
  if (policy.requireNote && !note) {
    throw new AccountingInputError('This approval band requires an approval note.');
  }

  const previous=await client.query(
    `SELECT decision FROM accounting_approval_decisions
     WHERE company_id=$1 AND request_id=$2 AND decided_by=$3 AND deleted_at IS NULL LIMIT 1`,
    [context.companyId,requestId,context.userId],
  );
  if (previous.rows[0]) {
    return {
      requestId,
      status:String(request.status),
      journalId:String(request.journal_id),
      replayed:true,
      approvals:0,
    };
  }

  await client.query(
    `INSERT INTO accounting_approval_decisions(
      company_id,request_id,decision,note,decided_by,decided_at
     ) VALUES($1,$2,$3,$4,$5,NOW())`,
    [context.companyId,requestId,decision,note||null,context.userId],
  );

  if (decision==='rejected') {
    await client.query(
      `UPDATE accounting_approval_requests
       SET status='rejected',resolved_at=NOW(),updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,requestId],
    );
    return {requestId,status:'rejected',journalId:String(request.journal_id),replayed:false,approvals:0};
  }

  const countResult=await client.query(
    `SELECT COUNT(*)::int AS approvals
     FROM accounting_approval_decisions
     WHERE company_id=$1 AND request_id=$2 AND deleted_at IS NULL AND decision='approved'`,
    [context.companyId,requestId],
  );
  const approvals=Number(countResult.rows[0]?.approvals||0);
  const required=Math.max(1,Number(request.required_approvals||1));

  if (approvals>=required) {
    await client.query(
      `UPDATE accounting_approval_requests
       SET status='approved',resolved_at=NOW(),updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,requestId],
    );
    await client.query(
      `UPDATE journals
       SET status='approved',approved_by=$3,approved_at=NOW(),approval_note=$4,
           updated_by=$3,updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='draft'`,
      [context.companyId,String(request.journal_id),context.userId,note||null],
    );
    return {requestId,status:'approved',journalId:String(request.journal_id),replayed:false,approvals,required};
  }

  return {requestId,status:'pending_approval',journalId:String(request.journal_id),replayed:false,approvals,required};
}

export async function approveAccountingJournalWithControls(
  context:Context,
  client:PoolClient,
  journalId:string,
  note:string,
) {
  const journalResult=await client.query(
    `SELECT id::text,status,posting_kind,created_by::text
     FROM journals
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [context.companyId,journalId],
  );
  const journal=journalResult.rows[0];
  if (!journal) throw new AccountingInputError('This journal could not be found.');
  if (journal.status==='approved') {
    return {journalId,status:'approved',replayed:true,approvals:1,required:1};
  }
  if (journal.status!=='draft') throw new AccountingInputError('Only a draft journal can be approved.');
  if (!['manual','opening'].includes(String(journal.posting_kind))) {
    throw new AccountingInputError('Automatic subsystem journals do not use manual approval.');
  }

  const proof=await client.query(
    `SELECT
      COALESCE(SUM(debit),0)::text AS amount,
      COALESCE(SUM(debit),0)=COALESCE(SUM(credit),0)
        AND COALESCE(SUM(debit),0)>0
        AND COUNT(*)>=2 AS balanced
     FROM journal_lines
     WHERE company_id=$1 AND journal_id=$2 AND deleted_at IS NULL`,
    [context.companyId,journalId],
  );
  const amount=String(proof.rows[0]?.amount||'0');
  if (proof.rows[0]?.balanced!==true) {
    throw new AccountingInputError('SaMi refused approval because the journal is not a valid balanced entry.');
  }

  const pending=await client.query(
    `SELECT id::text FROM accounting_approval_requests
     WHERE company_id=$1 AND journal_id=$2 AND deleted_at IS NULL AND status='pending'
     LIMIT 1 FOR UPDATE`,
    [context.companyId,journalId],
  );
  let requestId=pending.rows[0]?.id?String(pending.rows[0].id):'';

  if (!requestId) {
    const settings=await currentSettings(client,context.companyId);
    const policy=await matchingPolicy(client,context.companyId,String(journal.posting_kind),amount);
    const required=Math.max(1,Math.min(3,Number(policy?.required_approvals||settings.default_required_approvals||1)));
    const policySnapshot:ApprovalPolicySnapshot={
      policyId:policy?.id?String(policy.id):null,
      policyName:policy?.name?String(policy.name):'Default approval control',
      approverMode:
        policy?.approver_mode==='owner'||policy?.approver_mode==='specific_user'
          ? policy.approver_mode
          : 'any_authorized',
      approverUserId:policy?.approver_user_id?String(policy.approver_user_id):null,
      requireNote:policy?.require_note===true,
      requiredApprovals:required,
      enforceMakerChecker:settings.enforce_maker_checker===true,
    };
    const created=await client.query(
      `INSERT INTO accounting_approval_requests(
        company_id,journal_id,policy_id,amount,status,required_approvals,
        policy_snapshot_json,requested_by,requested_at
       ) VALUES($1,$2,$3,$4,'pending',$5,$6::jsonb,$7,NOW())
       RETURNING id::text`,
      [
        context.companyId,journalId,policySnapshot.policyId,amount,
        required,JSON.stringify(policySnapshot),String(journal.created_by||context.userId),
      ],
    );
    requestId=String(created.rows[0].id);
  }

  return decideRequest(context,client,requestId,'approved',note);
}

export async function assertAccountingPostingControl(
  context:Context,
  client:PoolClient,
  journalId:string,
) {
  const settings=await currentSettings(client,context.companyId);
  if (settings.require_posting_separation!==true) return;

  const journal=await client.query(
    `SELECT approved_by::text FROM journals
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1 FOR SHARE`,
    [context.companyId,journalId],
  );
  if (String(journal.rows[0]?.approved_by||'')===context.userId) {
    throw new AccountingInputError('Posting separation is enabled. An approver cannot also post this journal.');
  }

  const decision=await client.query(
    `SELECT 1
     FROM accounting_approval_requests r
     JOIN accounting_approval_decisions d
       ON d.request_id=r.id AND d.company_id=r.company_id AND d.deleted_at IS NULL
     WHERE r.company_id=$1 AND r.journal_id=$2 AND r.deleted_at IS NULL
       AND r.status='approved' AND d.decision='approved' AND d.decided_by=$3
     ORDER BY r.resolved_at DESC NULLS LAST LIMIT 1`,
    [context.companyId,journalId,context.userId],
  );
  if (decision.rows[0]) {
    throw new AccountingInputError('Posting separation is enabled. An approval participant cannot post this journal.');
  }
}

export async function assertAccountingReversalControl(
  context:Context,
  client:PoolClient,
  reason:string,
) {
  const settings=await currentSettings(client,context.companyId);
  if (settings.require_reversal_reason===true && !reason.trim()) {
    throw new AccountingInputError('A business reason is required before reversing a posted Accounting journal.');
  }
}

export async function getAccountingApprovalControls() {
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_approval_requests','report');
  const [settingsResult,policiesResult,requestsResult,historyResult,findingsResult,members]=await Promise.all([
    context.pool.query(
      `SELECT enforce_maker_checker,require_posting_separation,require_reversal_reason,default_required_approvals
       FROM accounting_approval_settings WHERE company_id=$1 AND deleted_at IS NULL LIMIT 1`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT id::text,name,posting_kind,min_amount::text,max_amount::text,required_approvals,
        approver_mode,approver_user_id::text,require_note,priority,is_active
       FROM accounting_approval_policies
       WHERE company_id=$1 AND deleted_at IS NULL
       ORDER BY is_active DESC,priority,min_amount,id`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT r.id::text,r.journal_id::text,j.journal_number,j.journal_date::text,
        COALESCE(j.description,'') AS description,r.amount::text,r.required_approvals,
        r.policy_snapshot_json,r.requested_by::text,r.requested_at::text,
        COUNT(d.id) FILTER (WHERE d.decision='approved')::int AS approval_count
       FROM accounting_approval_requests r
       JOIN journals j ON j.id=r.journal_id AND j.company_id=r.company_id AND j.deleted_at IS NULL
       LEFT JOIN accounting_approval_decisions d
         ON d.request_id=r.id AND d.company_id=r.company_id AND d.deleted_at IS NULL
       WHERE r.company_id=$1 AND r.deleted_at IS NULL AND r.status='pending'
       GROUP BY r.id,j.id
       ORDER BY r.requested_at ASC,r.id ASC`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT r.id::text,r.journal_id::text,j.journal_number,r.amount::text,r.status,
        r.required_approvals,r.resolved_at::text,r.requested_at::text,
        COUNT(d.id) FILTER (WHERE d.decision='approved')::int AS approval_count,
        COUNT(d.id) FILTER (WHERE d.decision='rejected')::int AS rejection_count
       FROM accounting_approval_requests r
       JOIN journals j ON j.id=r.journal_id AND j.company_id=r.company_id AND j.deleted_at IS NULL
       LEFT JOIN accounting_approval_decisions d
         ON d.request_id=r.id AND d.company_id=r.company_id AND d.deleted_at IS NULL
       WHERE r.company_id=$1 AND r.deleted_at IS NULL
       GROUP BY r.id,j.id
       ORDER BY r.requested_at DESC LIMIT 80`,
      [context.companyId],
    ),
    context.pool.query(
      `SELECT j.id::text,j.journal_number,j.status,j.created_by::text,j.approved_by::text,j.posted_by::text,
        CASE
          WHEN j.created_by IS NOT NULL AND j.approved_by=j.created_by THEN 'maker_is_approver'
          WHEN j.approved_by IS NOT NULL AND j.posted_by=j.approved_by THEN 'approver_is_poster'
          ELSE 'none'
        END AS finding
       FROM journals j
       WHERE j.company_id=$1 AND j.deleted_at IS NULL
         AND (
           (j.created_by IS NOT NULL AND j.approved_by=j.created_by)
           OR
           (j.approved_by IS NOT NULL AND j.posted_by=j.approved_by)
         )
       ORDER BY j.created_at DESC LIMIT 50`,
      [context.companyId],
    ),
    workspaceMembers(context.tenantId),
  ]);

  const settings=settingsResult.rows[0]||DEFAULT_SETTINGS;
  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    settings:{
      enforceMakerChecker:settings.enforce_maker_checker===true,
      requirePostingSeparation:settings.require_posting_separation===true,
      requireReversalReason:settings.require_reversal_reason!==false,
      defaultRequiredApprovals:Number(settings.default_required_approvals||1),
    },
    policies:policiesResult.rows,
    pending:requestsResult.rows,
    history:historyResult.rows,
    segregationFindings:findingsResult.rows,
    members,
  };
}

export type AccountingApprovalControlsWorkspace=
  Awaited<ReturnType<typeof getAccountingApprovalControls>>;

export async function saveAccountingApprovalSettings(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_approval_settings','edit');
  const defaultRequiredApprovals=integer(body.defaultRequiredApprovals,1,3,'Default approvals');
  await context.pool.query(
    `INSERT INTO accounting_approval_settings(
      company_id,enforce_maker_checker,require_posting_separation,require_reversal_reason,
      default_required_approvals,created_by,updated_by,created_at,updated_at,deleted_at
     ) VALUES($1,$2,$3,$4,$5,$6,$6,NOW(),NOW(),NULL)
     ON CONFLICT(company_id) DO UPDATE SET
       enforce_maker_checker=EXCLUDED.enforce_maker_checker,
       require_posting_separation=EXCLUDED.require_posting_separation,
       require_reversal_reason=EXCLUDED.require_reversal_reason,
       default_required_approvals=EXCLUDED.default_required_approvals,
       updated_by=EXCLUDED.updated_by,updated_at=NOW(),deleted_at=NULL`,
    [
      context.companyId,
      bool(body.enforceMakerChecker),
      bool(body.requirePostingSeparation),
      bool(body.requireReversalReason,true),
      defaultRequiredApprovals,
      context.userId,
    ],
  );
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.approval_controls.settings_updated',module:'accounting',
    resourceType:'accounting_approval_settings',resourceId:context.companyId,
    summary:'Accounting approval and segregation settings updated',result:'success',
  }).catch(()=>undefined);
  return {success:true};
}

export async function createAccountingApprovalPolicy(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_approval_policies','edit');
  const name=textValue(body.name,160,'Policy name',true);
  const postingKind=['manual','opening'].includes(String(body.postingKind))?String(body.postingKind):'any';
  const minAmount=money(body.minAmount,'Minimum amount')||'0.00';
  const maxAmount=money(body.maxAmount,'Maximum amount',true);
  if (maxAmount!==null && moneyCents(maxAmount)<moneyCents(minAmount)) {
    throw new AccountingInputError('Maximum amount cannot be less than minimum amount.');
  }
  const requiredApprovals=integer(body.requiredApprovals,1,3,'Required approvals');
  const approverMode=
    body.approverMode==='owner'||body.approverMode==='specific_user'
      ? body.approverMode
      : 'any_authorized';
  const approverUserId=
    approverMode==='specific_user'?accountingId(body.approverUserId):null;
  if (approverMode==='specific_user' && requiredApprovals!==1) {
    throw new AccountingInputError('A specific-user approval policy must require exactly one approval.');
  }
  if (approverUserId) {
    const members=await workspaceMembers(context.tenantId);
    if (!members.some(member=>member.userId===approverUserId)) {
      throw new AccountingInputError('The selected specific approver is not an active workspace member.');
    }
  }
  const result=await context.pool.query(
    `INSERT INTO accounting_approval_policies(
      company_id,name,posting_kind,min_amount,max_amount,required_approvals,
      approver_mode,approver_user_id,require_note,priority,is_active,created_by,updated_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$11)
     RETURNING id::text`,
    [
      context.companyId,name,postingKind,minAmount,maxAmount,requiredApprovals,
      approverMode,approverUserId,bool(body.requireNote),integer(body.priority??100,0,100000,'Priority'),context.userId,
    ],
  );
  const policyId=String(result.rows[0].id);
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.approval_controls.policy_created',module:'accounting',
    resourceType:'accounting_approval_policies',resourceId:policyId,
    summary:'Accounting approval policy created',result:'success',
    metadata:{name,postingKind,minAmount,maxAmount,requiredApprovals,approverMode,priority:Number(body.priority??100)},
  }).catch(()=>undefined);
  return {id:policyId};
}

export async function archiveAccountingApprovalPolicy(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_approval_policies','edit');
  const policyId=accountingId(body.policyId);
  const result=await context.pool.query(
    `UPDATE accounting_approval_policies
     SET is_active=FALSE,updated_by=$3,updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
     RETURNING id::text`,
    [context.companyId,policyId,context.userId],
  );
  if (!result.rows[0]) throw new AccountingInputError('This approval policy could not be found.');
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.approval_controls.policy_archived',module:'accounting',
    resourceType:'accounting_approval_policies',resourceId:policyId,
    summary:'Accounting approval policy archived',result:'success',
  }).catch(()=>undefined);
  return {id:policyId,isActive:false};
}

export async function decideAccountingApprovalRequest(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext('accounting','accounting_approval_requests','edit');
  const requestId=accountingId(body.requestId);
  const decision=body.decision==='rejected'?'rejected':body.decision==='approved'?'approved':null;
  if (!decision) throw new AccountingInputError('Choose approve or reject.');
  const note=textValue(body.note,1000,'Decision note');
  const client=await context.pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    result=await decideRequest(context,client,requestId,decision,note);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
    action:'accounting.approval_controls.'+decision,module:'accounting',
    resourceType:'accounting_approval_requests',resourceId:requestId,
    summary:'Accounting approval request '+decision,result:'success',
    metadata:{journalId:result.journalId,status:result.status},
  }).catch(()=>undefined);
  return result;
}
