import {
  Bot,
  BrainCircuit,
  CircleAlert,
  Clock3,
  ExternalLink,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';

import type {
  AccountingAutomationAiWorkspace,
} from '@/lib/apps/accounting/automation-ai';
import styles from './AccountingFoundation.module.css';

function statusLabel(value:unknown) {
  return String(value||'—').replaceAll('_',' ');
}

export default function AccountingAutomationAi({
  data,
}:{
  data:AccountingAutomationAiWorkspace;
}) {
  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Automation & SaMi AI</div>
          <h2>Intelligence without bypassing controls</h2>
          <p>
            Use SaMi AI to explain authoritative Accounting data and Automation to orchestrate
            controlled workflows. Posting, approval, reversal and period close remain governed
            by their Accounting services.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/ai">
            <Sparkles size={15}/>Open SaMi AI
          </Link>
          <Link className={styles.button} href="/automation">
            <Workflow size={15}/>Open Automation
          </Link>
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Accounting AI tools</span>
          <strong>{data.ai.tools.length}</strong>
          <small>{data.ai.configured?'SaMi AI provider ready':'Provider not configured'}</small>
        </div>
        <div className={styles.financeCard}>
          <span>Accounting workflows</span>
          <strong>{data.automation.workflows.length}</strong>
          <small>{data.automation.workflows.filter(row=>row.status==='active').length} active</small>
        </div>
        <div className={styles.financeCard}>
          <span>Pending automation approvals</span>
          <strong>{data.automation.pendingApprovals.length}</strong>
          <small>Protected automation steps waiting for authorization</small>
        </div>
        <div className={styles.financeCard}>
          <span>Accounting exceptions</span>
          <strong>{data.controls.exceptionSummary.total}</strong>
          <small>
            {data.controls.exceptionSummary.high} high · {data.controls.exceptionSummary.medium} medium
          </small>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>SaMi AI</span>
            <h3>Accounting capabilities</h3>
          </div>
          <BrainCircuit size={20}/>
        </div>
        {!data.ai.available?(
          <div className={styles.notice}>
            <CircleAlert size={16}/>
            <span>{data.ai.error||'SaMi AI is not available for this workspace or user.'}</span>
          </div>
        ):(
          <>
            <div className={styles.financeCards}>
              <div className={styles.financeCard}>
                <span>Configured</span>
                <strong>{data.ai.configured?'Yes':'No'}</strong>
                <small>Provider routing remains a SaMi platform concern</small>
              </div>
              <div className={styles.financeCard}>
                <span>24h AI requests</span>
                <strong>{Number(data.ai.performance?.requests24h||0)}</strong>
                <small>{Number(data.ai.performance?.failures24h||0)} failed</small>
              </div>
              <div className={styles.financeCard}>
                <span>24h tool calls</span>
                <strong>{Number(data.ai.performance?.toolCalls24h||0)}</strong>
                <small>Permission-filtered workspace tools</small>
              </div>
              <div className={styles.financeCard}>
                <span>Monthly allowance used</span>
                <strong>{Number(data.ai.monthlyQueries?.used||0)}</strong>
                <small>{data.ai.monthlyQueries?.limit??'—'} available for the period</small>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Accounting AI tool</th>
                    <th>Operation</th>
                    <th>Risk</th>
                    <th>Confirmation</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ai.tools.map(tool=>(
                    <tr key={tool.key}>
                      <td><strong>{tool.name}</strong><div className={styles.muted}>{tool.key}</div></td>
                      <td>{statusLabel(tool.operation)}</td>
                      <td>{statusLabel(tool.riskLevel)}</td>
                      <td>{tool.confirmationRequired?'Required':'Not required'}</td>
                    </tr>
                  ))}
                  {!data.ai.tools.length?(
                    <tr><td colSpan={4}>No Accounting-specific AI tools are available to this user.</td></tr>
                  ):null}
                </tbody>
              </table>
            </div>

            <div className={styles.notice}>
              <ShieldCheck size={16}/>
              <span>
                SaMi AI may create a balanced manual journal <strong>draft</strong> only after explicit
                confirmation. It has no Accounting write tool for approval, posting, reversal,
                month-end close or year-end close.
              </span>
            </div>
          </>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Automation</span>
            <h3>Accounting event catalog</h3>
          </div>
          <Workflow size={20}/>
        </div>
        {!data.automation.available?(
          <div className={styles.notice}>
            <CircleAlert size={16}/>
            <span>{data.automation.error||'Automation is not available for this workspace or user.'}</span>
          </div>
        ):(
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Trigger</th><th>Key</th><th>Type</th><th>Scope</th></tr></thead>
                <tbody>
                  {data.automation.triggers.map(trigger=>(
                    <tr key={trigger.key}>
                      <td><strong>{trigger.name}</strong><div className={styles.muted}>{trigger.description}</div></td>
                      <td>{trigger.key}</td>
                      <td>{trigger.type}</td>
                      <td>{trigger.companyScoped?'Current company':'Workspace'}</td>
                    </tr>
                  ))}
                  {!data.automation.triggers.length?<tr><td colSpan={4}>No Accounting automation triggers are available.</td></tr>:null}
                </tbody>
              </table>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Accounting action</th><th>Operation</th><th>Approval policy</th></tr></thead>
                <tbody>
                  {data.automation.actions.map(action=>(
                    <tr key={action.key}>
                      <td><strong>{action.name}</strong><div className={styles.muted}>{action.description}</div></td>
                      <td>{action.operation}</td>
                      <td>{statusLabel(action.approvalPolicy)}</td>
                    </tr>
                  ))}
                  {!data.automation.actions.length?<tr><td colSpan={3}>No Accounting automation actions are available.</td></tr>:null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Suggested controls</span>
            <h3>Recommended automations from current Accounting state</h3>
          </div>
          <Bot size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Recommendation</th><th>Why now</th><th>Trigger</th><th>Action</th><th>Priority</th></tr></thead>
            <tbody>
              {data.recommendations.map(row=>(
                <tr key={row.key}>
                  <td><strong>{row.title}</strong></td>
                  <td>{row.reason}</td>
                  <td>{row.trigger}</td>
                  <td>{row.action}</td>
                  <td>{row.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link className={styles.primary} href="/automation">
          Build in Automation <ExternalLink size={14}/>
        </Link>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Accounting workflows</span>
            <h3>Configured workflow status</h3>
          </div>
          <PlayCircle size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Workflow</th><th>Trigger</th><th>Status</th><th>Active version</th><th>Updated</th></tr></thead>
            <tbody>
              {data.automation.workflows.map(row=>(
                <tr key={row.id}>
                  <td><strong>{row.name}</strong><div className={styles.muted}>{row.description||'No description'}</div></td>
                  <td>{row.triggerKey||'—'}</td>
                  <td>{row.status}</td>
                  <td>{row.activeVersion??'—'}</td>
                  <td>{row.updatedAt?new Date(row.updatedAt).toLocaleString('en-KE'):'—'}</td>
                </tr>
              ))}
              {!data.automation.workflows.length?<tr><td colSpan={5}>No Accounting workflows configured yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Recent execution</span>
            <h3>Accounting automation runs</h3>
          </div>
          <Clock3 size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Workflow</th><th>Status</th><th>Attempt</th><th>Started</th><th>Error</th></tr></thead>
            <tbody>
              {data.automation.runs.map(row=>(
                <tr key={row.id}>
                  <td>{row.workflowName}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td>{row.attempt} / {row.maxAttempts}</td>
                  <td>{row.startedAt?new Date(row.startedAt).toLocaleString('en-KE'):'—'}</td>
                  <td>{row.errorMessage||'—'}</td>
                </tr>
              ))}
              {!data.automation.runs.length?<tr><td colSpan={5}>No Accounting automation runs yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
