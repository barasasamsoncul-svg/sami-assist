"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CheckCircle2,
  FileCheck2,
  Globe2,
  Link2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useState,type FormEvent } from 'react';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingInternationalWorkspace } from '@/lib/apps/accounting/international';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

export default function AccountingInternational({
  data,canCreate,canEdit,
}:{
  data:AccountingInternationalWorkspace;
  canCreate:boolean;
  canEdit:boolean;
}){
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const [packManifest,setPackManifest]=useState('');
  const [settings,setSettings]=useState({
    enabled:Boolean(data.settings.enabled),
    countryCode:String(data.settings.country_code||data.company.country_code||''),
    jurisdictionCode:String(data.settings.jurisdiction_code||data.company.country_code||''),
    locale:String(data.settings.locale||data.company.locale||'en'),
    accountingFramework:String(data.settings.accounting_framework||'local_gaap'),
    taxAuthorityName:String(data.settings.tax_authority_name||''),
    taxIdentifierLabel:String(data.settings.tax_identifier_label||'Tax ID'),
    filingFrequency:String(data.settings.filing_frequency||'monthly'),
    filingDay:String(data.settings.filing_day||20),
    eInvoicePolicy:String(data.settings.e_invoice_policy||'optional'),
    preferredEInvoiceNetwork:String(data.settings.preferred_e_invoice_network||''),
  });
  const activeBoxes=data.boxes.filter(row=>row.status==='active');
  const activeTaxes=data.taxCodes.filter(row=>row.status==='active');
  const [boxDraft,setBoxDraft]=useState({code:'',label:'',description:'',sequence:'100'});
  const [ruleDraft,setRuleDraft]=useState({
    boxId:activeBoxes[0]?.id||'',
    taxCodeId:activeTaxes[0]?.id||'',
    direction:'any',
    amountField:'tax',
    multiplier:'1',
  });
  const amount=(value:string)=>formatAccountingAmount(value,data.currency);

  async function request(body:Record<string,unknown>){
    const response=await fetch('/api/apps/accounting/international',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||'International localization action failed.');
    return payload.result as Record<string,unknown>;
  }

  async function saveSettings(event:FormEvent){
    event.preventDefault();if(!canEdit)return;setBusy('settings');
    try{
      await request({action:'save-settings',expectedCompanyId:data.companyId,...settings});
      showSuccess('Localization settings saved','The company localization profile was updated without changing tax rates or Invoicing provider credentials.');
      router.refresh();
    }catch(error){showError('Localization settings could not be saved',error instanceof Error?error.message:'Retry this action.');}
    finally{setBusy('');}
  }

  async function installPack(){
    if(!canEdit)return;setBusy('pack');
    try{
      const result=await request({
        action:'install-generic-vat-pack',expectedCompanyId:data.companyId,
        countryCode:settings.countryCode,jurisdictionCode:settings.jurisdictionCode,locale:settings.locale,
      });
      showSuccess(
        'Generic VAT reporting pack installed',
        String(result.boxCount||0)+' reporting boxes and '+String(result.ruleCount||0)+' tax rules are ready. This is a control/reporting pack, not a country-specific statutory filing form.',
      );
      router.refresh();
    }catch(error){showError('Localization pack could not be installed',error instanceof Error?error.message:'Check the company country code and retry.');}
    finally{setBusy('');}
  }

  async function createBox(event:FormEvent){
    event.preventDefault();if(!canCreate)return;setBusy('box');
    try{
      await request({action:'create-box',expectedCompanyId:data.companyId,...boxDraft});
      showSuccess('Reporting box created','The box is ready for tax-code mapping.');
      setBoxDraft({code:'',label:'',description:'',sequence:'100'});
      router.refresh();
    }catch(error){showError('Reporting box could not be created',error instanceof Error?error.message:'Retry this box.');}
    finally{setBusy('');}
  }

  async function importPack(){
    if(!canEdit||busy==='pack-import')return;
    let parsed:unknown;
    try{
      parsed=JSON.parse(packManifest);
    }catch{
      showError('Pack JSON is invalid','Paste a valid localization-pack JSON manifest.');
      return;
    }
    setBusy('pack-import');
    try{
      const result=await request({action:'import-pack',manifest:parsed});
      showSuccess(
        'Localization pack imported',
        String(result.packKey||'Pack')+' '+String(result.packVersion||'')+
        ' mapped '+String(result.boxCount||0)+' reporting boxes and '+
        String(result.ruleCount||0)+' existing company tax-code rules. No tax rates were created.',
      );
      setPackManifest('');
      router.refresh();
    }catch(error){
      showError('Localization pack could not be imported',error instanceof Error?error.message:'Retry this import.');
    }finally{
      setBusy('');
    }
  }

  async function saveRule(event:FormEvent){
    event.preventDefault();if(!canEdit)return;setBusy('rule');
    try{
      await request({action:'save-rule',...ruleDraft});
      showSuccess('Reporting rule saved','Tax-register amounts will flow into this localization box for matching entries.');
      router.refresh();
    }catch(error){showError('Reporting rule could not be saved',error instanceof Error?error.message:'Retry this mapping.');}
    finally{setBusy('');}
  }

  async function archiveRule(ruleId:string){
    if(!canEdit)return;setBusy('rule:'+ruleId);
    try{
      await request({action:'archive-rule',ruleId});
      showSuccess('Reporting rule archived','Future localization reports will no longer use this mapping.');
      router.refresh();
    }catch(error){showError('Rule could not be archived',error instanceof Error?error.message:'Retry this action.');}
    finally{setBusy('');}
  }

  async function changeBoxStatus(boxId:string,status:'active'|'archived'){
    if(!canEdit)return;setBusy('box:'+boxId);
    try{
      await request({action:'box-status',boxId,status});
      showSuccess('Reporting box updated','The localization box is now '+status+'.');
      router.refresh();
    }catch(error){showError('Reporting box could not be updated',error instanceof Error?error.message:'Retry this action.');}
    finally{setBusy('');}
  }

  async function snapshotReport(){
    if(!canCreate)return;setBusy('snapshot');
    try{
      const result=await request({action:'create-report-run',from:data.from,to:data.to});
      showSuccess('Localization report snapshot saved','Snapshot '+String(result.id||'')+' preserves the current boxes, diagnostics and e-invoicing evidence state.');
      router.refresh();
    }catch(error){showError('Report snapshot could not be created',error instanceof Error?error.message:'Retry this snapshot.');}
    finally{setBusy('');}
  }

  async function finalizeRun(runId:string){
    if(!canEdit)return;setBusy('finalize:'+runId);
    try{
      await request({action:'finalize-report-run',runId});
      showSuccess('Localization snapshot finalized','The snapshot is locked for internal reporting history. SaMi did not submit anything to a tax authority.');
      router.refresh();
    }catch(error){showError('Snapshot could not be finalized',error instanceof Error?error.message:'Resolve report errors and retry.');}
    finally{setBusy('');}
  }

  const errorCount=data.diagnostics.filter(item=>item.level==='error').length;
  const warningCount=data.diagnostics.filter(item=>item.level==='warning').length;

  return <div className={styles.workspace}>
    <div className={styles.heading}>
      <div>
        <div className={styles.eyebrow}>Accounting · International localization · {data.currency}</div>
        <h2>Country packs, tax reporting & e-invoice evidence</h2>
        <p>Localize Accounting by jurisdiction without hardcoding one country into the ledger. Tax rates remain effective-dated Accounting tax codes; this layer controls statutory grouping, report boxes, filing metadata and shared electronic-invoice evidence.</p>
      </div>
      <div className={styles.actions}>
        {data.eInvoicing.available?<Link className={styles.button} href="/apps/invoicing/e-invoicing"><Link2 size={15}/> Open e-invoicing</Link>:null}
        {canCreate?<button className={styles.primary} type="button" disabled={busy==='snapshot'} onClick={snapshotReport}><FileCheck2 size={15}/> Save report snapshot</button>:null}
      </div>
    </div>

    <section className={styles.financeCards}>
      <div className={styles.financeCard}><span>Localization</span><strong>{data.settings.enabled?'Enabled':'Not enabled'}</strong><small>{String(data.settings.country_code||data.company.country_code||'No country')} · {String(data.settings.locale||data.company.locale||'en')}</small></div>
      <div className={styles.financeCard}><span>Installed pack</span><strong>{data.settings.pack_key?String(data.settings.pack_key).replaceAll('_',' '):'Custom / none'}</strong><small>{data.settings.pack_version?'Version '+String(data.settings.pack_version):'No statutory rates are auto-invented'}</small></div>
      <div className={styles.financeCard}><span>Reporting health</span><strong>{errorCount} errors</strong><small>{warningCount} warnings · {data.unmappedUsedTaxCodes.length} used tax codes unmapped</small></div>
      <div className={styles.financeCard}><span>Next control due</span><strong>{data.nextDueDate}</strong><small>{String(data.settings.filing_frequency||'monthly')} · day {String(data.settings.filing_day||20)}</small></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><span className={styles.eyebrow}>Company localization profile</span><h3>Jurisdiction & filing controls</h3></div>
        <Globe2 size={20}/>
      </div>
      <form onSubmit={saveSettings}>
        <div className={styles.setupGrid}>
          <label><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> Enable international localization</label>
          <label>ISO country code<input required maxLength={2} value={settings.countryCode} onChange={e=>setSettings({...settings,countryCode:e.target.value.toUpperCase()})}/></label>
          <label>Jurisdiction code<input required maxLength={80} value={settings.jurisdictionCode} onChange={e=>setSettings({...settings,jurisdictionCode:e.target.value.toUpperCase()})}/></label>
          <label>Locale<input required maxLength={32} value={settings.locale} onChange={e=>setSettings({...settings,locale:e.target.value})}/></label>
          <label>Accounting framework<select value={settings.accountingFramework} onChange={e=>setSettings({...settings,accountingFramework:e.target.value})}><option value="ifrs">IFRS</option><option value="local_gaap">Local GAAP</option><option value="us_gaap">US GAAP</option><option value="other">Other</option></select></label>
          <label>Tax authority<input maxLength={180} value={settings.taxAuthorityName} onChange={e=>setSettings({...settings,taxAuthorityName:e.target.value})}/></label>
          <label>Tax ID label<input maxLength={80} value={settings.taxIdentifierLabel} onChange={e=>setSettings({...settings,taxIdentifierLabel:e.target.value})}/></label>
          <label>Filing frequency<select value={settings.filingFrequency} onChange={e=>setSettings({...settings,filingFrequency:e.target.value})}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label>
          <label>Filing day<input type="number" min="1" max="28" value={settings.filingDay} onChange={e=>setSettings({...settings,filingDay:e.target.value})}/></label>
          <label>E-invoice policy<select value={settings.eInvoicePolicy} onChange={e=>setSettings({...settings,eInvoicePolicy:e.target.value})}><option value="none">Not used</option><option value="optional">Optional / evidence only</option><option value="required">Required for issued invoices</option></select></label>
          <label>Preferred e-invoice network<select value={settings.preferredEInvoiceNetwork} onChange={e=>setSettings({...settings,preferredEInvoiceNetwork:e.target.value})}><option value="">No preference</option><option value="peppol">Peppol</option><option value="custom_edi">Custom EDI</option></select></label>
        </div>
        <div className={styles.actions}>
          {canEdit?<button type="button" className={styles.button} disabled={busy==='pack'} onClick={installPack}><RefreshCcw size={15}/> Install/update generic VAT pack</button>:null}
          {canEdit?<button className={styles.primary} disabled={busy==='settings'}>Save localization</button>:null}
        </div>
      </form>
      <p className={styles.meta}>The generic pack groups your existing Accounting tax codes into reusable control boxes. It deliberately does not claim to be a statutory return for any country; statutory country packs can supply their own boxes/rules without changing the Accounting engine.</p>
    </section>

    {data.diagnostics.length?<section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Readiness diagnostics</span><h3>Localization controls</h3></div>{errorCount?<TriangleAlert size={20}/>:<CheckCircle2 size={20}/>}</div>
      <div className={styles.healthGrid}>
        {data.diagnostics.map(item=><div key={item.code}><span>{item.level.toUpperCase()}</span><strong>{item.code.replaceAll('_',' ')}</strong><small>{item.message}</small></div>)}
      </div>
    </section>:<div className={styles.notice}><CheckCircle2 size={16}/> No international-localization diagnostics are open for this reporting period.</div>}

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Reporting period · {data.from} to {data.to}</span><h3>Localization report boxes</h3></div></div>
      <form method="get" className={styles.filters}>
        <label>From<input name="from" type="date" defaultValue={data.from}/></label>
        <label>To<input name="to" type="date" defaultValue={data.to}/></label>
        <button className={styles.button}>Apply period</button>
      </form>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Box</th><th>Description</th><th>Rules</th><th>Period total</th><th>Status</th><th></th></tr></thead>
        <tbody>{data.boxes.length?data.boxes.map(box=><tr key={box.id}>
          <td><strong>{box.code}</strong><span className={styles.meta}>{box.label}</span></td>
          <td>{box.description||'—'}</td>
          <td>{Array.isArray(box.rules)?box.rules.filter((rule:Record<string,unknown>)=>rule.status==='active').length:0}</td>
          <td>{amount(String(box.total||'0.00'))}</td>
          <td><span className={styles.badge}>{box.status}</span></td>
          <td>{canEdit?<button type="button" className={styles.button} disabled={busy==='box:'+box.id} onClick={()=>changeBoxStatus(String(box.id),box.status==='active'?'archived':'active')}>{box.status==='active'?<Archive size={14}/>:<RefreshCcw size={14}/>} {box.status==='active'?'Archive':'Restore'}</button>:null}</td>
        </tr>):<tr><td colSpan={6} className={styles.empty}>No localization reporting boxes yet. Install the generic VAT pack or create a custom box.</td></tr>}</tbody>
      </table></div>
    </section>

    <section className={styles.panel}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Versioned localization packs</span>
            <h3>Import a country reporting manifest</h3>
            <p>Import boxes and mappings to tax codes that already exist in this company. SaMi never imports tax rates from a pack.</p>
          </div>
        </div>
        <textarea
          rows={12}
          value={packManifest}
          onChange={event=>setPackManifest(event.target.value)}
          placeholder={'{"packKey":"country.vat.reporting","packVersion":"1.0.0","countryCode":"XX","boxes":[],"rules":[]}'}
          className="w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-3 font-mono text-xs outline-none"
        />
        <p className={styles.meta}>Rules reference existing Accounting tax-code <strong>codes</strong>. Import is versioned and preserved in pack history; it does not certify a statutory return.</p>
        {canEdit?<button type="button" className={styles.primary} disabled={!packManifest.trim()||busy==='pack-import'} onClick={importPack}>{busy==='pack-import'?'Importing…':'Import versioned pack'}</button>:null}
      </section>

      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Country-pack builder</span><h3>Custom report box & tax mappings</h3></div></div>
      {canCreate?<form onSubmit={createBox}>
        <div className={styles.setupGrid}>
          <label>Box code<input required value={boxDraft.code} onChange={e=>setBoxDraft({...boxDraft,code:e.target.value.toUpperCase()})}/></label>
          <label>Label<input required value={boxDraft.label} onChange={e=>setBoxDraft({...boxDraft,label:e.target.value})}/></label>
          <label>Description<input value={boxDraft.description} onChange={e=>setBoxDraft({...boxDraft,description:e.target.value})}/></label>
          <label>Sequence<input type="number" min="0" value={boxDraft.sequence} onChange={e=>setBoxDraft({...boxDraft,sequence:e.target.value})}/></label>
        </div>
        <button className={styles.button} disabled={busy==='box'}><Plus size={15}/> Create reporting box</button>
      </form>:null}

      {canEdit&&activeBoxes.length&&activeTaxes.length?<form onSubmit={saveRule}>
        <div className={styles.setupGrid}>
          <label>Reporting box<select required value={ruleDraft.boxId} onChange={e=>setRuleDraft({...ruleDraft,boxId:e.target.value})}>{activeBoxes.map(box=><option key={box.id} value={box.id}>{box.code} · {box.label}</option>)}</select></label>
          <label>Accounting tax code<select required value={ruleDraft.taxCodeId} onChange={e=>setRuleDraft({...ruleDraft,taxCodeId:e.target.value})}>{activeTaxes.map(tax=><option key={tax.id} value={tax.id}>{tax.code} · {tax.name} · {tax.rate}%</option>)}</select></label>
          <label>Direction<select value={ruleDraft.direction} onChange={e=>setRuleDraft({...ruleDraft,direction:e.target.value})}><option value="any">Any</option><option value="sale">Sale</option><option value="purchase">Purchase</option><option value="withholding">Withholding</option></select></label>
          <label>Amount source<select value={ruleDraft.amountField} onChange={e=>setRuleDraft({...ruleDraft,amountField:e.target.value})}><option value="taxable">Taxable amount</option><option value="tax">Tax amount</option><option value="recoverable">Recoverable tax</option><option value="nonrecoverable">Nonrecoverable tax</option></select></label>
          <label>Multiplier<input required inputMode="decimal" value={ruleDraft.multiplier} onChange={e=>setRuleDraft({...ruleDraft,multiplier:e.target.value})}/></label>
        </div>
        <button className={styles.primary} disabled={busy==='rule'}>Save reporting rule</button>
      </form>:null}

      {data.boxes.some(box=>Array.isArray(box.rules)&&box.rules.length)?<div className={styles.tableWrap}><table>
        <thead><tr><th>Box</th><th>Tax code</th><th>Direction</th><th>Amount</th><th>Multiplier</th><th>Status</th><th></th></tr></thead>
        <tbody>{data.boxes.flatMap(box=>(Array.isArray(box.rules)?box.rules:[]).map((rule:Record<string,unknown>)=><tr key={String(rule.id)}>
          <td>{String(box.code)}</td><td>{String(rule.taxCode||'')} · {String(rule.taxName||'')}</td><td>{String(rule.direction)}</td><td>{String(rule.amountField)}</td><td>{String(rule.multiplier)}</td><td><span className={styles.badge}>{String(rule.status)}</span></td>
          <td>{canEdit&&rule.status==='active'?<button type="button" className={styles.button} disabled={busy==='rule:'+String(rule.id)} onClick={()=>archiveRule(String(rule.id))}><Archive size={14}/> Archive</button>:null}</td>
        </tr>))}</tbody>
      </table></div>:null}
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Shared international e-invoicing</span><h3>UBL / Peppol evidence</h3></div>{data.eInvoicing.available?<ShieldCheck size={20}/>:<TriangleAlert size={20}/>}</div>
      <div className={styles.financeCards}>
        <div className={styles.financeCard}><span>Issued invoices</span><strong>{data.eInvoicing.metrics.issuedInvoices}</strong><small>Period invoices eligible for evidence review</small></div>
        <div className={styles.financeCard}><span>Valid structured documents</span><strong>{data.eInvoicing.metrics.validDocuments}</strong><small>{data.eInvoicing.standards.syntax}</small></div>
        <div className={styles.financeCard}><span>Accepted / exported</span><strong>{data.eInvoicing.metrics.acceptedOrExported}</strong><small>Strong shared evidence</small></div>
        <div className={styles.financeCard}><span>Evidence gaps</span><strong>{data.eInvoicing.metrics.missingStrongEvidence}</strong><small>{data.eInvoicing.metrics.rejectedOrFailed} rejected/failed</small></div>
      </div>
      <p className={styles.meta}>Accounting reads profile/document status only. Provider credentials, UBL generation, Peppol participants and transmissions stay exclusively in Invoicing.</p>
      {data.eInvoicing.profiles.length?<div className={styles.tableWrap}><table><thead><tr><th>Profile</th><th>Country</th><th>Network</th><th>Syntax</th><th>Environment</th><th>Status</th></tr></thead><tbody>
        {data.eInvoicing.profiles.map(profile=><tr key={String(profile.id)}><td>{String(profile.name)}</td><td>{String(profile.supplier_country_code)}</td><td>{String(profile.network_key)}</td><td>{String(profile.syntax_key)}</td><td>{String(profile.environment)}</td><td><span className={styles.badge}>{String(profile.status)}</span></td></tr>)}
      </tbody></table></div>:null}
      {data.eInvoicing.participantCountries.length?<p className={styles.meta}>Active buyer-country coverage: {data.eInvoicing.participantCountries.map(row=>String(row.country_code)+' ('+String(row.participant_count)+')').join(' · ')}</p>:null}
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Auditable reporting history</span><h3>Saved localization snapshots</h3></div></div>
      {data.runs.length?<div className={styles.tableWrap}><table><thead><tr><th>Period</th><th>Country</th><th>Pack</th><th>Status</th><th>Generated</th><th></th></tr></thead><tbody>
        {data.runs.map(run=><tr key={String(run.id)}><td>{String(run.period_start)} → {String(run.period_end)}</td><td>{String(run.country_code||'—')}</td><td>{String(run.pack_key||'custom')}</td><td><span className={styles.badge}>{String(run.status)}</span></td><td>{String(run.generated_at).slice(0,19).replace('T',' ')}</td><td>{canEdit&&run.status==='draft'?<button type="button" className={styles.button} disabled={busy==='finalize:'+String(run.id)} onClick={()=>finalizeRun(String(run.id))}><CheckCircle2 size={14}/> Finalize</button>:null}</td></tr>)}
      </tbody></table></div>:<p className={styles.meta}>No localization report snapshots have been saved yet.</p>}
      <p className={styles.meta}>Finalizing locks the internal snapshot for audit history. It does not file or transmit a tax return.</p>
    </section>

    {data.packHistory.length?<section className={styles.panel}>
      <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Pack provenance</span><h3>Localization pack history</h3></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Pack</th><th>Version</th><th>Country</th><th>Action</th><th>Date</th></tr></thead><tbody>
        {data.packHistory.map(row=><tr key={String(row.id)}><td>{String(row.pack_key)}</td><td>{String(row.pack_version)}</td><td>{String(row.country_code||'—')}</td><td>{String(row.action)}</td><td>{String(row.created_at).slice(0,19).replace('T',' ')}</td></tr>)}
      </tbody></table></div>
    </section>:null}

    {data.unmappedUsedTaxCodes.length?<div className={styles.notice}><TriangleAlert size={16}/> Used but unmapped tax codes: {data.unmappedUsedTaxCodes.map(row=>String(row.code)).join(', ')}. Map them before finalizing a localization report.</div>:null}
    <SaMiOverlay {...overlay} onClose={closeOverlay}/>
  </div>;
}
