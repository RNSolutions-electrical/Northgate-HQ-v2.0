import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useAuth} from '@clerk/clerk-react';
import {Link} from 'react-router-dom';
import {Plus,ArrowLeft,RefreshCw} from 'lucide-react';
import {usePermissions} from '../../../hooks/usePermissions.js';
import {createSupabaseClient} from '../../../services/supabaseClient.js';
import WorkbenchEditor from './app.jsx';
import {seed,sections,setCatalogue} from './model.mjs';
import {loadCatalogue,loadAssemblyLibrary} from './catalogueService.js';
import css from './style.css?inline';

function EditorFrame({document,onSave,permissions,onDirty,onExit}){
 const ref=useRef(),[target,setTarget]=useState(null);
 const srcDoc='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="editor"></div></body></html>';
 return <iframe title="Estimate editor" ref={ref} srcDoc={srcDoc} onLoad={()=>setTarget(ref.current.contentDocument.getElementById('editor'))}
  style={{width:'100%',height:'calc(100dvh - 130px)',minHeight:620,border:0}}
 >{target&&createPortal(<WorkbenchEditor initialDocument={document} onSave={onSave} canEditCatalog={permissions.canEditCatalog} readOnly={!permissions.canEstimate} frameWindow={ref.current.contentWindow} onDirty={onDirty} onExit={onExit}/>,target)}</iframe>;
}
export default function WorkbenchRoute(){
 const permissions=usePermissions(),{getToken}=useAuth();
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false);
 const dirty=useRef(false),active=useRef(null),saving=useRef(false);
 const library=useRef([]);
 const markDirty=useCallback(value=>{dirty.current=value;},[]);
 const client=useCallback(async()=>createSupabaseClient(await getToken({template:'supabase'})),[getToken]);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const db=await client();const materials=await loadCatalogue(db);
   library.current=await loadAssemblyLibrary(db);
   const response=await db.from('estimate_workbenches').select('estimate_id,revision,document,updated_at').order('updated_at',{ascending:false});
   if(response.error)throw response.error;
   setCatalogue(materials);setRows(response.data);
  }catch(e){setError(e.message);}finally{setLoading(false);}
 },[client]);
 useEffect(()=>{if(!permissions.isLoading&&(permissions.canEstimate||permissions.canApproveEstimates))reload();else if(!permissions.isLoading)setLoading(false);},[permissions.isLoading,permissions.canEstimate,permissions.canApproveEstimates,reload]);
 useEffect(()=>{const warn=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{
  const guard=e=>{
   const link=e.target.closest?.('a[href]');
   if(dirty.current&&link&&link.href!==location.href&&!window.confirm('Leave without saving your estimate changes?')){
    e.preventDefault();e.stopPropagation();
   }
  };
  document.addEventListener('click',guard,true);
  return()=>document.removeEventListener('click',guard,true);
 },[]);
 async function save(document,updates=[]){
  if(saving.current)throw new Error('A save is already in progress.');
  saving.current=true;
  try{
   const db=await client();const {data,error}=await db.rpc('save_estimate_workbench',{
    p_estimate_id:active.current?.estimate_id||null,p_division:permissions.division,
    p_document:document,p_expected_revision:active.current?.revision||null,p_catalogue_updates:updates
   });
   if(error)throw error;
   active.current=data;dirty.current=false;
   setRows(current=>[data,...current.filter(r=>r.estimate_id!==data.estimate_id)]);
   // A refresh failure must not turn a committed transaction into a reported failed save.
   if(updates.length){try{setCatalogue(await loadCatalogue(db));}catch{setError('Saved successfully. Catalogue refresh failed; reopen before another shared update.');}}
   return data;
  }finally{saving.current=false;}
 }
 async function create(e){
  e.preventDefault();setCreating(true);setError('');
  try{const f=new FormData(e.target);active.current=null;const doc=seed(f.get('name').trim(),f.get('customer').trim(),f.get('template'));doc.library=structuredClone(library.current);const row=await save(doc);setSelected(row);}
  catch(e){setError(e.message);}finally{setCreating(false);}
 }
 function exit(){
  if(dirty.current&&!window.confirm('Leave without saving your estimate changes?'))return;
  dirty.current=false;active.current=null;setSelected(null);
 }
 if(permissions.isLoading||loading)return <p>Loading estimator and material catalogue...</p>;
 if(!permissions.canEstimate&&!permissions.canApproveEstimates)return <p>Estimate access is required.</p>;
 if(selected)return <>{error&&<p role="alert">{error}</p>}<EditorFrame key={selected.estimate_id} document={selected.document} onSave={save} permissions={permissions} onDirty={markDirty} onExit={exit}/></>;
 return <section>
  <Link to="/estimates"><ArrowLeft size={16}/> Existing estimator</Link>
  <h1>Estimates</h1>
  {error&&<p role="alert">{error}</p>}
  <button type="button" onClick={reload}><RefreshCw size={16}/> Refresh catalogue</button>
  {permissions.canEstimate&&<form className="job-financials-form" onSubmit={create}>
   <h2>Create estimate</h2><div className="job-financials-form__grid">
    <label>Project name<input name="name" required/></label><label>Customer<input name="customer"/></label>
    <label>Template<select name="template">{Object.keys(sections).map(s=><option key={s}>{s}</option>)}</select></label>
   </div><button className="primary-button" disabled={creating||!!error}><Plus size={16}/>{creating?'Creating...':'Create estimate'}</button>
  </form>}
  <h2>Draft estimates</h2>
  {rows.map(row=><button className="secondary-button" key={row.estimate_id} onClick={()=>{active.current=row;setSelected(row);}} style={{display:'flex',width:'100%',justifyContent:'space-between',marginBottom:8}}><strong>{row.document.name}</strong><span>{row.document.customer}</span></button>)}
  {!rows.length&&<p>No drafts in the new estimator yet.</p>}
 </section>;
}
