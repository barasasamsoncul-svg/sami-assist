'use client';

import { CalendarRange,CheckCircle2,LockKeyhole,RotateCcw,ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo,useState } from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingPeriodClosingWorkspace } from '@/lib/apps/accounting/period-closing';
import styles from './AccountingFoundation.module.css';

export default function AccountingPeriodClosing({
  data,
  canCreate,
  canEdit,
}:{
  data:AccountingPeriodClosingWorkspace;
  canCreate:boolean;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const [name,setName]=useState('');
  const [startsOn,setStartsOn]=useState('');
  const [endsOn,setEndsOn]=useState('');
  const [reopenReason,setReopenReason]=useState('');
  const selected=data.selectedPeriod;
  const checks=data.checks;

  const blockers=useMemo(()=>[
    {label:'Draft journals',count:checks?.draftJournals??0},
    {label:'Unreconciled bank lines',count:checks?.unreconciledBankLines??0},
    {label:'Trial balance difference',count:checks?.balanced?0:1},
  ],[checks]);

  async function post(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/period-closing',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Period-closing action failed.');
    return payload.result;
  }

  async function createPeriod() {
    setBusy('create');
    try {
      await post({action:'create-period',name,startsOn,endsOn});
      showSuccess('Fiscal period created','The period is open and ready for posting.');
      setName('');setStartsOn('');setEndsOn('');
      router.refresh();
    } catch (error) {
      showError('Period creation failed',error instanceof Error?error.message:'Retry the period creation.');
    } finally { setBusy(''); }
  }

  function closePeriod(type:'month_end'|'year_end') {
    if (!selected) return;
    confirmAction({
      title:type==='year_end'?'Complete year-end close?':'Close this period?',
      message:type==='year_end'
        ? 'SaMi will transfer income and expense balances to retained earnings, lock the period, and preserve close evidence.'
        : 'SaMi will lock this period after validating drafts, bank reconciliation, and ledger balance.',
      confirmLabel:type==='year_end'?'Run year-end close':'Close period',
      onConfirm:()=>void (async()=>{
        setBusy(type);
        try {
          await post({
            action:'close-period',
            periodId:selected.id,
            closeType:type,
            requestKey:crypto.randomUUID(),
          });
          showSuccess(type==='year_end'?'Year-end closed':'Period closed','Posting is now locked through this period end.');
          router.refresh();
        } catch (error) {
          showError('Close failed',error instanceof Error?error.message:'Retry the period close.');
        } finally { setBusy(''); }
      })(),
    });
  }

  function reopen(runId:string) {
    confirmAction({
      title:'Reopen this accounting period?',
      message:'This removes the period lock. If the close included a year-end journal, SaMi will reverse it before reopening.',
      confirmLabel:'Reopen period',
      onConfirm:()=>void (async()=>{
        setBusy('reopen');
        try {
          await post({action:'reopen-period',runId,reason:reopenReason||'Authorized accounting correction'});
          showSuccess('Period reopened','The period is open again and any year-end close journal was reversed.');
          setReopenReason('');
          router.refresh();
        } catch (error) {
          showError('Reopen failed',error instanceof Error?error.message:'Retry reopening.');
        } finally { setBusy(''); }
      })(),
    });
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Period Control</div>
          <h2>Month-end & year-end closing</h2>
          <p>Close clean periods, lock historical posting dates, and transfer annual profit or loss to retained earnings.</p>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Periods</span><h3>Select a fiscal period</h3></div><CalendarRange size={20}/></div>
        <form method="get" className={styles.filters}>
          <label>Fiscal period
            <select name="periodId" defaultValue={selected?.id||''}>
              {data.periods.map(period=><option key={period.id} value={period.id}>{period.name} · {period.starts_on} → {period.ends_on} · {period.status}</option>)}
            </select>
          </label>
          <button className={styles.button}>Open period</button>
        </form>
        {!data.periods.length ? <p className={styles.muted}>No fiscal periods exist yet. Create the first period below.</p> : null}
      </section>

      {selected ? (
        <>
          <section className={styles.financeCards}>
            <div className={styles.financeCard}><span>Status</span><strong>{selected.status}</strong><small>{selected.starts_on} → {selected.ends_on}</small></div>
            <div className={styles.financeCard}><span>Posted journals</span><strong>{checks?.postedJournals??0}</strong><small>Inside selected period</small></div>
            <div className={styles.financeCard}><span>Close blockers</span><strong>{blockers.reduce((n,row)=>n+row.count,0)}</strong><small>Must reach zero before close</small></div>
            <div className={styles.financeCard}><span>Global lock</span><strong>{data.settings.globalLockDate||'None'}</strong><small>Posting blocked on or before this date</small></div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Close checklist</span><h3>Readiness controls</h3></div>{checks?.canClose?<CheckCircle2 size={20}/>:<ShieldAlert size={20}/>}</div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Control</th><th className={styles.number}>Open items</th><th>Status</th></tr></thead>
                <tbody>
                  {blockers.map(row=><tr key={row.label}><td>{row.label}</td><td className={styles.number}>{row.count}</td><td>{row.count===0?'Ready':'Resolve first'}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className={styles.actions}>
              <button className={styles.primary} disabled={!canEdit||!checks?.canClose||busy!==''} onClick={()=>closePeriod('month_end')}><LockKeyhole size={16}/>Close month/period</button>
              <button className={styles.button} disabled={!canEdit||!checks?.canClose||!data.selectedIsFiscalYearEnd||!data.settings.retainedEarningsAccountId||busy!==''} onClick={()=>closePeriod('year_end')}><LockKeyhole size={16}/>Run year-end close</button>
            </div>
            {!data.settings.retainedEarningsAccountId ? <p className={styles.muted}>Configure retained earnings in Accounting Setup before year-end closing.</p> : null}
          </section>
        </>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>New period</span><h3>Create fiscal period</h3></div><CalendarRange size={20}/></div>
        <div className={styles.filters}>
          <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="October 2026"/></label>
          <label>Starts<input type="date" value={startsOn} onChange={e=>setStartsOn(e.target.value)}/></label>
          <label>Ends<input type="date" value={endsOn} onChange={e=>setEndsOn(e.target.value)}/></label>
          <button type="button" className={styles.button} disabled={!canCreate||!name||!startsOn||!endsOn||busy!==''} onClick={()=>void createPeriod()}>Create period</button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Audit trail</span><h3>Close history</h3></div><RotateCcw size={20}/></div>
        <div className={styles.filters}>
          <label>Reason for reopening<input value={reopenReason} onChange={e=>setReopenReason(e.target.value)} placeholder="Required business reason"/></label>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Period</th><th>Close type</th><th>Status</th><th>Completed</th><th>Journal</th><th>Action</th></tr></thead>
            <tbody>
              {data.closeRuns.map(run=>(
                <tr key={String(run.id)}>
                  <td>{String(run.period_name)}</td>
                  <td>{String(run.close_type).replace('_',' ')}</td>
                  <td>{String(run.status)}</td>
                  <td>{run.completed_at?String(run.completed_at).slice(0,19).replace('T',' '):'—'}</td>
                  <td>{run.closing_journal_id?'Posted':'—'}</td>
                  <td>{run.status==='completed'?<button type="button" className={styles.button} disabled={!canEdit||busy!==''||!reopenReason.trim()} onClick={()=>reopen(String(run.id))}>Reopen</button>:'—'}</td>
                </tr>
              ))}
              {!data.closeRuns.length?<tr><td colSpan={6}>No completed closes yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
