import 'server-only';

import type { PoolClient } from 'pg';

import { getPermissionContext,permissionContextHas } from '@/lib/auth/permission-context';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { AccountingInputError,accountingId } from '@/lib/apps/accounting/validation';
import { queryControl } from '@/lib/db/control';
import {
  linkWorkspaceFileForAuthorizedCaller,
  listWorkspaceRecordFilesForAuthorizedCaller,
  unlinkWorkspaceFileForAuthorizedCaller,
} from '@/lib/services/workspace-file-links';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';
import { createWorkspaceNotification } from '@/lib/services/workspace-notifications';

type Context=Awaited<ReturnType<typeof requireEnterpriseModuleTableContext>>;

type RecordTarget={
  model:string;
  recordId:string;
  typeLabel:string;
  label:string;
  status:string|null;
  href:string;
};

type TargetDefinition={
  key:string;
  label:string;
  href:(recordId:string)=>string;
  lookupSql:string;
};

const TARGETS:Record<string,TargetDefinition>={
  journals:{
    key:'journals',
    label:'Journal',
    href:id=>'/apps/accounting/journals?journalId='+encodeURIComponent(id),
    lookupSql:"SELECT journal_number AS label,status FROM journals WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_vendor_documents:{
    key:'accounting_vendor_documents',
    label:'Vendor document',
    href:id=>'/apps/accounting/payables?documentId='+encodeURIComponent(id),
    lookupSql:"SELECT document_number AS label,status FROM accounting_vendor_documents WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_purchase_orders:{
    key:'accounting_purchase_orders',
    label:'Purchase order',
    href:()=>'/apps/accounting/purchasing',
    lookupSql:"SELECT purchase_order_number AS label,status FROM accounting_purchase_orders WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_payment_batches:{
    key:'accounting_payment_batches',
    label:'Payment batch',
    href:()=>'/apps/accounting/payments',
    lookupSql:"SELECT COALESCE(NULLIF(reference,''),'Payment batch') AS label,status FROM accounting_payment_batches WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_accrual_schedules:{
    key:'accounting_accrual_schedules',
    label:'Accrual schedule',
    href:()=>'/apps/accounting/accruals-deferrals',
    lookupSql:"SELECT name AS label,status FROM accounting_accrual_schedules WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_budget_runs:{
    key:'accounting_budget_runs',
    label:'Budget run',
    href:()=>'/apps/accounting/budgets-forecasts',
    lookupSql:"SELECT INITCAP(REPLACE(run_type,'_',' '))||' · '||as_of_date::text AS label,status FROM accounting_budget_runs WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_consolidation_runs:{
    key:'accounting_consolidation_runs',
    label:'Consolidation run',
    href:()=>'/apps/accounting/multi-company-consolidation',
    lookupSql:"SELECT 'Consolidation · '||period_start::text||' → '||period_end::text AS label,status FROM accounting_consolidation_runs WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_financial_statement_snapshots:{
    key:'accounting_financial_statement_snapshots',
    label:'Financial statement',
    href:()=>'/apps/accounting/financial-statements',
    lookupSql:"SELECT 'Statements · '||period_start::text||' → '||period_end::text AS label,status FROM accounting_financial_statement_snapshots WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_management_report_snapshots:{
    key:'accounting_management_report_snapshots',
    label:'Management report',
    href:()=>'/apps/accounting/management-reporting',
    lookupSql:"SELECT 'Management report · '||period_start::text||' → '||period_end::text AS label,status FROM accounting_management_report_snapshots WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_close_runs:{
    key:'accounting_close_runs',
    label:'Period close',
    href:()=>'/apps/accounting/period-closing',
    lookupSql:"SELECT INITCAP(REPLACE(close_type,'_',' '))||' close' AS label,status FROM accounting_close_runs WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1",
  },
  accounting_approval_requests:{
    key:'accounting_approval_requests',
    label:'Approval request',
    href:()=>'/apps/accounting/approval-controls',
    lookupSql:"SELECT 'Approval · '||COALESCE(j.journal_number,r.id::text) AS label,r.status FROM accounting_approval_requests r LEFT JOIN journals j ON j.id=r.journal_id AND j.company_id=r.company_id AND j.deleted_at IS NULL WHERE r.company_id=$1 AND r.id=$2 AND r.deleted_at IS NULL LIMIT 1",
  },
};

