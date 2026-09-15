import {useRef, useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {ArrowLeft, Plus, Save} from 'lucide-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {WorkspaceHeader} from '../../components/ui/WorkspaceHeader.jsx';
import {canManageInventoryDepartment} from './inventoryAccess.js';
import './storageLocationSetup.css';

const levels = ['unit','shelf','bay','bin'];
const names = {unit:'Storage unit',shelf:'Shelf',bay:'Bay',bin:'Bin'};
const blank = (kind='unit',parent='',department='') => ({kind,parent,department,code:'',label:'',position:'0',reason:'Initial storage setup'});
export function StorageLocationSetup({initialParent,permissions,locations,isLoading,error:onLoadError,onReload,onClose,onCreated,onStock}) {
 const {getToken}=useAuth();
 const [draft,setDraft]=useState(()=>blank(initialParent?levels[levels.indexOf(initialParent.type)+1]:'unit',initialParent?.id||'',initialParent?.division||permissions.department||permissions.division||''));
 const [saved,setSaved]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),request=useRef(null);
 const all=locations;
 const parents=all.filter(row=>row.type===levels[levels.indexOf(draft.kind)-1] && canManageInventoryDepartment(permissions,row.division));
 const parent=parents.find(row=>row.id===draft.parent);
 const department=draft.kind==='unit'?draft.department:parent?.division;
 const departments=[...new Set(['Electrical','Construction','Admin',...all.map(row=>row.division),permissions.department||permissions.division].filter(Boolean))]
  .filter(dept=>canManageInventoryDepartment(permissions,dept));
 const change=updates=>{setDraft(current=>({...current,...updates}));setError('');};
 const close=()=>{if(busy)return;if(!saved&&(draft.code||draft.label)&&!window.confirm('Discard this unsaved storage location?'))return;onClose();};
 async function save(event) {
  event.preventDefault();if(lock.current)return;
  const payload={p_kind:draft.kind,p_parent_id:draft.kind==='unit'?null:draft.parent,p_code:draft.code.trim().toUpperCase(),p_label:draft.label.trim(),p_division:department,p_position:Number(draft.position),p_reason:draft.reason.trim()};
  if(!new RegExp('^[A-Z0-9][A-Z0-9._/-]{0,59}$').test(payload.p_code)){setError('Enter a code starting with a letter or number. Use only letters, numbers, dots, dashes, underscores or slashes.');return;}
  if(!canManageInventoryDepartment(permissions,department)||!payload.p_label||!payload.p_reason||!Number.isInteger(payload.p_position)||payload.p_position<0){setError('Choose an authorized department/parent and enter a name, position and reason.');return;}
  const fingerprint=JSON.stringify(payload);
  if(request.current?.fingerprint!==fingerprint)request.current={id:crypto.randomUUID(),fingerprint};
  lock.current=true;setBusy(true);setError('');
  try {
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {data,error:rpcError}=await db.rpc('create_inventory_location',{p_request_id:request.current.id,...payload});
   if(rpcError)throw rpcError;
   if(!data?.id)throw new Error('The server did not confirm the saved location. Retry to verify it.');
   setSaved(data);onCreated(data);
  }catch(e){setError(e.message||'Location was not saved. Your input is retained.');}
  finally{lock.current=false;setBusy(false);}
 }
 const nextKind=saved?levels[levels.indexOf(saved.kind)+1]:null;
 return <>
  <WorkspaceHeader eyebrow="Material Inventory" title="Add Storage Location" description="Storage unit → Shelf → Bay → Bin. Materials and quantities are recorded in bins." actions={<button className="secondary-button" disabled={busy} onClick={close}><ArrowLeft size={16}/> Back to Inventory</button>}/>
  <section className="card workspace-card inventory-location-setup" data-ng-ui-type="FUNCTION" data-ng-ui-name="Add Storage Location">
   {saved?<div role="status"><h2>{names[saved.kind]} saved</h2><p>{saved.code} — {saved.label}</p><p>{saved.kind==='bin'?'This bin is ready for materials and an initial physical count.':'Continue to the next level, or return to your location list.'}</p><div className="inventory-setup-actions">
    {nextKind?<button className="primary-button" disabled={isLoading||!all.some(row=>row.id===saved.id)} onClick={()=>{setDraft(blank(nextKind,saved.id,saved.division));setSaved(null);request.current=null;}}><Plus size={16}/> Add {names[nextKind].toLowerCase()} here</button>:<button className="primary-button" onClick={()=>onStock(saved)}>Add materials and quantities</button>}
    <button className="secondary-button" onClick={()=>{setDraft(blank(saved.kind,'',saved.division));setSaved(null);request.current=null;}}>Add another location</button>
    <button className="secondary-button" onClick={()=>onClose(saved)}>Done</button>
   </div>{onLoadError&&<p role="alert">Location saved, but the refreshed list failed to load. <button className="secondary-button" onClick={onReload}>Retry refresh</button></p>}</div>:<form onSubmit={save}>
    <h2>Location details</h2><p>Use a short code for labels and QR scanning, plus a descriptive name.</p>
    {error&&<p role="alert" className="inventory-setup-error">{error}</p>}
    {onLoadError&&<p role="alert">Locations could not be loaded. <button type="button" className="secondary-button" onClick={onReload}>Retry</button></p>}
    <fieldset disabled={busy} className="inventory-setup-grid">
     <label>Location type<select value={draft.kind} onChange={e=>change({kind:e.target.value,parent:''})}>{levels.map(kind=><option key={kind} value={kind}>{names[kind]}</option>)}</select></label>
     {draft.kind==='unit'?<label>Department<select required value={draft.department} onChange={e=>change({department:e.target.value})}><option value="">Select department</option>{departments.map(dept=><option key={dept}>{dept}</option>)}</select></label>:<label>Parent {names[levels[levels.indexOf(draft.kind)-1]].toLowerCase()}<select required value={draft.parent} onChange={e=>change({parent:e.target.value})}><option value="">Select parent location</option>{parents.map(row=><option key={row.id} value={row.id}>{row.path} — {row.label} ({row.division})</option>)}</select></label>}
     {draft.kind!=='unit'&&<p className="inventory-setup-wide">{isLoading?'Loading locations…':parents.length?`Department: ${department||'Select a parent location'}`:`Create a ${names[levels[levels.indexOf(draft.kind)-1]].toLowerCase()} first using Location type above.`}</p>}
     <label>Location code<input required maxLength={60} title="Letters, numbers, dots, underscores, slashes and dashes; no spaces" value={draft.code} onChange={e=>change({code:e.target.value})} placeholder={draft.kind==='unit'?'SHOP-01':'01'}/></label>
     <label>Location name<input required maxLength={160} value={draft.label} onChange={e=>change({label:e.target.value})} placeholder={draft.kind==='unit'?'Main electrical shop':'Connectors and fittings'}/></label>
     {draft.kind!=='unit'&&<label>Sort position<input type="number" required min="0" max="2147483647" step="1" value={draft.position} onChange={e=>change({position:e.target.value})}/></label>}
     <label className="inventory-setup-wide">Setup reason<input required value={draft.reason} onChange={e=>change({reason:e.target.value})}/></label>
    </fieldset><div className="inventory-setup-actions"><button type="submit" className="primary-button" disabled={busy||isLoading||Boolean(onLoadError)}><Save size={16}/>{busy?'Saving…':'Save location'}</button><button type="button" className="secondary-button" disabled={busy} onClick={close}>Cancel</button></div>
   </form>}
  </section>
 </>;
}
