import {useAuth} from '@clerk/clerk-react';
import {useEffect,useState} from 'react';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import {DOCUMENT_GROUPS,departmentTags,selectedSections,matchesDocumentSections,canClassifyDocument,documentTagsLabel} from './documentSections.js';
export function DocumentSections({documents,value,onChange}){
 const selected=selectedSections(value);
 function toggle(key){onChange(!key?[]:key==='unclassified'?(selected.includes(key)?[]:[key]):selected.includes(key)?selected.filter(v=>v!==key):[...selected.filter(v=>v!=='unclassified'),key]);}
 return <div><nav className="document-sections" aria-label="Document department filters">{[{key:'',label:'All documents'},...DOCUMENT_GROUPS].map(s=><button key={s.key} type="button" className="secondary-button" aria-pressed={s.key?selected.includes(s.key):!selected.length} onClick={()=>toggle(s.key)}>{s.label} <span>({s.key?documents.filter(d=>matchesDocumentSections(d,s.key)).length:documents.length})</span></button>)}</nav>{selected.length>1&&<small>Showing documents with all selected department tags.</small>}</div>;
}
export function DocumentTagFilter({documents,value,onChange}){
 const tags=[...new Set(documents.flatMap(d=>d.custom_tags||[]))].sort();
 return <label className="document-tag-filter">Custom tag<select aria-label="Document tag filter" value={value||''} onChange={e=>onChange(e.target.value)}><option value="">All tags</option>{tags.map(tag=><option key={tag} value={tag}>{tag}</option>)}</select></label>;
}
export function DocumentSectionControl({document,onChanged}){
 const {getToken}=useAuth(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [departments,setDepartments]=useState(()=>departmentTags(document)),[tags,setTags]=useState(()=>document.custom_tags||[]),[entry,setEntry]=useState('');
 useEffect(()=>{setDepartments(departmentTags(document));setTags(document.custom_tags||[]);setEntry('');setError('');},[document.id,document.organization_version,document.updated_at]);
 if(!canClassifyDocument(document))return null;
 function toggle(key){setMessage('');setDepartments(current=>current.includes(key)?current.filter(v=>v!==key):[...current,key]);}
 function pendingTags(){return [...new Set([...tags,...(entry.trim()?[entry.trim().replace(/\s+/g,' ').toLowerCase()]:[])])].sort();}
 function addTag(){const next=pendingTags();if(next.length>20||next.some(t=>t.length>48)){setError('Use at most 20 tags, each up to 48 characters.');return;}setTags(next);setEntry('');setError('');setMessage('');}
 async function save(){
  const next=pendingTags();if(next.length>20||next.some(t=>!t.length||t.length>48)){setError('Use at most 20 tags, each up to 48 characters.');return;}
  setBusy(true);setError('');setMessage('');
  try{await withSupabaseTokenRetry(getToken,async db=>{const {error}=await db.rpc('set_document_tags',{p_id:document.id,p_departments:departments,p_tags:next,p_updated_at:document.updated_at,p_version:document.organization_version});if(error)throw error;});setMessage('Tags saved.');onChanged();}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <details className="document-section-control" onClick={e=>e.stopPropagation()}>
  <summary aria-label={'Edit tags for '+document.file_name}>Edit tags <small>{documentTagsLabel(document)}</small></summary>
  <fieldset disabled={busy}><legend>Departments</legend><div className="document-tag-choices">{DOCUMENT_GROUPS.filter(s=>s.key!=='unclassified').map(s=><label key={s.key}><input type="checkbox" checked={departments.includes(s.key)} onChange={()=>toggle(s.key)}/>{s.label.replace(' Documents','')}</label>)}</div>
   <small>No departments selected means Unclassified. Tags do not change who can access this document.</small>
   <label>Custom tag<input value={entry} maxLength={48} onChange={e=>{setEntry(e.target.value);setMessage('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag();}}} placeholder="e.g. client approval"/></label>
   <button type="button" className="secondary-button" onClick={addTag} disabled={!entry.trim()}>Add tag</button>
   <div className="document-tag-choices">{tags.map(tag=><button key={tag} type="button" className="secondary-button" aria-label={'Remove tag '+tag} onClick={()=>{setTags(tags.filter(t=>t!==tag));setMessage('');}}>{tag} ×</button>)}</div>
   <div className="document-tag-actions"><button type="button" className="primary-button" onClick={save}>{busy?'Saving…':'Save tags'}</button><button type="button" className="secondary-button" onClick={()=>{setDepartments(departmentTags(document));setTags(document.custom_tags||[]);setEntry('');setError('');setMessage('');}}>Reset</button></div>
  </fieldset>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </details>;
}

import './documentSections.css';
