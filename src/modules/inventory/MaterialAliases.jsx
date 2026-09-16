import {useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {WorkspaceHeader} from '../../components/ui/WorkspaceHeader.jsx';
import {canEditMaterialAliases} from '../../lib/materialResolver.js';
import './storageLocationSetup.css';

export function MaterialAliases({item,permissions,onClose,onSaved}) {
 const {getToken}=useAuth(),lock=useRef(false);
 const [aliases,setAliases]=useState(item.item_aliases||[]),[alias,setAlias]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const canEdit=canEditMaterialAliases(permissions,item.division);
 async function save(value,archived=false){
  if(lock.current||!canEdit)return;
  if(!value.trim()){setError('Enter an alias.');return;}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {data,error:rpcError}=await db.rpc('save_material_alias',{p_item_id:item.id,p_alias:value.trim(),p_archived:archived,p_reason:null});
   if(rpcError)throw rpcError;if(!data?.id)throw new Error('No saved alias was returned. Refresh before retrying.');
   setAliases(rows=>[...rows.filter(row=>row.id!==data.id),data]);setAlias('');setMessage(archived?'Alias archived.':'Alias saved.');onSaved();
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <><WorkspaceHeader eyebrow="Material Inventory" title="Material aliases" description={`${item.material_code||''} — ${item.name}`} actions={<button className="secondary-button" disabled={busy} onClick={onClose}>Back to Inventory</button>}/>
 <section className="card workspace-card inventory-location-setup" data-ng-ui-type="MODULE" data-ng-ui-name="Material Aliases">
  <h2>{item.name}</h2><p>Aliases are alternate names for this same catalogue item, not new materials. Shared names can match several items; users always choose the intended material.</p>
  {error&&<p role="alert" className="inventory-setup-error">{error}</p>}{message&&<p role="status">{message}</p>}
  {canEdit&&<form onSubmit={e=>{e.preventDefault();save(alias);}}><fieldset disabled={busy} className="inventory-setup-grid">
   <label>New alias<input value={alias} maxLength={160} onChange={e=>setAlias(e.target.value)} placeholder="For example: Greenfield"/></label>
  </fieldset><button className="primary-button" disabled={busy||!alias.trim()}>Add alias</button></form>}
  <ul className="inventory-alias-list">{aliases.map(row=><li key={row.id}><span>{row.alias}{row.archived_at?' (archived)':''}</span>{canEdit&&<button className={row.archived_at?'secondary-button':'secondary-button secondary-button--danger'} disabled={busy} onClick={()=>save(row.alias,!row.archived_at)}>{row.archived_at?'Restore':'Archive'} alias</button>}</li>)}</ul>
  {!aliases.length&&<p>No aliases yet. The canonical name and material code remain searchable.</p>}
 </section></>;
}
