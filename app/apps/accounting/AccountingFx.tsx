"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Plus,
  RefreshCcw,
  Repeat2,
  TriangleAlert,
} from 'lucide-react';
import { useMemo,useRef,useState,type FormEvent } from 'react';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingFxWorkspace } from '@/lib/apps/accounting/fx';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

function today(){return new Date().toISOString().slice(0,10);}
function uuid(){
  return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-'+String(Date.now()).padStart(12,'0').slice(-12);
}

export default function AccountingFx({
  data,canCreate,canEdit,
}:{data:AccountingFxWorkspace;canCreate:boolean;canEdit:boolean}){
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const paymentKey=useRef('');
  const transferKey=useRef('');
  const [settings,setSettings]=useState({
    rateSourceMode:String(data.settings.rate_source_mode||'mixed'),
    defaultRateType:String(data.settings.default_rate_type||'spot'),
    autoReverseRevaluation:Boolean(data.settings.auto_reverse_revaluation),
    revaluationReversalDays:String(data.settings.revaluation_reversal_days||1),
    unrealizedGainAccountId:String(data.settings.unrealized_gain_account_id||data.setup.fx_unrealized_gain_account_id||''),
    unrealizedLossAccountId:String(data.settings.unrealized_loss_account_id||data.setup.fx_unrealized_loss_account_id||''),
    providerKey:String(data.settings.provider_key||''),
  });
  const [currencyDraft,setCurrencyDraft]=useState({code:'USD',name:'US Dollar',symbol:'$',decimalPlaces:'2'});
  const [rateDraft,setRateDraft]=useState({currency:'USD',rateToBase:'',rateType:'spot',effectiveDate:data.asOf,sourceType:'manual',sourceName:'Manual'});
  const [paymentSource,setPaymentSource]=useState('');
  const [paymentDate,setPaymentDate]=useState(data.asOf);
  const [paymentRef,setPaymentRef]=useState('');
  const [allocations,setAllocations]=useState<Record<string,{billAmount:string;sourceAmount:string}>>({});
  const [transfer,setTransfer]=useState({date:data.asOf,sourceId:'',destinationId:'',sourceAmount:'',destinationAmount:'',reference:'',notes:''});
  const money=(value:string,currency=data.baseCurrency)=>formatAccountingAmount(value||'0.00',currency);

  const activeCurrencies=data.currencies.filter(row=>row.is_active);
  const activeAccounts=data.accounts.filter(row=>row.status==='active');
  const sourceAccount=data.accounts.find(row=>row.id===paymentSource);
  const selectedBills=useMemo(
    ()=>data.openBills.filter(row=>allocations[String(row.id)]?.billAmount&&allocations[String(row.id)]?.sourceAmount),
    [data.openBills,allocations],
  );

  async function request(body:Record<string,unknown>){
    const response=await fetch('/api/apps/accounting/fx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||'Foreign-currency action failed.');
    return payload.result as Record<string,unknown>;
  }
  async function run(key:string,body:Record<string,unknown>,title:string,message:(result:Record<string,unknown>)=>string){
    setBusy(key);
    try{
      const result=await request(body);
      showSuccess(title,message(result));
      router.refresh();
      return result;
    }catch(error){
      showError(title+' failed',error instanceof Error?error.message:'Retry this action.');
      return null;
    }finally{setBusy('');}
  }

  async function saveSettings(event:FormEvent){
    event.preventDefault();
    if(!canEdit)return;
    await run('settings',{action:'save-settings',expectedCompanyId:data.companyId,...settings},'FX settings saved',()=> 'Foreign-currency controls were updated.');
  }
  async function saveCurrency(event:FormEvent){
    event.preventDefault();
    if(!canEdit)return;
    const result=await run('currency',{action:'save-currency',expectedCompanyId:data.companyId,...currencyDraft},'Currency enabled',r=>String(r.code||currencyDraft.code)+' is available to Accounting FX and foreign financial accounts.');
    if(result)setRateDraft(d=>({...d,currency:String(result.code||d.currency)}));
  }
  async function saveRate(event:FormEvent){
    event.preventDefault();
    if(!canEdit)return;
    await run('rate',{action:'save-rate',...rateDraft},'Exchange rate saved',()=>rateDraft.currency+'/'+data.baseCurrency+' rate is now available for dated postings and revaluation.');
  }
  async function importInvoicing(){
    await run('import-invoicing',{action:'import-invoicing-rates'},'Invoicing rates imported',r=>String(r.imported||0)+' active Invoicing rate rows were copied into the Accounting FX rate history.');
  }
  async function generateRevaluation(){
    await run('generate-revaluation',{action:'generate-revaluation',asOf:data.asOf,rateType:'closing'},'Revaluation preview generated',r=>String(r.count||0)+' monetary positions were captured in a draft revaluation run.');
  }
  async function postRevaluation(runId:string){
    await run('post-revaluation:'+runId,{action:'post-revaluation',runId},'Revaluation posted',r=>'Unrealized FX was posted through balanced journal '+String(r.journalId||'')+'.');
  }
  function reverseRevaluation(runId:string){
    confirmAction({
      title:'Reverse FX revaluation?',
      message:'This posts a linked compensating journal. Use the reversal date required by your closing policy.',
      confirmLabel:'Reverse revaluation',
      onConfirm:()=>void run('reverse-revaluation:'+runId,{action:'reverse-revaluation',runId,reversalDate:today()},'Revaluation reversed',r=>'Compensating journal '+String(r.journalId||'')+' was posted.'),
    });
  }
  async function postVendorPayment(event:FormEvent){
    event.preventDefault();
    if(!paymentKey.current)paymentKey.current=uuid();
    const rows=selectedBills.map(b=>({
      billId:b.id,
      billAmount:allocations[String(b.id)].billAmount,
      sourceAmount:allocations[String(b.id)].sourceAmount,
    }));
    const result=await run('vendor-payment',{
      action:'post-vendor-payment',expectedCompanyId:data.companyId,requestKey:paymentKey.current,paymentDate,
      sourceAccountId:paymentSource,reference:paymentRef,allocations:rows,
    },'Foreign vendor payment posted',r=>'The payment posted with realized FX '+money(String(r.realizedFx||'0'))+'.');
    if(result){paymentKey.current='';setPaymentRef('');setAllocations({});}
  }
  function reverseVendorPayment(batchId:string){
    confirmAction({
      title:'Reverse foreign vendor payment?',
      message:'This restores the bill balances, foreign financial movement and realized FX through linked reversing entries.',
      confirmLabel:'Reverse payment',
      onConfirm:()=>void run('reverse-payment:'+batchId,{action:'reverse-vendor-payment',batchId,reversalDate:today()},'Foreign payment reversed',()=> 'The vendor payment and FX movement were reversed.'),
    });
  }
  async function postTransfer(event:FormEvent){
    event.preventDefault();
    if(!transferKey.current)transferKey.current=uuid();
    const result=await run('transfer',{
      action:'post-transfer',expectedCompanyId:data.companyId,requestKey:transferKey.current,transferDate:transfer.date,
      sourceAccountId:transfer.sourceId,destinationAccountId:transfer.destinationId,sourceAmount:transfer.sourceAmount,
      destinationAmount:transfer.destinationAmount,reference:transfer.reference,notes:transfer.notes,
    },'Cross-currency transfer posted',r=>'Transfer '+String(r.transferNumber||'')+' posted with conversion FX '+money(String(r.realizedFx||'0'))+'.');
    if(result){transferKey.current='';setTransfer({date:data.asOf,sourceId:'',destinationId:'',sourceAmount:'',destinationAmount:'',reference:'',notes:''});}
  }
  function reverseTransfer(id:string){
    confirmAction({
      title:'Reverse cross-currency transfer?',
      message:'This creates a linked compensating journal and reverses both foreign-currency subledger movements.',
      confirmLabel:'Reverse transfer',
      onConfirm:()=>void run('reverse-transfer:'+id,{action:'reverse-transfer',id,reversalDate:today()},'FX transfer reversed',()=> 'The cross-currency transfer was reversed.'),
    });
  }

  const errors=data.diagnostics.filter(item=>item.level==='error').length;
  const warnings=data.diagnostics.filter(item=>item.level==='warning').length;

  return <div className={styles.workspace}>
    <div className={styles.heading}>
      <div>
        <div className={styles.eyebrow}>Accounting · Foreign Currency · Base {data.baseCurrency}</div>
        <h2>Rates, settlements & revaluation</h2>
        <p>Keep the general ledger in {data.baseCurrency} while preserving foreign monetary balances, historical rates, realized FX on settlement and controlled period-end unrealized FX.</p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button} href="/apps/accounting/bank-cash"><Banknote size={15}/> Financial accounts</Link>
        <Link className={styles.button} href="/apps/accounting/payments"><CircleDollarSign size={15}/> Base-currency payments</Link>
      </div>
    </div>

    <section className={styles.financeCards}>
      <div className={styles.financeCard}><span>Base currency</span><strong>{data.baseCurrency}</strong><small>Authoritative ledger currency</small></div>
      <div className={styles.financeCard}><span>Enabled currencies</span><strong>{activeCurrencies.length}</strong><small>{activeCurrencies.filter(row=>!row.is_base).length} foreign currencies</small></div>
      <div className={styles.financeCard}><span>Open FX positions</span><strong>{data.positions.length}</strong><small>{data.positions.filter(row=>row.adjustmentAmount&&row.adjustmentAmount!=='0.00').length} require closing adjustment</small></div>
      <div className={styles.financeCard}><span>Readiness</span><strong>{errors} errors</strong><small>{warnings} warnings</small></div>
    </section>

    {data.diagnostics.length?<section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Control diagnostics</span><h3>FX readiness</h3></div>{errors?<TriangleAlert size={20}/>:<CheckCircle2 size={20}/>}</div>
      <div className={styles.healthGrid}>{data.diagnostics.map(item=><div key={item.code}><span>{item.level.toUpperCase()}</span><strong>{item.code.replaceAll('_',' ')}</strong><small>{item.message}</small></div>)}</div>
    </section>:null}

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Policy</span><h3>Foreign-currency settings</h3></div><Repeat2 size={20}/></div>
      <form onSubmit={saveSettings}>
        <div className={styles.setupGrid}>
          <label>Rate source mode<select value={settings.rateSourceMode} onChange={e=>setSettings({...settings,rateSourceMode:e.target.value})}><option value="mixed">Mixed</option><option value="manual">Manual</option><option value="invoicing">Invoicing import</option><option value="provider">External provider import</option></select></label>
          <label>Default rate type<select value={settings.defaultRateType} onChange={e=>setSettings({...settings,defaultRateType:e.target.value})}><option value="spot">Spot</option><option value="closing">Closing</option><option value="average">Average</option></select></label>
          <label>Unrealized gain account<select value={settings.unrealizedGainAccountId} onChange={e=>setSettings({...settings,unrealizedGainAccountId:e.target.value})}><option value="">Use realized FX gain mapping</option>{data.ledgerAccounts.filter(a=>String(a.account_type).startsWith('income')).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
          <label>Unrealized loss account<select value={settings.unrealizedLossAccountId} onChange={e=>setSettings({...settings,unrealizedLossAccountId:e.target.value})}><option value="">Use realized FX loss mapping</option>{data.ledgerAccounts.filter(a=>String(a.account_type).startsWith('expense')).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
          <label><input type="checkbox" checked={settings.autoReverseRevaluation} onChange={e=>setSettings({...settings,autoReverseRevaluation:e.target.checked})}/> Mark revaluation policy as auto-reverse</label>
          <label>Reversal days<input type="number" min="1" max="31" value={settings.revaluationReversalDays} onChange={e=>setSettings({...settings,revaluationReversalDays:e.target.value})}/></label>
          <label>Provider key<input value={settings.providerKey} onChange={e=>setSettings({...settings,providerKey:e.target.value})} placeholder="Optional adapter key"/></label>
        </div>
        {canEdit?<button className={styles.primary} disabled={busy==='settings'}>Save FX settings</button>:null}
      </form>
      <p className={styles.meta}>Provider keys identify a configured rate adapter; provider/API secrets are not stored in these Accounting tables. Imported provider rates retain source/date provenance.</p>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Currency registry</span><h3>Enabled currencies & exchange rates</h3></div></div>
      <div className={styles.financeCards}>{data.currencies.map(row=><div className={styles.financeCard} key={row.id}><span>{row.name}</span><strong>{row.code}</strong><small>{row.is_base?'Base currency':row.is_active?'Active':'Inactive'} · {row.decimal_places} decimals</small></div>)}</div>
      {canEdit?<form onSubmit={saveCurrency}>
        <div className={styles.setupGrid}>
          <label>Code<input required maxLength={3} value={currencyDraft.code} onChange={e=>setCurrencyDraft({...currencyDraft,code:e.target.value.toUpperCase()})}/></label>
          <label>Name<input required maxLength={120} value={currencyDraft.name} onChange={e=>setCurrencyDraft({...currencyDraft,name:e.target.value})}/></label>
          <label>Symbol<input maxLength={16} value={currencyDraft.symbol} onChange={e=>setCurrencyDraft({...currencyDraft,symbol:e.target.value})}/></label>
          <label>Decimal places<input type="number" min="0" max="6" value={currencyDraft.decimalPlaces} onChange={e=>setCurrencyDraft({...currencyDraft,decimalPlaces:e.target.value})}/></label>
        </div><button className={styles.button} disabled={busy==='currency'}><Plus size={15}/> Enable currency</button>
      </form>:null}

      {canEdit?<form onSubmit={saveRate}>
        <div className={styles.setupGrid}>
          <label>Foreign currency<select value={rateDraft.currency} onChange={e=>setRateDraft({...rateDraft,currency:e.target.value})}>{activeCurrencies.filter(row=>!row.is_base).map(row=><option key={row.id} value={row.code}>{row.code} · {row.name}</option>)}</select></label>
          <label>1 foreign = {data.baseCurrency}<input required inputMode="decimal" value={rateDraft.rateToBase} onChange={e=>setRateDraft({...rateDraft,rateToBase:e.target.value})}/></label>
          <label>Rate type<select value={rateDraft.rateType} onChange={e=>setRateDraft({...rateDraft,rateType:e.target.value})}><option value="spot">Spot</option><option value="closing">Closing</option><option value="average">Average</option></select></label>
          <label>Effective date<input type="date" required value={rateDraft.effectiveDate} onChange={e=>setRateDraft({...rateDraft,effectiveDate:e.target.value})}/></label>
          <label>Source<select value={rateDraft.sourceType} onChange={e=>setRateDraft({...rateDraft,sourceType:e.target.value})}><option value="manual">Manual</option><option value="provider">Provider</option><option value="import">Import</option></select></label>
          <label>Source name<input required value={rateDraft.sourceName} onChange={e=>setRateDraft({...rateDraft,sourceName:e.target.value})}/></label>
        </div>
        <div className={styles.actions}><button className={styles.primary} disabled={busy==='rate'}>Save rate</button>{data.invoicingRateImportAvailable?<button type="button" className={styles.button} disabled={busy==='import-invoicing'} onClick={importInvoicing}><RefreshCcw size={15}/> Import Invoicing rates</button>:null}</div>
      </form>:null}
      <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Currency</th><th>Type</th><th>Rate to {data.baseCurrency}</th><th>Source</th></tr></thead><tbody>
        {data.rates.map(row=><tr key={row.id}><td>{row.effective_date}</td><td>{row.currency}</td><td>{row.rate_type}</td><td>{row.rate_to_base}</td><td>{row.source_name||row.source_type}</td></tr>)}
        {!data.rates.length?<tr><td colSpan={5}>No foreign exchange rates have been recorded yet.</td></tr>:null}
      </tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Closing control · {data.asOf}</span><h3>Foreign monetary positions</h3></div><FileCheck2 size={20}/></div>
      <form method="get" className={styles.filters}><label>As of<input name="asOf" type="date" defaultValue={data.asOf}/></label><button className={styles.button}>Load date</button>{canCreate?<button type="button" className={styles.primary} disabled={busy==='generate-revaluation'} onClick={generateRevaluation}>Generate closing revaluation</button>:null}</form>
      <div className={styles.tableWrap}><table><thead><tr><th>Source</th><th>Currency</th><th>Foreign balance</th><th>Historical base</th><th>Closing rate</th><th>Revalued base</th><th>Adjustment</th></tr></thead><tbody>
        {data.positions.map((row,index)=><tr key={String(row.sourceType)+String(row.source_id)+index}><td>{String(row.sourceType)} · {String(row.source_reference||row.source_id)}</td><td>{String(row.currency)}</td><td>{money(String(row.foreign_balance),String(row.currency))}</td><td>{money(String(row.historical_base_balance))}</td><td>{row.closingRate?String(row.closingRate):'Missing'}</td><td>{row.revaluedBaseBalance?money(String(row.revaluedBaseBalance)):'—'}</td><td>{row.adjustmentAmount?money(String(row.adjustmentAmount)):'—'}</td></tr>)}
        {!data.positions.length?<tr><td colSpan={7}>No open foreign monetary positions at this date.</td></tr>:null}
      </tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Period-end journal lifecycle</span><h3>FX revaluation runs</h3></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Sources</th><th>Gain</th><th>Loss</th><th>Net adjustment</th><th>Status</th><th>Control</th></tr></thead><tbody>
        {data.runs.map(run=><tr key={run.id}><td>{run.as_of_date}</td><td>{run.source_count}</td><td>{money(run.total_gain)}</td><td>{money(run.total_loss)}</td><td>{money(run.net_adjustment)}</td><td><span className={styles.badge}>{run.status}</span></td><td><div className={styles.actions}>{canEdit&&run.status==='draft'?<button className={styles.primary} disabled={busy==='post-revaluation:'+run.id} onClick={()=>postRevaluation(run.id)}>Post</button>:null}{canEdit&&run.status==='posted'&&!run.reversal_journal_id?<button className={styles.button} onClick={()=>reverseRevaluation(run.id)}>Reverse</button>:null}</div></td></tr>)}
        {!data.runs.length?<tr><td colSpan={7}>No revaluation runs yet.</td></tr>:null}
      </tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Accounts payable FX</span><h3>Post foreign vendor payment</h3></div><CircleDollarSign size={20}/></div>
      <form onSubmit={postVendorPayment}>
        <div className={styles.setupGrid}>
          <label>Payment date<input type="date" required value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label>
          <label>Source financial account<select required value={paymentSource} onChange={e=>setPaymentSource(e.target.value)}><option value="">Choose account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.currency===data.baseCurrency?money(a.base_book_balance):money(a.foreign_balance,a.currency)}</option>)}</select></label>
          <label>External reference<input required maxLength={255} value={paymentRef} onChange={e=>setPaymentRef(e.target.value)}/></label>
        </div>
        {sourceAccount?<p className={styles.meta}>Source currency: {String(sourceAccount.currency)}. For each bill, enter the amount extinguished in the bill currency and the actual amount debited from this source account. SaMi calculates the realized base-currency FX difference.</p>:null}
        <div className={styles.tableWrap}><table><thead><tr><th>Bill</th><th>Vendor</th><th>Currency</th><th>Open</th><th>Bill amount</th><th>{sourceAccount?String(sourceAccount.currency):'Source'} amount</th></tr></thead><tbody>
          {data.openBills.map(b=>{const row=allocations[String(b.id)]||{billAmount:'',sourceAmount:''};return <tr key={b.id}><td>{b.document_number}</td><td>{b.vendor}</td><td>{b.currency}</td><td>{money(b.open_amount,b.currency)}</td><td><input inputMode="decimal" value={row.billAmount} placeholder="0.0000" onChange={e=>setAllocations({...allocations,[String(b.id)]:{...row,billAmount:e.target.value}})}/></td><td><input inputMode="decimal" value={row.sourceAmount} placeholder="0.0000" onChange={e=>setAllocations({...allocations,[String(b.id)]:{...row,sourceAmount:e.target.value}})}/></td></tr>})}
          {!data.openBills.length?<tr><td colSpan={6}>No open posted vendor bills.</td></tr>:null}
        </tbody></table></div>
        {canCreate?<button className={styles.primary} disabled={busy==='vendor-payment'||!paymentSource||!selectedBills.length}>Post completed FX payment</button>:null}
      </form>
      <p className={styles.meta}>This records an externally completed payment. It does not initiate a bank transfer. The original bill exchange rate is relieved from AP; the source account uses the dated spot rate and the balancing difference goes to realized FX gain/loss.</p>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Cash conversion</span><h3>Cross-currency internal transfer</h3></div><ArrowRightLeft size={20}/></div>
      <form onSubmit={postTransfer}>
        <div className={styles.setupGrid}>
          <label>Date<input type="date" required value={transfer.date} onChange={e=>setTransfer({...transfer,date:e.target.value})}/></label>
          <label>From<select required value={transfer.sourceId} onChange={e=>setTransfer({...transfer,sourceId:e.target.value})}><option value="">Choose source</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
          <label>Source amount<input required inputMode="decimal" value={transfer.sourceAmount} onChange={e=>setTransfer({...transfer,sourceAmount:e.target.value})}/></label>
          <label>To<select required value={transfer.destinationId} onChange={e=>setTransfer({...transfer,destinationId:e.target.value})}><option value="">Choose destination</option>{activeAccounts.filter(a=>a.id!==transfer.sourceId).map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
          <label>Destination amount<input required inputMode="decimal" value={transfer.destinationAmount} onChange={e=>setTransfer({...transfer,destinationAmount:e.target.value})}/></label>
          <label>Reference<input maxLength={255} value={transfer.reference} onChange={e=>setTransfer({...transfer,reference:e.target.value})}/></label>
          <label>Notes<input maxLength={2000} value={transfer.notes} onChange={e=>setTransfer({...transfer,notes:e.target.value})}/></label>
        </div>
        {canEdit?<button className={styles.primary} disabled={busy==='transfer'}>Post cross-currency transfer</button>:null}
      </form>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Realized FX audit</span><h3>Foreign vendor payments</h3></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Reference</th><th>Date</th><th>Source</th><th>Amount</th><th>Base amount</th><th>Status</th><th></th></tr></thead><tbody>
        {data.fxPayments.map(row=><tr key={row.id}><td>{row.reference}</td><td>{row.payment_date}</td><td>{row.source_name}</td><td>{money(row.gross_amount,row.currency)}</td><td>{money(row.base_gross_amount||'0')}</td><td><span className={styles.badge}>{row.status}</span></td><td>{canEdit&&row.status==='posted'?<button className={styles.button} onClick={()=>reverseVendorPayment(row.id)}>Reverse</button>:null}</td></tr>)}
        {!data.fxPayments.length?<tr><td colSpan={7}>No FX-managed vendor payments yet.</td></tr>:null}
      </tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Conversion audit</span><h3>Cross-currency transfers</h3></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Transfer</th><th>Date</th><th>Route</th><th>Source</th><th>Destination</th><th>FX</th><th>Status</th><th></th></tr></thead><tbody>
        {data.fxTransfers.map(row=><tr key={row.id}><td>{row.transfer_number}</td><td>{row.transfer_date}</td><td>{row.source_name} → {row.destination_name}</td><td>{money(row.source_amount,row.source_currency)}</td><td>{money(row.destination_amount,row.destination_currency)}</td><td>{money(row.realized_fx_amount)}</td><td><span className={styles.badge}>{row.status}</span></td><td>{canEdit&&row.status==='posted'?<button className={styles.button} onClick={()=>reverseTransfer(row.id)}>Reverse</button>:null}</td></tr>)}
        {!data.fxTransfers.length?<tr><td colSpan={8}>No cross-currency internal transfers yet.</td></tr>:null}
      </tbody></table></div>
    </section>

    <div className={styles.notice}><CheckCircle2 size={16}/> Customer-side realized FX remains owned by Invoicing payment allocations. Accounting FX does not repost those journals; this workspace owns Accounting rates, foreign financial positions, AP settlements, internal currency conversions and unrealized revaluation.</div>
    <SaMiOverlay {...overlay} onClose={closeOverlay}/>
  </div>;
}
