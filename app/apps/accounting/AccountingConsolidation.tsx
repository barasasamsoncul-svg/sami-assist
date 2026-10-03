'use client';

import {
  Building2,
  CheckCircle2,
  Layers3,
  Plus,
  RefreshCcw,
  Save,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { useMemo,useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingConsolidationWorkspace } from '@/lib/apps/accounting/consolidation';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

function today() {
  return new Date().toISOString().slice(0,10);
}

function yearBounds(value:string) {
  return {start:value.slice(0,4)+'-01-01',end:value.slice(0,4)+'-12-31'};
}

function rowLabel(value:unknown) {
  return String(value || '').replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
}

export default function AccountingConsolidation({
  data,
  canCreate,
  canEdit,
}:{
  data:AccountingConsolidationWorkspace;
  canCreate:boolean;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const settingsRow=data.settings as Record<string,unknown>;
  const currentCurrency=String(data.currentCompany.currency || 'KES').toUpperCase();
  const activeGroup=data.groups.find(row=>row.status==='active') || data.groups[0] || null;
  const bounds=yearBounds(today());

  const [settings,setSettings]=useState({
    enabled:settingsRow.enabled!==false,
    requireCompleteMapping:settingsRow.require_complete_mapping===true,
    defaultPresentationCurrency:String(settingsRow.default_presentation_currency || currentCurrency),
  });
  const [group,setGroup]=useState({
    name:'Group consolidation',
    code:'GROUP',
    presentationCurrency:String(settingsRow.default_presentation_currency || currentCurrency),
    translationAdjustmentCode:'CTA',
    translationAdjustmentName:'Cumulative translation adjustment',
    notes:'',
  });
  const [member,setMember]=useState({
    groupId:activeGroup ? String(activeGroup.id) : '',
    memberCompanyId:data.companies[0] ? String(data.companies[0].id) : '',
    consolidationMethod:'full',
    ownershipPercent:'100',
    effectiveFrom:'',
    effectiveTo:'',
    enabled:true,
  });
  const [mapping,setMapping]=useState({
    groupId:activeGroup ? String(activeGroup.id) : '',
    memberCompanyId:data.companies[0] ? String(data.companies[0].id) : '',
    sourceAccountId:'',
    consolidatedCode:'',
    consolidatedName:'',
    consolidatedType:'asset',
    signMultiplier:1,
  });
  const [rate,setRate]=useState({
    groupId:activeGroup ? String(activeGroup.id) : '',
    memberCompanyId:data.companies[0] ? String(data.companies[0].id) : '',
    rateDate:today(),
    rateType:'closing',
    rate:'1',
  });
  const [elimination,setElimination]=useState({
    groupId:activeGroup ? String(activeGroup.id) : '',
    eliminationDate:today(),
    reference:'',
    name:'Intercompany elimination',
    debitCode:'',
    debitName:'',
    debitType:'asset',
    creditCode:'',
    creditName:'',
    creditType:'liability',
    amount:'',
    notes:'',
  });
  const [run,setRun]=useState({
    groupId:activeGroup ? String(activeGroup.id) : '',
    periodStart:bounds.start,
    periodEnd:bounds.end,
  });

  const money=(value:unknown,currency=String(data.latestRun?.presentation_currency || currentCurrency))=>
    formatAccountingAmount(String(value || '0.00'),currency);

  const accountsForMapping=useMemo(
    ()=>data.accounts.filter(row=>!mapping.memberCompanyId || String(row.company_id)===mapping.memberCompanyId),
    [data.accounts,mapping.memberCompanyId],
  );

  async function request(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/consolidation',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error || 'Consolidation action failed.');
    return payload.result as Record<string,unknown>;
  }

  async function execute(
    key:string,
    body:Record<string,unknown>,
    title:string,
    message:string,
  ) {
    setBusy(key);
    try {
      const result=await request(body);
      showSuccess(title,message);
      router.refresh();
      return result;
    } catch (error) {
      showError(title+' failed',error instanceof Error ? error.message : 'Retry the action.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveSettings(event:FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    await execute('settings',{action:'save-settings',...settings},'Consolidation settings saved','Multi-company consolidation policy was updated.');
  }

  async function createGroup(event:FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    const result=await execute(
      'group',
      {action:'create-group',requestKey:crypto.randomUUID(),...group},
      'Consolidation group created',
      'The group is in draft until at least two authorized companies are added.',
    );
    if (result?.id) {
      const id=String(result.id);
      setMember(current=>({...current,groupId:id}));
      setMapping(current=>({...current,groupId:id}));
      setRate(current=>({...current,groupId:id}));
      setElimination(current=>({...current,groupId:id}));
      setRun(current=>({...current,groupId:id}));
    }
  }

  async function saveMember(event:FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    await execute('member',{action:'save-member',...member},'Member company saved','The authorized company is now configured for this consolidation group.');
  }

  async function saveMapping(event:FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const account=accountsForMapping.find(row=>String(row.id)===mapping.sourceAccountId);
    await execute(
      'mapping',
      {
        action:'save-mapping',
        ...mapping,
        consolidatedCode:mapping.consolidatedCode || String(account?.code || ''),
        consolidatedName:mapping.consolidatedName || String(account?.name || ''),
        consolidatedType:mapping.consolidatedType || String(account?.account_type || 'asset'),
      },
      'Account mapping saved',
      'The local account will roll into the selected consolidated account code.',
    );
  }

  async function saveRate(event:FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    await execute('rate',{action:'save-rate',...rate},'Translation rate saved','The rate is available for the next consolidation snapshot.');
  }

  async function createElimination(event:FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    await execute(
      'elimination',
      {action:'create-elimination',requestKey:crypto.randomUUID(),...elimination},
      'Elimination drafted',
      'Finalize it when the debit and credit classification has been reviewed.',
    );
  }

  function finalizeElimination(id:unknown) {
    confirmAction({
      title:'Finalize this consolidation elimination?',
      message:'Finalized eliminations are included in future consolidation snapshots for their effective period.',
      confirmLabel:'Finalize',
      onConfirm:()=>{ void execute('finalize-elimination',{action:'finalize-elimination',eliminationId:id},'Elimination finalized','The adjustment is now eligible for consolidation runs.'); },
    });
  }

  function setStatus(id:unknown,status:'active'|'closed') {
    confirmAction({
      title:status==='active'?'Activate this consolidation group?':'Close this consolidation group?',
      message:status==='active'
        ? 'Activation requires at least two active member companies.'
        : 'Closing prevents further setup changes and cannot be reversed.',
      confirmLabel:status==='active'?'Activate':'Close group',
      onConfirm:()=>{ void execute('group-status',{action:'set-group-status',groupId:id,status},'Group status updated','The consolidation group lifecycle changed successfully.'); },
    });
  }

  async function runConsolidation(event:FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    await execute(
      'run',
      {action:'run',requestKey:crypto.randomUUID(),...run},
      'Consolidation completed',
      'Posted ledgers, FX translation, ownership, eliminations and translation adjustment were snapshotted.',
    );
  }

  function finalizeRun(id:unknown) {
    confirmAction({
      title:'Finalize this consolidation snapshot?',
      message:'Finalization locks the completed snapshot for reporting and audit evidence.',
      confirmLabel:'Finalize snapshot',
      onConfirm:()=>{ void execute('finalize-run',{action:'finalize-run',runId:id},'Consolidation finalized','The snapshot is now locked for reporting.'); },
    });
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Multi-company & Consolidation</div>
          <h2>Group accounting across authorized companies</h2>
          <p>
            Consolidate posted ledgers without duplicating company books. SaMi applies controlled account mapping, ownership, closing/average/historical FX rates, finalized eliminations and an automatic equity translation adjustment.
          </p>
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Groups</span><strong>{data.metrics.groups}</strong><small>{data.metrics.activeGroups} active</small></div>
        <div className={styles.financeCard}><span>Member companies</span><strong>{data.metrics.memberCompanies}</strong><small>{data.companies.length} companies allowed to this user</small></div>
        <div className={styles.financeCard}><span>Completed snapshots</span><strong>{data.metrics.completedRuns}</strong><small>Completed or finalized</small></div>
        <div className={styles.financeCard}><span>Selected company context</span><strong>{data.selectedCompanyIds.length}</strong><small>Current session selection</small></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Policy</span><h3>Consolidation defaults</h3></div><ShieldCheck size={20}/></div>
        <form className={styles.inlineForm} onSubmit={saveSettings}>
          <label>Enabled<select value={settings.enabled?'yes':'no'} onChange={e=>setSettings({...settings,enabled:e.target.value==='yes'})}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>
          <label>Require explicit account mapping<select value={settings.requireCompleteMapping?'yes':'no'} onChange={e=>setSettings({...settings,requireCompleteMapping:e.target.value==='yes'})}><option value="no">Allow same-code fallback</option><option value="yes">Require every mapping</option></select></label>
          <label>Default presentation currency<input maxLength={3} value={settings.defaultPresentationCurrency} onChange={e=>setSettings({...settings,defaultPresentationCurrency:e.target.value.toUpperCase()})}/></label>
          <button className={styles.primary} disabled={!canEdit || busy==='settings'}><Save size={15}/>Save policy</button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Group setup</span><h3>Create consolidation group</h3></div><Layers3 size={20}/></div>
        <form className={styles.inlineForm} onSubmit={createGroup}>
          <label>Name<input value={group.name} onChange={e=>setGroup({...group,name:e.target.value})}/></label>
          <label>Code<input value={group.code} onChange={e=>setGroup({...group,code:e.target.value.toUpperCase()})}/></label>
          <label>Presentation currency<input maxLength={3} value={group.presentationCurrency} onChange={e=>setGroup({...group,presentationCurrency:e.target.value.toUpperCase()})}/></label>
          <label>CTA code<input value={group.translationAdjustmentCode} onChange={e=>setGroup({...group,translationAdjustmentCode:e.target.value.toUpperCase()})}/></label>
          <label>CTA name<input value={group.translationAdjustmentName} onChange={e=>setGroup({...group,translationAdjustmentName:e.target.value})}/></label>
          <button className={styles.primary} disabled={!canCreate || busy==='group'}><Plus size={15}/>Create group</button>
        </form>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Group</th><th>Currency</th><th>Status</th><th>Control</th></tr></thead>
            <tbody>
              {data.groups.map(row=>(
                <tr key={String(row.id)}>
                  <td><strong>{String(row.name)}</strong><br/><span>{String(row.code)}</span></td>
                  <td>{String(row.presentation_currency)}</td>
                  <td><span className={styles.badge}>{String(row.status)}</span></td>
                  <td><div className={styles.actions}>
                    {row.status==='draft' && <button className={styles.button} type="button" onClick={()=>setStatus(row.id,'active')}>Activate</button>}
                    {row.status==='active' && <button className={styles.button} type="button" onClick={()=>setStatus(row.id,'closed')}>Close</button>}
                  </div></td>
                </tr>
              ))}
              {!data.groups.length && <tr><td colSpan={4}>Create the first consolidation group.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Membership</span><h3>Companies and ownership</h3></div><Building2 size={20}/></div>
        <form className={styles.inlineForm} onSubmit={saveMember}>
          <label>Group<select value={member.groupId} onChange={e=>setMember({...member,groupId:e.target.value})}><option value="">Choose group</option>{data.groups.filter(row=>row.status!=='closed').map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>
          <label>Company<select value={member.memberCompanyId} onChange={e=>setMember({...member,memberCompanyId:e.target.value})}>{data.companies.map(company=><option key={company.id} value={company.id}>{company.name} · {company.currency}</option>)}</select></label>
          <label>Method<select value={member.consolidationMethod} onChange={e=>setMember({...member,consolidationMethod:e.target.value})}><option value="full">Full consolidation</option><option value="proportional">Proportional</option></select></label>
          <label>Ownership %<input value={member.ownershipPercent} disabled={member.consolidationMethod==='full'} onChange={e=>setMember({...member,ownershipPercent:e.target.value})}/></label>
          <button className={styles.primary} disabled={!canEdit || !member.groupId || busy==='member'}><Save size={15}/>Save member</button>
        </form>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Company</th><th>Method</th><th>Ownership</th><th>Currency</th></tr></thead><tbody>
          {data.members.map(row=><tr key={String(row.id)}><td>{String(row.member_company_name)}</td><td>{rowLabel(row.consolidation_method)}</td><td>{String(row.ownership_percent)}%</td><td>{String(row.currency)}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Chart harmonization</span><h3>Account mapping</h3></div><Scale size={20}/></div>
        <form className={styles.inlineForm} onSubmit={saveMapping}>
          <label>Group<select value={mapping.groupId} onChange={e=>setMapping({...mapping,groupId:e.target.value})}><option value="">Choose group</option>{data.groups.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>
          <label>Member company<select value={mapping.memberCompanyId} onChange={e=>setMapping({...mapping,memberCompanyId:e.target.value,sourceAccountId:''})}>{data.companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label>Source account<select value={mapping.sourceAccountId} onChange={e=>{const account=accountsForMapping.find(row=>String(row.id)===e.target.value);setMapping({...mapping,sourceAccountId:e.target.value,consolidatedCode:String(account?.code||''),consolidatedName:String(account?.name||''),consolidatedType:String(account?.account_type||'asset')});}}><option value="">Choose account</option>{accountsForMapping.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.code)} · {String(row.name)}</option>)}</select></label>
          <label>Group code<input value={mapping.consolidatedCode} onChange={e=>setMapping({...mapping,consolidatedCode:e.target.value.toUpperCase()})}/></label>
          <label>Group name<input value={mapping.consolidatedName} onChange={e=>setMapping({...mapping,consolidatedName:e.target.value})}/></label>
          <label>Type<input value={mapping.consolidatedType} onChange={e=>setMapping({...mapping,consolidatedType:e.target.value.toLowerCase()})}/></label>
          <button className={styles.primary} disabled={!canEdit || !mapping.groupId || !mapping.sourceAccountId || busy==='mapping'}><Save size={15}/>Save mapping</button>
        </form>
        <p className={styles.muted}>Without an explicit mapping, SaMi can fall back to the source account code/name unless the company policy requires complete mapping.</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Currency translation</span><h3>Closing, average and historical rates</h3></div><RefreshCcw size={20}/></div>
        <form className={styles.inlineForm} onSubmit={saveRate}>
          <label>Group<select value={rate.groupId} onChange={e=>setRate({...rate,groupId:e.target.value})}><option value="">Choose group</option>{data.groups.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>
          <label>Member company<select value={rate.memberCompanyId} onChange={e=>setRate({...rate,memberCompanyId:e.target.value})}>{data.companies.map(company=><option key={company.id} value={company.id}>{company.name} · {company.currency}</option>)}</select></label>
          <label>Rate date<input type="date" value={rate.rateDate} onChange={e=>setRate({...rate,rateDate:e.target.value})}/></label>
          <label>Rate type<select value={rate.rateType} onChange={e=>setRate({...rate,rateType:e.target.value})}><option value="closing">Closing · balance sheet</option><option value="average">Average · income/expense</option><option value="historical">Historical · equity</option></select></label>
          <label>Rate<input value={rate.rate} onChange={e=>setRate({...rate,rate:e.target.value})}/></label>
          <button className={styles.primary} disabled={!canEdit || !rate.groupId || busy==='rate'}><Save size={15}/>Save rate</button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Intercompany</span><h3>Elimination entries</h3></div><CheckCircle2 size={20}/></div>
        <form className={styles.inlineForm} onSubmit={createElimination}>
          <label>Group<select value={elimination.groupId} onChange={e=>setElimination({...elimination,groupId:e.target.value})}><option value="">Choose group</option>{data.groups.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>
          <label>Date<input type="date" value={elimination.eliminationDate} onChange={e=>setElimination({...elimination,eliminationDate:e.target.value})}/></label>
          <label>Name<input value={elimination.name} onChange={e=>setElimination({...elimination,name:e.target.value})}/></label>
          <label>Debit code<input value={elimination.debitCode} onChange={e=>setElimination({...elimination,debitCode:e.target.value.toUpperCase()})}/></label>
          <label>Debit name<input value={elimination.debitName} onChange={e=>setElimination({...elimination,debitName:e.target.value})}/></label>
          <label>Debit type<input value={elimination.debitType} onChange={e=>setElimination({...elimination,debitType:e.target.value.toLowerCase()})}/></label>
          <label>Credit code<input value={elimination.creditCode} onChange={e=>setElimination({...elimination,creditCode:e.target.value.toUpperCase()})}/></label>
          <label>Credit name<input value={elimination.creditName} onChange={e=>setElimination({...elimination,creditName:e.target.value})}/></label>
          <label>Credit type<input value={elimination.creditType} onChange={e=>setElimination({...elimination,creditType:e.target.value.toLowerCase()})}/></label>
          <label>Amount<input value={elimination.amount} onChange={e=>setElimination({...elimination,amount:e.target.value})}/></label>
          <button className={styles.primary} disabled={!canCreate || !elimination.groupId || busy==='elimination'}><Plus size={15}/>Draft elimination</button>
        </form>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Date</th><th>Entry</th><th>Amount</th><th>Status</th><th>Control</th></tr></thead><tbody>
          {data.eliminations.map(row=><tr key={String(row.id)}><td>{String(row.elimination_date)}</td><td><strong>{String(row.name)}</strong><br/><span>{String(row.debit_code)} → {String(row.credit_code)}</span></td><td>{money(row.amount,String(row.currency))}</td><td>{String(row.status)}</td><td>{row.status==='draft' && <button type="button" className={styles.button} onClick={()=>finalizeElimination(row.id)}>Finalize</button>}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Consolidation engine</span><h3>Generate controlled snapshot</h3></div><RefreshCcw size={20}/></div>
        <form className={styles.inlineForm} onSubmit={runConsolidation}>
          <label>Group<select value={run.groupId} onChange={e=>setRun({...run,groupId:e.target.value})}><option value="">Choose active group</option>{data.groups.filter(row=>row.status==='active').map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>
          <label>Period start<input type="date" value={run.periodStart} onChange={e=>setRun({...run,periodStart:e.target.value})}/></label>
          <label>Period end<input type="date" value={run.periodEnd} onChange={e=>setRun({...run,periodEnd:e.target.value})}/></label>
          <button className={styles.primary} disabled={!canCreate || !run.groupId || busy==='run'}><RefreshCcw size={15}/>Run consolidation</button>
        </form>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Group</th><th>Period</th><th>Companies</th><th>Debit</th><th>Credit</th><th>CTA</th><th>Status</th><th>Control</th></tr></thead><tbody>
          {data.runs.map(row=><tr key={String(row.id)}><td>{String(row.group_name)}</td><td>{String(row.period_start)} → {String(row.period_end)}</td><td>{String(row.source_companies)}</td><td>{money(row.total_debit,String(row.presentation_currency))}</td><td>{money(row.total_credit,String(row.presentation_currency))}</td><td>{money(row.translation_adjustment,String(row.presentation_currency))}</td><td>{String(row.status)}</td><td>{row.status==='completed' && <button type="button" className={styles.button} onClick={()=>finalizeRun(row.id)}>Finalize</button>}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Latest snapshot</span><h3>Consolidated trial balance</h3></div><Scale size={20}/></div>
        {data.latestRun ? <p className={styles.muted}>{String(data.latestRun.group_name)} · {String(data.latestRun.period_start)} → {String(data.latestRun.period_end)} · {String(data.latestRun.presentation_currency)}</p> : null}
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Opening</th><th>Period</th><th>Closing</th></tr></thead><tbody>
          {data.latestSummary.map(row=><tr key={String(row.consolidated_code)}><td>{String(row.consolidated_code)}</td><td>{String(row.consolidated_name)}</td><td>{rowLabel(row.consolidated_type)}</td><td>{money(row.opening)}</td><td>{money(row.period)}</td><td><strong>{money(row.closing)}</strong></td></tr>)}
          {!data.latestSummary.length && <tr><td colSpan={6}>Run an active consolidation group to generate the first snapshot.</td></tr>}
        </tbody></table></div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
