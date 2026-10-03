import 'server-only';

import { getPermissionContext } from '@/lib/auth/permission-context';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { dispatchBusinessAutomationEventSafely } from '@/lib/automation/business-events';
import type {
  SamiAutomationActionDefinition,
  SamiAutomationActionHandler,
  SamiAutomationRuntimeContext,
  SamiAutomationTriggerDefinition,
} from '@/lib/automation/types';
import { validateJournal } from '@/lib/apps/accounting/validation';
import { saveBalancedJournalDraft } from '@/lib/apps/accounting/journal-command';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

const VIEW='accounting.record.view';
const CREATE='accounting.record.create';

export const ACCOUNTING_AUTOMATION_TRIGGERS:SamiAutomationTriggerDefinition[]=[
  {
    key:'accounting.journal.approved',
    name:'Accounting journal approved',
    description:'Run after a manual or opening Accounting journal completes its approval requirements.',
    type:'event',moduleKey:'accounting',resourceKey:'journal',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.journal.posted',
    name:'Accounting journal posted',
    description:'Run after an Accounting journal becomes part of the immutable posted ledger.',
    type:'event',moduleKey:'accounting',resourceKey:'journal',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.journal.reversed',
    name:'Accounting journal reversed',
    description:'Run after a posted Accounting journal receives a linked compensating reversal.',
    type:'event',moduleKey:'accounting',resourceKey:'journal',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.approval.requested',
    name:'Accounting approval requested',
    description:'Run when a journal enters the Accounting approval queue.',
    type:'event',moduleKey:'accounting',resourceKey:'approval_request',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.approval.approved',
    name:'Accounting approval completed',
    description:'Run when an Accounting journal approval request reaches the approved state.',
    type:'event',moduleKey:'accounting',resourceKey:'approval_request',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.approval.rejected',
    name:'Accounting approval rejected',
    description:'Run when an Accounting journal approval request is rejected.',
    type:'event',moduleKey:'accounting',resourceKey:'approval_request',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.period.closed',
    name:'Accounting period closed',
    description:'Run after a month-end or year-end fiscal period is successfully closed and locked.',
    type:'event',moduleKey:'accounting',resourceKey:'fiscal_period',
    requiredPermissions:[VIEW],companyScoped:true,
  },
  {
    key:'accounting.period.reopened',
    name:'Accounting period reopened',
    description:'Run after an authorized fiscal-period reopen completes.',
    type:'event',moduleKey:'accounting',resourceKey:'fiscal_period',
    requiredPermissions:[VIEW],companyScoped:true,
  },
];

export const ACCOUNTING_AUTOMATION_ACTIONS:SamiAutomationActionDefinition[]=[
  {
    key:'accounting.journal.create_draft',
    name:'Create Accounting journal draft',
    description:'Create a balanced manual journal draft through Accounting validation. The action always requires approval and never approves or posts the journal.',
    moduleKey:'accounting',
    operation:'write',
    resourceKey:'journal',
    requiredPermissions:[CREATE],
    approvalPolicy:'always',
    inputSchema:{
      type:'object',
      additionalProperties:false,
      properties:{
        journalDate:{type:'string'},
        reference:{type:'string',maxLength:255},
        description:{type:'string',maxLength:1000},
        lines:{
          type:'array',minItems:2,maxItems:100,
          items:{
            type:'object',additionalProperties:false,
            properties:{
              accountId:{type:'string'},
              description:{type:'string',maxLength:500},
              debit:{oneOf:[{type:'string'},{type:'number'}]},
              credit:{oneOf:[{type:'string'},{type:'number'}]},
            },
            required:['accountId','debit','credit'],
          },
        },
      },
      required:['journalDate','description','lines'],
    },
  },
];

async function createDraft(
  runtime:SamiAutomationRuntimeContext,
  input:Record<string,unknown>,
) {
  const validated=validateJournal({
    idempotencyKey:globalThis.crypto.randomUUID(),
    journalDate:input.journalDate,
    reference:input.reference,
    description:input.description,
    lines:input.lines,
  });
  const pool=await getTenantPoolByTenantId(runtime.tenantId);
  const result=await saveBalancedJournalDraft(
    pool,
    {companyId:runtime.companyId,userId:runtime.userId},
    validated,
  );
  await recordWorkspaceAuditEvent({
    tenantId:runtime.tenantId,
    companyId:runtime.companyId,
    userId:runtime.userId,
    actorType:runtime.sessionId==='automation-worker'?'system':'human',
    action:'accounting.automation.journal_draft_created',
    module:'accounting',
    resourceType:'journals',
    resourceId:String(result.id),
    summary:'Approved automation created an Accounting journal draft.',
    result:'success',
    metadata:{generatedBy:'automation',journalNumber:result.journal_number},
  }).catch(()=>undefined);
  return {
    journalId:String(result.id),
    journalNumber:String(result.journal_number),
    status:String(result.status),
    replayed:Boolean(result.replayed),
  };
}

export const ACCOUNTING_AUTOMATION_ACTION_HANDLERS=
  new Map<string,SamiAutomationActionHandler>([
    ['accounting.journal.create_draft',createDraft],
  ]);

export async function dispatchAccountingAutomationEventSafely(input:{
  tenantId:string;
  userId:string;
  companyId:string;
  triggerKey:string;
  recordType:string;
  recordId?:string|null;
  payload?:Record<string,unknown>;
  idempotencySeed:string;
}) {
  try {
    const permissions=await getPermissionContext();
    if (
      permissions.tenantId!==input.tenantId ||
      permissions.userId!==input.userId
    ) {
      return {matched:0,started:0,failed:0};
    }
    return dispatchBusinessAutomationEventSafely({
      runtime:{
        userId:permissions.userId,
        sessionId:permissions.sessionId,
        tenantId:permissions.tenantId,
        companyId:input.companyId,
        accessibleModuleKeys:['accounting'],
        permissionSet:permissions.permissionSet,
        isOwner:permissions.isOwner,
      },
      moduleKey:'accounting',
      triggerKey:input.triggerKey,
      recordType:input.recordType,
      recordId:input.recordId||null,
      payload:input.payload||{},
      idempotencySeed:input.idempotencySeed,
    });
  } catch (error) {
    console.error('[Accounting] Automation event dispatch failed',error);
    return {matched:0,started:0,failed:1};
  }
}
