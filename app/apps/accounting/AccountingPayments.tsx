'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingPaymentsWorkspace } from '@/lib/apps/accounting/payments';
import { formatAccountingAmount, minorUnits, decimalAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

export default function AccountingPayments({data,canCreate,canTransition}: {
  data:AccountingPaymentsWorkspace;canCreate:boolean;canTransition:boolean;
}) {
  const router=useRouter();
  const {overlay,closeOverlay,showError,showSuccess,confirmAction}=useSaMiOverlay();
  const [mode,setMode]=useState<'list'|'vendor_payment'|'settlement'>('list');
  const [busy,setBusy]=useState(false);
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  const [selected,setSelected]=useState<string|null>(null);
  const [reversalDate,setReversalDate]=useState(new Date().toISOString().slice(0,10));
  const key=useRef('');
  const batch=data.batches.find(b=>b.id===selected);
  const money=(value:string)=>formatAccountingAmount(value,data.currency);
  let total='0.00';
  try {total=decimalAmount(Object.values(amounts).reduce((sum,value)=>sum+minorUnits(value),BigInt(0)));} catch {total='0.00';}
  async function send(body:Record<string,unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const response=await fetch('/api/apps/accounting/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,expectedCompanyId:data.companyId})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error||'Payment action failed.');
      key.current=''; setMode('list'); setAmounts({});
      showSuccess('Payment updated',body.action==='post'?'The completed payment is recorded in the ledger.':'Your changes have been saved.');
      router.refresh();
    } catch(error) {showError('Payment could not be saved',error instanceof Error?error.message:'Please try again.');}
    finally {setBusy(false);}
  }
  function prepare(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    if (!key.current) key.current=crypto.randomUUID();
    void send({action:'create',requestKey:key.current,kind:mode,reference:form.get('reference'),paymentDate:form.get('paymentDate'),
      sourceAccountId:form.get('sourceAccountId'),notes:form.get('notes'),
      ...(mode==='settlement'?{destinationAccountId:form.get('destinationAccountId'),grossAmount:form.get('grossAmount'),feeAmount:form.get('feeAmount'),feeAccountId:form.get('feeAccountId')}:
        {allocations:Object.entries(amounts).filter(([,amount])=>amount && amount!=='0' && amount!=='0.00').map(([billId,amount])=>({billId,amount}))})});
  }
  function action(action:string,id:string) {
    confirmAction({title:action==='post'?'Record completed payment?':action==='reverse'?'Reverse this payment?':action==='approve'?'Approve payment batch?':'Cancel payment batch?',
      message:action==='post'?'Confirm that the bank or provider has completed this payment. This records the ledger entries; it does not send money.':action==='reverse'?'A linked reversing journal will be posted and bill balances restored. This does not recover money from the recipient.':'The batch and its reference will remain in payment history.',
      confirmLabel:action==='post'?'Record payment':'Continue',onConfirm:()=>void send({action,batchId:id,reversalDate})});
  }
  function remittance() {
    if (!batch) return;
    const cell=(value:unknown)=>'"'+String(value??'').replace(/^[=+@\-\t\r\n]/,"'$&").replaceAll('"','""')+'"';
    const rows=[['Payment reference','Status','Date','Currency','Vendor','Bill','Amount'],
      ...batch.allocations.map((a:{vendor:string;billNumber:string;amount:string})=>[batch.reference,batch.status,batch.payment_date,batch.currency,a.vendor,a.billNumber,a.amount])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='remittance-'+batch.id+'.csv';link.click();URL.revokeObjectURL(url);
  }
  return <div className={styles.workspace}>
    <div className={styles.heading}><div><div className={styles.eyebrow}>Accounting · Payments</div><h2>Payments & settlements</h2>
      <p>Prepare vendor payments and record provider settlements with their fees. Customer receipts remain in Invoicing.</p></div>
      <div className={styles.actions}><Link className={styles.button} href='/apps/invoicing/payments'>Customer receipts</Link>
        {mode==='list' && canCreate && <><button className={styles.primary} onClick={()=>{key.current='';setSelected(null);setMode('vendor_payment');}}>Prepare payment</button>
          <button className={styles.button} onClick={()=>{key.current='';setSelected(null);setMode('settlement');}}>Prepare settlement</button></>}
        {mode!=='list' && <button disabled={busy} className={styles.button} onClick={()=>setMode('list')}>Back to payments</button>}</div></div>
    {mode!=='list'?<form className={styles.panel} onSubmit={prepare}>
      <h3>{mode==='vendor_payment'?'Prepare vendor payment batch':'Prepare provider settlement'}</h3>
      <p>{mode==='settlement'?'Use the account holding already-recorded receipts as the source. Gross less fees is the amount received by the destination bank.':'Choose bills and full or partial amounts. Approve the batch, then record it after the external payment completes.'}</p>
      <fieldset disabled={busy} style={{border:0,padding:0,marginTop:20}}>
      <div className={styles.formGrid}>
        <label>Payment date<input name='paymentDate' type='date' required defaultValue={new Date().toISOString().slice(0,10)}/></label>
        <label>Bank / provider reference<input name='reference' required maxLength={255}/></label>
        <label>Source account<select name='sourceAccountId' required defaultValue=''><option value=''>Choose account</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {money(a.balance)}</option>)}</select></label>
      </div>
      {mode==='settlement' && <div className={styles.formGrid} style={{marginTop:16}}>
        <label>Destination bank<select name='destinationAccountId' required defaultValue=''><option value=''>Choose account</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Gross amount ({data.currency})<input name='grossAmount' inputMode='decimal' required pattern='[0-9]+(\.[0-9]{1,2})?'/></label>
        <label>Provider fees<input name='feeAmount' inputMode='decimal' defaultValue='0.00' pattern='[0-9]+(\.[0-9]{1,2})?'/></label>
        <label>Fee expense account<select name='feeAccountId' defaultValue=''><option value=''>None (no fees)</option>{data.feeAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
      </div>}
      {mode==='vendor_payment' && <><div className={styles.tableWrap} style={{marginTop:20}}><table><thead><tr><th>Bill</th><th>Vendor</th><th>Due</th><th>Outstanding</th><th>Payment amount</th></tr></thead><tbody>
        {data.bills.map(b=><tr key={b.id}><td>{b.document_number}</td><td>{b.vendor}</td><td>{b.due_date}</td><td>{money(b.open_amount)}</td><td><input aria-label={'Payment for '+b.document_number} inputMode='decimal' value={amounts[b.id]||''} placeholder='0.00' pattern='[0-9]+(\.[0-9]{1,2})?' onChange={e=>setAmounts({...amounts,[b.id]:e.target.value})}/></td></tr>)}
        {!data.bills.length && <tr><td colSpan={5}>No open bills in {data.currency}. Post a bill in Payables first.</td></tr>}
      </tbody></table></div><p>Batch total: <strong>{money(total)}</strong>. Up to 90 bills per batch; oldest 500 open bills shown.</p></>}
      <div className={styles.formGrid} style={{marginTop:20}}><label>Notes<input name='notes' maxLength={2000}/></label><button className={styles.primary} type='submit'>Save draft</button></div>
      </fieldset></form>:<>
      {batch && <section className={styles.panel} aria-label='Payment detail'><div className={styles.heading}><div><h3>{batch.reference}</h3><p>{batch.status} · {batch.payment_date} · {batch.source_name}{batch.destination_name?' → '+batch.destination_name:''}</p></div><button className={styles.button} onClick={()=>setSelected(null)}>Close detail</button></div>
        <p>Gross {money(batch.gross_amount)} · Fees {money(batch.fee_amount)} · Net {money(batch.net_amount)}</p><p>{batch.notes}</p>
        {batch.allocations.length>0 && <><ul>{batch.allocations.map((a:{billNumber:string;vendor:string;amount:string},i:number)=><li key={i}>{a.vendor} · {a.billNumber} · {money(a.amount)}</li>)}</ul><button className={styles.button} onClick={remittance}>Download remittance CSV</button></>}
        <div className={styles.actions} style={{marginTop:16}}>
          {batch.posted_journal_id && <Link className={styles.button} href='/apps/accounting/general-ledger'>View general ledger</Link>}
          {canTransition && <>{batch.status==='draft' && <button disabled={busy} className={styles.primary} onClick={()=>action('approve',batch.id)}>Approve</button>}
            {batch.status==='approved' && <button disabled={busy} className={styles.primary} onClick={()=>action('post',batch.id)}>Record completed payment</button>}
            {['draft','approved'].includes(batch.status) && <button disabled={busy} className={styles.button} onClick={()=>action('cancel',batch.id)}>Cancel batch</button>}
            {batch.status==='posted' && <><label>Reversal date<input type='date' value={reversalDate} onChange={e=>setReversalDate(e.target.value)}/></label><button disabled={busy || !reversalDate} className={styles.button} onClick={()=>action('reverse',batch.id)}>Reverse payment</button></>}</>}
        </div></section>}
      <section className={styles.panel}><h3>Payment history</h3><div className={styles.tableWrap}><table><thead><tr><th>Reference</th><th>Date</th><th>Type</th><th>Source</th><th>Gross</th><th>Fees</th><th>Status</th></tr></thead><tbody>
        {data.batches.map(b=><tr key={b.id}><td><button className={styles.button} onClick={()=>setSelected(b.id)}>{b.reference}</button></td><td>{b.payment_date}</td><td>{b.kind==='settlement'?'Settlement':'Vendor payment'}</td><td>{b.source_name}</td><td>{money(b.gross_amount)}</td><td>{money(b.fee_amount)}</td><td><span className={styles.badge}>{b.status}</span></td></tr>)}
        {!data.batches.length && <tr><td colSpan={7}>No payment batches yet. Prepare a vendor payment or provider settlement to begin.</td></tr>}
      </tbody></table></div><div className={styles.actions} style={{marginTop:16}}>{data.page>1 && <Link className={styles.button} href={'/apps/accounting/payments?page='+(data.page-1)}>Previous</Link>}<span>Page {data.page}</span>{data.hasMore && <Link className={styles.button} href={'/apps/accounting/payments?page='+(data.page+1)}>Next</Link>}</div></section>
      <p>These actions record payments made outside SaMi. Base-currency payments are supported; cross-currency payments will follow with foreign-currency accounting.</p>
    </>}
    <SaMiOverlay {...overlay} onClose={closeOverlay}/>
  </div>;
}
