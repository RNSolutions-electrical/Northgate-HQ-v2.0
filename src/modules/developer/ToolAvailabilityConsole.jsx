import {useAuth} from '@clerk/clerk-react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import {useToolAvailability} from '../../hooks/useToolAvailability.jsx';
import {StatePanel} from '../../components/ui/StatePanel.jsx';
import {ConfirmDialog} from '../../components/ui/ConfirmDialog.jsx';
import {MODULES,isModulePermitted} from '../registry.js';
import {ALWAYS_AVAILABLE} from '../toolAvailability.js';
export function ToolAvailabilityConsole({permissions}) {
 const {getToken}=useAuth();const service=useToolAvailability();
 const [pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 if(permissions.permissionSource!=='server'||permissions.canAccessDeveloper!==true)return null;
 async function save(){
  if(busy||!pending)return;setBusy(true);setError('');
  try{
   await withSupabaseTokenRetry(getToken,async client=>{const {error}=await client.rpc('set_tool_availability',{p_module_key:pending.module_key,p_enabled:!pending.is_enabled,p_expected_version:pending.version});if(error)throw error;});
   setMessage(pending.label+(!pending.is_enabled?' enabled.':' disabled for ordinary users.'));
   setPending(null);await service.reload();window.dispatchEvent(new Event('northgate:tools-updated'));
  }catch(e){setError(e.message);await service.reload();setPending(null);}finally{setBusy(false);}
 }
 return <section className="developer-console-page" aria-label="Tool availability">
 <h2>Tool availability</h2><p>Control entire workspaces in this environment only: <strong>{import.meta.env.VITE_APP_ENV||'production'}</strong>. Disabled tools leave standard navigation and are blocked for ordinary users. Code, records, and user permissions are preserved. Developer previews retain existing permissions.</p>
 <p>Disabling remains locked until server enforcement is verified. This is an environment-wide availability setting, not a replacement for user permissions.</p><p>Dashboard and Developer Tools always remain available so the system can be recovered. Disabling a workspace can also make its related data unavailable in other workspaces. Reports and other shared views may use data owned by an enabled workspace; this is not a data-classification control.</p>
 <button className="secondary-button" disabled={busy} onClick={()=>service.reload()}>Refresh status</button>
 {service.error&&<StatePanel tone="danger" title="Availability could not be loaded" description={service.error.message}/>}
 {error&&<StatePanel tone="danger" title="Could not confirm the update" description={error+" Check the refreshed status below before trying again; a lost response may follow a successful save."}/>}
 {message&&<p role="status">{message}</p>}
 <div className="table-wrap"><table className="data-table"><thead><tr><th>Tool</th><th>Availability</th><th>Actions</th></tr></thead><tbody>{MODULES.map(module=>{
 const row=service.rows.find(r=>r.module_key===module.key);const protectedTool=ALWAYS_AVAILABLE.has(module.key);
 return <tr key={module.key}><td data-label="Tool">{module.label}</td><td data-label="Availability">{protectedTool?'Always available':row?(row.is_enabled?'Enabled':'Disabled'):'Status unavailable'}</td><td data-label="Actions">{!protectedTool&&row&&<><button className="secondary-button" disabled={busy || (row.is_enabled && row.enforcement_ready !== true)} title={row.enforcement_ready !== true ? "Server enforcement must be verified before disabling tools" : undefined} onClick={()=>{setError('');setPending({...row,label:module.label});}}>{row.is_enabled?'Disable':'Enable'}</button>{!row.is_enabled&&isModulePermitted(module,permissions)&&<Link className="text-button" to={module.path} state={{developerToolPreview:module.key}}>Open developer preview</Link>}</>}</td></tr>;
 })}</tbody></table></div>
 <ConfirmDialog open={!!pending} isSubmitting={busy} title={pending?(pending.is_enabled?'Disable ':'Enable ')+pending.label+'?':''} description={pending?.is_enabled?'Ordinary users will lose access to this workspace, including direct links and its protected data endpoints. Saved records remain; users should save their work before a tool is disabled. Developers can open it deliberately from here.':'Restore normal navigation and access for users who already have permission.'} confirmLabel={pending?.is_enabled?'Disable tool':'Enable tool'} onCancel={()=>setPending(null)} onConfirm={save}/>
 </section>;
}
