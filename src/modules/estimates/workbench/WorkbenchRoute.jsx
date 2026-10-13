import {newLaborRates} from './laborRates.mjs';
import { getSupabaseAccessToken } from '../../../services/clerkToken.js';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useAuth} from '@clerk/clerk-react';
import {useLocation,useNavigate,useOutletContext} from 'react-router-dom';
import {Plus,ArrowLeft,RefreshCw} from 'lucide-react';
import {usePermissions} from '../../../hooks/usePermissions.js';
import {createSupabaseClient} from '../../../services/supabaseClient.js';
import WorkbenchEditor from './app.jsx';
import PersonalEstimateSubmission from './PersonalEstimateSubmission.jsx';
import { EstimateDirectory } from './EstimateDirectory.jsx';
import './estimateDirectory.css';
import {seed,sections,setCatalogue} from './model.mjs';
import {loadCatalogue,loadAssemblyLibrary,catalogueMaterial} from './catalogueService.js';
import {WorkspaceHeader} from '../../../components/ui/WorkspaceHeader.jsx';
import baseCSS from './style.css?inline';
import workspaceCSS from './workspace.css?inline';
import catalogueCSS from '../../inventory/materialCatalogue.css?inline';
const css=baseCSS+'\n'+workspaceCSS+'\n'+catalogueCSS;
import {handoffDestinationState} from './handoff.mjs';
import {estimatesSectionFromLocation,estimatesSectionUrl} from '../estimatesNavigation.js';

