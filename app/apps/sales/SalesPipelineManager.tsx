'use client';

import { useEffect, useState } from 'react';

type PipelineStage={id:string;name:string};
type SalesLead={id:string;lead_number:string;status:string;name:string;source:string|null};
type SalesOpportunity={id:string;opportunity_number:string;stage_id:string;name:string;currency:string;expected_value:number|string;probability:number|string};
type PipelineData={stages:PipelineStage[];leads:SalesLead[];opportunities:SalesOpportunity[]};
type PipelineAction={action:'create_lead';name:FormDataEntryValue|null;companyName:FormDataEntryValue|null;contactName:FormDataEntryValue|null;email:FormDataEntryValue|null;phone:FormDataEntryValue|null;source:FormDataEntryValue|null}|{action:'convert_lead';leadId:string;name:string}|{action:'move_opportunity';opportunityId:string;stageId:string};

export default function SalesPipelineManager(){
 const [data,setData]=useState<PipelineData>({stages:[],leads:[],opportunities:[]});
 const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 async function load(){const r=await fetch('/api/apps/sales?pipeline=1',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load pipeline.');setData(j.pipeline);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function action(body:PipelineAction){setBusy(true);setError('');try{const r=await fetch('/api/apps/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Sales action failed.');await load();}catch(e){setError(e instanceof Error?e.message:'Sales action failed.');}finally{setBusy(false);}}
 return <div className="space-y-5">
  <div className="sami-surface rounded-[24px] p-5"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Roadmap Part 11</p><h2 className="mt-1 text-xl font-black">Leads & Opportunities</h2><p className="mt-1 text-sm text-slate-500">Qualify prospects, manage weighted pipeline and move opportunities from first contact to won or lost.</p></div>
  {error?<div className="rounded-xl border border-red-200 p-3 text-sm text-red-600">{error}</div>:null}
  <form className="sami-surface grid gap-3 rounded-[24px] p-5 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await action({action:'create_lead',name:f.get('name'),companyName:f.get('companyName'),contactName:f.get('contactName'),email:f.get('email'),phone:f.get('phone'),source:f.get('source')});e.currentTarget.reset();}}>
   <h3 className="font-black md:col-span-2">Capture lead</h3>
   {['name','companyName','contactName','email','phone','source'].map(x=><input key={x} name={x} required={x==='name'} placeholder={x.replace(/[A-Z]/g,m=>' '+m).replace(/^./,m=>m.toUpperCase())} className="h-11 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"/>)}
   <button disabled={busy} className="h-11 rounded-xl border border-[var(--sami-border)] px-4 text-sm font-black md:col-span-2">Create lead</button>
  </form>
  <div className="grid gap-4 lg:grid-cols-2">
   <section className="sami-surface rounded-[24px] p-5"><h3 className="font-black">Leads</h3><div className="mt-3 space-y-2">{data.leads.map(l=><div key={l.id} className="rounded-xl border border-[var(--sami-border)] p-3"><div className="flex justify-between gap-3"><div><p className="font-black">{l.name}</p><p className="text-xs text-slate-500">{l.lead_number} · {l.status} · {l.source||'Direct'}</p></div>{l.status!=='converted'?<button disabled={busy} onClick={()=>action({action:'convert_lead',leadId:l.id,name:l.name})} className="text-xs font-black">Qualify →</button>:null}</div></div>)}</div></section>
   <section className="sami-surface rounded-[24px] p-5"><h3 className="font-black">Opportunity pipeline</h3><div className="mt-3 space-y-3">{data.opportunities.map(o=><div key={o.id} className="rounded-xl border border-[var(--sami-border)] p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{o.name}</p><p className="text-xs text-slate-500">{o.opportunity_number} · {o.currency} {Number(o.expected_value).toLocaleString()} · {o.probability}%</p></div><select value={o.stage_id} disabled={busy} onChange={e=>action({action:'move_opportunity',opportunityId:o.id,stageId:e.target.value})} className="rounded-lg border border-[var(--sami-border)] bg-transparent p-2 text-xs">{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>)}</div></section>
  </div>
 </div>;
}
