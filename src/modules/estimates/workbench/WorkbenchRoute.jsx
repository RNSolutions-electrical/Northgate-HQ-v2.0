import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useAuth} from '@clerk/clerk-react';
import {useLocation,useNavigate} from 'react-router-dom';
import {Plus,ArrowLeft,RefreshCw} from 'lucide-react';
import {usePermissions} from '../../../hooks/usePermissions.js';
import {createSupabaseClient} from '../../../services/supabaseClient.js';
import WorkbenchEditor from './app.jsx';
import {seed,sections,setCatalogue} from './model.mjs';
import {loadCatalogue,loadAssemblyLibrary} from './catalogueService.js';
import {WorkspaceHeader} from '../../../components/ui/WorkspaceHeader.jsx';
import css from './style.css?inline';

function EditorFrame({document,onSave,onApprove,approvedSnapshot,permissions,onDirty,onExit,onReloadLibrary,libraryOnly,onArchiveAssembly,onCreateRevision,version,onOpenOriginal}){
 const ref=useRef(),[target,setTarget]=useState(null);
 const srcDoc='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="editor"></div></body></html>';
 return <iframe title="Estimate editor" ref={ref} srcDoc={srcDoc} onLoad={()=>setTarget(ref.current.contentDocument.getElementById('editor'))}
  style={{width:'100%',height:'calc(100dvh - 130px)',minHeight:620,border:0}}
 >{target&&createPortal(<WorkbenchEditor initialDocument={document} onSave={onSave} onApprove={onApprove} approvedSnapshot={approvedSnapshot} canEditCatalog={permissions.canEditCatalog} canApprove={permissions.canApproveEstimates} readOnly={!permissions.canEstimate} frameWindow={ref.current.contentWindow} onDirty={onDirty} onExit={onExit} onReloadLibrary={onReloadLibrary} libraryOnly={libraryOnly} onArchiveAssembly={onArchiveAssembly} onCreateRevision={onCreateRevision} version={version} onOpenOriginal={onOpenOriginal}/>,target)}</iframe>;
}
export default function WorkbenchRoute({libraryOnly=false}){
 const location=useLocation(),navigate=useNavigate();
 const permissions=usePermissions(),{getToken}=useAuth();
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false);
 const allowedDivisions=permissions.canViewAllDivisions?['Electrical','Construction','Admin']:[permissions.division].filter(Boolean);
 const requestedDivision=location.state?.department||permissions.department||permissions.division;
 const division=allowedDivisions.includes(requestedDivision)?requestedDivision:permissions.division;
 const dirty=useRef(false),active=useRef(null),saving=useRef(false);
 const library=useRef([]);
 const markDirty=useCallback(value=>{dirty.current=value;},[]);
 const client=useCallback(async()=>createSupabaseClient(await getToken({template:'supabase'})),[getToken]);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const db=await client();const materials=await loadCatalogue(db);
   library.current=await loadAssemblyLibrary(db);
   const response=libraryOnly?{data:[]}:await db.from('estimate_workbenches').select('estimate_id,revision,document,updated_at,estimates!estimate_workbenches_estimate_id_fkey!inner(division,status,submitted_at,version_number,revision_of,revision_root_id,source_snapshot_id)').eq('estimates.division',division).order('updated_at',{ascending:false});
   if(response.error)throw response.error;
   const workbenches=response.data||[];
   let snapshotsByEstimate=new Map();
   if(workbenches.length){
    const snapshots=await db.from('estimate_snapshots').select('id,estimate_id,approved_at,approved_by,approval_note,title,customer_name,pricing_total,workbench_document').in('estimate_id',workbenches.map(row=>row.estimate_id)).order('approved_at',{ascending:false});
    if(snapshots.error)throw snapshots.error;
    for(const snapshot of snapshots.data||[])if(!snapshotsByEstimate.has(snapshot.estimate_id))snapshotsByEstimate.set(snapshot.estimate_id,snapshot);
   }
   setCatalogue(materials);setRows(workbenches.map(row=>({...row,snapshot:snapshotsByEstimate.get(row.estimate_id)||null})));
  }catch(e){setError(e.message);}finally{setLoading(false);}
 },[client,division,libraryOnly]);
 useEffect(()=>{if(!permissions.isLoading&&(permissions.canEstimate||permissions.canApproveEstimates))reload();else if(!permissions.isLoading)setLoading(false);},[permissions.isLoading,permissions.canEstimate,permissions.canApproveEstimates,reload]);
 useEffect(()=>{const warn=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{
  const guard=e=>{
   const link=e.target.closest?.('a[href]');
   if(dirty.current&&link&&link.href!==location.href&&!window.confirm('Leave without saving your estimate changes?')){
    e.preventDefault();e.stopPropagation();
   }
  };
  const beforeNavigate=e=>{if(dirty.current&&!window.confirm('Leave without saving your changes?'))e.preventDefault();};
  window.document.addEventListener('northgate:before-navigate',beforeNavigate);
  document.addEventListener('click',guard,true);
  return()=>{document.removeEventListener('click',guard,true);window.document.removeEventListener('northgate:before-navigate',beforeNavigate);};
 },[]);
 async function save(document,updates=[],assembly=null){
  if(saving.current)throw new Error('A save is already in progress.');
  saving.current=true;
  try{
   const db=await client();const {data,error}=await db.rpc(assembly?'save_workbench_assembly':'save_estimate_workbench',{
    p_estimate_id:active.current?.estimate_id||null,p_division:division,
    p_document:document,p_expected_revision:active.current?.revision||null,p_catalogue_updates:updates,
    ...(assembly?{p_assembly:assembly}:{})
   });
   if(error)throw error;
   data.estimates=active.current?.estimates||{division,status:'draft',version_number:1};
   active.current=data;dirty.current=false;
   setRows(current=>[data,...current.filter(r=>r.estimate_id!==data.estimate_id)]);
   // A refresh failure must not turn a committed transaction into a reported failed save.
   if(updates.length){try{setCatalogue(await loadCatalogue(db));}catch{setError('Saved successfully. Catalogue refresh failed; reopen before another shared update.');}}
   if(assembly){try{library.current=await loadAssemblyLibrary(db);data.document={...data.document,library:structuredClone(library.current)};}catch{setError('Saved successfully. Library refresh failed; refresh the catalogue before editing shared assemblies again.');}}
   return data;
  }finally{saving.current=false;}
 }
 async function archiveAssembly(item,reason){
  const db=await client();const {error}=await db.rpc('archive_assembly_library',{p_assembly_id:item.libraryId,p_expected_updated_at:item.updatedAt,p_reason:reason});
  if(error)throw error;library.current=library.current.filter(a=>a.id!==item.id);
 }
 async function approve(document,note){
  if(!active.current?.estimate_id)throw new Error('Save the estimate before approval.');
  const db=await client();
  const {data:snapshotId,error}=await db.rpc('approve_workbench_estimate',{p_estimate_id:active.current.estimate_id,p_approval_note:note||null});
  if(error)throw error;
  const snapshotResponse=await db.from('estimate_snapshots').select('id,estimate_id,approved_at,approved_by,approval_note,title,customer_name,pricing_total,workbench_document').eq('id',snapshotId).single();
  if(snapshotResponse.error)throw snapshotResponse.error;
  const snapshot=snapshotResponse.data;
  setRows(current=>current.map(row=>row.estimate_id===active.current.estimate_id?{...row,estimates:{...row.estimates,status:'approved',submitted_at:snapshot.approved_at},snapshot}:row));
  return snapshot;
 }
 async function createRevision(snapshot,reason){
  const db=await client(),response=await db.rpc('create_workbench_revision',{p_estimate_id:active.current.estimate_id,p_source_snapshot_id:snapshot.id,p_reason:reason});
  if(response.error)throw response.error;
  const row=response.data;
  const header=await db.from('estimates').select('division,status,submitted_at,version_number,revision_of,revision_root_id,source_snapshot_id').eq('id',row.estimate_id).single();
  if(header.error)throw header.error;
  const next={...row,estimates:header.data,snapshot:null};
  active.current=next;dirty.current=false;setRows(current=>[next,...current.filter(r=>r.estimate_id!==next.estimate_id)]);setSelected(next);
 }
 async function saveLibrary(document,updates,assembly){
  if(!assembly)throw new Error('Select an assembly to save.');
  const db=await client(),{data,error}=await db.rpc('save_assembly_library',{p_division:division,p_assembly:assembly});
  if(error)throw error;
  const saved={...assembly,id:data.id,libraryId:data.id,updatedAt:null,qty:1,kind:'Assembly',status:'Not started'};
  library.current=[...library.current.filter(a=>a.id!==saved.id),saved];
  try{library.current=await loadAssemblyLibrary(db);}catch{setError('Saved. Library refresh failed; refresh before further edits.');}
  return {document:{...document,library:structuredClone(library.current)}};
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
 if(libraryOnly)return <>{error&&<p role="alert">{error}</p>}<EditorFrame document={{...seed('Assembly library'),library:structuredClone(library.current)}} onSave={saveLibrary} permissions={permissions} onDirty={markDirty} onExit={()=>{if(!dirty.current||window.confirm('Leave without saving changes?'))navigate('/estimates');}} onReloadLibrary={async()=>{library.current=await loadAssemblyLibrary(await client());return structuredClone(library.current);}} libraryOnly onArchiveAssembly={archiveAssembly}/></>;
 if(selected){
  const approvedSnapshot=selected.snapshot||null;
  const document={...selected.document,approvedAt:approvedSnapshot?.approved_at||null,library:structuredClone(library.current)};
  return <>{error&&<p role="alert">{error}</p>}<EditorFrame key={selected.estimate_id} document={document} onSave={save} onApprove={approve} approvedSnapshot={approvedSnapshot} onArchiveAssembly={archiveAssembly} onCreateRevision={createRevision} version={selected.estimates?.version_number||1} onOpenOriginal={selected.estimates?.revision_of?()=>{const original=rows.find(r=>r.estimate_id===selected.estimates.revision_of);if(!original){setError('The previous version is unavailable. Return to All estimates and refresh.');return;}if(dirty.current&&!window.confirm('Leave without saving your estimate changes?'))return;dirty.current=false;active.current=original;setSelected(original);}:undefined} permissions={permissions} onDirty={markDirty} onExit={exit} onReloadLibrary={async()=>{library.current=await loadAssemblyLibrary(await client());return structuredClone(library.current);}}/></>;
 }
 return <section className="workspace-stack">
  <WorkspaceHeader eyebrow="Workspace" title={division+' Estimates'} description="Build pricing, prepare a client proposal, and retain approved versions." descriptionIsDiagnostic={false} actions={<><button className="secondary-button" type="button" onClick={()=>navigate('/estimates/assemblies')}>Assembly library</button><button className="secondary-button" type="button" onClick={reload}><RefreshCw size={16}/> Refresh catalogue</button></>}/>
  {error&&<p role="alert">{error}</p>}
  {permissions.canEstimate&&<form className="job-financials-form" onSubmit={create}>
   <h2>Create estimate</h2><div className="job-financials-form__grid">
    <label>Project name<input type="text" name="name" required/></label><label>Customer<input type="text" name="customer"/></label>
    <label>Template<select name="template">{Object.keys(sections).map(s=><option key={s}>{s}</option>)}</select></label>
   </div><div className="job-financials-form__actions"><button className="primary-button" disabled={creating||!!error}><Plus size={16}/>{creating?'Creating...':'Create estimate'}</button></div>
  </form>}
  <h2>Workbench estimates</h2>
  {rows.map(row=><button className="secondary-button" key={row.estimate_id} onClick={()=>{active.current=row;setSelected(row);}} style={{display:'flex',width:'100%',justifyContent:'space-between',marginBottom:8}}><strong>{row.document.name}</strong><span>{row.document.customer}</span><span>Version {row.estimates?.version_number||1}{row.estimates?.revision_of?' · Revised':''}</span><span>{row.estimates?.status === 'approved' ? 'Approved' : 'Draft'}</span></button>)}
  {!rows.length&&<p>No estimates yet.</p>}
 </section>;
}
