import {useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {canManageInventoryDepartment} from './inventoryAccess.js';
import './storageLocationSetup.css';

export function StorageLocationLifecycle({location,permissions,onSaved}) {
 const {getToken}=useAuth(),lock=useRef(false);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState(false),[code,setCode]=useState(location.code||''),[label,setLabel]=useState(location.label||''),[position,setPosition]=useState(String(location.position||0));
 const canEdit=canManageInventoryDepartment(permissions,location.division)&&!location.archived_at;
 const allowed=permissions.canArchiveRecords===true&&canManageInventoryDepartment(permissions,location.division);
 async function save(e){
  e.preventDefault();if(lock.current||!allowed||!reason.trim())return;
  if(!window.confirm(`${location.archived_at?'Restore':'Archive'} ${location.path}? History will be preserved.`))return;
  lock.current=true;setBusy(true);setError('');
  try{
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {error:rpcError}=await db.rpc('set_inventory_location_archived',{p_kind:location.type,p_id:location.id,p_archived:!location.archived_at,p_reason:reason.trim()});
   if(rpcError)throw rpcError;setReason('');onSaved();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 async function edit(e){
  e.preventDefault();if(lock.current||!canEdit||!reason.trim())return;
  lock.current=true;setBusy(true);setError('');
  try{
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {error:rpcError}=await db.rpc('edit_inventory_location',{p_kind:location.type,p_id:location.id,p_code:code.trim(),p_label:label.trim(),p_position:Number(position),p_expected_revision:location.revision,p_reason:reason.trim()});
   if(rpcError)throw rpcError;setEditing(false);onSaved();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <section className="inventory-location-lifecycle" data-ng-ui-type="FUNCTION" data-ng-ui-name="Archive Storage Location">
  <h3>{location.archived_at?'Archived location':'Location administration'}</h3>
  <p>{location.archived_at?`Archived: ${new Date(location.archived_at).toLocaleString()}. ${location.archive_reason||''}`:'Archiving preserves history. Resolve active child locations and material links first; stock is never cleared automatically.'}</p>
  {error&&<p role="alert" className="inventory-setup-error">{error}</p>}
  {canEdit&&!editing&&<button className="secondary-button" disabled={busy} onClick={()=>{setEditing(true);setReason('');setError('');}}>Edit location</button>}
  {editing&&<form onSubmit={edit} data-ng-ui-type="FUNCTION" data-ng-ui-name="Edit Storage Location"><fieldset disabled={busy} className="inventory-setup-grid">
   <label>Location code<input required maxLength={60} value={code} onChange={e=>setCode(e.target.value)}/></label>
   <label>Location name<input required maxLength={160} value={label} onChange={e=>setLabel(e.target.value)}/></label>
   {location.type!=='unit'&&<label>Sort position<input required type="number" min="0" max="2147483647" step="1" value={position} onChange={e=>setPosition(e.target.value)}/></label>}
   <label>Reason for editing location<input required value={reason} onChange={e=>setReason(e.target.value)}/></label>
  </fieldset><p>Identity, QR links, department, parent location, and stock history stay unchanged.</p><div className="inventory-setup-actions"><button className="primary-button" disabled={busy||!reason.trim()}>Save location changes</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setEditing(false);setReason('');}}>Cancel edit</button></div></form>}
  {allowed&&!editing&&<form onSubmit={save} className="inventory-setup-grid"><label>Reason for {location.archived_at?'restoring':'archiving'} location<input required value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
   <div className="inventory-setup-actions"><button className={location.archived_at?'secondary-button':'secondary-button secondary-button--danger'} disabled={busy||!reason.trim()}>{busy?'Saving…':location.archived_at?'Restore location':'Archive location'}</button></div>
  </form>}
 </section>;
}
