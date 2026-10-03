'use client';

import { CheckCircle2,Scale,ShieldCheck,UserCheck,XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingApprovalControlsWorkspace } from '@/lib/apps/accounting/approval-controls';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

export default function AccountingApprovalControls({
  data,
  canEdit,
}:{
  data:AccountingApprovalControlsWorkspace;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const [makerChecker,setMakerChecker]=useState(data.settings.enforceMakerChecker);
  const [postingSeparation,setPostingSeparation]=useState(data.settings.requirePostingSeparation);
  const [reversalReason,setReversalReason]=useState(data.settings.requireReversalReason);
  const [defaultApprovals,setDefaultApprovals]=useState(String(data.settings.defaultRequiredApprovals));
  const [name,setName]=useState('');
  const [postingKind,setPostingKind]=useState('any');
  const [minAmount,setMinAmount]=useState('0.00');
  const [maxAmount,setMaxAmount]=useState('');
  const [requiredApprovals,setRequiredApprovals]=useState('1');
  const [approverMode,setApproverMode]=useState('any_authorized');
  const [approverUserId,setApproverUserId]=useState('');
  const [requireNote,setRequireNote]=useState(false);
  const [priority,setPriority]=useState('100');
  const [decisionNote,setDecisionNote]=useState('');
  const money=(value:string)=>formatAccountingAmount(value,data.currency);

  async function post(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/approval-controls',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Accounting approval-control action failed.');
    return payload.result;
  }

  async function saveSettings() {
    setBusy('settings');
    try {
      await post({
        action:'save-settings',
        enforceMakerChecker:makerChecker,
        requirePostingSeparation:postingSeparation,
        requireReversalReason:reversalReason,
        defaultRequiredApprovals:Number(defaultApprovals),
      });
      showSuccess('Approval controls saved','New journal approvals will use the updated segregation rules.');
      router.refresh();
    } catch (error) {
      showError('Settings not saved',error instanceof Error?error.message:'Retry the approval settings.');
    } finally { setBusy(''); }
  }

  async function createPolicy() {
    setBusy('policy');
    try {
      await post({
        action:'create-policy',
        name,postingKind,minAmount,maxAmount:maxAmount||null,
        requiredApprovals:Number(requiredApprovals),
        approverMode,
        approverUserId:approverMode==='specific_user'?approverUserId:null,
        requireNote,
        priority:Number(priority),
      });
      showSuccess('Approval band created','Matching journal amounts will use this policy by priority.');
      setName('');setMinAmount('0.00');setMaxAmount('');setRequiredApprovals('1');
      setApproverMode('any_authorized');setApproverUserId('');setRequireNote(false);setPriority('100');
      router.refresh();
    } catch (error) {
      showError('Policy not created',error instanceof Error?error.message:'Retry the approval policy.');
    } finally { setBusy(''); }
  }

  function archivePolicy(policyId:string) {
    confirmAction({
      title:'Archive this approval policy?',
      message:'New approval requests will stop matching this policy. Existing request evidence remains unchanged.',
      confirmLabel:'Archive policy',
      onConfirm:()=>void (async()=>{
        setBusy('archive:'+policyId);
        try {
          await post({action:'archive-policy',policyId});
          showSuccess('Policy archived','Historical approval evidence was preserved.');
          router.refresh();
        } catch (error) {
          showError('Policy not archived',error instanceof Error?error.message:'Retry archiving.');
        } finally { setBusy(''); }
      })(),
    });
  }

  async function decide(requestId:string,decision:'approved'|'rejected') {
    setBusy(decision+':'+requestId);
    try {
      const result=await post({action:'decision',requestId,decision,note:decisionNote});
      showSuccess(
        decision==='approved'?'Approval recorded':'Request rejected',
        result?.status==='approved'
          ? 'The journal has enough approvals and is now ready for posting.'
          : decision==='approved'
            ? 'Your approval was recorded. Additional approval is still required.'
            : 'The request was rejected and the journal remains a draft.',
      );
      setDecisionNote('');
      router.refresh();
    } catch (error) {
      showError('Decision failed',error instanceof Error?error.message:'Retry the approval decision.');
    } finally { setBusy(''); }
  }

  const memberName=(id:unknown)=>
    data.members.find(member=>member.userId===String(id))?.name||String(id||'—');

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Internal Control</div>
          <h2>Approvals & audit controls</h2>
          <p>Configure maker-checker, amount-based approval bands, separation of duties, decision evidence and audit exceptions.</p>
        </div>
        <Link className={styles.button} href="/apps/accounting/journals">Journal register</Link>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Pending approvals</span><strong>{data.pending.length}</strong><small>Journal requests awaiting decisions</small></div>
        <div className={styles.financeCard}><span>Active policies</span><strong>{data.policies.filter(row=>row.is_active).length}</strong><small>Amount and approver rules</small></div>
        <div className={styles.financeCard}><span>Segregation findings</span><strong>{data.segregationFindings.length}</strong><small>Historical maker/approver/poster overlaps</small></div>
        <div className={styles.financeCard}><span>Default approvals</span><strong>{data.settings.defaultRequiredApprovals}</strong><small>Used where no amount band matches</small></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Segregation policy</span><h3>Journal control defaults</h3></div><ShieldCheck size={20}/></div>
        <div className={styles.formGrid}>
          <label><input type="checkbox" checked={makerChecker} onChange={e=>setMakerChecker(e.target.checked)}/> Maker-checker: creator cannot approve own journal</label>
          <label><input type="checkbox" checked={postingSeparation} onChange={e=>setPostingSeparation(e.target.checked)}/> Approvers cannot also post the journal</label>
          <label><input type="checkbox" checked={reversalReason} onChange={e=>setReversalReason(e.target.checked)}/> Require business reason for reversals</label>
          <label>Default required approvals
            <select value={defaultApprovals} onChange={e=>setDefaultApprovals(e.target.value)}>
              <option value="1">1 approval</option><option value="2">2 approvals</option><option value="3">3 approvals</option>
            </select>
          </label>
        </div>
        <button type="button" className={styles.primary} disabled={!canEdit||busy!==''} onClick={()=>void saveSettings()}>Save controls</button>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Approval bands</span><h3>Add amount-based policy</h3></div><Scale size={20}/></div>
        <div className={styles.formGrid}>
          <label>Policy name<input value={name} onChange={e=>setName(e.target.value)} placeholder="High-value journals"/></label>
          <label>Journal type<select value={postingKind} onChange={e=>setPostingKind(e.target.value)}><option value="any">Any manual/opening</option><option value="manual">Manual</option><option value="opening">Opening</option></select></label>
          <label>Minimum amount<input inputMode="decimal" value={minAmount} onChange={e=>setMinAmount(e.target.value)}/></label>
          <label>Maximum amount<input inputMode="decimal" value={maxAmount} onChange={e=>setMaxAmount(e.target.value)} placeholder="No maximum"/></label>
          <label>Required approvals<select value={requiredApprovals} onChange={e=>setRequiredApprovals(e.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
          <label>Approver rule<select value={approverMode} onChange={e=>setApproverMode(e.target.value)}><option value="any_authorized">Any authorized Accounting editor</option><option value="owner">Workspace owner</option><option value="specific_user">Specific user</option></select></label>
          {approverMode==='specific_user'?<label>Specific approver<select value={approverUserId} onChange={e=>setApproverUserId(e.target.value)}><option value="">Choose user</option>{data.members.map(member=><option key={member.userId} value={member.userId}>{member.name}{member.isOwner?' · owner':''}</option>)}</select></label>:null}
          <label>Priority<input type="number" min="0" value={priority} onChange={e=>setPriority(e.target.value)}/></label>
          <label><input type="checkbox" checked={requireNote} onChange={e=>setRequireNote(e.target.checked)}/> Require approver note</label>
        </div>
        <button type="button" className={styles.primary} disabled={!canEdit||!name.trim()||busy!==''||(approverMode==='specific_user'&&!approverUserId)} onClick={()=>void createPolicy()}>Create approval policy</button>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Policy</th><th>Range</th><th>Journal</th><th>Approvals</th><th>Approver</th><th>Priority</th><th>Status</th><th/></tr></thead>
            <tbody>
              {data.policies.map(row=>(
                <tr key={String(row.id)}>
                  <td><strong>{String(row.name)}</strong>{row.require_note?<div className={styles.muted}>Note required</div>:null}</td>
                  <td>{money(String(row.min_amount))} → {row.max_amount?money(String(row.max_amount)):'No limit'}</td>
                  <td>{String(row.posting_kind)}</td>
                  <td>{Number(row.required_approvals)}</td>
                  <td>{row.approver_mode==='specific_user'?memberName(row.approver_user_id):String(row.approver_mode).replace('_',' ')}</td>
                  <td>{Number(row.priority)}</td>
                  <td>{row.is_active?'Active':'Archived'}</td>
                  <td>{row.is_active?<button type="button" className={styles.button} disabled={!canEdit||busy!==''} onClick={()=>archivePolicy(String(row.id))}>Archive</button>:null}</td>
                </tr>
              ))}
              {!data.policies.length?<tr><td colSpan={8}>No custom approval bands yet. Default controls apply.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Approval queue</span><h3>Pending journal decisions</h3></div><UserCheck size={20}/></div>
        <div className={styles.filters}><label>Decision note<input value={decisionNote} onChange={e=>setDecisionNote(e.target.value)} placeholder="Reason or review evidence"/></label></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Journal</th><th>Amount</th><th>Policy</th><th>Progress</th><th>Requested by</th><th>Decision</th></tr></thead>
            <tbody>
              {data.pending.map(row=>{
                const policy=row.policy_snapshot_json as Record<string,unknown>;
                return <tr key={String(row.id)}>
                  <td><Link href={'/apps/accounting/journals?journalId='+encodeURIComponent(String(row.journal_id))}><strong>{String(row.journal_number)}</strong></Link><div className={styles.muted}>{String(row.journal_date)} · {String(row.description||'')}</div></td>
                  <td>{money(String(row.amount))}</td>
                  <td>{String(policy?.policyName||'Default control')}</td>
                  <td>{Number(row.approval_count)} / {Number(row.required_approvals)}</td>
                  <td>{memberName(row.requested_by)}</td>
                  <td><div className={styles.actions}><button type="button" className={styles.primary} disabled={!canEdit||busy!==''} onClick={()=>void decide(String(row.id),'approved')}><CheckCircle2 size={14}/>Approve</button><button type="button" className={styles.button} disabled={!canEdit||busy!==''} onClick={()=>void decide(String(row.id),'rejected')}><XCircle size={14}/>Reject</button></div></td>
                </tr>;
              })}
              {!data.pending.length?<tr><td colSpan={6}>No journal approvals are waiting.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Audit review</span><h3>Segregation-of-duties findings</h3></div><ShieldCheck size={20}/></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Journal</th><th>Finding</th><th>Creator</th><th>Approver</th><th>Poster</th></tr></thead>
            <tbody>
              {data.segregationFindings.map(row=><tr key={String(row.id)}><td>{String(row.journal_number)}</td><td>{String(row.finding).replaceAll('_',' ')}</td><td>{memberName(row.created_by)}</td><td>{memberName(row.approved_by)}</td><td>{memberName(row.posted_by)}</td></tr>)}
              {!data.segregationFindings.length?<tr><td colSpan={5}>No creator/approver/poster overlap found in the recent journal history.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Decision evidence</span><h3>Recent approval requests</h3></div><CheckCircle2 size={20}/></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Journal</th><th>Amount</th><th>Status</th><th>Approvals</th><th>Requested</th><th>Resolved</th></tr></thead>
            <tbody>{data.history.map(row=><tr key={String(row.id)}><td>{String(row.journal_number)}</td><td>{money(String(row.amount))}</td><td>{String(row.status)}</td><td>{Number(row.approval_count)} / {Number(row.required_approvals)}</td><td>{String(row.requested_at||'').slice(0,19).replace('T',' ')}</td><td>{row.resolved_at?String(row.resolved_at).slice(0,19).replace('T',' '):'—'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
