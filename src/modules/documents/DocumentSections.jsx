import {useAuth} from '@clerk/clerk-react';
import {useState} from 'react';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import {DOCUMENT_GROUPS,documentSection,canClassifyDocument} from './documentSections.js';
export function DocumentSections({documents,value,onChange}){
 return <nav className="document-sections" aria-label="Document sections">{[{key:'',label:'All documents'},...DOCUMENT_GROUPS].map(s=><button key={s.key} type="button" className="secondary-button" aria-pressed={value===s.key} onClick={()=>onChange(s.key)}>{s.label} <span>({s.key?documents.filter(d=>documentSection(d)===s.key).length:documents.length})</span></button>)}</nav>;
}
export function DocumentSectionControl({document,onChanged}){
 const {getToken}=useAuth(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!canClassifyDocument(document))return null;
 return <label className="document-section-control"><span>Document section</span><select aria-label={'Section for '+document.file_name} value={document.document_section||''} disabled={busy} onChange={async e=>{
 const section=e.target.value;setBusy(true);setError('');
 try{await withSupabaseTokenRetry(getToken,async db=>{const {error}=await db.rpc('set_document_section',{p_id:document.id,p_section:section||null,p_updated_at:document.updated_at});if(error)throw error;});onChanged();}catch(e){setError(e.message);}finally{setBusy(false);}
 }}><option value="">Unclassified</option>{DOCUMENT_GROUPS.filter(s=>s.key!=='unclassified').map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>{error&&<span role="alert">{error}</span>}</label>;
}

import './documentSections.css';
