import {useAuth} from '@clerk/clerk-react';
import {useState} from 'react';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import {safeHtmlPreview} from './safeHtmlPreview.js';
export function DocumentFileActions({document:row}){
 const {getToken}=useAuth(),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const printable=row.mime_type==='application/pdf'||row.mime_type==='text/html'||/^image\/(png|jpeg|webp)$/.test(row.mime_type);
 const action=async kind=>{
  let target=kind==='download'?null:window.open('','_blank');if(target){target.opener=null;target.document.body.textContent='Opening authorized file…';}
  setBusy(kind);setError('');
  try{
   await withSupabaseTokenRetry(getToken,async client=>{
    // Re-read under the current user's RLS; never trust a path from URL state.
    const {data:doc,error:readError}=await client.from('documents').select('id,storage_path,file_name,mime_type').eq('id',row.id).is('archived_at',null).single();if(readError)throw readError;
    if(kind!=='download'&&doc.mime_type==='text/html'){
     if(!target)throw Error('Allow a new tab to open this file.');
     const {data:blob,error:downloadError}=await client.storage.from('northgate-files').download(doc.storage_path);if(downloadError)throw downloadError;
     if(blob.size>25000000)throw Error('Download this HTML file to open it in its original application.');
     const preview=safeHtmlPreview(await blob.text(),target.document),heading=target.document.createElement('p'),style=target.document.createElement('style');
     heading.textContent=doc.file_name+' — HTML preview; active content and external resources removed.';
     style.textContent='body{font:14px Arial;margin:32px;color:#17202b}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccc;padding:6px}pre{white-space:pre-wrap}img{max-width:100%}';
     target.document.title=doc.file_name;target.document.head.append(style);target.document.body.replaceChildren(heading,preview);if(kind==='print'){target.focus();target.print();}return;
    }
    const {data,error}=await client.storage.from('northgate-files').createSignedUrl(doc.storage_path,120,kind==='download'?{download:doc.file_name}:undefined);if(error)throw error;
    if(kind==='download'){const a=document.createElement('a');a.href=data.signedUrl;a.download=doc.file_name;a.rel='noopener noreferrer';a.click();}
    else if(target){target.location.href=data.signedUrl;}else throw Error('Allow a new tab to open this file.');
   });
  }catch(e){target?.close();setError(e.message);}finally{setBusy('');}
 };
 return <div className="document-file-actions"><div className="job-document-actions">{['open','download',...(printable?['print']:[])].map(kind=><button type="button" className="secondary-button" key={kind} disabled={!!busy} onClick={()=>action(kind)}>{busy===kind?'Opening…':kind==='print'?'Open print view':kind[0].toUpperCase()+kind.slice(1)}</button>)}</div><small>{printable?'Print from the browser’s PDF or image view.':'Download and print using the file’s original application.'}</small>{error&&<p role="alert">{error}</p>}</div>;
}
