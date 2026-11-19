import {bindTokenToActor} from '../dwelling-load/sessionSafety.js';
import {fetchDaybookHqJobs} from './daybookJobs.js';
import {useAuth} from '@clerk/clerk-react';
import {useEffect,useRef,useState} from 'react';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import './daybook.css';
import {daybookFrame} from './daybookFrame.js';
import {mergeWorkspace} from './daybookModel.js';
import {daybookAccess,plannerData,savePayload,historyScopes,stripWorkerPay,accessChanged,rebaseAccessDraft} from './daybookAccess.js';
import {SharedCrewSchedule} from './SharedCrewSchedule.jsx';

const DRAFTS=new Map();
export function DaybookWorkspace({permissions}) {return <DaybookSession key={permissions.userId||'signed-out'} permissions={permissions}/>;}
function DaybookSession({permissions}) {
 const [bridgeToken]=useState(()=>crypto.randomUUID()),[frameHTML]=useState(()=>daybookFrame(bridgeToken));
 const accessGeneration=useRef(0),accessDenied=useRef(false);
 const jobsGeneration=useRef(0),jobsAllowed=useRef(false);
 // Production retains existing Jobs authorization/RLS; the staging tool-toggle gateway is not installed.
 const liveJobsAllowed=Boolean(permissions.permissionSource==='server' && permissions.canAccessDeveloper);
 const {getToken,userId:clerkUserId}=useAuth(),actor=useRef(clerkUserId), frame=useRef(null), state=useRef(null), pending=useRef(null), saving=useRef(false), ready=useRef(false);
 const [frameHeight,setFrameHeight]=useState(720);
 const mounted=useRef(true),validation=useRef(new Map());
 actor.current=clerkUserId;
 const active=()=>mounted.current && actor.current===permissions.userId;
 const guardedToken=bindTokenToActor(getToken,permissions.userId,active);
 const [,setAccessRevision]=useState(0);
 const [accessBlocked,setAccessBlocked]=useState(false),[loaded,setLoaded]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('Loading HQ workspace…'),[lastExport,setLastExport]=useState('None this session'),[loadedBackup,setLoadedBackup]=useState('HQ cloud workspace'),[restore,setRestore]=useState(null),[history,setHistory]=useState(null);
 const rpc=async(name,args)=>{const r=await withSupabaseTokenRetry(guardedToken,c=>{if(!active())throw Error('Daybook account changed. No request sent.');return c.rpc(name,args);});if(!active())throw Error('Daybook account changed. Response discarded.');if(r.error)throw r.error;return r.data;};

 const send=(type,data)=>frame.current?.contentWindow?.postMessage({channel:'hq-daybook',token:bridgeToken,type,data},'*');
 useEffect(()=>{jobsGeneration.current++;jobsAllowed.current=liveJobsAllowed;if(!jobsAllowed.current)send('hq-jobs-invalidated',{});},[liveJobsAllowed]);
 const initialize=()=>{if(ready.current&&state.current)send('load',{workspace:plannerData(state.current,pending.current),access:daybookAccess(state.current)});};
 const refreshAccess=async()=>{
  const generation=++accessGeneration.current;
  try{
   const fresh=await rpc('get_daybook_workspace');
   if(!active()||generation!==accessGeneration.current)return null;
   const old=state.current,changed=old&&accessChanged(old,fresh);
   state.current=old?{...fresh,personal:old.personal,northgate:!changed&&fresh.can_manage_northgate?old.northgate:fresh.northgate}:fresh;
   if(changed){
    setHistory(null);setRestore(null);
    if(pending.current){pending.current=rebaseAccessDraft(fresh,pending.current);setStatus('Access changed. Unsaved personal edits were kept. Shared data was reloaded from HQ.');}
   }
   if(!fresh.can_view_pay){
    state.current.personal={...state.current.personal,payload:stripWorkerPay(state.current.personal.payload)};
    if(state.current.northgate)state.current.northgate={...state.current.northgate,payload:stripWorkerPay(state.current.northgate.payload)};
   }
   if(pending.current)DRAFTS.set(permissions.userId,{data:pending.current,workspace:state.current});
   else DRAFTS.delete(permissions.userId);
   const wasDenied=accessDenied.current;accessDenied.current=false;setAccessBlocked(false);setAccessRevision(n=>n+1);
   jobsGeneration.current++;jobsAllowed.current=Boolean(fresh.can_manage_northgate&&liveJobsAllowed);
   if(!jobsAllowed.current)send('hq-jobs-invalidated',{});
   if(changed||wasDenied)initialize();
   return state.current;
  }catch(e){
   if(!active()||generation!==accessGeneration.current)return null;
   accessDenied.current=true;setAccessBlocked(true);jobsAllowed.current=false;jobsGeneration.current++;
   send('hq-jobs-invalidated',{});send('access-blocked',{});setHistory(null);setRestore(null);
   setError('Daybook access could not be confirmed. No export or shared operation was performed. '+(e.message||String(e)));
   return null;
  }
 };

 const validate=data=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{validation.current.delete(id);reject(Error('Planner validation timed out'));},10000);validation.current.set(id,{resolve,reject,timer});frame.current?.contentWindow?.postMessage({channel:'hq-daybook',token:bridgeToken,type:'validate',data,id},'*');});
 const save=async(data,restoring=false,filename='')=>{
  if(saving.current||!state.current||accessDenied.current)return;
  const value=data||pending.current;if(!value)return;
  saving.current=true;setBusy(true);setError('');
  try {
   const checked=await validate(value);if(!mounted.current)return;const current=state.current,split=savePayload(current,checked);
   const next=await rpc('save_daybook_workspace',{p_personal:split.personal,p_northgate:split.northgate,p_personal_version:current.personal.version,p_northgate_version:current.northgate?.version||0,p_restore:restoring});
   if(!mounted.current)return;state.current=next;
   if(restoring){pending.current=null;send('load',{workspace:plannerData(next),access:daybookAccess(next)});setLoadedBackup(filename);setRestore(null);setDirty(false);}
   else if(pending.current===value){pending.current=null;setDirty(false);send('saved');}
   if(!pending.current)DRAFTS.delete(permissions.userId);
   setStatus('Last successful HQ save: '+new Date().toLocaleString());
  } catch(e){if(!mounted.current)return;setError((e.message||String(e))+' No replacement was applied. Keep this page open or export your edits.');}
  finally{saving.current=false;if(mounted.current)setBusy(false);}
 };
 useEffect(()=>{
  let alive=true;mounted.current=true;
  rpc('get_daybook_workspace').then(value=>{
   if(!alive)return;
   const draft=DRAFTS.get(permissions.userId),changed=draft&&accessChanged(draft.workspace,value);
   state.current=draft?{...value,personal:{...value.personal,version:draft.workspace.personal.version},northgate:value.northgate?{...value.northgate,version:!changed&&value.can_manage_northgate?draft.workspace.northgate?.version||0:value.northgate.version}:value.northgate}:value;
   pending.current=draft?(changed?rebaseAccessDraft(value,draft.data):plannerData(value,draft.data)):null;
   if(pending.current)DRAFTS.set(permissions.userId,{data:pending.current,workspace:state.current});
   setDirty(Boolean(draft));setLoaded(true);
   setStatus(changed?'Access changed. Unsaved personal edits were kept. Shared data was reloaded from HQ.':draft?'Unsaved draft recovered. Saving checks its original cloud versions.':'HQ workspace loaded. Original local planner untouched.');
   initialize();
  }).catch(e=>{if(alive)setError(e.message||String(e));});
  const message=e=>{
   if(!active()||e.source!==frame.current?.contentWindow||e.data?.channel!=='hq-daybook'||e.data?.token!==bridgeToken)return;
   const m=e.data;
   if(m.type==='validated'){const v=validation.current.get(m.id);if(v){clearTimeout(v.timer);validation.current.delete(m.id);m.error?v.reject(Error(m.error)):v.resolve(m.data);}return;}
   if(m.type==='print-request'){refreshAccess().then(current=>{if(current&&mounted.current)send('print-approved',{requestId:m.requestId});});return;}
   if(m.type==='export-request'){refreshAccess().then(current=>{if(current&&mounted.current)send('export-approved',{requestId:m.requestId,filename:String(m.filename||'Daybook.json'),data:plannerData(current,m.data)});});return;}
   if(m.type==='hq-jobs-request'){const generation=jobsGeneration.current,requestId=m.requestId;if(!state.current?.can_manage_northgate||!jobsAllowed.current){send('hq-jobs-result',{requestId,error:'HQ Jobs availability could not be confirmed.'});return;}withSupabaseTokenRetry(guardedToken,async client=>{if(!active()||accessBlocked)throw Error('Daybook access changed. No request sent.');return {data:await fetchDaybookHqJobs(client)};}).then(r=>{if(active()&&generation===jobsGeneration.current&&jobsAllowed.current)send('hq-jobs-result',r.error?{requestId,error:r.error.message}:{requestId,jobs:r.data});}).catch(e=>{if(active()&&generation===jobsGeneration.current)send('hq-jobs-result',{requestId,error:e.message||String(e)});});}
   if(m.type==='resize'&&Number.isFinite(m.height))setFrameHeight(Math.max(400,Math.min(40000,m.height)));
   if(m.type==='ready'){ready.current=true;initialize();}
   if(m.type==='changed'){if(saving.current||accessDenied.current||!state.current)return;pending.current=plannerData(state.current,m.data);DRAFTS.set(permissions.userId,{data:pending.current,workspace:state.current});setDirty(true);}
   if(m.type==='restore'&&!accessDenied.current)setRestore({data:m.data,filename:m.filename});
   if(m.type==='exported')setLastExport(m.filename+' · download requested '+new Date().toLocaleString());
   if(m.type==='error')setError(m.message);
  };
  window.addEventListener('message',message);const focus=()=>refreshAccess();window.addEventListener('focus',focus);
  return()=>{alive=false;mounted.current=false;for(const v of validation.current.values()){clearTimeout(v.timer);v.reject(Error('Planner closed'));}validation.current.clear();window.removeEventListener('message',message);window.removeEventListener('focus',focus);};
 },[permissions.userId]);
 useEffect(()=>{const guard=e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}};const link=e=>{if((dirty||busy)&&e.target.closest('a[href]')&&!window.confirm('Leave Daybook without saving your edits to HQ?')){e.preventDefault();e.stopPropagation();}};window.addEventListener('beforeunload',guard);document.addEventListener('click',link,true);return()=>{window.removeEventListener('beforeunload',guard);document.removeEventListener('click',link,true);}},[dirty,busy]);
 const restoreHistory=(entry)=>{const p=history.personal.find(x=>x.operation_id===entry.operation_id),n=(daybookAccess(state.current).canManageNorthgate?history.northgate||[]:[]).find(x=>x.operation_id===entry.operation_id);setRestore({data:mergeWorkspace({personal:{payload:p?p.before_data:state.current.personal.payload},northgate:{payload:n?n.before_data:state.current.northgate?.payload}}),filename:'pre-change snapshot '+entry.recorded_at});setHistory(null);};
 const showHistory=async()=>{setError('');try{const [p,n]=await Promise.all(historyScopes(state.current).map(p_scope=>rpc('list_daybook_history',{p_scope})));setHistory({personal:p||[],northgate:n||[]});}catch(e){setError(e.message)}};
 return <section className="daybook-hq">
  <header className="daybook-heading">
   <div className="daybook-title"><h1>Daybook</h1>
    <details className="daybook-info"><summary aria-label="About Daybook" title="About Daybook">i</summary>
     <div className="daybook-popover"><strong>Daybook access</strong><p>Personal records stay owner-private. Northgate schedules and worker records are company data. Access follows your explicit Daybook permissions. Shared scheduling is read-only unless you can manage Northgate. Pay requires a separate explicit permission. This does not update Google Calendar or payroll.</p><p>Your original standalone planner is untouched. Save changes to HQ before leaving.</p></div>
    </details>
   </div>
   <p className={dirty?'daybook-save-state is-dirty':'daybook-save-state'} role="status" title={status}>{busy?'Saving to HQ…':dirty?'Unsaved changes · save in Preferences':loaded?'Saved workspace loaded':'Loading workspace…'}</p>
   <details className="daybook-preferences"><summary>Preferences</summary>
    <div className="daybook-popover"><h2>Save & recovery</h2>
     <p>{status}</p>
     <div className="daybook-actions"><button disabled={!loaded||!dirty||busy||accessBlocked} onClick={()=>save()}>{busy?'Saving…':'Save to HQ'}</button><button disabled={!loaded||busy||accessBlocked} onClick={showHistory}>Recovery history</button></div>
     <p><small>Last JSON export: {lastExport}<br/>Loaded from: {loadedBackup}</small></p>
    </div>
   </details>
  </header>
  {error&&<p role="alert">{error}</p>}
  {restore&&<section role="dialog" aria-label="Restore Daybook backup" style={{border:'2px solid #b58a30',padding:20,margin:12}}>
   <h2>Restore {restore.filename}?</h2><p>{daybookAccess(state.current).canManageNorthgate?'This replaces your personal workspace and the shared Northgate workspace.':'This replaces only your personal workspace. Shared Northgate data in the backup is not imported.'} The server saves a separate pre-restore snapshot atomically before replacing anything. Your original standalone browser data is never touched.</p>
   {dirty&&<p>Save your current unsaved edits to HQ first so they are included in the pre-restore snapshot.</p>}
   <button disabled={busy||dirty} onClick={()=>save(restore.data,true,restore.filename)}>Save snapshot and restore</button>{' '}<button disabled={busy} onClick={()=>setRestore(null)}>Cancel</button>
  </section>}
  {history&&<section><h2>Recovery history</h2><p>Choose a prior state to review and restore. Restoration creates another pre-restore snapshot, so this operation can itself be reversed.</p><button onClick={()=>setHistory(null)}>Close history</button><ul>{[...new Map([...history.personal,...history.northgate].map(e=>[e.operation_id,e])).values()].sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)).map(entry=><li key={entry.id}>{entry.recorded_at} · {entry.snapshot_kind||entry.action} <button disabled={busy} onClick={()=>restoreHistory(entry)}>Review restoring prior state</button></li>)}</ul></section>}
  {loaded&&!accessBlocked&&!daybookAccess(state.current).canManageNorthgate&&<SharedCrewSchedule workspace={state.current}/> }
  <div className="daybook-planner" hidden={accessBlocked} inert={busy||accessBlocked}><iframe ref={frame} title="Daybook planner" sandbox="allow-scripts allow-modals allow-downloads allow-forms" srcDoc={frameHTML} style={{height:frameHeight}} /></div>
 </section>;
}
