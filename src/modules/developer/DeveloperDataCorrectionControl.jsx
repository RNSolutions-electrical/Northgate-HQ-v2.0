import {useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {correctionOverrideEnabled} from '../inventory/dataCorrectionAccess.js';

export function DeveloperDataCorrectionControl({user,permissions,onSaved}) {
  const {getToken}=useAuth(), lock=useRef(false);
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const enabled=correctionOverrideEnabled(user.active_overrides);
  if(permissions.permissionSource!=='server'||permissions.role!=='Developer'||permissions.canAccessDeveloper!==true||(user.role!=='Developer'&&!enabled))return null;
  async function save(e) {
    e.preventDefault();if(lock.current||!reason.trim())return;
    if(!window.confirm(`${enabled?'Revoke':'Grant'} Developer Data Correction for ${user.email||user.display_name}? This is scoped inventory correction, not a permission bypass.`))return;
    lock.current=true;setBusy(true);setError('');setSuccess('');
    try {
      const db=createSupabaseClient(await getToken({template:'supabase'}));
      const {data,error}=await db.rpc('set_developer_data_correction',{p_user_id:user.user_id,p_enabled:!enabled,p_expected_enabled:enabled,p_reason:reason.trim()});
      if(error)throw error;
      if(data?.enabled!==!enabled)throw new Error('Permission change was not confirmed. Refresh permissions.');
      setReason('');setSuccess(enabled?'Correction access revoked.':'Correction access granted. Revoke it before official rollout.');
      onSaved();window.dispatchEvent(new Event('northgate:permissions-updated'));
    } catch(e) {setError(e.message);} finally {lock.current=false;setBusy(false);}
  }
  return <section className="permission-template-editor" data-ng-ui-type="FUNCTION" data-ng-ui-name="Manage Developer Data Correction">
    <h3>Developer Data Correction — {enabled?'Enabled':'Disabled'}</h3>
    <p>Temporary per-user access to restore retired inventory assignments. Existing location editing and guarded deletion remain unchanged. No RLS bypass, stock reset, or history deletion. Revoke before rollout.</p>
    <form className="developer-permission-profile" onSubmit={save}><label className="developer-permission-profile__reason"><span>Correction access reason</span><input type="text" required maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button className={enabled?'secondary-button secondary-button--danger':'primary-button'} disabled={busy||!reason.trim()}>{enabled?'Revoke correction access':'Grant correction access'}</button></form>
    {error&&<p role="alert">{error}</p>}{success&&<p role="status">{success}</p>}
  </section>;
}
