import {useToolAvailability} from '../../hooks/useToolAvailability.jsx';
import {fetchDaybookHqJobs} from './daybookJobs.js';
import {useAuth} from '@clerk/clerk-react';
import {useEffect,useRef,useState} from 'react';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import './daybook.css';
import {daybookFrame} from './daybookFrame.js';
import {splitWorkspace,mergeWorkspace} from './daybookModel.js';
const FRAME=daybookFrame();
const DRAFTS=new Map();
export function DaybookWorkspace({permissions}) {return <DaybookSession key={permissions.userId||'signed-out'} permissions={permissions}/>;}
function DaybookSession({permissions}) {
 const availability=useToolAvailability(),jobsGeneration=useRef(0),jobsAllowed=useRef(false);
 const liveJobsAllowed=Boolean(availability&&!availability.loading&&!availability.error&&availability.rows.some(r=>r.module_key==='jobs'&&r.is_enabled===true));
 const {getToken}=useAuth(), frame=useRef(null), state=useRef(null), pending=useRef(null), saving=useRef(false), ready=useRef(false);
 const [frameHeight,setFrameHeight]=useState(720);
 const mounted=useRef(true),validation=useRef(new Map());
 const [loaded,setLoaded]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('Loading HQ workspace…'),[lastExport,setLastExport]=useState('None this session'),[loadedBackup,setLoadedBackup]=useState('HQ cloud workspace'),[restore,setRestore]=useState(null),[history,setHistory]=useState(null);
 const rpc=async(name,args)=>{const r=await withSupabaseTokenRetry(getToken,c=>c.rpc(name,args));if(r.error)throw r.error;return r.data;};

 const send=(type,data)=>frame.current?.contentWindow?.postMessage({channel:'hq-daybook',type,data},'*');
 useEffect(()=>{jobsGeneration.current++;jobsAllowed.current=liveJobsAllowed;if(!jobsAllowed.current)send('hq-jobs-invalidated',{});},[liveJobsAllowed]);
 const initialize=()=>{if(ready.current&&state.current)send('load',pending.current||mergeWorkspace(state.current));};
 const validate=data=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{validation.current.delete(id);reject(Error('Planner validation timed out'));},10000);validation.current.set(id,{resolve,reject,timer});frame.current?.contentWindow?.postMessage({channel:'hq-daybook',type:'validate',data,id},'*');});
 const save=async(data,restoring=false,filename='')=>{
  if(saving.current||!state.current)return;
  const value=data||pending.current;if(!value)return;
  saving.current=true;setBusy(true);setError('');
  try {
   const checked=await validate(value);if(!mounted.current)return;const split=splitWorkspace(checked),current=state.current;
   const next=await rpc('save_daybook_workspace',{p_personal:split.personal,p_northgate:split.northgate,p_personal_version:current.personal.version,p_northgate_version:current.northgate?.version||0,p_restore:restoring});
   if(!mounted.current)return;state.current=next;
   if(restoring){pending.current=null;send('load',mergeWorkspace(next));setLoadedBackup(filename);setRestore(null);setDirty(false);}
   else if(pending.current===value){pending.current=null;setDirty(false);send('saved');}
   if(!pending.current)DRAFTS.delete(permissions.userId);
   setStatus('Last successful HQ save: '+new Date().toLocaleString());
  } catch(e){if(!mounted.current)return;setError((e.message||String(e))+' No replacement was applied. Keep this page open or export your edits.');}
  finally{saving.current=false;if(mounted.current)setBusy(false);}
 };
 useEffect(()=>{
  let alive=true;mounted.current=true;
  rpc('get_daybook_workspace').then(value=>{if(!alive)return;const draft=DRAFTS.get(permissions.userId);state.current=draft?.workspace||value;pending.current=draft?.data||null;setDirty(Boolean(draft));setLoaded(true);setStatus(draft?'Unsaved draft recovered. Saving checks its original cloud versions.':'HQ workspace loaded. Original local planner untouched.');initialize();}).catch(e=>{if(alive)setError(e.message||String(e));});
  const message=e=>{
   if(e.source!==frame.current?.contentWindow||e.data?.channel!=='hq-daybook')return;
   const m=e.data;
   if(m.type==='validated'){const v=validation.current.get(m.id);if(v){clearTimeout(v.timer);validation.current.delete(m.id);m.error?v.reject(Error(m.error)):v.resolve(m.data);}return;}
   if(m.type==='hq-jobs-request'){const generation=jobsGeneration.current,requestId=m.requestId;if(!jobsAllowed.current){send('hq-jobs-result',{requestId,error:'HQ Jobs availability could not be confirmed.'});return;}withSupabaseTokenRetry(getToken,async client=>({data:await fetchDaybookHqJobs(client)})).then(r=>{if(mounted.current&&generation===jobsGeneration.current&&jobsAllowed.current)send('hq-jobs-result',r.error?{requestId,error:r.error.message}:{requestId,jobs:r.data});}).catch(e=>{if(mounted.current&&generation===jobsGeneration.current)send('hq-jobs-result',{requestId,error:e.message||String(e)});});}
   if(m.type==='resize'&&Number.isFinite(m.height))setFrameHeight(Math.max(400,Math.min(40000,m.height)));
   if(m.type==='ready'){ready.current=true;initialize();}
   if(m.type==='changed'){if(saving.current)return;pending.current=m.data;DRAFTS.set(permissions.userId,{data:m.data,workspace:state.current});setDirty(true);}
   if(m.type==='restore')setRestore({data:m.data,filename:m.filename});
   if(m.type==='exported')setLastExport(m.filename+' · download requested '+new Date().toLocaleString());
   if(m.type==='error')setError(m.message);
  };
  window.addEventListener('message',message);
  return()=>{alive=false;mounted.current=false;for(const v of validation.current.values()){clearTimeout(v.timer);v.reject(Error('Planner closed'));}validation.current.clear();window.removeEventListener('message',message);};
 },[permissions.userId]);
 useEffect(()=>{const guard=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};const link=e=>{if((dirty||busy)&&e.target.closest('a[href]')&&!window.confirm('Leave Daybook without saving your edits to HQ?')){e.preventDefault();e.stopPropagation();}};window.addEventListener('beforeunload',guard);document.addEventListener('click',link,true);return()=>{window.removeEventListener('beforeunload',guard);document.removeEventListener('click',link,true);}},[dirty,busy]);
 const restoreHistory=(entry)=>{const p=history.personal.find(x=>x.operation_id===entry.operation_id),n=history.northgate.find(x=>x.operation_id===entry.operation_id);setRestore({data:mergeWorkspace({personal:{payload:p?p.before_data:state.current.personal.payload},northgate:{payload:n?n.before_data:state.current.northgate.payload}}),filename:'pre-change snapshot '+entry.recorded_at});setHistory(null);};
 const showHistory=async()=>{setError('');try{const [p,n]=await Promise.all(['personal','northgate'].map(p_scope=>rpc('list_daybook_history',{p_scope})));setHistory({personal:p,northgate:n});}catch(e){setError(e.message)}};
 return <section className="daybook-hq">
  <header className="daybook-heading">
   <div className="daybook-title"><h1>Daybook</h1>
    <details className="daybook-info"><summary aria-label="About Daybook staging" title="About Daybook staging">i</summary>
     <div className="daybook-popover"><strong>Staging pilot</strong><p>Personal records stay owner-private. Northgate schedules and worker records are company data. This pilot is developer-only. This does not update Google Calendar or payroll.</p><p>Your original standalone planner is untouched. Save changes to HQ before leaving.</p></div>
    </details>
   </div>
   <p className={dirty?'daybook-save-state is-dirty':'daybook-save-state'} role="status" title={status}>{busy?'Saving to HQ…':dirty?'Unsaved changes · save in Preferences':loaded?'Saved workspace loaded':'Loading workspace…'}</p>
   <details className="daybook-preferences"><summary>Preferences</summary>
    <div className="daybook-popover"><h2>Save & recovery</h2>
     <p>{status}</p>
     <div className="daybook-actions"><button disabled={!loaded||!dirty||busy} onClick={()=>save()}>{busy?'Saving…':'Save to HQ'}</button><button disabled={!loaded||busy} onClick={showHistory}>Recovery history</button></div>
     <p><small>Last JSON export: {lastExport}<br/>Loaded from: {loadedBackup}</small></p>
    </div>
   </details>
  </header>
  {error&&<p role="alert">{error}</p>}
  {restore&&<section role="dialog" aria-label="Restore Daybook backup" style={{border:'2px solid #b58a30',padding:20,margin:12}}>
   <h2>Restore {restore.filename}?</h2><p>This replaces your personal workspace and the shared Northgate pilot workspace. The server saves a separate pre-restore snapshot atomically before replacing anything. Your original standalone browser data is never touched.</p>
   {dirty&&<p>Save your current unsaved edits to HQ first so they are included in the pre-restore snapshot.</p>}
   <button disabled={busy||dirty} onClick={()=>save(restore.data,true,restore.filename)}>Save snapshot and restore</button>{' '}<button disabled={busy} onClick={()=>setRestore(null)}>Cancel</button>
  </section>}
  {history&&<section><h2>Recovery history</h2><p>Choose a prior state to review and restore. Restoration creates another pre-restore snapshot, so this operation can itself be reversed.</p><button onClick={()=>setHistory(null)}>Close history</button><ul>{[...new Map([...history.personal,...history.northgate].map(e=>[e.operation_id,e])).values()].sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)).map(entry=><li key={entry.id}>{entry.recorded_at} · {entry.snapshot_kind||entry.action} <button disabled={busy} onClick={()=>restoreHistory(entry)}>Review restoring prior state</button></li>)}</ul></section>}
  <div className="daybook-planner" inert={busy}><iframe ref={frame} title="Daybook planner" sandbox="allow-scripts allow-modals allow-downloads allow-forms" srcDoc={FRAME} style={{height:frameHeight}} /></div>
 </section>;
}