const TARGET_KEYS=Object.keys(TARGETS);

function bodyOf(input:unknown) {
  if (!input || typeof input!=='object' || Array.isArray(input)) {
    throw new AccountingInputError('Enter valid Accounting collaboration data.');
  }
  return input as Record<string,unknown>;
}

function modelKey(value:unknown) {
  const key=typeof value==='string'?value.trim().toLowerCase():'';
  if (!TARGETS[key]) throw new AccountingInputError('Choose a supported Accounting record type.');
  return key;
}

function commentText(value:unknown,label='Comment') {
  const text=typeof value==='string'?value.trim():'';
  if (!text || text.length>5000) {
    throw new AccountingInputError(label+' must contain between 1 and 5,000 characters.');
  }
  return text;
}

function commentKind(value:unknown):'comment'|'internal_note' {
  return value==='internal_note'?'internal_note':'comment';
}

function mentionIds(value:unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const ids=[...new Set(value.map(accountingId))];
  if (ids.length>20) throw new AccountingInputError('A comment can mention at most 20 workspace users.');
  return ids;
}

async function members(tenantId:string) {
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

async function validateMentions(tenantId:string,ids:string[]) {
  if (!ids.length) return;
  const active=await members(tenantId);
  const allowed=new Set(active.map(row=>row.userId));
  if (ids.some(id=>!allowed.has(id))) {
    throw new AccountingInputError('Every mentioned user must be an active workspace member.');
  }
}

async function target(
  context:Context,
  model:unknown,
  recordIdValue:unknown,
):Promise<RecordTarget> {
  const key=modelKey(model);
  const recordId=accountingId(recordIdValue);
  const definition=TARGETS[key];
  const result=await context.pool.query(definition.lookupSql,[context.companyId,recordId]);
  if (!result.rows[0]) throw new AccountingInputError('This Accounting record could not be found in the selected company.');
  return {
    model:key,
    recordId,
    typeLabel:definition.label,
    label:String(result.rows[0].label||definition.label),
    status:result.rows[0].status===null||result.rows[0].status===undefined?null:String(result.rows[0].status),
    href:definition.href(recordId),
  };
}

async function audit(
  context:Context,
  action:string,
  resourceId:string,
  summary:string,
  metadata:Record<string,unknown>={},
) {
  await recordWorkspaceAuditEvent({
    tenantId:context.tenantId,
    companyId:context.companyId,
    userId:context.userId,
    action:'accounting.collaboration.'+action,
    module:'accounting',
    resourceType:'accounting_collaboration',
    resourceId,
    summary,
    result:'success',
    metadata,
  }).catch(error=>console.error('[Accounting] Collaboration audit failed',error));
}

async function requireFilesManage(context:Context) {
  const permissions=await getPermissionContext();
  if (
    permissions.tenantId!==context.tenantId ||
    permissions.userId!==context.userId
  ) {
    throw new AccountingInputError('Your workspace context changed. Reload Accounting before managing attachments.');
  }
  if (!permissions.isOwner && !permissionContextHas(permissions,SAMI_PERMISSIONS.FILES_MANAGE)) {
    throw new AccountingInputError('Workspace Files manage permission is required to link or unlink Accounting attachments.');
  }
}

async function notifyComment(
  context:Context,
  record:RecordTarget,
  commentId:string,
  body:string,
  recipients:string[],
) {
  const unique=[...new Set(recipients)].filter(id=>id!==context.userId);
  await Promise.all(unique.map(recipientUserId=>
    createWorkspaceNotification({
      tenantId:context.tenantId,
      recipientUserId,
      companyId:context.companyId,
      type:'accounting.collaboration.comment',
      eventKey:'accounting.collaboration.comment',
      priority:'normal',
      title:'Accounting collaboration update',
      message:body.slice(0,500),
      href:record.href,
      sourceModule:'accounting',
      sourceModel:record.model,
      sourceRecordId:record.recordId,
      dedupeKey:'accounting-comment-'+commentId+'-'+recipientUserId,
      metadata:{commentId,recordLabel:record.label},
    }).catch(error=>console.error('[Accounting] Collaboration notification failed',error)),
  ));
}

async function recentRecords(context:Context) {
  const result=await context.pool.query(
    `SELECT * FROM (
      SELECT 'journals'::text AS model,id::text AS record_id,journal_number::text AS label,status::text,created_at
      FROM journals WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_vendor_documents',id::text,document_number::text,status::text,created_at
      FROM accounting_vendor_documents WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_purchase_orders',id::text,purchase_order_number::text,status::text,created_at
      FROM accounting_purchase_orders WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_payment_batches',id::text,COALESCE(NULLIF(reference,''),'Payment batch')::text,status::text,created_at
      FROM accounting_payment_batches WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_accrual_schedules',id::text,name::text,status::text,created_at
      FROM accounting_accrual_schedules WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_budget_runs',id::text,(INITCAP(REPLACE(run_type,'_',' '))||' · '||as_of_date::text)::text,status::text,created_at
      FROM accounting_budget_runs WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_consolidation_runs',id::text,('Consolidation · '||period_start::text||' → '||period_end::text)::text,status::text,created_at
      FROM accounting_consolidation_runs WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_financial_statement_snapshots',id::text,('Statements · '||period_start::text||' → '||period_end::text)::text,status::text,created_at
      FROM accounting_financial_statement_snapshots WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_management_report_snapshots',id::text,('Management report · '||period_start::text||' → '||period_end::text)::text,status::text,created_at
      FROM accounting_management_report_snapshots WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_close_runs',id::text,(INITCAP(REPLACE(close_type,'_',' '))||' close')::text,status::text,created_at
      FROM accounting_close_runs WHERE company_id=$1 AND deleted_at IS NULL
      UNION ALL
      SELECT 'accounting_approval_requests',r.id::text,('Approval · '||COALESCE(j.journal_number,r.id::text))::text,r.status::text,r.created_at
      FROM accounting_approval_requests r
      LEFT JOIN journals j ON j.id=r.journal_id AND j.company_id=r.company_id AND j.deleted_at IS NULL
      WHERE r.company_id=$1 AND r.deleted_at IS NULL
    ) records
    ORDER BY created_at DESC,record_id DESC
    LIMIT 150`,
    [context.companyId],
  );
  return result.rows.map(row=>({
    model:String(row.model),
    recordId:String(row.record_id),
    typeLabel:TARGETS[String(row.model)]?.label||String(row.model),
    label:String(row.label||row.record_id),
    status:row.status===null?null:String(row.status),
    href:TARGETS[String(row.model)]?.href(String(row.record_id))||'/apps/accounting/documents-collaboration',
    createdAt:new Date(row.created_at).toISOString(),
  }));
}

export async function getAccountingCollaboration(
  input:{model?:unknown;recordId?:unknown}={},
) {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_collaboration_comments',
    'report',
  );

  const selected=
    input.model && input.recordId
      ? await target(context,input.model,input.recordId)
      : null;

  const [recent,workspaceMembers,recentFiles,recentComments]=await Promise.all([
    recentRecords(context),
    members(context.tenantId),
    context.pool.query(
      `SELECT
        f.id::text AS file_id,f.name,f.mime_type,f.extension,f.size_bytes,
        fl.model,fl.record_id::text,fl.purpose,fl.created_at::text
       FROM file_links fl
       JOIN files f ON f.id=fl.file_id AND f.company_id=fl.company_id
       WHERE fl.company_id=$1
         AND fl.module_key='accounting'
         AND fl.model=ANY($2::text[])
         AND fl.deleted_at IS NULL
         AND f.status='active'
         AND f.deleted_at IS NULL
       ORDER BY fl.created_at DESC,fl.id DESC
       LIMIT 120`,
      [context.companyId,TARGET_KEYS],
    ),
    context.pool.query(
      `SELECT id::text,model,record_id::text,parent_comment_id::text,kind,body,
        mentioned_user_ids,created_by::text,edited_by::text,created_at::text,updated_at::text,edited_at::text
       FROM accounting_collaboration_comments
       WHERE company_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC,id DESC LIMIT 120`,
      [context.companyId],
    ),
  ]);

  let attachments:Array<Record<string,unknown>>=[];
  let comments:Array<Record<string,unknown>>=[];
  let revisions:Array<Record<string,unknown>>=[];
  let followers:Array<Record<string,unknown>>=[];

  if (selected) {
    const [linked,commentRows,revisionRows,followerRows]=await Promise.all([
      listWorkspaceRecordFilesForAuthorizedCaller({
        tenantId:context.tenantId,
        userId:context.userId,
        companyId:context.companyId,
        model:selected.model,
        recordId:selected.recordId,
      }),
      context.pool.query(
        `SELECT id::text,parent_comment_id::text,kind,body,mentioned_user_ids,
          created_by::text,edited_by::text,created_at::text,updated_at::text,edited_at::text
         FROM accounting_collaboration_comments
         WHERE company_id=$1 AND model=$2 AND record_id=$3 AND deleted_at IS NULL
         ORDER BY created_at ASC,id ASC`,
        [context.companyId,selected.model,selected.recordId],
      ),
      context.pool.query(
        `SELECT r.id::text,r.comment_id::text,r.prior_body,r.prior_mentioned_user_ids,
          r.revised_by::text,r.revised_at::text
         FROM accounting_collaboration_comment_revisions r
         JOIN accounting_collaboration_comments c
           ON c.id=r.comment_id AND c.company_id=r.company_id
         WHERE r.company_id=$1 AND c.model=$2 AND c.record_id=$3
         ORDER BY r.revised_at DESC,r.id DESC LIMIT 100`,
        [context.companyId,selected.model,selected.recordId],
      ),
      context.pool.query(
        `SELECT id::text,user_id::text,created_by::text,created_at::text
         FROM accounting_record_followers
         WHERE company_id=$1 AND model=$2 AND record_id=$3 AND deleted_at IS NULL
         ORDER BY created_at,id`,
        [context.companyId,selected.model,selected.recordId],
      ),
    ]);
    attachments=linked;
    comments=commentRows.rows;
    revisions=revisionRows.rows;
    followers=followerRows.rows;
  }

  const recordIndex=new Map(recent.map(row=>[row.model+':'+row.recordId,row]));
  return {
    companyId:context.companyId,
    currentUserId:context.userId,
    selectedRecord:selected,
    recordTypes:TARGET_KEYS.map(key=>({key,label:TARGETS[key].label})),
    recentRecords:recent,
    members:workspaceMembers,
    attachments,
    comments,
    revisions,
    followers,
    recentFiles:recentFiles.rows.map(row=>{
      const record=recordIndex.get(String(row.model)+':'+String(row.record_id));
      return {
        fileId:String(row.file_id),
        name:String(row.name),
        mimeType:row.mime_type?String(row.mime_type):null,
        extension:row.extension?String(row.extension):null,
        sizeBytes:Number(row.size_bytes||0),
        model:String(row.model),
        recordId:String(row.record_id),
        purpose:String(row.purpose||'attachment'),
        createdAt:String(row.created_at),
        recordLabel:record?.label||TARGETS[String(row.model)]?.label+' · '+String(row.record_id).slice(0,8),
        href:record?.href||TARGETS[String(row.model)]?.href(String(row.record_id))||'/apps/accounting/documents-collaboration',
      };
    }),
    recentComments:recentComments.rows,
  };
}