function EditorFrame({document,onSave,onApprove,approvedSnapshot,permissions,onDirty,onExit,onReloadLibrary,libraryOnly,onArchiveAssembly,onArchiveEstimate,onCreateRevision,version,onOpenOriginal,fitViewport=false,...handoffProps}){
 const ref=useRef(),[target,setTarget]=useState(null),[height,setHeight]=useState(0);
 useEffect(()=>{
  if(!fitViewport)return;
  const frame=ref.current,win=frame.ownerDocument.defaultView;
  const shell=frame.closest('.ng-shell'),body=frame.closest('.ng-shell__body');
  const resize=()=>{
   // Measure header/banner height, including wrapped text on small screens.
   if(shell&&body)shell.style.setProperty('--ng-estimate-shell-top',(body.getBoundingClientRect().top+win.scrollY)+'px');
   const content=frame.closest('.ng-shell__content');
   const bottom=content?parseFloat(win.getComputedStyle(content).paddingBottom)||0:0;
   setHeight(Math.max(1,(win.visualViewport?.height||win.innerHeight)-(frame.getBoundingClientRect().top+win.scrollY)-bottom-16));
  };
  const observer=new ResizeObserver(resize);observer.observe(frame.parentElement);
  win.addEventListener('resize',resize);win.visualViewport?.addEventListener('resize',resize);resize();
  return()=>{observer.disconnect();win.removeEventListener('resize',resize);win.visualViewport?.removeEventListener('resize',resize);shell?.style.removeProperty('--ng-estimate-shell-top');};
 },[fitViewport]);
 const srcDoc='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="editor"></div></body></html>';
 return <iframe title="Estimate editor" className={fitViewport?'estimate-editor-frame--fit':undefined} ref={ref} srcDoc={srcDoc} onLoad={()=>setTarget(ref.current.contentDocument.getElementById('editor'))}
  style={{display:'block',width:'100%',height:fitViewport&&height?height:'calc(100dvh - 130px)',minHeight:fitViewport?0:620,border:0}}
 >{target&&createPortal(<WorkbenchEditor initialDocument={document} onSave={onSave} onApprove={onApprove} approvedSnapshot={approvedSnapshot} canEditCatalog={permissions.canEditCatalog&&!permissions.personalOnly} canApprove={permissions.canApproveEstimates&&!permissions.personalOnly} readOnly={permissions.personalLocked||(!permissions.canEstimate&&!permissions.personalOnly)} frameWindow={ref.current.contentWindow} onDirty={onDirty} onExit={onExit} onReloadLibrary={onReloadLibrary} libraryOnly={libraryOnly} onArchiveAssembly={onArchiveAssembly} onArchiveEstimate={onArchiveEstimate} onCreateRevision={onCreateRevision} version={version} onOpenOriginal={onOpenOriginal} {...handoffProps}/>,target)}</iframe>;
}
export default function WorkbenchRoute({libraryOnly=false}){
 const location=useLocation(),navigate=useNavigate();
 const permissions=usePermissions(),{getToken}=useAuth();
 const {setEstimatesNavVisible}=useOutletContext();
 const personalOnly=permissions.canSavePersonalWork&&!permissions.canEstimate&&!permissions.canApproveEstimates;
 const [view,setView]=useState(()=>estimatesSectionFromLocation(location.pathname,location.search,permissions,location.state));
 const personalMode=personalOnly||view==='personal';
 const reviewMode=!personalOnly&&view==='review';
 const [reviewRows,setReviewRows]=useState([]),[selectedReview,setSelectedReview]=useState(null);
 const [workflow,setWorkflow]=useState({reason:'',busy:false,error:'',success:''});
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false);
 const allowedDivisions=permissions.canViewAllDivisions?['Electrical','Construction','Admin']:[permissions.division].filter(Boolean);
 const requestedDivision=location.state?.department||permissions.department||permissions.division;
 const division=allowedDivisions.includes(requestedDivision)?requestedDivision:permissions.division;
 const dirty=useRef(false),active=useRef(null),saving=useRef(false),submitting=useRef(false);
 useEffect(()=>{setWorkflow({reason:'',busy:false,error:'',success:''});},[selected?.personal_id]);
 const library=useRef([]),librarySettings=useRef(null);
 const [handoffs,setHandoffs]=useState({});
 const [associatedJob,setAssociatedJob]=useState(null);
 const [checklistConfig,setChecklistConfig]=useState(null);
 const markDirty=useCallback(value=>{dirty.current=value;},[]);
 const client=useCallback(async()=>createSupabaseClient(await getSupabaseAccessToken(getToken)),[getToken]);
 useEffect(()=>{
  if(!libraryOnly)setView(estimatesSectionFromLocation(location.pathname,location.search,permissions,location.state));
 },[libraryOnly,location.pathname,location.search,location.state?.reviewMode,permissions.canSavePersonalWork,permissions.canEstimate,permissions.canApproveEstimates]);
 useEffect(()=>{
  setEstimatesNavVisible(libraryOnly||(!selected&&!selectedReview));
 },[libraryOnly,selected,selectedReview,setEstimatesNavVisible]);
 useEffect(()=>()=>setEstimatesNavVisible(true),[setEstimatesNavVisible]);
 const reloadChecklist=useCallback(async()=>{
  try{const db=await client(),result=await db.from('estimate_checklist_definitions').select('*').order('sort_order');if(result.error)throw result.error;setChecklistConfig(result.data);}
  catch{setChecklistConfig(null);}
 },[client]);
 useEffect(()=>{if(!libraryOnly&&!permissions.isLoading&&(permissions.canEstimate||permissions.canApproveEstimates))reloadChecklist();},[libraryOnly,permissions.isLoading,permissions.canEstimate,permissions.canApproveEstimates,reloadChecklist]);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const db=await client();
   if(reviewMode){
    const response=await db.rpc('read_v5_estimate_task_queue',{p_limit:200});
    if(response.error)throw response.error;
    setReviewRows(response.data||[]);setRows([]);setHandoffs({});
    return;
   }
   librarySettings.current=await loadRateSettings(db);
   if(personalMode){
    const [materials,assemblies]=await Promise.all([loadCatalogue(db),loadAssemblyLibrary(db,division)]);
    const response=await db.rpc('read_my_v5_working_copies',{p_module_key:'estimating',p_limit:200});
    if(response.error)throw response.error;
    library.current=assemblies;setCatalogue(materials);
    setRows((response.data||[]).filter(row=>row.work_type==='estimate').map(row=>({
     personal_id:row.id,revision:row.version,document:row.payload,updated_at:row.updated_at,
     estimates:{division:row.scope_context?.division||division,status:row.status,version_number:row.version},
     snapshot:null
    })));
    setHandoffs({});
    return;
   }
   const materials=await loadCatalogue(db);
   library.current=await loadAssemblyLibrary(db,division);
   const response=libraryOnly?{data:[]}:await db.from('estimate_workbenches').select('estimate_id,revision,document,updated_at,estimates!estimate_workbenches_estimate_id_fkey!inner(division,status,submitted_at,version_number,revision_of,revision_root_id,source_snapshot_id)').eq('estimates.division',division).order('updated_at',{ascending:false});
   if(response.error)throw response.error;
   const workbenches=response.data||[];
   if(workbenches.length){const links=await db.from('estimate_workflow_handoffs').select('id,estimate_id,job_id,change_order_id,destination,source_version,source_revision').in('estimate_id',workbenches.map(r=>r.estimate_id));if(links.error)throw links.error;setHandoffs(Object.fromEntries((links.data||[]).map(h=>[h.estimate_id,h])));}
   let snapshotsByEstimate=new Map();
   if(workbenches.length){
    const snapshots=await db.from('estimate_snapshots').select('id,estimate_id,approved_at,approved_by,approval_note,title,customer_name,pricing_total,workbench_document').in('estimate_id',workbenches.map(row=>row.estimate_id)).order('approved_at',{ascending:false});
    if(snapshots.error)throw snapshots.error;
    for(const snapshot of snapshots.data||[])if(!snapshotsByEstimate.has(snapshot.estimate_id))snapshotsByEstimate.set(snapshot.estimate_id,snapshot);
   }
   setCatalogue(materials);setRows(workbenches.map(row=>({...row,snapshot:snapshotsByEstimate.get(row.estimate_id)||null})));
  }catch(e){setError(e.message);}finally{setLoading(false);}
 },[client,division,libraryOnly,personalMode,reviewMode]);
 useEffect(()=>{if(reviewMode&&location.state?.reviewDestinationId&&reviewRows.length){const row=reviewRows.find(item=>item.destination_id===location.state.reviewDestinationId);if(row)setSelectedReview(row);}},[reviewMode,reviewRows,location.state?.reviewDestinationId]);
 useEffect(()=>{if(!permissions.isLoading&&(permissions.canEstimate||permissions.canApproveEstimates||permissions.canSavePersonalWork))reload();else if(!permissions.isLoading)setLoading(false);},[permissions.isLoading,permissions.canEstimate,permissions.canApproveEstimates,permissions.canSavePersonalWork,reload]);
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
   const db=await client();
   if(personalMode){
    const priorProposals=document.reviewProposals||{};
    const savedDocument={...document,reviewProposals:{...priorProposals,
      ...(assembly?{assembly}:{...(('assembly' in priorProposals)?{assembly:priorProposals.assembly}:{})}),
      ...(updates.length?{catalogueUpdates:updates}:{...(('catalogueUpdates' in priorProposals)?{catalogueUpdates:priorProposals.catalogueUpdates}:{})})}};
    const {data,error}=await db.rpc('save_v5_working_copy',{
     p_request_id:crypto.randomUUID(),p_working_copy_id:active.current?.personal_id||null,
     p_expected_version:active.current?.revision||null,p_module_key:'estimating',p_work_type:'estimate',
     p_scope_context:{division},p_payload:savedDocument,p_source_table:null,p_source_record_id:null,p_source_version:null
    });
    if(error)throw error;
    const row={personal_id:data.id,revision:data.version,document:data.payload,updated_at:data.updated_at,
     estimates:{division,status:data.status,version_number:data.version},snapshot:null};
    active.current=row;dirty.current=false;
    setRows(current=>[row,...current.filter(item=>item.personal_id!==row.personal_id)]);
    return {...row,document:savedDocument};
   }
   const {data,error}=await db.rpc(assembly?'save_workbench_assembly':'save_estimate_workbench',{
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
   if(assembly){try{library.current=await loadAssemblyLibrary(db,division);data.document={...data.document,library:structuredClone(library.current)};}catch{setError('Saved successfully. Library refresh failed; refresh the catalogue before editing shared assemblies again.');}}
   return data;
  }finally{saving.current=false;}
 }
 async function saveChecklistDefinition(values){
  const db=await client(),response=await db.rpc('manage_estimate_checklist',{p_key:values.key,p_label:values.label||null,p_description:values.description||'',p_retire:!!values.retire,p_reason:values.reason||null});
  if(response.error)throw response.error;
  await reloadChecklist();
 }
 useEffect(()=>{
  let valid=true;setAssociatedJob(null);
  const jobId=selected&&handoffs[selected.estimate_id]?.job_id;
  if(jobId)client().then(db=>db.from('jobs').select('id,name,job_number,address_line1,address_line2,city,state,postal_code').eq('id',jobId).single()).then(r=>{
   if(valid&&r.data)setAssociatedJob({...r.data,number:r.data.job_number,address:[r.data.address_line1,r.data.address_line2,r.data.city,r.data.state,r.data.postal_code].filter(Boolean).join(', ')});
  }).catch(()=>{});
  return()=>{valid=false;};
 },[selected?.estimate_id,handoffs,client]);
 const catalogueRequest=useRef(null);
 async function catalogueSave(line,material,values){
  const db=await client();
  const input={p_item_id:material?.id||line.catalogueCandidateId||null,p_division:division,p_values:values,p_expected_updated_at:material?.updated_at||null};
  const key=JSON.stringify(input);if(catalogueRequest.current?.key!==key)catalogueRequest.current={key,id:crypto.randomUUID()};
  const response=await db.rpc('save_full_material_catalogue',{...input,p_request_id:catalogueRequest.current.id});
  if(response.error)throw response.error;
  const saved=catalogueMaterial(response.data.item);
  catalogueRequest.current=null;
  try{setCatalogue(await loadCatalogue(db));}catch{setError('Material saved. Refresh catalogue before another shared edit.');}
  return saved;
 }
 async function archiveAssembly(item,reason){
  const db=await client();const {error}=await db.rpc('archive_assembly_library',{p_assembly_id:item.libraryId,p_expected_updated_at:item.updatedAt,p_reason:reason});
  if(error)throw error;library.current=library.current.filter(a=>a.id!==item.id);
 }
 async function archiveEstimate(reason){
  if(!active.current?.estimate_id)throw new Error('Save the estimate before archiving it.');
  const db=await client(),estimateId=active.current.estimate_id;
  const {error}=await db.rpc('archive_estimate',{p_estimate_id:estimateId,p_reason:reason});
  if(error)throw error;
  setRows(current=>current.filter(row=>row.estimate_id!==estimateId));dirty.current=false;active.current=null;setSelected(null);
 }
 async function submitHandoff(values){
  if(saving.current)throw new Error('Wait for the current save to finish.');
  const current=active.current;if(!current?.estimate_id)throw new Error('Save the estimate first.');
  const db=await client(),{data,error}=await db.rpc('submit_estimate_for_review_v2',{
   p_estimate_id:current.estimate_id,p_expected_revision:current.revision,p_destination:values.destination,
   p_job_id:values.jobId||null,p_new_job:values.newJob,p_co_number:values.coNumber||null,p_line_targets:values.targets,
   p_financial_targets:values.financialTargets||{}});
  if(error)throw error;setHandoffs(h=>({...h,[current.estimate_id]:data}));return data;
 }
 function openHandoff(handoff){
  if(dirty.current&&!window.confirm('Leave without saving your estimate changes?'))return;
  dirty.current=false;navigate('/jobs',{state:handoffDestinationState(handoff)});
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
 async function loadRateSettings(db){
  const response=await db.from('assembly_library_settings').select('division,default_rate,updated_at').eq('division',division).single();
  if(response.error)throw new Error('Assembly Library rates are unavailable. Refresh or contact your administrator.');
  return response.data;
 }
 async function loadLibraryRates(){
  const db=await client();const [settings,assemblies]=await Promise.all([loadRateSettings(db),loadAssemblyLibrary(db,division)]);
  librarySettings.current=settings;library.current=assemblies;return {settings,library:structuredClone(assemblies)};
 }
 async function saveRateSettings(rate,expected){
  const db=await client(),response=await db.rpc('save_assembly_library_settings',{p_division:division,p_rate:rate,p_expected_updated_at:expected.updated_at});
  if(response.error)throw response.error;librarySettings.current=response.data;return response.data;
 }
 async function saveLibrary(document,updates,assembly){
  if(!assembly)throw new Error('Select an assembly to save.');
  const db=await client(),{data,error}=await db.rpc('save_assembly_library',{p_division:division,p_assembly:assembly});
  if(error)throw error;
  const saved={...assembly,id:data.id,libraryId:data.id,updatedAt:null,qty:1,kind:'Assembly',status:'Not started'};
  library.current=[...library.current.filter(a=>a.id!==saved.id),saved];
  try{library.current=await loadAssemblyLibrary(db,division);}catch{setError('Saved. Library refresh failed; refresh before further edits.');}
  return {document:{...document,library:structuredClone(library.current)}};
 }
 async function create(e){
  e.preventDefault();setCreating(true);setError('');
  try{const f=new FormData(e.target);active.current=null;const doc=newLaborRates(seed(f.get('name').trim(),f.get('customer').trim(),f.get('template')),librarySettings.current);doc.library=structuredClone(library.current);const row=await save(doc);setSelected(row);}
  catch(e){setError(e.message);}finally{setCreating(false);}
 }
 function exit(){
  if(dirty.current&&!window.confirm('Leave without saving your estimate changes?'))return;
  dirty.current=false;active.current=null;setSelected(null);
 }
 function switchView(next){
  if(dirty.current&&!window.confirm('Leave without saving your estimate changes?'))return;
  dirty.current=false;active.current=null;setSelected(null);setSelectedReview(null);setWorkflow({reason:'',busy:false,error:'',success:''});setView(next);
  navigate(estimatesSectionUrl(next),{state:{department:division,reviewMode:next==='review'}});
 }
 async function submitPersonal(event){
  event.preventDefault();
  if(submitting.current||workflow.busy||!personalMode||active.current?.estimates?.status==='submitted')return;
  if(dirty.current){setWorkflow(current=>({...current,error:'Save the current estimate before submitting it.'}));return;}
  const reason=workflow.reason.trim();if(!reason||!active.current?.personal_id)return;
  const submitted=active.current;submitting.current=true;
  setWorkflow(current=>({...current,busy:true,error:'',success:''}));
  try{
   const db=await client(),response=await db.rpc('submit_v5_estimate_for_review',{p_request_id:crypto.randomUUID(),p_working_copy_id:submitted.personal_id,p_expected_version:submitted.revision,p_reason:reason});
   if(response.error)throw response.error;
   const next={...submitted,estimates:{...submitted.estimates,status:'submitted'}};
   setRows(current=>current.map(row=>row.personal_id===next.personal_id?next:row));
   if(active.current?.personal_id!==submitted.personal_id)return;
   active.current=next;setSelected(next);
   setWorkflow({reason:'',busy:false,error:'',success:'Submitted for review. The locked payload remains private until a reviewer promotes it.'});
  }catch(error){if(active.current?.personal_id===submitted.personal_id)setWorkflow(current=>({...current,busy:false,error:error.message||'Submission failed.'}));}finally{submitting.current=false;}
 }
 async function reviewPersonal(decision){
  const note=workflow.reason.trim();if(!note||!selectedReview||workflow.busy)return;
  setWorkflow(current=>({...current,busy:true,error:'',success:''}));
  try{
   const db=await client();
   const response=decision==='apply'?(selectedReview.destination_key==='official_estimate'?await db.rpc('apply_v5_estimate_promotion',{p_destination_id:selectedReview.destination_id,p_expected_version:selectedReview.destination_version,p_expected_payload_hash:selectedReview.payload_hash,p_note:note}):await db.rpc('apply_v5_estimate_linked_destination',{p_destination_id:selectedReview.destination_id,p_expected_version:selectedReview.destination_version,p_expected_payload_hash:selectedReview.payload_hash,p_note:note})):await db.rpc('review_v5_change_destination',{p_destination_id:selectedReview.destination_id,p_expected_version:selectedReview.destination_version,p_expected_payload_hash:selectedReview.payload_hash,p_decision:decision,p_note:note});
   if(response.error)throw response.error;
   setReviewRows(current=>current.filter(row=>row.destination_id!==selectedReview.destination_id));setSelectedReview(null);
   setWorkflow({reason:'',busy:false,error:'',success:decision==='apply'?'Promoted to an official draft.':decision==='return'?'Returned to the author.':'Declined and retained in the author history.'});
  }catch(error){setWorkflow(current=>({...current,busy:false,error:error.message||'Review action failed.'}));}
 }
 if(permissions.isLoading||loading)return <p>Loading estimator and material catalogue...</p>;
 if(!permissions.canEstimate&&!permissions.canApproveEstimates&&!permissions.canSavePersonalWork)return <p>Estimate access is required.</p>;
 if(!reviewMode&&!librarySettings.current)return <p role="alert">{error||'Assembly Library rate settings are unavailable.'}</p>;
  if(libraryOnly&&personalOnly)return <p>Shared assembly access requires estimating authority. Personal assemblies remain inside My Estimates.</p>;
 if(libraryOnly)return <>{error&&<p role="alert">{error}</p>}<EditorFrame document={{...newLaborRates(seed('Assembly library'),librarySettings.current),librarySettings:librarySettings.current,library:structuredClone(library.current)}} onSaveLibrarySettings={permissions.canEditCatalog?saveRateSettings:undefined} onLoadLibraryRates={loadLibraryRates} onSave={saveLibrary} permissions={permissions} onDirty={markDirty} onExit={()=>{if(!dirty.current||window.confirm('Leave without saving changes?'))navigate('/estimates');}} onReloadLibrary={async()=>{library.current=await loadAssemblyLibrary(await client(),division);return structuredClone(library.current);}} libraryOnly onCatalogueMaterial={permissions.canEditCatalog?catalogueSave:undefined} onArchiveAssembly={archiveAssembly}/></>;
 if(selectedReview){
  if(selectedReview.destination_key!=='official_estimate')return <section className="workspace-stack">
   <WorkspaceHeader eyebrow={selectedReview.task_type} title={selectedReview.estimate_name||'Shared estimating change'} description={`Submitted by ${selectedReview.submitted_by_name} for ${selectedReview.target_division||'company review'}.`} descriptionIsDiagnostic={false} actions={<button className="secondary-button" type="button" onClick={()=>{setSelectedReview(null);setWorkflow({reason:'',busy:false,error:'',success:''});}}><ArrowLeft size={16}/>Review queue</button>}/>
   <div className="job-financials-form"><h2>Proposed shared change</h2><p><strong>Submission reason:</strong> {selectedReview.shared_reason}</p><pre className="estimate-review-payload">{JSON.stringify(selectedReview.proposed_payload,null,2)}</pre><label>Review note<textarea value={workflow.reason} onChange={event=>setWorkflow(current=>({...current,reason:event.target.value,error:'',success:''}))} required rows={3}/></label>{workflow.error&&<p role="alert">{workflow.error}</p>}<div className="job-financials-form__actions"><button className="primary-button" type="button" disabled={workflow.busy||!workflow.reason.trim()} onClick={()=>reviewPersonal('apply')}>Approve and Apply</button><button className="secondary-button" type="button" disabled={workflow.busy||!workflow.reason.trim()} onClick={()=>reviewPersonal('return')}>Return for Changes</button><button className="secondary-button" type="button" disabled={workflow.busy||!workflow.reason.trim()} onClick={()=>reviewPersonal('decline')}>Decline</button></div></div>
  </section>;
  const reviewDocument={...selectedReview.proposed_payload,library:[]};
  return <section className="workspace-stack">
   <WorkspaceHeader eyebrow="Estimate review" title={reviewDocument.name||'Submitted estimate'} description={'Submitted by '+selectedReview.submitted_by_name+' for '+selectedReview.target_division+'.'} descriptionIsDiagnostic={false} actions={<button className="secondary-button" type="button" onClick={()=>{setSelectedReview(null);setWorkflow({reason:'',busy:false,error:'',success:''});}}><ArrowLeft size={16}/>Review queue</button>}/>
   <div className="job-financials-form">
    <h2>Review decision</h2>
    <p><strong>Submission reason:</strong> {selectedReview.shared_reason}</p>
    <label>Review note<textarea value={workflow.reason} onChange={event=>setWorkflow(current=>({...current,reason:event.target.value,error:'',success:''}))} required rows={3} placeholder="Required for promotion, return, or decline"/></label>
    {workflow.error&&<p role="alert">{workflow.error}</p>}
    {workflow.success&&<p role="status">{workflow.success}</p>}
    <div className="job-financials-form__actions">
     <button className="primary-button" type="button" disabled={workflow.busy||!workflow.reason.trim()} onClick={()=>reviewPersonal('apply')}>Promote to Official Draft</button>
     <button className="secondary-button" type="button" disabled={workflow.busy||!workflow.reason.trim()} onClick={()=>reviewPersonal('return')}>Return for Changes</button>
     <button className="secondary-button" type="button" disabled={workflow.busy||!workflow.reason.trim()} onClick={()=>reviewPersonal('decline')}>Decline</button>
    </div>
   </div>
   <EditorFrame document={reviewDocument} permissions={{...permissions,personalOnly:false,personalLocked:true}} onDirty={()=>{}} onExit={()=>setSelectedReview(null)} onReloadLibrary={async()=>[]}/>
  </section>;
 }
 if(selected){
  const approvedSnapshot=selected.snapshot||null;
  const document={...selected.document,approvedAt:approvedSnapshot?.approved_at||null,libraryDefaultRateCurrent:librarySettings.current?.default_rate,library:structuredClone(library.current)};
  const personalLocked=personalMode&&selected.estimates?.status==='submitted';
  return <section className="workspace-stack">
   {error&&<p role="alert">{error}</p>}
   {personalMode&&<PersonalEstimateSubmission key={'submission:'+selected.personal_id} routeKey={location.key} locked={personalLocked} workflow={workflow} onReason={reason=>setWorkflow(current=>({...current,reason,error:'',success:''}))} onSubmit={submitPersonal}/>}
   <EditorFrame fitViewport key={selected.estimate_id||selected.personal_id} document={document} onLoadLibraryRates={loadLibraryRates} onSave={save} onApprove={personalMode?undefined:approve} approvedSnapshot={approvedSnapshot} onCatalogueMaterial={!personalMode&&permissions.canEditCatalog?catalogueSave:undefined} onArchiveAssembly={personalMode?undefined:archiveAssembly} onArchiveEstimate={!personalMode&&permissions.canArchiveRecords?archiveEstimate:undefined} onCreateRevision={personalMode?undefined:createRevision} version={selected.estimates?.version_number||1} onOpenOriginal={!personalMode&&selected.estimates?.revision_of?()=>{const original=rows.find(r=>r.estimate_id===selected.estimates.revision_of);if(!original){setError('The previous version is unavailable. Return to All estimates and refresh.');return;}if(dirty.current&&!window.confirm('Leave without saving your estimate changes?'))return;dirty.current=false;active.current=original;setSelected(original);}:undefined} permissions={{...permissions,personalOnly:personalMode,personalLocked}} onDirty={markDirty} onExit={exit} onReloadLibrary={async()=>{library.current=await loadAssemblyLibrary(await client(),division);return structuredClone(library.current);}} handoffClient={personalMode?undefined:client} onHandoff={personalMode?undefined:submitHandoff} onOpenHandoff={personalMode?undefined:openHandoff} existingHandoff={personalMode?null:handoffs[selected.estimate_id]} checklistConfig={checklistConfig} onReloadChecklist={reloadChecklist} canManageChecklist={!personalMode&&permissions.canEditCatalog} isDeveloper={permissions.canAccessDeveloper} onChecklistDefinition={personalMode?undefined:saveChecklistDefinition} associatedJob={personalMode?null:associatedJob} onOpenJob={personalMode?undefined:()=>openHandoff(handoffs[selected.estimate_id])}/>
  </section>;
 }
 return <section className="workspace-stack">
  <WorkspaceHeader eyebrow="Workspace" title={reviewMode?'Estimate review queue':personalMode?'My Estimates':division+' Estimates'} description={reviewMode?'Review exact submitted payloads before promoting, returning, or declining them.':personalMode?'Private working estimates remain unpublished until submitted for review.':'Build pricing, prepare a client proposal, and retain approved versions.'} descriptionIsDiagnostic={false} actions={<><span className="estimate-workbench-directory-links">{!personalOnly&&view!=='official'&&<button className="secondary-button" type="button" onClick={()=>switchView('official')}>Official estimates</button>}{!personalOnly&&view!=='personal'&&<button className="secondary-button" type="button" onClick={()=>switchView('personal')}>My Estimates</button>}{permissions.canApproveEstimates&&view!=='review'&&<button className="secondary-button" type="button" onClick={()=>switchView('review')}>Review submissions</button>}{!personalMode&&!reviewMode&&<button className="secondary-button" type="button" onClick={()=>navigate('/estimates/assemblies')}>Assembly library</button>}</span><button className="secondary-button" type="button" onClick={reload}><RefreshCw size={16}/>Refresh</button></>}/>
  {error&&<p role="alert">{error}</p>}
  {workflow.error&&<p role="alert">{workflow.error}</p>}
  {workflow.success&&<p role="status">{workflow.success}</p>}
  {!reviewMode&&(permissions.canEstimate||personalMode)&&<form className="job-financials-form estimate-create-form" onSubmit={create}>
   <h2>Create estimate</h2><div className="estimate-create-grid">
    <label>Project name<input type="text" name="name" required/></label><label>Customer<input type="text" name="customer"/></label>
    <label>Template<select name="template">{Object.keys(sections).map(s=><option key={s}>{s}</option>)}</select></label>
   <button className="primary-button" disabled={creating||!!error}><Plus size={16}/>{creating?'Creating...':'Create estimate'}</button></div>
  </form>}
  <EstimateDirectory rows={reviewMode ? reviewRows : rows} reviewMode={reviewMode} personalMode={personalMode}
    onOpen={row => {
      if (reviewMode) { setWorkflow({reason:'',busy:false,error:'',success:''}); setSelectedReview(row); }
      else { active.current=row; setSelected(row); }
    }}/>

 </section>;
}
