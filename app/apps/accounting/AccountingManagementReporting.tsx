'use client';

import { AlertTriangle,CheckCircle2,FileCheck2,RefreshCcw,Save,ShieldAlert,TrendingUp,WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingManagementReportingWorkspace,ManagementException } from '@/lib/apps/accounting/management-reporting';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

function titleCase(value:string) {
  return value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
}

export default function AccountingManagementReporting({
  data,
  canCreate,
  canEdit,
}:{
  data:AccountingManagementReportingWorkspace;
  canCreate:boolean;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const row=data.settings as Record<string,unknown>;
  const [settings,setSettings]=useState({
    enabled:row.enabled!==false,
    currentRatioWarning:String(row.current_ratio_warning || '1.00'),
    overdueReceivablesWarning:String(row.overdue_receivables_warning || '0.00'),
    overduePayablesWarning:String(row.overdue_payables_warning || '0.00'),
    unreconciledLinesWarning:String(row.unreconciled_lines_warning ?? '5'),
    budgetVarianceAlertsWarning:String(row.budget_variance_alerts_warning ?? '1'),
    warnNegativeNetMargin:row.warn_negative_net_margin!==false,
    warnNegativeCash:row.warn_negative_cash!==false,
  });

  const k=data.kpis;
  const money=(value:string|null|undefined)=>formatAccountingAmount(String(value||'0.00'),data.currency);
  const ratio=(value:string|null)=>value===null?'—':value;
  const percent=(value:string|null)=>value===null?'—':value+'%';
  const critical=data.exceptions.filter(item=>item.severity==='critical').length;
  const warnings=data.exceptions.filter(item=>item.severity==='warning').length;

  async function post(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/management-reporting',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Management reporting action failed.');
    return payload.result as Record<string,unknown>;
  }

  async function saveSettings(event:FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy('settings');
    try {
      await post({action:'save-settings',...settings});
      showSuccess('Management reporting settings saved','Exception thresholds will apply to the next report refresh.');
      router.refresh();
    } catch (error) {
      showError('Settings could not be saved',error instanceof Error?error.message:'Retry the settings update.');
    } finally {
      setBusy('');
    }
  }

  async function generateSnapshot() {
    if (!canCreate) return;
    setBusy('snapshot');
    try {
      await post({
        action:'generate-snapshot',
        requestKey:crypto.randomUUID(),
        from:data.dates.from,
        to:data.dates.to,
        compareFrom:data.dates.compareFrom,
        compareTo:data.dates.compareTo,
      });
      showSuccess('Management snapshot generated','KPIs, source health and current exceptions were captured for audit and review.');
      router.refresh();
    } catch (error) {
      showError('Snapshot failed',error instanceof Error?error.message:'Retry the snapshot.');
    } finally {
      setBusy('');
    }
  }

  function finalizeSnapshot(runId:unknown) {
    confirmAction({
      title:'Finalize this management snapshot?',
      message:'Finalization locks the KPI and exception snapshot as management-review evidence.',
      confirmLabel:'Finalize snapshot',
      onConfirm:()=>{
        void (async()=>{
          setBusy('finalize');
          try {
            await post({action:'finalize-snapshot',runId});
            showSuccess('Management snapshot finalized','The report snapshot is now locked.');
            router.refresh();
          } catch (error) {
            showError('Finalization failed',error instanceof Error?error.message:'Retry finalization.');
          } finally {
            setBusy('');
          }
        })();
      },
    });
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Management & Exceptions</div>
          <h2>Management reporting</h2>
          <p>
            See profitability, liquidity, working capital and accounting exceptions in one place, with every warning linked back to its source workflow.
          </p>
        </div>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={!canCreate||busy==='snapshot'} onClick={()=>void generateSnapshot()}>
            <FileCheck2 size={16}/>{busy==='snapshot'?'Capturing…':'Capture management snapshot'}
          </button>
        </div>
      </div>

      <form method="get" className={styles.filters}>
        <label>Current from<input type="date" name="from" defaultValue={data.dates.from} required/></label>
        <label>Current to<input type="date" name="to" defaultValue={data.dates.to} required/></label>
        <label>Compare from<input type="date" name="compareFrom" defaultValue={data.dates.compareFrom}/></label>
        <label>Compare to<input type="date" name="compareTo" defaultValue={data.dates.compareTo}/></label>
        <button className={styles.button}><RefreshCcw size={15}/>Apply periods</button>
      </form>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Revenue</span><strong>{money(k.revenue)}</strong><small>Posted income for the selected period</small></div>
        <div className={styles.financeCard}><span>Gross margin</span><strong>{percent(k.grossMarginPercent)}</strong><small>Gross profit {money(k.grossProfit)}</small></div>
        <div className={styles.financeCard}><span>Net profit / loss</span><strong>{money(k.netProfit)}</strong><small>Net margin {percent(k.netMarginPercent)}</small></div>
        <div className={styles.financeCard}><span>Cash position</span><strong>{money(k.cash)}</strong><small>Bank, cash and mobile money</small></div>
      </section>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Customers owe you</span><strong>{money(k.receivables)}</strong><small>Overdue {money(k.overdueReceivables)}</small></div>
        <div className={styles.financeCard}><span>You owe suppliers</span><strong>{money(k.payables)}</strong><small>Overdue {money(k.overduePayables)}</small></div>
        <div className={styles.financeCard}><span>Working capital</span><strong>{money(k.workingCapital)}</strong><small>Current ratio {ratio(k.currentRatio)}</small></div>
        <div className={styles.financeCard}><span>Debt to equity</span><strong>{ratio(k.debtToEquity)}</strong><small>{k.unreconciledBankLines} bank item(s) unmatched</small></div>
      </section>

      <section className={styles.healthGrid}>
        <div><span>Critical exceptions</span><strong>{critical}</strong><small>Immediate accounting integrity or cash risks</small></div>
        <div><span>Warnings</span><strong>{warnings}</strong><small>Management attention recommended</small></div>
        <div><span>Budget variance alerts</span><strong>{k.budgetVarianceAlerts}</strong><small>From published budget monitoring</small></div>
        <div><span>DSO</span><strong>{k.dsoDays===null?'—':String(k.dsoDays)+' days'}</strong><small>Receivables collection indicator</small></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><span className={styles.eyebrow}>Action queue</span><h3>Accounting exceptions</h3></div>
          {critical>0?<ShieldAlert size={21}/>:warnings>0?<AlertTriangle size={21}/>:<CheckCircle2 size={21}/>}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Severity</th><th>Issue</th><th>Value</th><th>Policy</th><th>Open source</th></tr></thead>
            <tbody>
              {data.exceptions.map((item:ManagementException)=>(
                <tr key={item.code}>
                  <td><span className={styles.badge}>{item.severity.toUpperCase()}</span></td>
                  <td><strong>{item.title}</strong><br/><span>{item.message}</span></td>
                  <td>{item.metricValue||'—'}</td>
                  <td>{item.thresholdValue||'—'}</td>
                  <td><Link className={styles.button} href={item.sourceRoute}>Review</Link></td>
                </tr>
              ))}
              {!data.exceptions.length?<tr><td colSpan={5}>No current management exceptions. The selected period is within configured controls.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Policy</span><h3>Exception thresholds</h3></div><TrendingUp size={20}/></div>
        <form className={styles.inlineForm} onSubmit={saveSettings}>
          <label>Current ratio warning below<input value={settings.currentRatioWarning} onChange={e=>setSettings({...settings,currentRatioWarning:e.target.value})}/></label>
          <label>Overdue receivables warning above<input value={settings.overdueReceivablesWarning} onChange={e=>setSettings({...settings,overdueReceivablesWarning:e.target.value})}/></label>
          <label>Overdue payables warning above<input value={settings.overduePayablesWarning} onChange={e=>setSettings({...settings,overduePayablesWarning:e.target.value})}/></label>
          <label>Unreconciled lines warning above<input value={settings.unreconciledLinesWarning} onChange={e=>setSettings({...settings,unreconciledLinesWarning:e.target.value})}/></label>
          <label>Budget-alert count warning<input value={settings.budgetVarianceAlertsWarning} onChange={e=>setSettings({...settings,budgetVarianceAlertsWarning:e.target.value})}/></label>
          <label>Negative net margin<select value={settings.warnNegativeNetMargin?'yes':'no'} onChange={e=>setSettings({...settings,warnNegativeNetMargin:e.target.value==='yes'})}><option value="yes">Warn</option><option value="no">Do not warn</option></select></label>
          <label>Negative cash<select value={settings.warnNegativeCash?'yes':'no'} onChange={e=>setSettings({...settings,warnNegativeCash:e.target.value==='yes'})}><option value="yes">Critical exception</option><option value="no">Do not flag</option></select></label>
          <button className={styles.primary} disabled={!canEdit||busy==='settings'}><Save size={15}/>Save policy</button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Audit evidence</span><h3>Management snapshots</h3></div><WalletCards size={20}/></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Period</th><th>Exceptions</th><th>Critical</th><th>Warnings</th><th>Status</th><th>Control</th></tr></thead>
            <tbody>
              {data.runs.map(row=>(
                <tr key={String(row.id)}>
                  <td>{String(row.period_start)} → {String(row.period_end)}</td>
                  <td>{String(row.exception_count)}</td>
                  <td>{String(row.critical_count)}</td>
                  <td>{String(row.warning_count)}</td>
                  <td>{String(row.status)}</td>
                  <td>{row.status==='generated'?<button type="button" className={styles.button} disabled={!canEdit||busy==='finalize'} onClick={()=>finalizeSnapshot(row.id)}>Finalize</button>:'Locked'}</td>
                </tr>
              ))}
              {!data.runs.length?<tr><td colSpan={6}>No management snapshots have been captured yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