export type AccountingCollaborationWorkspace=
  Awaited<ReturnType<typeof getAccountingCollaboration>>;

export async function addAccountingComment(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_collaboration_comments',
    'edit',
  );
  const record=await target(context,body.model,body.recordId);
  const kind=commentKind(body.kind);
  const text=commentText(body.body);
  const mentioned=mentionIds(body.mentionedUserIds);
  await validateMentions(context.tenantId,mentioned);
  const parentCommentId=body.parentCommentId?accountingId(body.parentCommentId):null;
  const client=await context.pool.connect();
  let commentId='';

  try {
    await client.query('BEGIN');
    if (parentCommentId) {
      const parent=await client.query(
        `SELECT 1 FROM accounting_collaboration_comments
         WHERE company_id=$1 AND id=$2 AND model=$3 AND record_id=$4
           AND deleted_at IS NULL LIMIT 1 FOR SHARE`,
        [context.companyId,parentCommentId,record.model,record.recordId],
      );
      if (!parent.rows[0]) throw new AccountingInputError('The reply target is no longer available.');
    }
    const inserted=await client.query(
      `INSERT INTO accounting_collaboration_comments(
        company_id,model,record_id,parent_comment_id,kind,body,mentioned_user_ids,
        created_by,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7::uuid[],$8,NOW(),NOW())
       RETURNING id::text`,
      [
        context.companyId,record.model,record.recordId,parentCommentId,kind,text,
        mentioned,context.userId,
      ],
    );
    commentId=String(inserted.rows[0].id);
    const followerRows=await client.query(
      `SELECT user_id::text FROM accounting_record_followers
       WHERE company_id=$1 AND model=$2 AND record_id=$3 AND deleted_at IS NULL`,
      [context.companyId,record.model,record.recordId],
    );
    await client.query('COMMIT');

    await notifyComment(
      context,
      record,
      commentId,
      text,
      [...mentioned,...followerRows.rows.map(row=>String(row.user_id))],
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }

  await audit(context,'comment_added',commentId,'Accounting collaboration comment added.',{
    model:record.model,recordId:record.recordId,kind,mentionedUserIds:mentioned,
  });
  return {id:commentId};
}

