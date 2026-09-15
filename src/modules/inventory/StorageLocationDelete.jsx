import {useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';

export function StorageLocationDelete({location,permissions,onDeleted}){
 const {getToken}=useAuth(),lock=useRef(false);
 const [reason,setReason]=useState(''),[initials,setInitials]=useState(''),[code,setCode]=useState('');
 const [backup,setBackup]=useState(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const validInitials=/^[A-Za-z][A-Za-z .'-]{0,19}$/.test(initials.trim());
 if(permissions.permissionSource!=='server'||permissions.role!=='Developer'||permissions.canAccessDeveloper!==true||!location.archived_at)return null;
 const invalidate=()=>{setBackup(null);setConfirmed(false);setError('');};
 async function download(){
  if(lock.current||!reason.trim()||!validInitials)return;
  lock.current=true;setBusy(true);setError('');setBackup(null);setConfirmed(false);
  try{
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {data,error:rpcError}=await db.rpc('prepare_storage_location_deletion',{p_kind:location.type,p_id:location.id,p_reason:reason.trim(),p_initials:initials.trim()});
   if(rpcError)throw rpcError;
   if(!data?.backup_id||data.record?.id!==location.id)throw new Error('The server did not confirm this location backup. Retry before deleting.');
   const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`northgate-location-${location.code.replace(/[^a-z0-9_-]/gi,'-')}-${data.backup_id}.json`;
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setBackup(data);
  }catch(e){setError(e.message||'Backup could not be prepared. Nothing was deleted.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function remove(e){
  e.preventDefault();if(lock.current||!backup||!confirmed||code.trim()!==backup.code)return;
  if(!window.confirm(`Permanently delete ${location.path}? This removes the location and its QR destination. The backup and audit history remain; recovery requires controlled Developer assistance.`))return;
  lock.current=true;setBusy(true);setError('');
  try{
   const db=createSupabaseClient(await getToken({template:'supabase'}));
   const {data,error:rpcError}=await db.rpc('permanently_delete_storage_location',{p_backup_id:backup.backup_id,p_confirmation_code:code.trim(),p_download_confirmed:confirmed});
   if(rpcError)throw rpcError;
   if(data?.deleted!==true||data.id!==location.id)throw new Error('Deletion was not confirmed. Retry to verify the result.');
   onDeleted(location);
  }catch(e){setError(e.message||'Deletion was not confirmed. Your backup is retained.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <details className="inventory-delete-location" data-ng-ui-type="FUNCTION" data-ng-ui-name="Permanently Delete Storage Location"><summary>Developer only · Permanent deletion</summary>
  <p>Only archived, unreferenced locations can be deleted. Children (including archived), material links, stock and inventory history block deletion. Nothing beneath this location will be deleted automatically.</p>
  <form onSubmit={remove}><fieldset disabled={busy} className="inventory-setup-grid">
   <label>Reason for permanent deletion<input required maxLength={2000} value={reason} onChange={e=>{setReason(e.target.value);invalidate();}}/></label>
   <label>Developer initials<input required maxLength={20} value={initials} onChange={e=>{setInitials(e.target.value);invalidate();}}/></label>
  </fieldset>
  <button type="button" className="secondary-button" disabled={busy||!reason.trim()||!validInitials} onClick={download}>{busy?'Working…':'Download backup JSON'}</button>
  {backup&&<><p>Backup prepared. Save the downloaded file before continuing. A copy is also retained in the audit log. Recovery is a controlled Developer task, not an automatic import.</p><label className="inventory-delete-certification"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm I saved the backup JSON.</label><div className="inventory-setup-grid"><label>Type location code {backup.code} to confirm<input disabled={busy} required value={code} onChange={e=>setCode(e.target.value)} autoComplete="off"/></label></div></>}
  {error&&<p role="alert" className="inventory-setup-error">{error}</p>}
  <div className="inventory-setup-actions"><button type="submit" className="secondary-button secondary-button--danger" disabled={busy||!backup||!confirmed||code.trim()!==backup.code}>Permanently Delete</button></div>
  </form>
 </details>;
}
