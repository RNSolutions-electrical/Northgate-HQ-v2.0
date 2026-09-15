import {useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {canManageInventoryDepartment} from './inventoryAccess.js';
import {StorageLocationDelete} from './StorageLocationDelete.jsx';
import './storageLocationSetup.css';

export function StorageLocationLifecycle({location,locations=[],permissions,onSaved,onDeleted}) {
 const {getToken}=useAuth(),lock=useRef(false);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState(false),[code,setCode]=useState(location.code||''),[label,setLabel]=useState(location.label||''),[position,setPosition]=useState(String(location.position||0));
 const [physical,setPhysical]=useState(location.physical_location||''),[summary,setSummary]=useState(location.materials_summary||''),[parent,setParent]=useState(location.parentId||'');
 const parentType={shelf:'unit',bay:'shelf',bin:'bay'}[location.type];
 const parentOptions=locations.filter(row=>row.type===parentType&&!row.archived_at&&canManageInventoryDepartment(permissions,row.division));
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
  if(parent!==location.parentId&&location.type!=='unit'&&!window.confirm('Move this location and everything beneath it? IDs, QR links and quantities stay unchanged. The location path and inherited department may change.'))return;
  lock.current=true;setBusy(true);setError('');
  try{
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {error:rpcError}=await db.rpc('edit_inventory_location',{p_kind:location.type,p_id:location.id,p_code:code.trim(),p_label:label.trim(),p_position:Number(position),p_expected_revision:location.revision,p_reason:reason.trim(),p_details:{physical_location:physical,materials_summary:summary},p_parent_id:location.type==='unit'?null:parent});
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
   <label>Physical location<input maxLength={500} value={physical} onChange={e=>setPhysical(e.target.value)} placeholder="Shop north wall, aisle 2"/></label>
   <label>Materials stored / purpose<input maxLength={500} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Conduit fittings and connectors"/></label>
   {parentType&&<label>Parent location<select aria-label="Parent location" required value={parent} onChange={e=>setParent(e.target.value)}>{parentOptions.map(row=><option key={row.id} value={row.id}>{row.path} — {row.label} ({row.division})</option>)}</select></label>}
   <label>Reason for editing location<input required value={reason} onChange={e=>setReason(e.target.value)}/></label>
  </fieldset><p>Identity, QR links and quantities stay unchanged. Changing the parent moves the entire branch; access to both departments is required.</p><div className="inventory-setup-actions"><button className="primary-button" disabled={busy||!reason.trim()}>Save location changes</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setEditing(false);setReason('');}}>Cancel edit</button></div></form>}
  {allowed&&!editing&&<form onSubmit={save} className="inventory-setup-grid"><label>Reason for {location.archived_at?'restoring':'archiving'} location<input required value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
   <div className="inventory-setup-actions"><button className={location.archived_at?'secondary-button':'secondary-button secondary-button--danger'} disabled={busy||!reason.trim()}>{busy?'Saving…':location.archived_at?'Restore location':'Archive location'}</button></div>
  </form>}
  <StorageLocationDelete location={location} permissions={permissions} onDeleted={onDeleted||onSaved}/>
 </section>;
}
