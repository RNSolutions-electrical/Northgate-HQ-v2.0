import {useRef, useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {canCorrectInventoryData} from './dataCorrectionAccess.js';
import './storageLocationSetup.css';

export function RetiredBinAssignments({location, permissions, onRestored}) {
  const {getToken} = useAuth(), lock = useRef(false);
  const [open,setOpen] = useState(false), [rows,setRows] = useState([]), [loaded,setLoaded] = useState(false);
  const [selected,setSelected] = useState(null), [reason,setReason] = useState('');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [success,setSuccess] = useState('');
  if (!canCorrectInventoryData(permissions)) return null;
  async function rpc(name, args) {
    const db = createSupabaseClient(await getToken({template:'supabase'}));
    const {data,error} = await db.rpc(name,args);
    if (error) throw error;
    return data;
  }
  async function load() {
    if (lock.current) return;
    lock.current=true; setBusy(true); setError(''); setOpen(true); setSelected(null); setReason('');
    try {setRows(await rpc('read_retired_bin_assignments',{p_bin_id:location.id}));setLoaded(true);}
    catch(e) {setError(e.message);}
    finally {lock.current=false;setBusy(false);}
  }
  async function restore(e) {
    e.preventDefault(); if(lock.current || !selected || !reason.trim()) return;
    if(!window.confirm(`Restore ${selected.item_name} in ${location.code}? Existing history is preserved. Stock stays at zero; record a physical count afterward.`)) return;
    lock.current=true;setBusy(true);setError('');setSuccess('');
    try {
      const data=await rpc('restore_retired_bin_assignment',{p_bin_item_id:selected.id,p_expected_archived_at:selected.archived_at,p_reason:reason.trim()});
      if(data?.restored!==true || data.id!==selected.id) throw new Error('Restoration was not confirmed. Refresh retired assignments to check the result.');
      setRows(old=>old.filter(row=>row.id!==selected.id));setSelected(null);setReason('');
      setSuccess('Assignment restored. Stock was not changed. Use Add materials / Count to record the physical quantity.');onRestored();
    } catch(e) {setError(e.message);}
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="inventory-location-lifecycle" data-ng-ui-type="FUNCTION" data-ng-ui-name="Restore Retired Material Assignment">
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>open?setOpen(false):load()}>{open?'Hide retired assignments':'View retired assignments'}</button>
    {open&&<><h3>Retired material assignments · {location.code}</h3>
      <p>Restore only the material that belongs in this bin. History stays intact and no previous quantities are reinstated.</p>
      <button type="button" className="secondary-button" disabled={busy} onClick={load}>Refresh retired assignments</button>
      {busy&&<p role="status">Working…</p>}{error&&<p role="alert" className="inventory-setup-error">{error}</p>}{success&&<p role="status">{success}</p>}
      {loaded&&!busy&&!rows.length&&<p>No retired material assignments in this bin.</p>}
      {rows.map(row=><div className="inventory-retired-assignment" key={row.id}>
        <div><strong>{row.material_code} — {row.item_name}</strong><p>Retired {new Date(row.archived_at).toLocaleString()} · {row.archive_reason}</p><p>Recorded quantity: {row.quantity ?? 'Not recorded'}</p></div>
        <button type="button" className="secondary-button" disabled={busy||!!location.archived_at||row.quantity==null||Number(row.quantity)!==0} onClick={()=>{setSelected(row);setReason('');setError('');setSuccess('');}}>Restore assignment</button>
      </div>)}
      {location.archived_at&&<p>Restore this bin and any archived parents before restoring material assignments.</p>}
      {selected&&<form onSubmit={restore}><label className="inventory-correction-reason">Reason for restoring assignment<input type="text" required maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="inventory-setup-actions"><button className="primary-button" disabled={busy||!reason.trim()}>Confirm restoration</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setSelected(null)}>Cancel</button></div></form>}
    </>}
  </section>;
}
