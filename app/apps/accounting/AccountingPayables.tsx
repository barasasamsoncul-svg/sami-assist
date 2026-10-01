"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  UserPlus,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import SaMiOverlay from "@/app/components/SaMiOverlay";
import { useSaMiOverlay } from "@/app/components/useSaMiOverlay";
import type {
  AccountingPayablesWorkspace,
} from "@/lib/apps/accounting/payables-types";
import { formatAccountingAmount } from "@/lib/apps/accounting/validation";
import styles from "./AccountingFoundation.module.css";

type DraftLine = {
  id: number;
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
};

function line(id: number): DraftLine {
  return { id, accountId:"", description:"", quantity:"1", unitPrice:"", taxAmount:"0" };
}

export default function AccountingPayables({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingPayablesWorkspace;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState("");
  const [showVendor,setShowVendor]=useState(false);
  const [showDocument,setShowDocument]=useState(false);
  const [vendorDraft,setVendorDraft]=useState({
    vendorCode:"",name:"",email:"",phone:"",taxNumber:"",
    currency:data.currency,paymentTermsDays:"30",
  });
  const [documentDraft,setDocumentDraft]=useState({
    documentType:"bill",vendorId:"",documentNumber:"",vendorReference:"",
    documentDate:new Date().toISOString().slice(0,10),
    dueDate:new Date().toISOString().slice(0,10),
    currency:data.currency,exchangeRate:"1",
  });
  const [lines,setLines]=useState<DraftLine[]>([line(1)]);
  const [nextLine,setNextLine]=useState(2);
  const [creditTarget,setCreditTarget]=useState("");
  const [creditAmount,setCreditAmount]=useState("");
  const [applicationDate,setApplicationDate]=useState(new Date().toISOString().slice(0,10));
  const [reversalDate,setReversalDate]=useState(new Date().toISOString().slice(0,10));

  const amount=(value:string)=>formatAccountingAmount(value,data.currency);
  const selected=data.selected;
  const pageCount=Math.max(1,Math.ceil(data.documentCount/50));

  function query(changes:{page?:number;bucket?:string;vendorId?:string;search?:string}) {
    const p=new URLSearchParams();
    const page=changes.page ?? data.filters.page;
    const bucket=changes.bucket !== undefined ? changes.bucket : data.filters.bucket;
    const vendorId=changes.vendorId !== undefined ? changes.vendorId : data.filters.vendorId;
    const search=changes.search !== undefined ? changes.search : data.filters.search;
    if(page>1)p.set("page",String(page));
    if(bucket)p.set("bucket",bucket);
    if(vendorId)p.set("vendorId",vendorId);
    if(search)p.set("search",search);
    const q=p.toString();
    return "/apps/accounting/payables"+(q?"?"+q:"");
  }

  async function request(url:string,body:Record<string,unknown>) {
    const response=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||"Accounts Payable action failed.");
    return payload;
  }

  async function createVendor(event:FormEvent) {
    event.preventDefault();
    if(!canCreate)return showError("Action unavailable","You need Accounting create permission.");
    setBusy("vendor");
    try {
      await request("/api/apps/accounting/payables",{
        action:"create-vendor",expectedCompanyId:data.companyId,...vendorDraft,
      });
      showSuccess("Vendor created","The vendor is ready for bills and vendor credits.");
      setShowVendor(false);
      setVendorDraft({vendorCode:"",name:"",email:"",phone:"",taxNumber:"",currency:data.currency,paymentTermsDays:"30"});
      router.refresh();
    } catch(error) {
      showError("Vendor could not be created",error instanceof Error?error.message:"Retry this vendor.");
    } finally { setBusy(""); }
  }

  async function createDocument(event:FormEvent) {
    event.preventDefault();
    if(!canCreate)return showError("Action unavailable","You need Accounting create permission.");
    setBusy("document");
    try {
      const payload=await request("/api/apps/accounting/payables",{
        action:"create-document",expectedCompanyId:data.companyId,...documentDraft,
        lines:lines.map(row=>({
          accountId:row.accountId,description:row.description,quantity:row.quantity,
          unitPrice:row.unitPrice,taxAmount:row.taxAmount,
        })),
      });
      const id=String(payload.result?.id||"");
      if(!id)throw new Error("SaMi did not return the vendor document ID.");
      showSuccess("Vendor document saved","The document is a draft and has not changed the ledger.");
      setShowDocument(false);
      router.push("/apps/accounting/payables/"+encodeURIComponent(id));
      router.refresh();
    } catch(error) {
      showError("Vendor document could not be created",error instanceof Error?error.message:"Retry this document.");
    } finally { setBusy(""); }
  }

  async function action(name:"approve"|"post"|"cancel"|"reverse") {
    if(!selected || !canEdit)return showError("Action unavailable","You need Accounting edit permission.");
    setBusy(name);
    try {
      await request("/api/apps/accounting/payables/"+encodeURIComponent(selected.id),{
        action:name,expectedCompanyId:data.companyId,
        ...(name==="reverse"?{reversalDate}:{}),
      });
      showSuccess(
        name==="approve"?"Document approved":name==="post"?"Document posted":name==="reverse"?"Document reversed":"Document cancelled",
        name==="post"?"The vendor document is now in the authoritative ledger.":"The Accounts Payable workflow was updated.",
      );
      router.refresh();
    } catch(error) {
      showError("Accounts Payable action failed",error instanceof Error?error.message:"Retry this action.");
    } finally { setBusy(""); }
  }

  async function applyCredit(event:FormEvent) {
    event.preventDefault();
    if(!selected || !canEdit)return;
    setBusy("credit");
    try {
      await request("/api/apps/accounting/payables/"+encodeURIComponent(selected.id),{
        action:"apply-credit",expectedCompanyId:data.companyId,
        billDocumentId:creditTarget,amount:creditAmount,applicationDate,
      });
      showSuccess("Vendor credit applied","The credit reduced the selected bill without creating a duplicate ledger posting.");
      setCreditTarget("");setCreditAmount("");
      router.refresh();
    } catch(error) {
      showError("Credit could not be applied",error instanceof Error?error.message:"Retry this credit application.");
    } finally { setBusy(""); }
  }

  return <div className={styles.workspace}>
    <div className={styles.heading}>
      <div>
        <div className={styles.eyebrow}>Accounting · Accounts Payable · {data.currency}</div>
        <h2>{selected?selected.document_number:"Vendor bills & payables"}</h2>
        <p>{selected
          ?"Review the vendor document, its accounting lines, applications and controlled ledger lifecycle."
          :"Manage supplier balances, bills, vendor credits, aging and AP-to-ledger reconciliation."}</p>
      </div>
      <div className={styles.actions}>
        {selected?<Link className={styles.button} href="/apps/accounting/payables"><ArrowLeft size={15}/> All payables</Link>:null}
        {canCreate?<button className={styles.button} type="button" onClick={()=>setShowVendor(v=>!v)}><UserPlus size={15}/> New vendor</button>:null}
        {canCreate?<button className={styles.primary} type="button" onClick={()=>setShowDocument(v=>!v)}><FilePlus2 size={15}/> New bill / credit</button>:null}
      </div>
    </div>

    <section className={styles.dashboardHero}>
      <div>
        <span className={styles.heroLabel}>Net accounts payable</span>
        <strong className={styles.heroValue}>{amount(data.metrics.netPayable)}</strong>
        <p>{data.metrics.billCount} open bills across {data.metrics.vendorCount} vendors.</p>
      </div>
      <div className={styles.heroHealth}>
        <span className={styles.heroLabel}>Overdue</span>
        <strong>{amount(data.metrics.overdue)}</strong>
        <small>{data.metrics.overdueBillCount} overdue bills</small>
      </div>
    </section>

    <section className={styles.financeCards}>
      <div className={styles.financeCard}><span>Open bills</span><strong>{amount(data.metrics.outstandingBills)}</strong><small>Posted vendor obligations</small></div>
      <div className={styles.financeCard}><span>Vendor credits</span><strong>{amount(data.metrics.availableCredits)}</strong><small>Available posted credits</small></div>
      <div className={styles.financeCard}><span>Drafts</span><strong>{data.counts.draft}</strong><small>Not yet approved</small></div>
      <div className={styles.financeCard}><span>Approved</span><strong>{data.counts.approved}</strong><small>Ready for posting</small></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><span className={styles.eyebrow}>Control reconciliation</span><h3>Accounts Payable</h3></div>
        {data.control.reconciled?<CheckCircle2 size={20}/>:<AlertTriangle size={20}/>}
      </div>
      <div className={styles.receivableControlValues}>
        <div><span>General ledger</span><strong>{amount(data.control.glBalance)}</strong></div>
        <div><span>Vendor subledger + opening AP</span><strong>{amount(data.control.subledgerBalance)}</strong></div>
        <div><span>Difference</span><strong>{amount(data.control.difference)}</strong></div>
      </div>
      <p className={styles.meta}>{data.control.accountCode
        ? data.control.accountCode+" · "+data.control.accountName
        : "Map the Accounts Payable control account in Accounting Setup before posting."}</p>
    </section>

    {!data.control.reconciled?<div className={styles.notice}><AlertTriangle size={16}/> A non-zero AP control difference means the vendor subledger and posted ledger disagree. Review postings before manual adjustments.</div>:null}

    <section className={styles.healthGrid}>
      {data.aging.map(row=><Link key={row.bucket} href={query({page:1,bucket:row.bucket})}>
        <span>{row.bucket==="current"?"Current":row.bucket+" days"}</span>
        <strong>{amount(row.amount)}</strong>
        <small>{row.count} bill{row.count===1?"":"s"}</small>
      </Link>)}
    </section>

    {showVendor?<form onSubmit={createVendor} className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Vendor master</span><h3>Create vendor</h3></div></div>
      <div className={styles.setupGrid}>
        <label>Vendor code<input required maxLength={50} value={vendorDraft.vendorCode} onChange={e=>setVendorDraft({...vendorDraft,vendorCode:e.target.value})}/></label>
        <label>Name<input required maxLength={255} value={vendorDraft.name} onChange={e=>setVendorDraft({...vendorDraft,name:e.target.value})}/></label>
        <label>Email<input type="email" value={vendorDraft.email} onChange={e=>setVendorDraft({...vendorDraft,email:e.target.value})}/></label>
        <label>Phone<input value={vendorDraft.phone} onChange={e=>setVendorDraft({...vendorDraft,phone:e.target.value})}/></label>
        <label>Tax number<input value={vendorDraft.taxNumber} onChange={e=>setVendorDraft({...vendorDraft,taxNumber:e.target.value})}/></label>
        <label>Currency<input required maxLength={3} value={vendorDraft.currency} onChange={e=>setVendorDraft({...vendorDraft,currency:e.target.value.toUpperCase()})}/></label>
        <label>Payment terms (days)<input type="number" min="0" max="3650" value={vendorDraft.paymentTermsDays} onChange={e=>setVendorDraft({...vendorDraft,paymentTermsDays:e.target.value})}/></label>
      </div>
      <div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setShowVendor(false)}>Cancel</button><button disabled={busy==="vendor"} className={styles.primary}><Plus size={15}/> Save vendor</button></div>
    </form>:null}

    {showDocument?<form onSubmit={createDocument} className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Controlled source document</span><h3>New vendor bill or credit</h3></div></div>
      <div className={styles.setupGrid}>
        <label>Type<select value={documentDraft.documentType} onChange={e=>setDocumentDraft({...documentDraft,documentType:e.target.value})}><option value="bill">Vendor bill</option><option value="credit_note">Vendor credit note</option></select></label>
        <label>Vendor<select required value={documentDraft.vendorId} onChange={e=>setDocumentDraft({...documentDraft,vendorId:e.target.value})}><option value="">Choose vendor</option>{data.vendors.filter(v=>v.status==="active").map(v=><option key={v.id} value={v.id}>{v.vendor_code} · {v.name}</option>)}</select></label>
        <label>SaMi document number<input required value={documentDraft.documentNumber} onChange={e=>setDocumentDraft({...documentDraft,documentNumber:e.target.value})}/></label>
        <label>Vendor reference<input value={documentDraft.vendorReference} onChange={e=>setDocumentDraft({...documentDraft,vendorReference:e.target.value})}/></label>
        <label>Document date<input required type="date" value={documentDraft.documentDate} onChange={e=>setDocumentDraft({...documentDraft,documentDate:e.target.value})}/></label>
        {documentDraft.documentType==="bill"?<label>Due date<input required type="date" value={documentDraft.dueDate} onChange={e=>setDocumentDraft({...documentDraft,dueDate:e.target.value})}/></label>:null}
        <label>Currency<input required maxLength={3} value={documentDraft.currency} onChange={e=>setDocumentDraft({...documentDraft,currency:e.target.value.toUpperCase()})}/></label>
        <label>Exchange rate to {data.currency}<input required inputMode="decimal" value={documentDraft.exchangeRate} onChange={e=>setDocumentDraft({...documentDraft,exchangeRate:e.target.value})}/></label>
      </div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Account</th><th>Description</th><th>Qty</th><th>Unit</th><th>Tax</th><th></th></tr></thead>
        <tbody>{lines.map(row=><tr key={row.id}>
          <td><select required value={row.accountId} onChange={e=>setLines(rows=>rows.map(x=>x.id===row.id?{...x,accountId:e.target.value}:x))}><option value="">Choose</option>{data.accounts.filter(a=>!a.is_control_account).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td>
          <td><input required value={row.description} onChange={e=>setLines(rows=>rows.map(x=>x.id===row.id?{...x,description:e.target.value}:x))}/></td>
          <td><input required inputMode="decimal" value={row.quantity} onChange={e=>setLines(rows=>rows.map(x=>x.id===row.id?{...x,quantity:e.target.value}:x))}/></td>
          <td><input required inputMode="decimal" value={row.unitPrice} onChange={e=>setLines(rows=>rows.map(x=>x.id===row.id?{...x,unitPrice:e.target.value}:x))}/></td>
          <td><input required inputMode="decimal" value={row.taxAmount} onChange={e=>setLines(rows=>rows.map(x=>x.id===row.id?{...x,taxAmount:e.target.value}:x))}/></td>
          <td>{lines.length>1?<button type="button" className={styles.button} onClick={()=>setLines(rows=>rows.filter(x=>x.id!==row.id))}>Remove</button>:null}</td>
        </tr>)}</tbody>
      </table></div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={()=>{setLines(rows=>[...rows,line(nextLine)]);setNextLine(n=>n+1);}}><Plus size={15}/> Add line</button>
        <button type="button" className={styles.button} onClick={()=>setShowDocument(false)}>Cancel</button>
        <button disabled={busy==="document"} className={styles.primary}><FilePlus2 size={15}/> Save draft</button>
      </div>
    </form>:null}

    {selected?<>
      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Vendor</span><strong>{selected.vendor_name}</strong><small>{selected.vendor_reference||"No vendor reference"}</small></div>
        <div className={styles.financeCard}><span>Total</span><strong>{selected.currency} {selected.total_amount}</strong><small>Base: {amount(selected.base_open_amount)}</small></div>
        <div className={styles.financeCard}><span>Open</span><strong>{selected.currency} {selected.open_amount}</strong><small>Due {selected.due_date||"—"}</small></div>
        <div className={styles.financeCard}><span>Status</span><strong>{selected.status.replaceAll("_"," ")}</strong><small>{selected.document_type.replaceAll("_"," ")}</small></div>
      </section>

      <div className={styles.actions}>
        {selected.status==="draft"&&canEdit?<button className={styles.primary} disabled={busy==="approve"} onClick={()=>action("approve")}><CheckCircle2 size={15}/> Approve</button>:null}
        {selected.status==="approved"&&canEdit?<button className={styles.primary} disabled={busy==="post"} onClick={()=>action("post")}><Send size={15}/> Post to ledger</button>:null}
        {["draft","approved"].includes(selected.status)&&canEdit?<button className={styles.button} disabled={busy==="cancel"} onClick={()=>action("cancel")}>Cancel document</button>:null}
        {["posted","partially_settled","settled"].includes(selected.status)&&selected.posted_journal_id&&canEdit?<><label>Reversal date<input type="date" value={reversalDate} onChange={e=>setReversalDate(e.target.value)}/></label><button className={styles.button} disabled={busy==="reverse"} onClick={()=>action("reverse")}><RotateCcw size={15}/> Reverse</button></>:null}
        {selected.posted_journal_id?<Link className={styles.button} href={"/apps/accounting/journals/"+encodeURIComponent(selected.posted_journal_id)}><CircleDollarSign size={15}/> Posted journal</Link>:null}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Document accounting</span><h3>Lines</h3></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Account</th><th>Description</th><th>Qty</th><th>Unit</th><th>Tax</th><th>Total</th></tr></thead>
          <tbody>{selected.lines.map(row=><tr key={row.id}><td>{row.account_code} · {row.account_name}</td><td>{row.description}</td><td>{row.quantity}</td><td>{selected.currency} {row.unit_price}</td><td>{selected.currency} {row.tax_amount}</td><td>{selected.currency} {row.line_total}</td></tr>)}</tbody>
        </table></div>
      </section>

      {selected.document_type==="credit_note"&&["posted","partially_settled"].includes(selected.status)&&canEdit?<form className={styles.panel} onSubmit={applyCredit}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Vendor credit</span><h3>Apply to bill</h3></div></div>
        <div className={styles.setupGrid}>
          <label>Open bill<select required value={creditTarget} onChange={e=>setCreditTarget(e.target.value)}><option value="">Choose bill</option>{data.applicationTargets.map(x=><option key={x.id} value={x.id}>{x.document_number} · {x.currency} {x.open_amount}</option>)}</select></label>
          <label>Amount<input required inputMode="decimal" value={creditAmount} onChange={e=>setCreditAmount(e.target.value)}/></label>
          <label>Application date<input required type="date" value={applicationDate} onChange={e=>setApplicationDate(e.target.value)}/></label>
        </div>
        <button disabled={busy==="credit"} className={styles.primary}><RefreshCcw size={15}/> Apply credit</button>
      </form>:null}
    </>:<>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Vendor exposure</span><h3>Vendors</h3></div></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Vendor</th><th>Status</th><th>Terms</th><th>Open bills</th><th>Credits</th><th>Net payable</th></tr></thead>
          <tbody>{data.vendors.length?data.vendors.map(v=><tr key={v.id}><td>{v.name}<span className={styles.meta}>{v.vendor_code}</span></td><td>{v.status}</td><td>{v.payment_terms_days} days</td><td>{amount(v.outstanding_bills)}</td><td>{amount(v.available_credits)}</td><td>{amount(v.net_payable)}</td></tr>):<tr><td colSpan={6} className={styles.empty}>No vendors yet.</td></tr>}</tbody>
        </table></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>AP register</span><h3>Vendor documents</h3></div></div>
        <form method="get" className={styles.filters}>
          <label>Vendor<select name="vendorId" defaultValue={data.filters.vendorId}><option value="">All vendors</option>{data.vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <label>Aging<select name="bucket" defaultValue={data.filters.bucket}><option value="">All</option>{data.aging.map(x=><option key={x.bucket} value={x.bucket}>{x.bucket}</option>)}</select></label>
          <label>Search<input name="search" defaultValue={data.filters.search} placeholder="Document, vendor, reference"/></label>
          <button className={styles.button}>Apply</button>
        </form>
        <div className={styles.tableWrap}><table><thead><tr><th>Document</th><th>Vendor</th><th>Date / due</th><th>Status</th><th>Total</th><th>Open</th></tr></thead>
          <tbody>{data.documents.length?data.documents.map(d=><tr key={d.id}><td><Link href={"/apps/accounting/payables/"+encodeURIComponent(d.id)}>{d.document_number}</Link><span className={styles.meta}>{d.document_type.replaceAll("_"," ")}{d.vendor_reference?" · "+d.vendor_reference:""}</span></td><td>{d.vendor_name}</td><td>{d.document_date}<span className={styles.meta}>Due {d.due_date||"—"}</span></td><td><span className={styles.badge}>{d.status.replaceAll("_"," ")}</span></td><td>{d.currency} {d.total_amount}</td><td>{d.currency} {d.open_amount}</td></tr>):<tr><td colSpan={6} className={styles.empty}>No vendor documents match these filters.</td></tr>}</tbody>
        </table></div>
        <div className={styles.actions}><span>{data.documentCount} documents · Page {data.filters.page} of {pageCount}</span>{data.filters.page>1?<Link className={styles.button} href={query({page:data.filters.page-1})}>Previous</Link>:null}{data.filters.page<pageCount?<Link className={styles.button} href={query({page:data.filters.page+1})}>Next</Link>:null}</div>
      </section>
    </>}

    <SaMiOverlay {...overlay} onClose={closeOverlay}/>
  </div>;
}
