'use client';

import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  FileSearch,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { useRef,useState } from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { getAccountingDocumentCapture } from '@/lib/apps/accounting/document-extraction';
import styles from './AccountingFoundation.module.css';

type Data=Awaited<ReturnType<typeof getAccountingDocumentCapture>>;

function browserUuid() {
  return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-'+String(Date.now()).padStart(12,'0').slice(-12);
}

function pretty(value:unknown) {
  return JSON.stringify(value&&typeof value==='object'?value:{},null,2);
}

export default function AccountingDocumentCapture({
  data,
  canCreate,
  canEdit,
}:{
  data:Data;
  canCreate:boolean;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const [selectedFileId,setSelectedFileId]=useState(data.files[0]?.id?String(data.files[0].id):'');
  const [kind,setKind]=useState('vendor_bill');
  const fileRef=useRef<HTMLInputElement|null>(null);

  async function api(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/document-capture',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Document action failed.');
    return payload.result;
  }

  async function extract() {
    if (!selectedFileId||busy) return;
    setBusy('extract');
    try {
      await api({
        action:'extract',
        requestKey:browserUuid(),
        fileId:selectedFileId,
        extractionType:kind,
      });
      showSuccess(
        'Document extracted',
        'SaMi prepared reviewable accounting fields. No financial record was posted.',
      );
      router.refresh();
    } catch (error) {
      showError('Extraction failed',error instanceof Error?error.message:'Retry extraction.');
    } finally {
      setBusy('');
    }
  }

  async function review(id:string,decision:'review'|'reject') {
    if (busy) return;
    setBusy(decision+':'+id);
    try {
      await api({action:'review',id,decision});
      showSuccess(
        decision==='review'?'Extraction reviewed':'Extraction rejected',
        decision==='review'
          ? 'The extraction is marked reviewed. Create the accounting document through the validated AP/AR workflow.'
          : 'The extraction remains preserved as rejected evidence.',
      );
      router.refresh();
    } catch (error) {
      showError('Review failed',error instanceof Error?error.message:'Retry this action.');
    } finally {
      setBusy('');
    }
  }

  async function uploadFile(file:File) {
    if (busy) return;
    setBusy('upload');
    try {
      const intentResponse=await fetch('/api/workspace/files/upload-intent',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          fileName:file.name,
          mimeType:file.type||'application/octet-stream',
          sizeBytes:file.size,
          purpose:'accounting-document-capture',
        }),
      });
      const intent=await intentResponse.json().catch(()=>({}));
      if (!intentResponse.ok) throw new Error(intent.error||'Could not prepare upload.');

      const putResponse=await fetch(intent.upload.url,{
        method:intent.upload.method||'PUT',
        headers:intent.upload.headers||{'Content-Type':file.type||'application/octet-stream'},
        body:file,
      });
      if (!putResponse.ok) throw new Error('Private file upload failed.');

      const completeResponse=await fetch(
        '/api/workspace/files/'+encodeURIComponent(intent.file.id)+'/complete',
        {method:'POST'},
      );
      const completed=await completeResponse.json().catch(()=>({}));
      if (!completeResponse.ok) throw new Error(completed.error||'Could not finalize uploaded file.');

      setSelectedFileId(String(intent.file.id));
      showSuccess('File uploaded','The private file is available for Accounting extraction.');
      router.refresh();
    } catch (error) {
      showError('Upload failed',error instanceof Error?error.message:'Retry this upload.');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value='';
    }
  }

  return (
    <div className={styles.workspace}>
      <SaMiOverlay overlay={overlay} onClose={closeOverlay}/>

      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Accounting · Document capture</span>
          <h2>Bill, receipt and invoice extraction</h2>
          <p>
            Extract reviewable fields from private workspace documents using the configured
            SaMi AI provider. Extraction never posts a journal or vendor/customer document.
          </p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={()=>router.refresh()}>
            <RefreshCw size={15}/>Refresh
          </button>
          {canCreate?(
            <>
              <input
                ref={fileRef}
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,text/plain,text/csv,application/json,application/pdf"
                onChange={event=>{
                  const file=event.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <button className={styles.button} type="button" disabled={Boolean(busy)} onClick={()=>fileRef.current?.click()}>
                <Upload size={15}/>{busy==='upload'?'Uploading…':'Upload private file'}
              </button>
            </>
          ):null}
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Direct extraction</span>
            <h3>Select a workspace document</h3>
          </div>
          <ScanLine size={20}/>
        </div>

        <div className={styles.setupGrid}>
          <label>
            File
            <select value={selectedFileId} onChange={event=>setSelectedFileId(event.target.value)}>
              <option value="">Choose a file</option>
              {data.files.map(file=>(
                <option key={String(file.id)} value={String(file.id)}>
                  {String(file.name||file.file_name)} · {String(file.mime_type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Document type
            <select value={kind} onChange={event=>setKind(event.target.value)}>
              <option value="vendor_bill">Vendor bill</option>
              <option value="receipt">Receipt</option>
              <option value="supplier_credit">Supplier credit</option>
              <option value="invoice">Customer invoice</option>
            </select>
          </label>
        </div>

        <div className={styles.notice}>
          <ShieldCheck size={16}/>
          <span>{data.pdfNote}</span>
        </div>

        {canCreate?(
          <button className={styles.primary} type="button" disabled={!selectedFileId||Boolean(busy)} onClick={extract}>
            <FileSearch size={15}/>{busy==='extract'?'Extracting…':'Extract with SaMi AI'}
          </button>
        ):null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Review queue</span>
            <h3>Extraction evidence</h3>
          </div>
          <FileSearch size={20}/>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>File</th><th>Type</th><th>Status</th><th>Provider/model</th><th>Extracted fields</th><th>Review</th></tr>
            </thead>
            <tbody>
              {data.extractions.map(row=>(
                <tr key={String(row.id)}>
                  <td><strong>{String(row.file_name||'Document')}</strong><div className={styles.muted}>{String(row.mime_type||'')}</div></td>
                  <td>{String(row.extraction_type).replaceAll('_',' ')}</td>
                  <td>{String(row.status)}</td>
                  <td>{row.provider?String(row.provider):'—'}<div className={styles.muted}>{row.model?String(row.model):''}</div></td>
                  <td>
                    {row.status==='failed'
                      ? <span>{String(row.error_message||'Extraction failed')}</span>
                      : <pre className="max-h-56 max-w-[560px] overflow-auto whitespace-pre-wrap text-[10px]">{pretty(row.extracted_data)}</pre>}
                  </td>
                  <td>
                    {String(row.status)==='extracted'&&canEdit?(
                      <div className={styles.actions}>
                        <button className={styles.button} type="button" disabled={Boolean(busy)} onClick={()=>review(String(row.id),'review')}>
                          <CheckCircle2 size={14}/>Reviewed
                        </button>
                        <button className={styles.button} type="button" disabled={Boolean(busy)} onClick={()=>review(String(row.id),'reject')}>
                          <XCircle size={14}/>Reject
                        </button>
                      </div>
                    ):(
                      <span className={styles.muted}>{row.reviewed_at?'Reviewed':'—'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!data.extractions.length?<tr><td colSpan={6}>No Accounting document extraction has been run yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
