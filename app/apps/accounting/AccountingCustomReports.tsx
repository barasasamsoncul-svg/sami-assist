'use client';

import {
  Archive,
  Download,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';
import { useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { getAccountingCustomReports } from '@/lib/apps/accounting/custom-reports';
import styles from './AccountingFoundation.module.css';

type Data=Awaited<ReturnType<typeof getAccountingCustomReports>>;
type Result={
  runId:string;
  name:string;
  dataset:string;
  datasetLabel:string;
  columns:Array<{key:string;label:string;type:string}>;
  rows:Array<Record<string,unknown>>;
  filters:Record<string,unknown>;
  truncated:boolean;
};

function csvCell(value:unknown) {
  const text=value==null?'':String(value);
  return '"'+text.replaceAll('"','""')+'"';
}

export default function AccountingCustomReports({
  data,
  canManage,
}:{
  data:Data;
  canManage:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const activeReports=data.reports.filter(row=>String(row.status)==='active');
  const firstDataset=data.datasets[0]?.key||'general_ledger';
  const [dataset,setDataset]=useState(firstDataset);
  const datasetDef=useMemo(
    ()=>data.datasets.find(item=>item.key===dataset)||data.datasets[0],
    [data.datasets,dataset],
  );
  const [name,setName]=useState('My Accounting report');
  const [description,setDescription]=useState('');
  const [columns,setColumns]=useState<string[]>(
    datasetDef?.columns.slice(0,6).map(column=>column.key)||[],
  );
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [status,setStatus]=useState('');
  const [search,setSearch]=useState('');
  const [groupBy,setGroupBy]=useState('');
  const [busy,setBusy]=useState('');
  const [result,setResult]=useState<Result|null>(null);

  function selectDataset(value:string) {
    setDataset(value);
    const next=data.datasets.find(item=>item.key===value);
    setColumns(next?.columns.slice(0,6).map(column=>column.key)||[]);
    setGroupBy('');
  }

  async function action(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/custom-reports',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Custom report action failed.');
    return payload.result;
  }

  async function save() {
    if (!canManage||busy) return;
    setBusy('save');
    try {
      await action({
        action:'save',
        name,description,dataset,columns,
        filters:{from:from||undefined,to:to||undefined,status,search},
        groupBy:groupBy||undefined,
        sort:[],
      });
      showSuccess('Custom report saved','The report definition is stored without arbitrary SQL.');
      router.refresh();
    } catch (error) {
      showError('Report not saved',error instanceof Error?error.message:'Retry this action.');
    } finally {
      setBusy('');
    }
  }

  async function run(reportId:string) {
    if (busy) return;
    setBusy('run:'+reportId);
    try {
      const output=await action({
        action:'run',
        reportId,
        filters:{from:from||undefined,to:to||undefined,status,search},
      }) as Result;
      setResult(output);
      showSuccess('Report generated',output.rows.length+' governed row(s) generated.');
    } catch (error) {
      showError('Report failed',error instanceof Error?error.message:'Retry this report.');
    } finally {
      setBusy('');
    }
  }

  async function archive(id:string) {
    if (!canManage||busy) return;
    setBusy('archive:'+id);
    try {
      await action({action:'archive',id});
      showSuccess('Report archived','The definition remains preserved in report history.');
      router.refresh();
    } catch (error) {
      showError('Archive failed',error instanceof Error?error.message:'Retry this action.');
    } finally {
      setBusy('');
    }
  }

  function downloadCsv() {
    if (!result) return;
    const keys=result.columns.map(column=>column.key);
    const labels=result.columns.map(column=>column.label);
    const rows=[
      labels.map(csvCell).join(','),
      ...result.rows.map(row=>keys.map(key=>csvCell(row[key])).join(',')),
    ];
    const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=result.name.replace(/[^a-z0-9_-]+/gi,'-').toLowerCase()+'.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.workspace}>
      <SaMiOverlay overlay={overlay} onClose={closeOverlay}/>

      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Accounting · Custom reports</span>
          <h2>Build governed Accounting reports</h2>
          <p>
            Choose a supported dataset, columns and filters. SaMi never accepts custom SQL
            from report definitions.
          </p>
        </div>
        {result?(
          <button className={styles.button} type="button" onClick={downloadCsv}>
            <Download size={15}/>Export current CSV
          </button>
        ):null}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Designer</span>
            <h3>New report definition</h3>
          </div>
          <SlidersHorizontal size={20}/>
        </div>

        <div className={styles.setupGrid}>
          <label>
            Report name
            <input value={name} onChange={event=>setName(event.target.value)} maxLength={180}/>
          </label>
          <label>
            Dataset
            <select value={dataset} onChange={event=>selectDataset(event.target.value)}>
              {data.datasets.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label>
            From
            <input type="date" value={from} onChange={event=>setFrom(event.target.value)}/>
          </label>
          <label>
            To
            <input type="date" value={to} onChange={event=>setTo(event.target.value)}/>
          </label>
          <label>
            Status / aging bucket
            <input value={status} onChange={event=>setStatus(event.target.value)} placeholder="Optional dataset-specific value"/>
          </label>
          <label>
            Search
            <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Reference, account, customer, vendor…"/>
          </label>
          <label>
            Group by
            <select value={groupBy} onChange={event=>setGroupBy(event.target.value)}>
              <option value="">None</option>
              {datasetDef?.columns.map(column=><option key={column.key} value={column.key}>{column.label}</option>)}
            </select>
          </label>
          <label>
            Description
            <input value={description} onChange={event=>setDescription(event.target.value)} maxLength={2000}/>
          </label>
        </div>

        <div className={styles.setupSection}>
          <strong>Columns</strong>
          <div className={styles.setupAccountGrid}>
            {datasetDef?.columns.map(column=>(
              <label key={column.key} className={styles.toggleField}>
                <input
                  type="checkbox"
                  checked={columns.includes(column.key)}
                  onChange={event=>setColumns(current=>
                    event.target.checked
                      ? [...new Set([...current,column.key])]
                      : current.filter(key=>key!==column.key)
                  )}
                />
                <span><strong>{column.label}</strong><small>{column.type}</small></span>
              </label>
            ))}
          </div>
        </div>

        {canManage?(
          <button className={styles.primary} type="button" disabled={busy==='save'||!columns.length} onClick={save}>
            <Save size={15}/>{busy==='save'?'Saving…':'Save report'}
          </button>
        ):null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><span className={styles.eyebrow}>Saved</span><h3>Custom report library</h3></div>
          <TableProperties size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Name</th><th>Dataset</th><th>Columns</th><th>Group</th><th>Actions</th></tr></thead>
            <tbody>
              {activeReports.map(report=>(
                <tr key={String(report.id)}>
                  <td><strong>{String(report.name)}</strong><div className={styles.muted}>{String(report.description||'')}</div></td>
                  <td>{String(report.dataset).replaceAll('_',' ')}</td>
                  <td>{Array.isArray(report.columns)?report.columns.length:0}</td>
                  <td>{report.group_by?String(report.group_by):'—'}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={()=>run(String(report.id))}>
                        <Play size={14}/>Run
                      </button>
                      {canManage?(
                        <button className={styles.button} type="button" disabled={Boolean(busy)} onClick={()=>archive(String(report.id))}>
                          <Archive size={14}/>Archive
                        </button>
                      ):null}
                    </div>
                  </td>
                </tr>
              ))}
              {!activeReports.length?<tr><td colSpan={5}>No custom Accounting reports saved yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      {result?(
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Latest run</span>
              <h3>{result.name}</h3>
              <p>{result.rows.length} row(s){result.truncated?' · capped at 5,000':''}</p>
            </div>
            <Download size={20}/>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{result.columns.map(column=><th key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>
                {result.rows.slice(0,500).map((row,index)=>(
                  <tr key={index}>{result.columns.map(column=><td key={column.key}>{String(row[column.key]??'')}</td>)}</tr>
                ))}
                {!result.rows.length?<tr><td colSpan={result.columns.length||1}>No rows matched this report.</td></tr>:null}
              </tbody>
            </table>
          </div>
          {result.rows.length>500?<div className={styles.notice}>The browser preview shows the first 500 rows. CSV export includes the full generated result.</div>:null}
        </section>
      ):null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><span className={styles.eyebrow}>Run history</span><h3>Recent report executions</h3></div>
          <Plus size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Report</th><th>Status</th><th>Rows</th><th>Generated</th></tr></thead>
            <tbody>
              {data.runs.map(run=>(
                <tr key={String(run.id)}>
                  <td>{String(run.report_name)}</td>
                  <td>{String(run.status)}</td>
                  <td>{Number(run.row_count||0)}</td>
                  <td>{String(run.generated_at||'')}</td>
                </tr>
              ))}
              {!data.runs.length?<tr><td colSpan={4}>No custom-report runs yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
