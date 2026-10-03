'use client';

import {
  Bell,
  Download,
  FilePlus2,
  Link2,
  MessageSquareText,
  Paperclip,
  Pencil,
  Reply,
  Trash2,
  Unlink,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingCollaborationWorkspace } from '@/lib/apps/accounting/collaboration';
import styles from './AccountingFoundation.module.css';

type WorkspaceFileOption={
  id:string;
  name:string;
  sizeBytes:number;
  mimeType:string;
};

function sizeLabel(value:number) {
  if (value<1024) return value+' B';
  if (value<1024*1024) return (value/1024).toFixed(1)+' KB';
  return (value/(1024*1024)).toFixed(1)+' MB';
}

export default function AccountingCollaboration({
  data,
  canEdit,
}:{
  data:AccountingCollaborationWorkspace;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const [model,setModel]=useState(data.selectedRecord?.model||data.recentRecords[0]?.model||'journals');
  const [comment,setComment]=useState('');
  const [kind,setKind]=useState<'comment'|'internal_note'>('comment');
  const [mentions,setMentions]=useState<string[]>([]);
  const [replyTo,setReplyTo]=useState<string|null>(null);
  const [editCommentId,setEditCommentId]=useState<string|null>(null);
  const [editBody,setEditBody]=useState('');
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [workspaceFiles,setWorkspaceFiles]=useState<WorkspaceFileOption[]>([]);
  const [existingFileId,setExistingFileId]=useState('');
  const [filesLoaded,setFilesLoaded]=useState(false);

  const selected=data.selectedRecord;
  const following=Boolean(
    selected &&
    data.followers.some(row=>String(row.user_id)===data.currentUserId),
  );
  const recordsForModel=useMemo(
    ()=>data.recentRecords.filter(row=>row.model===model),
    [data.recentRecords,model],
  );
  const memberName=(id:unknown)=>
    data.members.find(row=>row.userId===String(id))?.name||String(id||'Unknown user');

  async function post(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/collaboration',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Accounting collaboration action failed.');
    return payload.result;
  }

  async function addComment() {
    if (!selected) return;
    setBusy('comment');
    try {
      await post({
        action:'add-comment',
        model:selected.model,
        recordId:selected.recordId,
        kind,
        body:comment,
        mentionedUserIds:mentions,
        parentCommentId:replyTo,
      });
      setComment('');
      setMentions([]);
      setReplyTo(null);
      showSuccess('Comment added','The Accounting record discussion was updated and mentioned/following users were notified.');
      router.refresh();
    } catch (error) {
      showError('Comment not added',error instanceof Error?error.message:'Retry the comment.');
    } finally {
      setBusy('');
    }
  }

  async function saveEdit(row:Record<string,unknown>) {
    setBusy('edit:'+String(row.id));
    try {
      await post({
        action:'edit-comment',
        commentId:String(row.id),
        body:editBody,
        mentionedUserIds:Array.isArray(row.mentioned_user_ids)?row.mentioned_user_ids:[],
      });
      setEditCommentId(null);
      setEditBody('');
      showSuccess('Comment updated','The previous comment text was preserved in revision history.');
      router.refresh();
    } catch (error) {
      showError('Comment not updated',error instanceof Error?error.message:'Retry the edit.');
    } finally {
      setBusy('');
    }
  }

  function removeComment(commentId:string) {
    confirmAction({
      title:'Remove this Accounting comment?',
      message:'The active comment will be hidden. Existing revision and audit evidence is preserved.',
      confirmLabel:'Remove comment',
      onConfirm:()=>void (async()=>{
        setBusy('delete:'+commentId);
        try {
          await post({action:'delete-comment',commentId});
          showSuccess('Comment removed','Audit history remains available.');
          router.refresh();
        } catch (error) {
          showError('Comment not removed',error instanceof Error?error.message:'Retry removing the comment.');
        } finally {
          setBusy('');
        }
      })(),
    });
  }

  async function toggleFollow() {
    if (!selected) return;
    setBusy('follow');
    try {
      await post({
        action:following?'unfollow-record':'follow-record',
        model:selected.model,
        recordId:selected.recordId,
      });
      showSuccess(
        following?'Stopped following':'Following record',
        following?'You will no longer receive follower comment alerts.':'You will be notified when teammates add comments to this Accounting record.',
      );
      router.refresh();
    } catch (error) {
      showError('Follow setting failed',error instanceof Error?error.message:'Retry the follow setting.');
    } finally {
      setBusy('');
    }
  }

  async function uploadAndLink() {
    if (!selected||!uploadFile) return;
    setBusy('upload');
    try {
      const mimeType=uploadFile.type||'application/octet-stream';
      const intentResponse=await fetch('/api/workspace/files/upload-intent',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          fileName:uploadFile.name,
          mimeType,
          sizeBytes:uploadFile.size,
          purpose:'accounting_attachment',
        }),
      });
      const intent=await intentResponse.json().catch(()=>({}));
      if (!intentResponse.ok) throw new Error(intent.error||'Secure file upload could not start.');

      const uploadResponse=await fetch(intent.upload.url,{
        method:intent.upload.method||'PUT',
        headers:intent.upload.headers||{'Content-Type':mimeType},
        body:uploadFile,
      });
      if (!uploadResponse.ok) throw new Error('The file could not be uploaded to secure storage.');

      const completeResponse=await fetch('/api/workspace/files/'+encodeURIComponent(intent.file.id)+'/complete',{method:'POST'});
      const completed=await completeResponse.json().catch(()=>({}));
      if (!completeResponse.ok) throw new Error(completed.error||'The secure upload could not be finalized.');

      await post({
        action:'link-file',
        model:selected.model,
        recordId:selected.recordId,
        fileId:intent.file.id,
        purpose:'supporting_document',
      });
      setUploadFile(null);
      showSuccess('Document attached','The file remains in SaMi secure workspace storage and is now linked to this Accounting record.');
      router.refresh();
    } catch (error) {
      showError('Attachment failed',error instanceof Error?error.message:'Retry the attachment.');
    } finally {
      setBusy('');
    }
  }

  async function loadWorkspaceFiles() {
    setBusy('load-files');
    try {
      const response=await fetch('/api/workspace/files?limit=100',{cache:'no-store'});
      const payload=await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(payload.error||'Workspace files could not be loaded.');
      setWorkspaceFiles((payload.files||[]) as WorkspaceFileOption[]);
      setFilesLoaded(true);
    } catch (error) {
      showError('Workspace files unavailable',error instanceof Error?error.message:'Retry loading workspace files.');
    } finally {
      setBusy('');
    }
  }

  async function linkExisting() {
    if (!selected||!existingFileId) return;
    setBusy('link-existing');
    try {
      await post({
        action:'link-file',
        model:selected.model,
        recordId:selected.recordId,
        fileId:existingFileId,
        purpose:'supporting_document',
      });
      setExistingFileId('');
      showSuccess('Existing file linked','No duplicate file was created.');
      router.refresh();
    } catch (error) {
      showError('File not linked',error instanceof Error?error.message:'Retry linking the file.');
    } finally {
      setBusy('');
    }
  }

  function unlinkFile(fileId:string,purpose:string) {
    if (!selected) return;
    confirmAction({
      title:'Unlink this document?',
      message:'The file stays safely stored in the workspace; only its link to this Accounting record is removed.',
      confirmLabel:'Unlink document',
      onConfirm:()=>void (async()=>{
        setBusy('unlink:'+fileId);
        try {
          await post({
            action:'unlink-file',
            model:selected.model,
            recordId:selected.recordId,
            fileId,
            purpose,
          });
          showSuccess('Document unlinked','The original workspace file was not deleted.');
          router.refresh();
        } catch (error) {
          showError('Document not unlinked',error instanceof Error?error.message:'Retry unlinking the document.');
        } finally {
          setBusy('');
        }
      })(),
    });
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Documents & Collaboration</div>
          <h2>Evidence, comments & record teamwork</h2>
          <p>Attach secure workspace files to Accounting records, discuss work internally, mention teammates, follow records, and preserve comment revisions.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.button} href="/apps/documents"><Paperclip size={15}/>Documents app</Link>
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Linked Accounting files</span><strong>{data.recentFiles.length}</strong><small>Recent secure file links</small></div>
        <div className={styles.financeCard}><span>Recent comments</span><strong>{data.recentComments.length}</strong><small>Across supported Accounting records</small></div>
        <div className={styles.financeCard}><span>Current record followers</span><strong>{data.followers.length}</strong><small>Users receiving comment alerts</small></div>
        <div className={styles.financeCard}><span>Supported record types</span><strong>{data.recordTypes.length}</strong><small>One collaboration layer, no duplicate storage</small></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Record context</span><h3>Choose Accounting record</h3></div><Link2 size={20}/></div>
        <form method="get" className={styles.filters}>
          <label>Record type
            <select name="model" value={model} onChange={event=>setModel(event.target.value)}>
              {data.recordTypes.map(row=><option key={row.key} value={row.key}>{row.label}</option>)}
            </select>
          </label>
          <label>Recent record
            <select name="recordId" defaultValue={selected?.model===model?selected.recordId:''} required>
              <option value="">Choose record</option>
              {recordsForModel.map(row=><option key={row.recordId} value={row.recordId}>{row.label} · {row.status||'record'}</option>)}
            </select>
          </label>
          <button className={styles.button}>Open collaboration</button>
        </form>
        {!recordsForModel.length?<p className={styles.muted}>No recent records of this type are available in the selected company.</p>:null}
      </section>

      {selected?(
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><span className={styles.eyebrow}>{selected.typeLabel}</span><h3>{selected.label}</h3><p className={styles.muted}>Status: {selected.status||'—'}</p></div>
              <div className={styles.actions}>
                <Link className={styles.button} href={selected.href}>Open source record</Link>
                <button type="button" className={following?styles.button:styles.primary} disabled={!canEdit||busy!==''} onClick={()=>void toggleFollow()}><Bell size={15}/>{following?'Unfollow':'Follow'}</button>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Supporting evidence</span><h3>Attachments</h3></div><Paperclip size={20}/></div>
            <div className={styles.formGrid}>
              <label>Upload new secure file
                <input type="file" onChange={event=>setUploadFile(event.target.files?.[0]||null)}/>
              </label>
              <button type="button" className={styles.primary} disabled={!canEdit||!uploadFile||busy!==''} onClick={()=>void uploadAndLink()}><FilePlus2 size={15}/>Upload & attach</button>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busy!==''} onClick={()=>void loadWorkspaceFiles()}>{filesLoaded?'Refresh workspace files':'Link existing workspace file'}</button>
              {filesLoaded?(
                <>
                  <select value={existingFileId} onChange={event=>setExistingFileId(event.target.value)}>
                    <option value="">Choose existing file</option>
                    {workspaceFiles.map(file=><option key={file.id} value={file.id}>{file.name} · {sizeLabel(file.sizeBytes)}</option>)}
                  </select>
                  <button type="button" className={styles.button} disabled={!canEdit||!existingFileId||busy!==''} onClick={()=>void linkExisting()}>Link selected file</button>
                </>
              ):null}
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Document</th><th>Purpose</th><th>Size</th><th>Added</th><th>Actions</th></tr></thead>
                <tbody>
                  {data.attachments.map(row=>(
                    <tr key={String(row.id)}>
                      <td><strong>{String(row.name)}</strong><div className={styles.muted}>{String(row.mimeType||row.extension||'file')}</div></td>
                      <td>{String(row.purpose||'attachment')}</td>
                      <td>{sizeLabel(Number(row.sizeBytes||0))}</td>
                      <td>{String(row.createdAt||'').slice(0,19).replace('T',' ')}</td>
                      <td><div className={styles.actions}>
                        <a className={styles.button} href={'/api/workspace/files/'+encodeURIComponent(String(row.id))+'/download'}><Download size={14}/>Download</a>
                        <button type="button" className={styles.button} disabled={!canEdit||busy!==''} onClick={()=>unlinkFile(String(row.id),String(row.purpose||'attachment'))}><Unlink size={14}/>Unlink</button>
                      </div></td>
                    </tr>
                  ))}
                  {!data.attachments.length?<tr><td colSpan={5}>No supporting documents linked to this Accounting record yet.</td></tr>:null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Internal discussion</span><h3>Comments & notes</h3></div><MessageSquareText size={20}/></div>
            {replyTo?<div className={styles.notice}>Replying to a comment. <button type="button" className={styles.button} onClick={()=>setReplyTo(null)}>Cancel reply</button></div>:null}
            <div className={styles.formGrid}>
              <label>Entry type
                <select value={kind} onChange={event=>setKind(event.target.value==='internal_note'?'internal_note':'comment')}>
                  <option value="comment">Comment</option>
                  <option value="internal_note">Internal note</option>
                </select>
              </label>
              <label>Mention teammates
                <select multiple value={mentions} onChange={event=>setMentions(Array.from(event.target.selectedOptions).map(option=>option.value))}>
                  {data.members.filter(member=>member.userId!==data.currentUserId).map(member=><option key={member.userId} value={member.userId}>{member.name}{member.isOwner?' · owner':''}</option>)}
                </select>
              </label>
            </div>
            <label>Message
              <textarea value={comment} onChange={event=>setComment(event.target.value)} maxLength={5000} placeholder="Add review notes, evidence context, follow-up, or an Accounting handoff…"/>
            </label>
            <button type="button" className={styles.primary} disabled={!canEdit||!comment.trim()||busy!==''} onClick={()=>void addComment()}><MessageSquareText size={15}/>Add {kind==='internal_note'?'note':'comment'}</button>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Author / time</th><th>Discussion</th><th>Mentions</th><th>Actions</th></tr></thead>
                <tbody>
                  {data.comments.map(row=>(
                    <tr key={String(row.id)}>
                      <td><strong>{memberName(row.created_by)}</strong><div className={styles.muted}>{String(row.created_at||'').slice(0,19).replace('T',' ')}</div>{row.edited_at?<div className={styles.muted}>Edited {String(row.edited_at).slice(0,19).replace('T',' ')}</div>:null}</td>
                      <td>
                        <span className={styles.eyebrow}>{String(row.kind).replace('_',' ')}</span>
                        {editCommentId===String(row.id)?(
                          <div><textarea value={editBody} onChange={event=>setEditBody(event.target.value)} maxLength={5000}/><div className={styles.actions}><button type="button" className={styles.primary} disabled={!editBody.trim()||busy!==''} onClick={()=>void saveEdit(row)}>Save edit</button><button type="button" className={styles.button} onClick={()=>{setEditCommentId(null);setEditBody('');}}>Cancel</button></div></div>
                        ):<div>{String(row.body)}</div>}
                        {row.parent_comment_id?<div className={styles.muted}>Reply to {String(row.parent_comment_id).slice(0,8)}…</div>:null}
                      </td>
                      <td>{Array.isArray(row.mentioned_user_ids)&&row.mentioned_user_ids.length?row.mentioned_user_ids.map(memberName).join(', '):'—'}</td>
                      <td><div className={styles.actions}>
                        <button type="button" className={styles.button} disabled={!canEdit||busy!==''} onClick={()=>setReplyTo(String(row.id))}><Reply size={14}/>Reply</button>
                        {String(row.created_by)===data.currentUserId?(
                          <>
                            <button type="button" className={styles.button} disabled={busy!==''} onClick={()=>{setEditCommentId(String(row.id));setEditBody(String(row.body));}}><Pencil size={14}/>Edit</button>
                            <button type="button" className={styles.button} disabled={busy!==''} onClick={()=>removeComment(String(row.id))}><Trash2 size={14}/>Remove</button>
                          </>
                        ):null}
                      </div></td>
                    </tr>
                  ))}
                  {!data.comments.length?<tr><td colSpan={4}>No discussion has been added to this record yet.</td></tr>:null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Collaboration evidence</span><h3>Followers & edit history</h3></div><Users size={20}/></div>
            <p><strong>Followers:</strong> {data.followers.length?data.followers.map(row=>memberName(row.user_id)).join(', '):'No followers yet.'}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Comment</th><th>Previous text</th><th>Revised by</th><th>Revised</th></tr></thead>
                <tbody>
                  {data.revisions.map(row=><tr key={String(row.id)}><td>{String(row.comment_id).slice(0,8)}…</td><td>{String(row.prior_body)}</td><td>{memberName(row.revised_by)}</td><td>{String(row.revised_at||'').slice(0,19).replace('T',' ')}</td></tr>)}
                  {!data.revisions.length?<tr><td colSpan={4}>No comment revisions for this record.</td></tr>:null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ):(
        <section className={styles.panel}><p className={styles.muted}>Choose an Accounting record above to attach evidence and collaborate.</p></section>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Module register</span><h3>Recent linked documents</h3></div><Paperclip size={20}/></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>File</th><th>Accounting record</th><th>Purpose</th><th>Added</th><th/></tr></thead>
            <tbody>
              {data.recentFiles.map(row=><tr key={row.fileId+':'+row.model+':'+row.recordId}><td><strong>{row.name}</strong><div className={styles.muted}>{sizeLabel(row.sizeBytes)}</div></td><td><Link href={row.href}>{row.recordLabel}</Link></td><td>{row.purpose}</td><td>{row.createdAt.slice(0,19).replace('T',' ')}</td><td><a className={styles.button} href={'/api/workspace/files/'+encodeURIComponent(row.fileId)+'/download'}><Download size={14}/>Download</a></td></tr>)}
              {!data.recentFiles.length?<tr><td colSpan={5}>No Accounting file links have been created yet.</td></tr>:null}
            </tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