export async function editAccountingComment(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_collaboration_comments',
    'edit',
  );
  const commentId=accountingId(body.commentId);
  const text=commentText(body.body);
  const mentioned=mentionIds(body.mentionedUserIds);
  await validateMentions(context.tenantId,mentioned);
  const client=await context.pool.connect();
  let record:RecordTarget|null=null;
  let newMentions:string[]=[];

  try {
    await client.query('BEGIN');
    const currentResult=await client.query(
      `SELECT id::text,model,record_id::text,body,mentioned_user_ids,created_by::text
       FROM accounting_collaboration_comments
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [context.companyId,commentId],
    );
    const current=currentResult.rows[0];
    if (!current) throw new AccountingInputError('This Accounting comment could not be found.');
    if (String(current.created_by)!==context.userId) {
      throw new AccountingInputError('Only the comment author can edit this Accounting comment.');
    }
    record=await target(context,String(current.model),String(current.record_id));
    const previousMentions=Array.isArray(current.mentioned_user_ids)
      ? current.mentioned_user_ids.map(String)
      : [];
    newMentions=mentioned.filter(id=>!previousMentions.includes(id));

    await client.query(
      `INSERT INTO accounting_collaboration_comment_revisions(
        company_id,comment_id,prior_body,prior_mentioned_user_ids,revised_by,revised_at
       ) VALUES($1,$2,$3,$4::uuid[],$5,NOW())`,
      [context.companyId,commentId,String(current.body),previousMentions,context.userId],
    );
    await client.query(
      `UPDATE accounting_collaboration_comments
       SET body=$3,mentioned_user_ids=$4::uuid[],edited_by=$5,edited_at=NOW(),updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,commentId,text,mentioned,context.userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }

  if (record && newMentions.length) {
    await notifyComment(context,record,commentId,text,newMentions);
  }
  await audit(context,'comment_edited',commentId,'Accounting collaboration comment edited.',{
    model:record?.model,recordId:record?.recordId,newMentionUserIds:newMentions,
  });
  return {id:commentId};
}

