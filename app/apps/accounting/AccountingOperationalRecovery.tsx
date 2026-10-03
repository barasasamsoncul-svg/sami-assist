'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CircleAlert,
  Download,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Wrench,
  X,
} from 'lucide-react';
import { useMemo,useState } from 'react';

import type { AccountingOperationalRecoveryWorkspace } from '@/lib/apps/accounting/operational-recovery';
import styles from './AccountingFoundation.module.css';

type Tab='health'|'settings'|'recovery';

function healthLabel(value:AccountingOperationalRecoveryWorkspace['health']['overall']) {
  return value==='healthy'?'Healthy':value==='attention'?'Needs attention':'Action required';
}

function actionLabel(value:string) {
  return value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
}

export default function AccountingOperationalRecovery({
  initialData,
  canManage,
}:{
  initialData:AccountingOperationalRecoveryWorkspace;
  canManage:boolean;
}) {
  const router=useRouter();
  const [tab,setTab]=useState<Tab>('health');
  const [busy,setBusy]=useState<string|null>(null);
  const [confirmAction,setConfirmAction]=useState<string|null>(null);
  const [feedback,setFeedback]=useState<{kind:'success'|'error';message:string}|null>(null);

  const availableActions=useMemo(
    ()=>initialData.safeRecoveryActions.filter(action=>action.available),
    [initialData.safeRecoveryActions],
  );

  function downloadDiagnostics() {
    const payload={
      product:'SaMi Accounting',
      generatedAt:initialData.generatedAt,
      companyId:initialData.companyId,
      currency:initialData.currency,
      health:initialData.health,
      settings:initialData.settingsAreas,
      recoveryHistory:initialData.recoveryHistory.slice(0,10).map(row=>({
        actionKey:row.actionKey,
        status:row.status,
        summary:row.summary,
        createdAt:row.createdAt,
      })),
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download='sami-accounting-diagnostics-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function runAction(actionKey:string) {
    if (busy || !canManage) return;
    setBusy(actionKey);
    setConfirmAction(null);
    setFeedback(null);

    try {
      const response=await fetch('/api/apps/accounting/operational-recovery',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          actionKey,
          requestKey:globalThis.crypto.randomUUID(),
        }),
      });
      const body=await response.json().catch(()=>({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error==='string'
            ? body.error
            : 'Accounting recovery action could not be completed.',
        );
      }
      setFeedback({
        kind:'success',
        message:typeof body.result?.summary==='string'
          ? body.result.summary
          : 'Accounting recovery action completed.',
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind:'error',
        message:error instanceof Error
          ? error.message
          : 'Accounting recovery action could not be completed.',
      });
    } finally {
      setBusy(null);
    }
  }

  const selectedAction=initialData.safeRecoveryActions.find(action=>action.key===confirmAction)||null;

  return (
    <div className={styles.workspace}>
      {feedback?(
        <div className={styles.feedbackOverlay} role={feedback.kind==='error'?'alert':'status'}>
          <div className={[
            styles.feedbackCard,
            feedback.kind==='error'?styles.feedbackError:styles.feedbackSuccess,
          ].join(' ')}>
            {feedback.kind==='error'?<TriangleAlert size={18}/>:<CheckCircle2 size={18}/>}
            <div>
              <strong>{feedback.kind==='error'?'Recovery action failed':'Accounting updated'}</strong>
              <p>{feedback.message}</p>
            </div>
            <button type="button" aria-label="Dismiss message" onClick={()=>setFeedback(null)}>×</button>
          </div>
        </div>
      ):null}

      {selectedAction?(
        <div className={styles.chartEditorBackdrop} role="presentation">
          <div className={styles.chartEditor} role="dialog" aria-modal="true" aria-labelledby="accounting-recovery-confirm-title">
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>Non-destructive recovery</span>
                <h3 id="accounting-recovery-confirm-title">{selectedAction.name}</h3>
                <p>{selectedAction.description}</p>
              </div>
              <button className={styles.button} type="button" aria-label="Close recovery confirmation" onClick={()=>setConfirmAction(null)}>
                <X size={15}/>
              </button>
            </div>
            <div className={styles.notice}>
              <ShieldCheck size={17}/>
              <span>
                SaMi will not delete financial records, change posted amounts, auto-post journals,
                reopen periods or lower a lock date through this action.
              </span>
            </div>
            <div className={styles.chartEditorFooter}>
              <button className={styles.button} type="button" onClick={()=>setConfirmAction(null)}>Cancel</button>
              <button className={styles.primary} type="button" onClick={()=>runAction(selectedAction.key)}>
                <Wrench size={15}/>Run safe recovery
              </button>
            </div>
          </div>
        </div>
      ):null}

      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Accounting · Settings & recovery</span>
          <h2>Book readiness and operational recovery</h2>
          <p>
            One place to review company Accounting configuration, integrity checks and
            non-destructive recovery evidence. Financial truth remains in the ledger and
            specialist workflows.
          </p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={()=>router.refresh()}>
            <RefreshCw size={15}/>Refresh checks
          </button>
          <button className={styles.button} type="button" onClick={downloadDiagnostics}>
            <Download size={15}/>Export diagnostics
          </button>
          <Link className={styles.primary} href="/apps/accounting/setup">
            <Settings2 size={15}/>Core setup
          </Link>
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Overall health</span>
          <strong>{healthLabel(initialData.health.overall)}</strong>
          <small>{initialData.health.checks.filter(check=>check.status==='fail').length} failed · {initialData.health.checks.filter(check=>check.status==='warn').length} warnings</small>
        </div>
        <div className={styles.financeCard}>
          <span>Control mappings</span>
          <strong>{initialData.health.counts.configuredMappings} / 10</strong>
          <small>{initialData.health.counts.activeAccounts} active ledger account(s)</small>
        </div>
        <div className={styles.financeCard}>
          <span>Fiscal periods</span>
          <strong>{initialData.health.counts.openPeriods} open</strong>
          <small>{initialData.health.counts.closedPeriods} closed period(s)</small>
        </div>
        <div className={styles.financeCard}>
          <span>Operational backlog</span>
          <strong>{initialData.health.counts.staleDrafts+initialData.health.counts.pendingApprovals+initialData.health.counts.unreconciledBankLines}</strong>
          <small>stale drafts + approvals + reconciliation items</small>
        </div>
      </section>

      <div className={styles.openingModeTabs} role="tablist" aria-label="Accounting settings and recovery views">
        <button type="button" role="tab" aria-selected={tab==='health'} className={tab==='health'?styles.primary:styles.button} onClick={()=>setTab('health')}>
          <Stethoscope size={15}/>Health
        </button>
        <button type="button" role="tab" aria-selected={tab==='settings'} className={tab==='settings'?styles.primary:styles.button} onClick={()=>setTab('settings')}>
          <Settings2 size={15}/>Settings map
        </button>
        <button type="button" role="tab" aria-selected={tab==='recovery'} className={tab==='recovery'?styles.primary:styles.button} onClick={()=>setTab('recovery')}>
          <RotateCcw size={15}/>Recovery
        </button>
      </div>

      {tab==='health'?(
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Live integrity checks</span>
              <h3>Accounting health</h3>
              <p>Generated {new Date(initialData.generatedAt).toLocaleString('en-KE')} from current company data.</p>
            </div>
            {initialData.health.overall==='healthy'
              ? <CheckCircle2 size={22}/>
              : initialData.health.overall==='attention'
                ? <CircleAlert size={22}/>
                : <TriangleAlert size={22}/>}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Check</th><th>Status</th><th>Result</th><th>Detail</th><th>Open</th></tr></thead>
              <tbody>
                {initialData.health.checks.map(check=>(
                  <tr key={check.key}>
                    <td><strong>{check.title}</strong></td>
                    <td>{check.status==='pass'?'Pass':check.status==='warn'?'Warning':'Action required'}</td>
                    <td>{check.summary}</td>
                    <td>{check.detail}</td>
                    <td><Link className={styles.link} href={check.href}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {initialData.health.raw.latestAccountingMigration?(
            <div className={styles.notice}>
              <ShieldCheck size={16}/>
              <span>Latest recorded Accounting migration: <strong>{initialData.health.raw.latestAccountingMigration}</strong>.</span>
            </div>
          ):null}
        </section>
      ):null}

      {tab==='settings'?(
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Configuration map</span>
              <h3>Accounting settings by domain</h3>
              <p>Specialist settings remain owned by their Accounting workflows; this hub does not duplicate them.</p>
            </div>
            <Settings2 size={22}/>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Area</th><th>Status</th><th>Purpose</th><th>Open</th></tr></thead>
              <tbody>
                {initialData.settingsAreas.map(area=>(
                  <tr key={area.key}>
                    <td><strong>{area.title}</strong></td>
                    <td>{area.configured?'Configured':'Not yet configured'}</td>
                    <td>{area.description}</td>
                    <td><Link className={styles.link} href={area.href}>Configure</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ):null}

      {tab==='recovery'?(
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>Safe actions</span>
                <h3>Operational recovery</h3>
                <p>Only bounded, auditable actions that preserve posted Accounting evidence are exposed here.</p>
              </div>
              <Wrench size={22}/>
            </div>

            {!canManage?(
              <div className={styles.notice}>
                You can inspect Accounting health and recovery history, but running recovery actions requires Accounting settings permission.
              </div>
            ):null}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Recovery action</th><th>Purpose</th><th>Availability</th><th>Action</th></tr></thead>
                <tbody>
                  {initialData.safeRecoveryActions.map(action=>(
                    <tr key={action.key}>
                      <td><strong>{action.name}</strong></td>
                      <td>{action.description}</td>
                      <td>{action.available?'Available':'Not required'}</td>
                      <td>
                        {action.key==='capture_diagnostics'?(
                          <button
                            className={styles.button}
                            type="button"
                            disabled={!canManage||busy!==null}
                            onClick={()=>runAction(action.key)}
                          >
                            {busy===action.key?'Running…':'Capture'}
                          </button>
                        ):(
                          <button
                            className={styles.button}
                            type="button"
                            disabled={!canManage||!action.available||busy!==null}
                            onClick={()=>setConfirmAction(action.key)}
                          >
                            {busy===action.key?'Running…':'Review & run'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canManage && availableActions.length===1 && availableActions[0]?.key==='capture_diagnostics'?(
              <div className={styles.notice}>
                <CheckCircle2 size={16}/>
                <span>No state-changing safe recovery is currently required. Diagnostic capture remains available for support evidence.</span>
              </div>
            ):null}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>Evidence</span>
                <h3>Recovery history</h3>
              </div>
              <RotateCcw size={22}/>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>When</th><th>Action</th><th>Status</th><th>Summary</th></tr></thead>
                <tbody>
                  {initialData.recoveryHistory.map(row=>(
                    <tr key={row.id}>
                      <td>{new Date(row.createdAt).toLocaleString('en-KE')}</td>
                      <td>{actionLabel(row.actionKey)}</td>
                      <td>{row.status}</td>
                      <td>{row.failureMessage||row.summary||'—'}</td>
                    </tr>
                  ))}
                  {!initialData.recoveryHistory.length?(
                    <tr><td colSpan={4}>No Accounting recovery action has been recorded for this company.</td></tr>
                  ):null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ):null}
    </div>
  );
}
