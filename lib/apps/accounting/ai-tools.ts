import 'server-only';

import type { SamiAiToolDefinition } from '@/lib/ai/types';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { getAccountingManagementReports } from '@/lib/apps/accounting/management-reporting';
import { getAccountingPeriodClosing } from '@/lib/apps/accounting/period-closing';
import { getAccountingApprovalControls } from '@/lib/apps/accounting/approval-controls';
import { validateJournal } from '@/lib/apps/accounting/validation';
import { saveBalancedJournalDraft } from '@/lib/apps/accounting/journal-command';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

const VIEW_PERMISSION='accounting.record.view';
const CREATE_PERMISSION='accounting.record.create';

function cleanText(value:unknown,max:number) {
  return typeof value==='string'?value.trim().slice(0,max):'';
}

function boundedLimit(value:unknown,fallback=20,max=100) {
  const n=Number(value);
  return Number.isInteger(n)&&n>0?Math.min(n,max):fallback;
}

export const ACCOUNTING_AI_TOOLS:SamiAiToolDefinition[]=[
  {
    key:'accounting_financial_overview',
    name:'Accounting financial overview',
    description:'Read current Accounting KPIs, twelve-month trend and exception summary from the authoritative ledger and subledgers for the current company.',
    moduleKey:'accounting',
    operation:'read',
    riskLevel:'low',
    confirmationRequired:false,
    requiredAllPermissions:[VIEW_PERMISSION],
    inputSchema:{
      type:'object',additionalProperties:false,
      properties:{
        from:{type:'string'},to:{type:'string'},
        compareFrom:{type:'string'},compareTo:{type:'string'},
      },
    },
    execute:async(_context,input)=>{
      const report=await getAccountingManagementReports({
        from:cleanText(input.from,10)||undefined,
        to:cleanText(input.to,10)||undefined,
        compareFrom:cleanText(input.compareFrom,10)||undefined,
        compareTo:cleanText(input.compareTo,10)||undefined,
      });
      return {
        companyId:report.companyId,
        currency:report.currency,
        filters:report.filters,
        kpis:report.kpis,
        trend:report.trend,
        exceptionSummary:report.exceptionSummary,
      };
    },
  },
  {
    key:'accounting_exception_register',
    name:'Accounting exception register',
    description:'Read unresolved Accounting exceptions such as ledger imbalance, control-account mismatches, stale drafts, unreconciled bank lines, overdue receivables/payables, budget alerts and reporting gaps.',
    moduleKey:'accounting',
    operation:'read',
    riskLevel:'low',
    confirmationRequired:false,
    requiredAllPermissions:[VIEW_PERMISSION],
    inputSchema:{
      type:'object',additionalProperties:false,
      properties:{limit:{type:'integer',minimum:1,maximum:100}},
    },
    execute:async(_context,input)=>{
      const report=await getAccountingManagementReports();
      const limit=boundedLimit(input.limit,30,100);
      return {
        currency:report.currency,
        summary:report.exceptionSummary,
        exceptions:report.exceptions.filter(row=>!row.resolved).slice(0,limit),
      };
    },
  },
  {
    key:'accounting_close_readiness',
    name:'Accounting close readiness',
    description:'Read fiscal-period close readiness, draft-journal blockers, unreconciled bank blockers, trial-balance difference, lock date and retained-earnings readiness.',
    moduleKey:'accounting',
    operation:'read',
    riskLevel:'low',
    confirmationRequired:false,
    requiredAllPermissions:[VIEW_PERMISSION],
    inputSchema:{
      type:'object',additionalProperties:false,
      properties:{periodId:{type:'string'}},
    },
    execute:async(_context,input)=>{
      const data=await getAccountingPeriodClosing({periodId:input.periodId});
      return {
        currency:data.currency,
        selectedPeriod:data.selectedPeriod,
        checks:data.checks,
        settings:data.settings,
        selectedFiscalYear:data.selectedFiscalYear,
        selectedIsFiscalYearEnd:data.selectedIsFiscalYearEnd,
        recentCloseRuns:data.closeRuns.slice(0,10),
      };
    },
  },
  {
    key:'accounting_approval_queue',
    name:'Accounting approval queue',
    description:'Read pending Accounting journal approvals, required approval counts, policies and segregation-of-duties findings. This tool never approves or posts a journal.',
    moduleKey:'accounting',
    operation:'read',
    riskLevel:'low',
    confirmationRequired:false,
    requiredAllPermissions:[VIEW_PERMISSION],
    inputSchema:{type:'object',additionalProperties:false,properties:{}},
    execute:async()=>{
      const data=await getAccountingApprovalControls();
      return {
        currency:data.currency,
        settings:data.settings,
        pending:data.pending,
        segregationFindings:data.segregationFindings,
      };
    },
  },
  {
    key:'accounting_journal_detail',
    name:'Explain Accounting journal',
    description:'Read one company-scoped journal with its ledger lines and account names so SaMi AI can explain the entry without changing it.',
    moduleKey:'accounting',
    operation:'read',
    riskLevel:'low',
    confirmationRequired:false,
    requiredAllPermissions:[VIEW_PERMISSION],
    inputSchema:{
      type:'object',additionalProperties:false,
      properties:{journalId:{type:'string'}},
      required:['journalId'],
    },
    execute:async(context,input)=>{
      const journalId=cleanText(input.journalId,80);
      const pool=await getTenantPoolByTenantId(context.tenantId);
      const journal=await pool.query(
        `SELECT id::text,journal_number,journal_date::text,reference,description,status,
          source_module,source_type,posting_kind,created_by::text,approved_by::text,posted_by::text,
          approved_at::text,posted_at::text,reversal_of_journal_id::text
         FROM journals
         WHERE company_id=$1 AND id=$2::uuid AND deleted_at IS NULL LIMIT 1`,
        [context.companyId,journalId],
      );
      if(!journal.rows[0]) return {found:false,journalId};
      const lines=await pool.query(
        `SELECT l.id::text,l.description,l.debit::text,l.credit::text,
          a.id::text AS account_id,a.code AS account_code,a.name AS account_name,a.account_type
         FROM journal_lines l
         JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id AND a.deleted_at IS NULL
         WHERE l.company_id=$1 AND l.journal_id=$2::uuid AND l.deleted_at IS NULL
         ORDER BY l.id`,
        [context.companyId,journalId],
      );
      return {found:true,journal:journal.rows[0],lines:lines.rows};
    },
  },
  {
    key:'accounting_create_draft_journal',
    name:'Create Accounting draft journal',
    description:'Create a balanced manual journal draft only after explicit confirmation. It never approves, posts or closes a period.',
    moduleKey:'accounting',
    operation:'write',
    riskLevel:'high',
    confirmationRequired:true,
    requiredAllPermissions:[CREATE_PERMISSION],
    inputSchema:{
      type:'object',additionalProperties:false,
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
    execute:async(context,input)=>{
      const validated=validateJournal({
        idempotencyKey:globalThis.crypto.randomUUID(),
        journalDate:input.journalDate,
        reference:input.reference,
        description:input.description,
        lines:input.lines,
      });
      const pool=await getTenantPoolByTenantId(context.tenantId);
      const result=await saveBalancedJournalDraft(
        pool,
        {companyId:context.companyId,userId:context.userId},
        validated,
      );
      await recordWorkspaceAuditEvent({
        tenantId:context.tenantId,
        companyId:context.companyId,
        userId:context.userId,
        action:'accounting.ai.journal_draft_created',
        module:'accounting',
        resourceType:'journals',
        resourceId:String(result.id),
        summary:'SaMi AI created a confirmed Accounting journal draft.',
        result:'success',
        metadata:{generatedBy:'sami_ai',journalNumber:result.journal_number},
      }).catch(()=>undefined);
      return {
        journalId:String(result.id),
        journalNumber:String(result.journal_number),
        status:String(result.status),
        replayed:Boolean(result.replayed),
        nextStep:'Review the draft in Accounting. Approval and posting remain separate controlled actions.',
      };
    },
  },
];
