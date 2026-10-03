import 'server-only';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { getAccountingManagementReports } from '@/lib/apps/accounting/management-reporting';
import { getAccountingPeriodClosing } from '@/lib/apps/accounting/period-closing';
import { getAccountingApprovalControls } from '@/lib/apps/accounting/approval-controls';
import { getWorkspaceAiStatus } from '@/lib/services/workspace-ai';
import { getWorkspaceAutomationState } from '@/lib/services/workspace-automation';

function automationUsesAccounting(workflow:{
  triggerModule:string|null;
  definition:unknown;
}) {
  if (workflow.triggerModule==='accounting') return true;
  const definition=
    workflow.definition && typeof workflow.definition==='object'
      ? workflow.definition as Record<string,unknown>
      : {};
  const actions=Array.isArray(definition.actions)?definition.actions:[];
  return actions.some(step=>{
    if (!step || typeof step!=='object' || Array.isArray(step)) return false;
    const key=(step as Record<string,unknown>).actionKey;
    return typeof key==='string' && key.startsWith('accounting.');
  });
}

export async function getAccountingAutomationAi() {
  const context=await requireEnterpriseModuleTableContext(
    'accounting',
    'journals',
    'report',
  );

  const [managementResult,closingResult,approvalResult,aiResult,automationResult]=
    await Promise.allSettled([
      getAccountingManagementReports(),
      getAccountingPeriodClosing(),
      getAccountingApprovalControls(),
      getWorkspaceAiStatus(),
      getWorkspaceAutomationState(),
    ]);

  const management=managementResult.status==='fulfilled'?managementResult.value:null;
  const closing=closingResult.status==='fulfilled'?closingResult.value:null;
  const approvals=approvalResult.status==='fulfilled'?approvalResult.value:null;
  const ai=aiResult.status==='fulfilled'?aiResult.value:null;
  const automation=automationResult.status==='fulfilled'?automationResult.value:null;

  const workflows=automation
    ? automation.workflows.filter(automationUsesAccounting)
    : [];
  const workflowIds=new Set(workflows.map(row=>row.id));
  const runs=automation
    ? automation.runs.filter(row=>workflowIds.has(row.workflowId))
    : [];
  const pendingApprovals=automation
    ? automation.approvals.filter(row=>
        row.actionModule==='accounting' || workflowIds.has(row.workflowId),
      )
    : [];
  const triggers=automation
    ? automation.triggers.filter(row=>row.moduleKey==='accounting')
    : [];
  const actions=automation
    ? automation.actions.filter(row=>row.moduleKey==='accounting')
    : [];
  const aiTools=ai
    ? ai.availableTools.filter(row=>row.key.startsWith('accounting_'))
    : [];

  const recommendations:Array<{
    key:string;
    title:string;
    reason:string;
    trigger:string;
    action:string;
    priority:'high'|'medium'|'low';
  }> = [];

  const exceptionKeys=new Set(
    management?.exceptions.filter(row=>!row.resolved).map(row=>row.key) || [],
  );

  if ((approvals?.pending.length||0)>0) {
    recommendations.push({
      key:'approval-alert',
      title:'Notify on Accounting approval requests',
      reason:'There are journal approvals waiting now. A workflow can notify the runner whenever a new Accounting approval request is created.',
      trigger:'accounting.approval.requested',
      action:'core.notify_me',
      priority:'high',
    });
  }

  if (exceptionKeys.has('bank_reconciliation_gap')) {
    recommendations.push({
      key:'reconciliation-digest',
      title:'Schedule reconciliation follow-up',
      reason:'Unmatched or suggested bank items are present. A scheduled workflow can send a recurring reminder until the team clears them.',
      trigger:'core.schedule',
      action:'core.notify_me',
      priority:'medium',
    });
  }

  if (
    exceptionKeys.has('stale_draft_journals') ||
    exceptionKeys.has('trial_balance_imbalance')
  ) {
    recommendations.push({
      key:'ledger-exception-review',
      title:'Automate ledger exception review',
      reason:'The current management exception register has ledger work requiring attention. Use a scheduled notification and SaMi AI exception analysis rather than auto-posting corrections.',
      trigger:'core.schedule',
      action:'core.notify_me',
      priority:'high',
    });
  }

  if (closing?.selectedPeriod && closing.checks && !closing.checks.canClose) {
    recommendations.push({
      key:'close-readiness',
      title:'Run a close-readiness routine',
      reason:'The selected fiscal period is not ready to close. Schedule a reminder and ask SaMi AI for close blockers using the read-only close-readiness tool.',
      trigger:'core.schedule',
      action:'core.notify_me',
      priority:'medium',
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      key:'period-close-alert',
      title:'Notify after period close',
      reason:'Create a lightweight control workflow that confirms each successful Accounting period close without adding any automatic ledger write.',
      trigger:'accounting.period.closed',
      action:'core.notify_me',
      priority:'low',
    });
  }

  return {
    companyId:context.companyId,
    currency:context.company.currentCompany.currency,
    ai:{
      available:Boolean(ai),
      configured:Boolean(ai?.configured),
      entitled:Boolean(ai?.entitled),
      monthlyQueries:ai?.usage.monthlyQueries||null,
      performance:ai?.performance||null,
      tools:aiTools,
      error:aiResult.status==='rejected'
        ? (aiResult.reason instanceof Error?aiResult.reason.message:'SaMi AI status is unavailable.')
        : null,
    },
    automation:{
      available:Boolean(automation),
      canManage:Boolean(automation?.canManage),
      triggers,
      actions,
      workflows,
      runs:runs.slice(0,30),
      pendingApprovals,
      error:automationResult.status==='rejected'
        ? (automationResult.reason instanceof Error?automationResult.reason.message:'Automation status is unavailable.')
        : null,
    },
    controls:{
      exceptionSummary:management?.exceptionSummary||{total:0,high:0,medium:0,low:0},
      closeReady:Boolean(closing?.checks?.canClose),
      selectedPeriod:closing?.selectedPeriod||null,
      pendingAccountingApprovals:approvals?.pending.length||0,
    },
    recommendations,
  };
}

export type AccountingAutomationAiWorkspace=
  Awaited<ReturnType<typeof getAccountingAutomationAi>>;