export async function deleteAccountingComment(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_collaboration_comments',
    'edit',
  );
  const commentId=accountingId(body.commentId);
  const result=await context.pool.query(
    `UPDATE accounting_collaboration_comments
     SET deleted_at=NOW(),updated_at=NOW()
     WHERE company_id=$1 AND id=$2 AND created_by=$3 AND deleted_at IS NULL
     RETURNING id::text,model,record_id::text`,
    [context.companyId,commentId,context.userId],
  );
  if (!result.rows[0]) {
    throw new AccountingInputError('Only the comment author can remove an active Accounting comment.');
  }
  await audit(context,'comment_removed',commentId,'Accounting collaboration comment removed.',{
    model:String(result.rows[0].model),recordId:String(result.rows[0].record_id),
  });
  return {id:commentId,removed:true};
}

export async function followAccountingRecord(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_record_followers',
    'edit',
  );
  const record=await target(context,body.model,body.recordId);
  const inserted=await context.pool.query(
    `INSERT INTO accounting_record_followers(
      company_id,model,record_id,user_id,created_by,created_at
     ) VALUES($1,$2,$3,$4,$4,NOW())
     ON CONFLICT (company_id,model,record_id,user_id)
       WHERE deleted_at IS NULL
     DO NOTHING
     RETURNING id::text`,
    [context.companyId,record.model,record.recordId,context.userId],
  );
  if (!inserted.rows[0]) {
    const existing=await context.pool.query(
      `SELECT id::text FROM accounting_record_followers
       WHERE company_id=$1 AND model=$2 AND record_id=$3 AND user_id=$4 AND deleted_at IS NULL
       LIMIT 1`,
      [context.companyId,record.model,record.recordId,context.userId],
    );
    return {id:String(existing.rows[0]?.id||''),following:true,replayed:true};
  }
  const id=String(inserted.rows[0].id);
  await audit(context,'record_followed',id,'Accounting record followed.',{
    model:record.model,recordId:record.recordId,
  });
  return {id,following:true,replayed:false};
}

