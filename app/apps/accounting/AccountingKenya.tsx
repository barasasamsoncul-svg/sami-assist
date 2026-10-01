"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2,Link2,RefreshCcw,ShieldCheck,TriangleAlert } from 'lucide-react';
import { useState,type FormEvent } from 'react';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingKenyaWorkspace } from '@/lib/apps/accounting/kenya';
import type { KenyaEtimsTaxType } from '@/lib/apps/accounting/kenya-rules';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

export default function AccountingKenya({
  data,canEdit,
}:{data:AccountingKenyaWorkspace;canEdit:boolean}){
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const [settings,setSettings]=useState({
    enabled:Boolean(data.settings.enabled),
    vatRegistered:Boolean(data.settings.vat_registered),
    vatReturnDay:String(data.settings.vat_return_day||20),
    etimsSyncEnabled:Boolean(data.settings.etims_sync_enabled),
  });
  const saleCodes=data.taxCodes.filter(row=>row.status==='active'&&['sale','both'].includes(String(row.scope)));
  const [mapping,setMapping]=useState({taxCodeId:saleCodes[0]?.id||'',etimsTaxTypeCode:'B'});
  const amount=(value:string)=>formatAccountingAmount(value,data.currency);

  async function request(body:Record<string,unknown>){
    const response=await fetch('/api/apps/accounting/kenya',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'Kenya accounting action failed.');
    return payload.result;
  }
  async function saveSettings(event:FormEvent){
    event.preventDefault();if(!canEdit)return;setBusy('settings');
    try{
      await request({action:'save-settings',expectedCompanyId:data.companyId,...settings});
      showSuccess('Kenya settings saved','Accounting localization settings were updated without changing the shared eTIMS credentials.');
      router.refresh();
    }catch(error){showError('Kenya settings could not be saved',error instanceof Error?error.message:'Retry this action.');}
    finally{setBusy('');}
  }
  async function installDefaults(){
    if(!canEdit)return;setBusy('defaults');
    try{
      const result=await request({action:'install-defaults',expectedCompanyId:data.companyId,vatRegistered:settings.vatRegistered});
      showSuccess('Kenya tax defaults installed',String(result.installed||0)+' Accounting tax codes and '+String(result.mapped||0)+' current eTIMS mappings are ready.');
      router.refresh();
    }catch(error){showError('Kenya defaults could not be installed',error instanceof Error?error.message:'Review Accounting Setup and retry.');}
    finally{setBusy('');}
  }
  async function saveMapping(event:FormEvent){
    event.preventDefault();if(!canEdit)return;setBusy('mapping');
    try{
      await request({action:'save-mapping',...mapping});
      showSuccess('KRA mapping saved','The Accounting tax code is now linked to the selected eTIMS A-E classification.');
      router.refresh();
    }catch(error){showError('KRA mapping could not be saved',error instanceof Error?error.message:'Check the tax rate and effective dates.');}
    finally{setBusy('');}
  }
  async function syncEtims(){
    if(!canEdit)return;setBusy('sync');
    try{
      const result=await request({action:'sync-etims'});
      showSuccess(
        result.status==='partial'?'eTIMS sync needs mapping review':'eTIMS tax register synchronized',
        String(result.inserted||0)+' new register entries, '+String(result.replayed||0)+' replay-safe duplicates, '+String(result.unmapped||0)+' unmapped source groups.',
      );
      router.refresh();
    }catch(error){showError('eTIMS register sync failed',error instanceof Error?error.message:'Retry the synchronization.');}
    finally{setBusy('');}
  }

  const profile=data.etims.profile as null|Record<string,unknown>;
  const profileReady=profile&&String(profile.status)==='activated';
  return <div className={styles.workspace}>
    <div className={styles.heading}>
      <div><div className={styles.eyebrow}>Accounting · Kenya localization · {data.currency}</div>
        <h2>Kenya accounting & shared eTIMS</h2>
        <p>Maintain Kenya VAT reporting in Accounting while reusing the certified OSCU/VSCU connector, fiscal receipts and KRA mappings already owned by Invoicing.</p>
      </div>
      <div className={styles.actions}>
        {data.etims.available?<Link className={styles.button} href="/apps/invoicing/etims"><Link2 size={15}/> Open eTIMS operations</Link>:null}
        {canEdit?<button className={styles.primary} type="button" disabled={busy==='sync'||data.currency!=='KES'} onClick={syncEtims}><RefreshCcw size={15}/> Sync tax register</button>:null}
      </div>
    </div>

    <section className={styles.financeCards}>
      <div className={styles.financeCard}><span>Kenya localization</span><strong>{data.settings.enabled?'Enabled':'Not enabled'}</strong><small>{data.settings.vat_registered?'VAT registered':'Non-VAT setting'}</small></div>
      <div className={styles.financeCard}><span>Shared eTIMS</span><strong>{profileReady?'Activated':profile?'Needs attention':data.etims.available?'Not configured':'Invoicing unavailable'}</strong><small>{profile?String(profile.solution_type||'').toUpperCase()+' · '+String(profile.environment||''):'No duplicate credentials stored here'}</small></div>
      <div className={styles.financeCard}><span>Fiscalized sales</span><strong>{data.etims.submissions.sales}</strong><small>{data.etims.submissions.credits} successful credit notes</small></div>
      <div className={styles.financeCard}><span>Last register sync</span><strong>{String(data.settings.last_sync_status||'idle')}</strong><small>{data.settings.last_etims_sync_at?String(data.settings.last_etims_sync_at).slice(0,19).replace('T',' '):'Not synchronized yet'}</small></div>
    </section>

    {data.currency!=='KES'?<div className={styles.notice}><TriangleAlert size={16}/> eTIMS register synchronization is disabled because this Accounting company currency is {data.currency}. KRA fiscal documents are KES in the current connector; foreign-currency tax accounting is handled in Accounting Part 17.</div>:null}
    <div className={styles.notice}><ShieldCheck size={16}/> SaMi does not create a second KRA connector here. OSCU/VSCU activation, communication keys, item mappings, invoice submission and fiscal receipts remain owned by Invoicing; Accounting consumes only successful fiscal evidence.</div>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Current Kenya setup</span><h3>Localization controls</h3></div></div>
      <form onSubmit={saveSettings}>
        <div className={styles.setupGrid}>
          <label><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> Enable Kenya accounting</label>
          <label><input type="checkbox" checked={settings.vatRegistered} onChange={e=>setSettings({...settings,vatRegistered:e.target.checked})}/> VAT registered</label>
          <label>VAT return day<input type="number" min="1" max="28" value={settings.vatReturnDay} onChange={e=>setSettings({...settings,vatReturnDay:e.target.value})}/></label>
          <label><input type="checkbox" checked={settings.etimsSyncEnabled} onChange={e=>setSettings({...settings,etimsSyncEnabled:e.target.checked})}/> Allow shared eTIMS register sync</label>
        </div>
        <div className={styles.actions}>
          {canEdit?<button className={styles.button} type="button" disabled={busy==='defaults'} onClick={installDefaults}>Install/update Kenya defaults</button>:null}
          {canEdit?<button className={styles.primary} disabled={busy==='settings'}>Save settings</button>:null}
        </div>
      </form>
      <p className={styles.meta}>SaMi defaults the VAT filing day to the 20th, but keeps it configurable so statutory changes do not require a code change.</p>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>KRA fiscal bridge</span><h3>Shared eTIMS profile</h3></div>{profileReady?<CheckCircle2 size={20}/>:<TriangleAlert size={20}/>}</div>
      {profile?<div className={styles.receivableControlValues}>
        <div><span>Taxpayer PIN</span><strong>{String(profile.taxpayerPinMasked||'Configured')}</strong></div>
        <div><span>Solution</span><strong>{String(profile.solution_type||'').toUpperCase()}</strong></div>
        <div><span>Environment</span><strong>{String(profile.environment||'')}</strong></div>
        <div><span>Branch</span><strong>{String(profile.branch_id||'—')}</strong></div>
      </div>:<p className={styles.meta}>No shared eTIMS profile is configured. Configure OSCU/VSCU from Invoicing; Accounting will read that same profile after it exists.</p>}
      {profile?.last_error_message?<div className={styles.notice}><TriangleAlert size={16}/> {String(profile.last_error_message)}</div>:null}
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>KRA tax types</span><h3>Accounting ↔ eTIMS mappings</h3></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>eTIMS</th><th>Meaning</th><th>Rate</th><th>Accounting tax</th><th>Status</th></tr></thead>
        <tbody>{(Object.entries(data.taxTypes) as Array<[KenyaEtimsTaxType,{label:string;rate:number;current:boolean;legacyEndsOn:string|null}]>).map(([code,rule])=>{
          const current=data.mappings.find(row=>String(row.etims_tax_type_code)===code&&row.status==='active');
          return <tr key={code}><td><strong>{code}</strong></td><td>{rule.label}</td><td>{rule.rate}%</td><td>{current?String(current.code)+' · '+String(current.name):'Not mapped'}</td><td><span className={styles.badge}>{rule.current?'current':'legacy to '+rule.legacyEndsOn}</span></td></tr>;
        })}</tbody>
      </table></div>
      {canEdit?<form onSubmit={saveMapping}>
        <div className={styles.setupGrid}>
          <label>Accounting sales tax<select required value={mapping.taxCodeId} onChange={e=>setMapping({...mapping,taxCodeId:e.target.value})}><option value="">Choose tax code</option>{saleCodes.map(row=><option key={row.id} value={row.id}>{row.code} · {row.name} · {row.rate}%</option>)}</select></label>
          <label>KRA eTIMS type<select value={mapping.etimsTaxTypeCode} onChange={e=>setMapping({...mapping,etimsTaxTypeCode:e.target.value})}><option value="A">A · Exempt</option><option value="B">B · 16%</option><option value="C">C · 0%</option><option value="D">D · Non-VAT</option><option value="E">E · Legacy 8%</option></select></label>
        </div>
        <button className={styles.button} disabled={busy==='mapping'}>Save mapping</button>
      </form>:null}
      <p className={styles.meta}>Type E is retained only for historical compatibility. SaMi refuses an active E mapping unless the Accounting tax code ends on or before 2023-06-30.</p>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>VAT control · {data.from} to {data.to}</span><h3>Tax-register summary</h3></div></div>
      <div className={styles.financeCards}>
        <div className={styles.financeCard}><span>Taxable sales</span><strong>{amount(data.vatSummary.salesTaxable)}</strong><small>Net of registered sales credits</small></div>
        <div className={styles.financeCard}><span>Output VAT</span><strong>{amount(data.vatSummary.outputTax)}</strong><small>Sales credits: {amount(data.vatSummary.salesCreditTax)}</small></div>
        <div className={styles.financeCard}><span>Recoverable input VAT</span><strong>{amount(data.vatSummary.recoverableInputTax)}</strong><small>Total input tax: {amount(data.vatSummary.inputTax)}</small></div>
        <div className={styles.financeCard}><span>Indicative VAT payable</span><strong>{amount(data.vatSummary.vatPayable)}</strong><small>Output VAT less recoverable input VAT</small></div>
      </div>
      <p className={styles.meta}>This is an Accounting control summary, not an automatic KRA return filing. Review classifications, exemptions, withholding credits and statutory adjustments before filing.</p>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Synchronisation audit</span><h3>Recent eTIMS register runs</h3></div></div>
      {data.syncRuns.length?<div className={styles.tableWrap}><table><thead><tr><th>Started</th><th>Status</th><th>Inserted</th><th>Replay-safe</th><th>Unmapped</th><th>Sources</th></tr></thead><tbody>
        {data.syncRuns.map(row=><tr key={row.id}><td>{String(row.started_at).slice(0,19).replace('T',' ')}</td><td><span className={styles.badge}>{row.status}</span></td><td>{row.inserted_count}</td><td>{row.replayed_count}</td><td>{row.unmapped_count}</td><td>{row.source_count}</td></tr>)}
      </tbody></table></div>:<p className={styles.meta}>No eTIMS-to-Accounting synchronization has been run yet.</p>}
    </section>
    <SaMiOverlay {...overlay} onClose={closeOverlay}/>
  </div>;
}
