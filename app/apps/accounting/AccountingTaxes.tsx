"use client";

import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FilePlus2,
  Layers3,
  Plus,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import SaMiOverlay from "@/app/components/SaMiOverlay";
import { useSaMiOverlay } from "@/app/components/useSaMiOverlay";
import type { AccountingTaxWorkspace } from "@/lib/apps/accounting/tax-engine";
import styles from "./AccountingFoundation.module.css";

function today() {
  return new Date().toISOString().slice(0,10);
}

export default function AccountingTaxes({
  data,
  canCreate,
  canEdit,
  canManageSettings,
}: {
  data: AccountingTaxWorkspace;
  canCreate: boolean;
  canEdit: boolean;
  canManageSettings: boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState("");
  const [showCode,setShowCode]=useState(false);
  const [showGroup,setShowGroup]=useState(false);
  const [showComponent,setShowComponent]=useState(false);
  const [showAdjustment,setShowAdjustment]=useState(false);
  const [codeDraft,setCodeDraft]=useState({
    code:"",name:"",taxType:"vat",direction:"both",rate:"16",
    calculation:"exclusive",recoverableRate:"100",
    inputAccountId:"",outputAccountId:"",nonrecoverableAccountId:"",
    countryCode:"",jurisdictionCode:"",validFrom:"",validTo:"",
  });
  const [groupDraft,setGroupDraft]=useState({code:"",name:"",calculation:"exclusive"});
  const [componentDraft,setComponentDraft]=useState({
    groupId:"",taxCodeId:"",sequenceNo:"10",compound:false,
  });
  const [adjustmentDraft,setAdjustmentDraft]=useState({
    taxCodeId:"",adjustmentDate:today(),direction:"input",amount:"",
    offsetAccountId:"",reason:"",reference:"",
  });
  const [reversalDate,setReversalDate]=useState(today());

  const amount=(value:unknown)=>{
    const numeric=Number(value || 0);
    return data.currency+" "+(Number.isFinite(numeric)
      ? numeric.toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2})
      : "0.00");
  };

  async function request(body:Record<string,unknown>) {
    const response=await fetch("/api/apps/accounting/taxes",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    const payload=await response.json();
    if(!response.ok) throw new Error(payload.error || "Accounting tax action failed.");
    return payload;
  }

  async function saveCode(event:FormEvent) {
    event.preventDefault();
    if(!canManageSettings) return showError("Action unavailable","You need Accounting settings permission.");
    setBusy("code");
    try {
      await request({action:"save-code",expectedCompanyId:data.companyId,...codeDraft});
      showSuccess("Tax code saved","The tax code is available to Accounting source documents.");
      setCodeDraft({
        code:"",name:"",taxType:"vat",direction:"both",rate:"16",
        calculation:"exclusive",recoverableRate:"100",
        inputAccountId:"",outputAccountId:"",nonrecoverableAccountId:"",
        countryCode:"",jurisdictionCode:"",validFrom:"",validTo:"",
      });
      setShowCode(false);
      router.refresh();
    } catch(error) {
      showError("Tax code could not be saved",error instanceof Error?error.message:"Retry this tax code.");
    } finally { setBusy(""); }
  }

  async function saveGroup(event:FormEvent) {
    event.preventDefault();
    if(!canManageSettings) return showError("Action unavailable","You need Accounting settings permission.");
    setBusy("group");
    try {
      await request({action:"save-group",expectedCompanyId:data.companyId,...groupDraft});
      showSuccess("Tax group saved","Add one or more tax components to make the group usable.");
      setGroupDraft({code:"",name:"",calculation:"exclusive"});
      setShowGroup(false);
      router.refresh();
    } catch(error) {
      showError("Tax group could not be saved",error instanceof Error?error.message:"Retry this tax group.");
    } finally { setBusy(""); }
  }

  async function saveComponent(event:FormEvent) {
    event.preventDefault();
    if(!canManageSettings) return showError("Action unavailable","You need Accounting settings permission.");
    setBusy("component");
    try {
      await request({
        action:"save-group-component",
        expectedCompanyId:data.companyId,
        ...componentDraft,
      });
      showSuccess("Tax component saved","The tax group calculation sequence has been updated.");
      setComponentDraft({groupId:"",taxCodeId:"",sequenceNo:"10",compound:false});
      setShowComponent(false);
      router.refresh();
    } catch(error) {
      showError("Tax component could not be saved",error instanceof Error?error.message:"Retry this component.");
    } finally { setBusy(""); }
  }

  async function changeStatus(kind:"code"|"group",id:string,status:"active"|"inactive") {
    if(!canManageSettings) return;
    setBusy(kind+":"+id);
    try {
      await request({
        action:kind==="code"?"set-code-status":"set-group-status",
        expectedCompanyId:data.companyId,id,status,
      });
      showSuccess("Tax status updated","The tax record is now "+status+".");
      router.refresh();
    } catch(error) {
      showError("Tax status could not be updated",error instanceof Error?error.message:"Retry this change.");
    } finally { setBusy(""); }
  }

  async function createAdjustment(event:FormEvent) {
    event.preventDefault();
    if(!canCreate) return showError("Action unavailable","You need Accounting create permission.");
    setBusy("adjustment");
    try {
      await request({action:"create-adjustment",expectedCompanyId:data.companyId,...adjustmentDraft});
      showSuccess("Tax adjustment drafted","Approve it before posting to the authoritative ledger.");
      setAdjustmentDraft({
        taxCodeId:"",adjustmentDate:today(),direction:"input",amount:"",
        offsetAccountId:"",reason:"",reference:"",
      });
      setShowAdjustment(false);
      router.refresh();
    } catch(error) {
      showError("Tax adjustment could not be created",error instanceof Error?error.message:"Retry this adjustment.");
    } finally { setBusy(""); }
  }

  async function transition(id:string,action:"approve"|"post"|"reverse"|"cancel") {
    if(!canEdit) return showError("Action unavailable","You need Accounting edit permission.");
    setBusy(action+":"+id);
    try {
      await request({
        action:action+"-adjustment",
        adjustmentId:id,
        expectedCompanyId:data.companyId,
        ...(action==="reverse"?{reversalDate}:{}),
      });
      showSuccess(
        action==="approve"?"Adjustment approved":
        action==="post"?"Adjustment posted":
        action==="reverse"?"Adjustment reversed":"Adjustment cancelled",
        action==="post"?"The adjustment is now in the authoritative ledger.":"The tax adjustment lifecycle was updated.",
      );
      router.refresh();
    } catch(error) {
      showError("Tax adjustment action failed",error instanceof Error?error.message:"Retry this action.");
    } finally { setBusy(""); }
  }

  const pageCount=Math.max(1,Math.ceil(data.purchaseCount/50));

  return <div className={styles.workspace}>
    <div className={styles.heading}>
      <div>
        <div className={styles.eyebrow}>Accounting · Tax engine · {data.currency}</div>
        <h2>Tax control center</h2>
        <p>Configure reusable tax logic, reconcile source taxes to the general ledger, and post controlled tax adjustments.</p>
      </div>
      <div className={styles.actions}>
        {canManageSettings?<button className={styles.button} type="button" onClick={()=>setShowCode(value=>!value)}><Plus size={15}/> Tax code</button>:null}
        {canManageSettings?<button className={styles.button} type="button" onClick={()=>setShowGroup(value=>!value)}><Layers3 size={15}/> Tax group</button>:null}
        {canManageSettings?<button className={styles.button} type="button" onClick={()=>setShowComponent(value=>!value)}><Calculator size={15}/> Group component</button>:null}
        {canCreate?<button className={styles.primary} type="button" onClick={()=>setShowAdjustment(value=>!value)}><FilePlus2 size={15}/> Tax adjustment</button>:null}
      </div>
    </div>

    <section className={styles.dashboardHero}>
      <div>
        <span className={styles.heroLabel}>Net tax control position</span>
        <strong className={styles.heroValue}>{amount(data.metrics.netTaxPosition)}</strong>
        <p>Output tax control less input tax control for {data.filters.from} to {data.filters.to}.</p>
      </div>
      <div className={styles.heroHealth}>
        <span className={styles.heroLabel}>Source reconciliation</span>
        <strong>{data.metrics.inputDifference==="0.00" && data.metrics.outputDifference==="0.00" ? "Balanced" : "Review"}</strong>
        <small>Input Δ {amount(data.metrics.inputDifference)} · Output Δ {amount(data.metrics.outputDifference)}</small>
      </div>
    </section>

    <section className={styles.financeCards}>
      <div className={styles.financeCard}><span>Purchase input tax</span><strong>{amount(data.metrics.sourceInputTax)}</strong><small>Recoverable source tax</small></div>
      <div className={styles.financeCard}><span>Input tax GL</span><strong>{amount(data.metrics.inputTaxGl)}</strong><small>Mapped input control accounts</small></div>
      <div className={styles.financeCard}><span>Sales output tax</span><strong>{amount(data.metrics.sourceOutputTax)}</strong><small>{data.metrics.salesSourceAvailable?"From Invoicing":"Invoicing source unavailable"}</small></div>
      <div className={styles.financeCard}><span>Output tax GL</span><strong>{amount(data.metrics.outputTaxGl)}</strong><small>Mapped output control accounts</small></div>
      <div className={styles.financeCard}><span>Non-recoverable purchase tax</span><strong>{amount(data.metrics.nonrecoverablePurchaseTax)}</strong><small>Expense/cost portion</small></div>
      <div className={styles.financeCard}><span>Configured tax codes</span><strong>{data.codes.length}</strong><small>{data.groups.length} tax groups</small></div>
    </section>

    {(data.metrics.inputDifference!=="0.00" || data.metrics.outputDifference!=="0.00")
      ? <div className={styles.notice}><AlertTriangle size={16}/> A source-to-ledger tax difference exists in this period. Review source documents, account mappings and controlled adjustments before filing or closing the period.</div>
      : <div className={styles.notice}><CheckCircle2 size={16}/> Tax source totals currently reconcile to the mapped tax control accounts for this period.</div>}

    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><span className={styles.eyebrow}>Reporting period</span><h3>Tax register filters</h3></div>
        <RefreshCcw size={18}/>
      </div>
      <form method="get" action="/apps/accounting/taxes" className={styles.setupGrid}>
        <label>From<input type="date" name="from" defaultValue={data.filters.from}/></label>
        <label>To<input type="date" name="to" defaultValue={data.filters.to}/></label>
        <div className={styles.actions}><button className={styles.primary}>Apply period</button></div>
      </form>
    </section>

    {showCode?<form onSubmit={saveCode} className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Tax definition</span><h3>New tax code</h3></div><ShieldCheck size={18}/></div>
      <div className={styles.setupGrid}>
        <label>Code<input required maxLength={80} value={codeDraft.code} onChange={e=>setCodeDraft({...codeDraft,code:e.target.value.toUpperCase()})}/></label>
        <label>Name<input required maxLength={160} value={codeDraft.name} onChange={e=>setCodeDraft({...codeDraft,name:e.target.value})}/></label>
        <label>Tax type<select value={codeDraft.taxType} onChange={e=>setCodeDraft({...codeDraft,taxType:e.target.value})}>
          <option value="vat">VAT</option><option value="sales_tax">Sales tax</option><option value="withholding">Withholding</option>
          <option value="excise">Excise</option><option value="levy">Levy</option><option value="other">Other</option>
        </select></label>
        <label>Direction<select value={codeDraft.direction} onChange={e=>setCodeDraft({...codeDraft,direction:e.target.value})}>
          <option value="both">Input & output</option><option value="input">Input only</option><option value="output">Output only</option>
        </select></label>
        <label>Rate %<input required inputMode="decimal" value={codeDraft.rate} onChange={e=>setCodeDraft({...codeDraft,rate:e.target.value})}/></label>
        <label>Calculation<select value={codeDraft.calculation} onChange={e=>setCodeDraft({...codeDraft,calculation:e.target.value})}>
          <option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option>
        </select></label>
        <label>Recoverable %<input required inputMode="decimal" value={codeDraft.recoverableRate} onChange={e=>setCodeDraft({...codeDraft,recoverableRate:e.target.value})}/></label>
        <label>Input tax account<select value={codeDraft.inputAccountId} onChange={e=>setCodeDraft({...codeDraft,inputAccountId:e.target.value})}><option value="">Use Accounting Setup default</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <label>Output tax account<select value={codeDraft.outputAccountId} onChange={e=>setCodeDraft({...codeDraft,outputAccountId:e.target.value})}><option value="">Use Accounting Setup default</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <label>Non-recoverable tax account<select value={codeDraft.nonrecoverableAccountId} onChange={e=>setCodeDraft({...codeDraft,nonrecoverableAccountId:e.target.value})}><option value="">Keep on source expense/cost</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <label>Country code<input maxLength={2} placeholder="KE" value={codeDraft.countryCode} onChange={e=>setCodeDraft({...codeDraft,countryCode:e.target.value.toUpperCase()})}/></label>
        <label>Jurisdiction<input maxLength={80} value={codeDraft.jurisdictionCode} onChange={e=>setCodeDraft({...codeDraft,jurisdictionCode:e.target.value})}/></label>
        <label>Valid from<input type="date" value={codeDraft.validFrom} onChange={e=>setCodeDraft({...codeDraft,validFrom:e.target.value})}/></label>
        <label>Valid to<input type="date" value={codeDraft.validTo} onChange={e=>setCodeDraft({...codeDraft,validTo:e.target.value})}/></label>
      </div>
      <div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setShowCode(false)}>Cancel</button><button disabled={busy==="code"} className={styles.primary}>Save tax code</button></div>
    </form>:null}

    {showGroup?<form onSubmit={saveGroup} className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Compound taxes</span><h3>New tax group</h3></div></div>
      <div className={styles.setupGrid}>
        <label>Code<input required value={groupDraft.code} onChange={e=>setGroupDraft({...groupDraft,code:e.target.value.toUpperCase()})}/></label>
        <label>Name<input required value={groupDraft.name} onChange={e=>setGroupDraft({...groupDraft,name:e.target.value})}/></label>
        <label>Calculation<select value={groupDraft.calculation} onChange={e=>setGroupDraft({...groupDraft,calculation:e.target.value})}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></select></label>
      </div>
      <div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setShowGroup(false)}>Cancel</button><button disabled={busy==="group"} className={styles.primary}>Save group</button></div>
    </form>:null}

    {showComponent?<form onSubmit={saveComponent} className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Tax group sequence</span><h3>Add or update component</h3></div></div>
      <div className={styles.setupGrid}>
        <label>Tax group<select required value={componentDraft.groupId} onChange={e=>setComponentDraft({...componentDraft,groupId:e.target.value})}><option value="">Choose group</option>{data.groups.filter(g=>g.status==="active").map(g=><option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}</select></label>
        <label>Tax code<select required value={componentDraft.taxCodeId} onChange={e=>setComponentDraft({...componentDraft,taxCodeId:e.target.value})}><option value="">Choose code</option>{data.codes.filter(t=>t.status==="active").map(t=><option key={t.id} value={t.id}>{t.code} · {t.name} · {t.rate}%</option>)}</select></label>
        <label>Sequence<input type="number" min="1" max="10000" value={componentDraft.sequenceNo} onChange={e=>setComponentDraft({...componentDraft,sequenceNo:e.target.value})}/></label>
        <label className={styles.toggleField}><input type="checkbox" checked={componentDraft.compound} onChange={e=>setComponentDraft({...componentDraft,compound:e.target.checked})}/><span>Compound on prior tax components</span></label>
      </div>
      <div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setShowComponent(false)}>Cancel</button><button disabled={busy==="component"} className={styles.primary}>Save component</button></div>
    </form>:null}

    {showAdjustment?<form onSubmit={createAdjustment} className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Controlled journal source</span><h3>New tax adjustment</h3></div></div>
      <div className={styles.setupGrid}>
        <label>Tax code<select required value={adjustmentDraft.taxCodeId} onChange={e=>setAdjustmentDraft({...adjustmentDraft,taxCodeId:e.target.value})}><option value="">Choose code</option>{data.codes.filter(t=>t.status==="active").map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select></label>
        <label>Direction<select value={adjustmentDraft.direction} onChange={e=>setAdjustmentDraft({...adjustmentDraft,direction:e.target.value})}><option value="input">Input tax</option><option value="output">Output tax</option></select></label>
        <label>Date<input required type="date" value={adjustmentDraft.adjustmentDate} onChange={e=>setAdjustmentDraft({...adjustmentDraft,adjustmentDate:e.target.value})}/></label>
        <label>Amount<input required inputMode="decimal" value={adjustmentDraft.amount} onChange={e=>setAdjustmentDraft({...adjustmentDraft,amount:e.target.value})}/></label>
        <label>Offset account<select required value={adjustmentDraft.offsetAccountId} onChange={e=>setAdjustmentDraft({...adjustmentDraft,offsetAccountId:e.target.value})}><option value="">Choose account</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        <label>Reference<input maxLength={160} value={adjustmentDraft.reference} onChange={e=>setAdjustmentDraft({...adjustmentDraft,reference:e.target.value})}/></label>
        <label>Reason<input required maxLength={500} value={adjustmentDraft.reason} onChange={e=>setAdjustmentDraft({...adjustmentDraft,reason:e.target.value})}/></label>
      </div>
      <div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setShowAdjustment(false)}>Cancel</button><button disabled={busy==="adjustment"} className={styles.primary}>Save draft adjustment</button></div>
    </form>:null}

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Configuration</span><h3>Tax codes</h3></div><span className={styles.meta}>{data.codes.length} configured</span></div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Direction</th><th>Rate</th><th>Recoverable</th><th>Calculation</th><th>Status</th><th></th></tr></thead>
        <tbody>{data.codes.length?data.codes.map(code=><tr key={code.id}>
          <td><strong>{code.code}</strong></td><td>{code.name}</td><td>{String(code.tax_type).replaceAll("_"," ")}</td><td>{code.direction}</td>
          <td className={styles.number}>{code.rate}%</td><td className={styles.number}>{code.recoverable_rate}%</td><td>{code.calculation}</td><td>{code.status}</td>
          <td>{canManageSettings?<button className={styles.button} type="button" disabled={busy==="code:"+code.id} onClick={()=>changeStatus("code",code.id,code.status==="active"?"inactive":"active")}>{code.status==="active"?"Deactivate":"Activate"}</button>:null}</td>
        </tr>):<tr><td colSpan={9}>No tax codes yet.</td></tr>}</tbody>
      </table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Compound & grouped tax</span><h3>Tax groups</h3></div></div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Code</th><th>Name</th><th>Calculation</th><th>Components</th><th>Status</th><th></th></tr></thead>
        <tbody>{data.groups.length?data.groups.map(group=><tr key={group.id}>
          <td><strong>{group.code}</strong></td><td>{group.name}</td><td>{group.calculation}</td>
          <td>{Array.isArray(group.components)?group.components.map(item=><span key={item.id} className={styles.meta}>{item.taxCode} {item.rate}%{item.compound?" · compound":""}<br/></span>):null}</td>
          <td>{group.status}</td>
          <td>{canManageSettings?<button className={styles.button} type="button" disabled={busy==="group:"+group.id} onClick={()=>changeStatus("group",group.id,group.status==="active"?"inactive":"active")}>{group.status==="active"?"Deactivate":"Activate"}</button>:null}</td>
        </tr>):<tr><td colSpan={6}>No tax groups yet.</td></tr>}</tbody>
      </table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Input tax source</span><h3>Purchase tax register</h3></div><span className={styles.meta}>{data.purchaseCount} rows</span></div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Date</th><th>Document</th><th>Vendor</th><th>Tax</th><th>Rate</th><th>Taxable</th><th>Tax</th><th>Recoverable</th><th>Non-recoverable</th></tr></thead>
        <tbody>{data.purchaseRegister.length?data.purchaseRegister.map((row,index)=><tr key={row.document_id+":"+row.tax_code_id+":"+index}>
          <td>{row.document_date}</td><td>{row.document_number}</td><td>{row.vendor}</td><td>{row.tax_code_snapshot}</td>
          <td className={styles.number}>{row.rate_snapshot}%</td><td className={styles.number}>{row.currency} {row.taxable_amount}</td>
          <td className={styles.number}>{row.currency} {row.tax_amount}</td><td className={styles.number}>{row.currency} {row.recoverable_tax_amount}</td>
          <td className={styles.number}>{row.currency} {row.nonrecoverable_tax_amount}</td>
        </tr>):<tr><td colSpan={9}>No posted purchase tax in this period.</td></tr>}</tbody>
      </table></div>
      {pageCount>1?<div className={styles.actions}>
        {data.filters.page>1?<a className={styles.button} href={"/apps/accounting/taxes?from="+data.filters.from+"&to="+data.filters.to+"&page="+(data.filters.page-1)}>Previous</a>:null}
        <span className={styles.meta}>Page {data.filters.page} of {pageCount}</span>
        {data.filters.page<pageCount?<a className={styles.button} href={"/apps/accounting/taxes?from="+data.filters.from+"&to="+data.filters.to+"&page="+(data.filters.page+1)}>Next</a>:null}
      </div>:null}
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Output tax source</span><h3>Sales tax register</h3></div><span className={styles.meta}>Invoicing-owned source documents</span></div>
      {data.metrics.salesSourceAvailable?<div className={styles.tableWrap}><table>
        <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Tax</th><th>Rate</th><th>Taxable</th><th>Tax</th><th>Base tax</th></tr></thead>
        <tbody>{data.salesRegister.length?data.salesRegister.map((row,index)=><tr key={row.invoice_id+":"+index}>
          <td>{row.invoice_date}</td><td>{row.invoice_number}</td><td>{row.customer}</td><td>{row.tax_name_snapshot || "Tax"}</td>
          <td className={styles.number}>{row.tax_rate}%</td><td className={styles.number}>{row.currency} {row.taxable_amount}</td>
          <td className={styles.number}>{row.currency} {row.tax_amount}</td><td className={styles.number}>{amount(row.base_tax_amount)}</td>
        </tr>):<tr><td colSpan={8}>No posted/confirmed sales tax in this period.</td></tr>}</tbody>
      </table></div>:<div className={styles.empty}>Invoicing tax source tables are not installed in this tenant. Accounting remains usable; output-source reconciliation will activate when Invoicing is installed.</div>}
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Controlled adjustments</span><h3>Tax adjustment register</h3></div></div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Date</th><th>Direction</th><th>Amount</th><th>Reason</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{data.adjustments.length?data.adjustments.map(row=><tr key={row.id}>
          <td>{row.adjustment_date}</td><td>{row.direction}</td><td className={styles.number}>{amount(row.amount)}</td><td>{row.reason}</td><td>{row.reference || "—"}</td><td>{row.status}</td>
          <td><div className={styles.actions}>
            {canEdit && row.status==="draft"?<button className={styles.button} disabled={busy==="approve:"+row.id} onClick={()=>transition(row.id,"approve")}>Approve</button>:null}
            {canEdit && row.status==="approved"?<button className={styles.primary} disabled={busy==="post:"+row.id} onClick={()=>transition(row.id,"post")}>Post</button>:null}
            {canEdit && ["draft","approved"].includes(row.status)?<button className={styles.button} disabled={busy==="cancel:"+row.id} onClick={()=>transition(row.id,"cancel")}>Cancel</button>:null}
            {canEdit && row.status==="posted"?<><input aria-label="Reversal date" type="date" value={reversalDate} onChange={e=>setReversalDate(e.target.value)}/><button className={styles.button} disabled={busy==="reverse:"+row.id} onClick={()=>transition(row.id,"reverse")}><RotateCcw size={14}/> Reverse</button></>:null}
          </div></td>
        </tr>):<tr><td colSpan={7}>No tax adjustments in this period.</td></tr>}</tbody>
      </table></div>
    </section>

    <SaMiOverlay {...overlay} onClose={closeOverlay}/>
  </div>;
}