export async function unfollowAccountingRecord(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_record_followers',
    'edit',
  );
  const record=await target(context,body.model,body.recordId);
  const result=await context.pool.query(
    `UPDATE accounting_record_followers
     SET deleted_at=NOW()
     WHERE company_id=$1 AND model=$2 AND record_id=$3 AND user_id=$4 AND deleted_at IS NULL
     RETURNING id::text`,
    [context.companyId,record.model,record.recordId,context.userId],
  );
  return {following:false,removed:result.rows.length>0};
}

export async function linkAccountingFile(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_collaboration_comments',
    'edit',
  );
  await requireFilesManage(context);
  const record=await target(context,body.model,body.recordId);
  const fileId=accountingId(body.fileId);
  const purpose=
    typeof body.purpose==='string' && body.purpose.trim()
      ? body.purpose.trim().slice(0,100)
      : 'supporting_document';
  let result;
  try {
    result=await linkWorkspaceFileForAuthorizedCaller({
      tenantId:context.tenantId,
      userId:context.userId,
      companyId:context.companyId,
      fileId,
      moduleKey:'accounting',
      model:record.model,
      recordId:record.recordId,
      purpose,
    });
  } catch (error) {
    throw new AccountingInputError(
      error instanceof Error ? error.message : 'This workspace file could not be linked to Accounting.',
    );
  }
  await audit(context,'file_linked',fileId,'Workspace file linked to Accounting record.',{
    model:record.model,recordId:record.recordId,purpose,
  });
  return {...result,fileId};
}

export async function unlinkAccountingFile(input:unknown) {
  const body=bodyOf(input);
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'accounting_collaboration_comments',
    'edit',
  );
  await requireFilesManage(context);
  const record=await target(context,body.model,body.recordId);
  const fileId=accountingId(body.fileId);
  const purpose=
    typeof body.purpose==='string' && body.purpose.trim()
      ? body.purpose.trim().slice(0,100)
      : 'supporting_document';
  let result;
  try {
    result=await unlinkWorkspaceFileForAuthorizedCaller({
      tenantId:context.tenantId,
      userId:context.userId,
      companyId:context.companyId,
      fileId,
      moduleKey:'accounting',
      model:record.model,
      recordId:record.recordId,
      purpose,
    });
  } catch (error) {
    throw new AccountingInputError(
      error instanceof Error ? error.message : 'This workspace file could not be unlinked from Accounting.',
    );
  }
  await audit(context,'file_unlinked',fileId,'Workspace file unlinked from Accounting record.',{
    model:record.model,recordId:record.recordId,purpose,
  });
  return {...result,fileId};
}
