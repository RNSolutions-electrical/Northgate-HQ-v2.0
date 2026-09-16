import {useAuth} from '@clerk/clerk-react';
import {useCallback,useEffect,useState} from 'react';
import {withSupabaseTokenRetry} from '../../services/supabaseClient.js';
import {Toolbar} from '../../components/ui/Toolbar.jsx';
import {StatePanel} from '../../components/ui/StatePanel.jsx';
import {stageTextColor} from '../service-calls/serviceStages.js';
import {uiElementAttributes} from '../../config/uiTerminology.js';
import '../service-calls/serviceCalls.css';

export function ServiceStageConsole() {
 const {getToken}=useAuth();
 const [stages,setStages]=useState([]),[selected,setSelected]=useState(''),[label,setLabel]=useState(''),[color,setColor]=useState('#FFF9C4');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const rpc=useCallback((name,args)=>withSupabaseTokenRetry(getToken,async client=>{
  const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data;
 }),[getToken]);
 const reload=useCallback(async()=>{const data=await rpc('svc_read_stages',{});if(!Array.isArray(data))throw Error('Stages could not be loaded');setStages(data);},[rpc]);
 useEffect(()=>{reload().catch(e=>setError(e.message));},[reload]);
 function choose(key){setSelected(key);const s=stages.find(s=>s.key===key);setLabel(s?.label || '');setColor(s?.background_color || '#FFF9C4');setError('');setMessage('');}
 async function save(event) {
  event.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
  try {
   const savedKey=await rpc('svc_save_stage',{p_key:selected || null,p_label:label,p_color:color,p_reason:null,p_expected_updated_at:stages.find(s=>s.key===selected)?.updated_at || null});
   await reload();setSelected(savedKey);setMessage('Stage saved. Refresh Service Calls to use the updated list and colors.');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="developer-console-page svc-workspace" aria-label="Service call stages" {...uiElementAttributes('MODULE','Service Call Stages')}>
  <Toolbar eyebrow="Developer" title="Service Call Stages" description="Manage stage names and row colors for Operations and the Financial Scorecard. Text contrast is selected automatically." actions={<button className="secondary-button" disabled={busy} onClick={()=>reload().catch(e=>setError(e.message))}>Refresh stages</button>}/>
  <form onSubmit={save}><fieldset disabled={busy} className="svc-fieldset">
   <div className="svc-grid">
    <label><span>Stage to edit</span><select aria-label="Stage to edit" value={selected} onChange={e=>choose(e.target.value)}><option value="">New stage</option>{stages.map(s=><option key={s.key} value={s.key}>{s.label}{s.kind==='derived'?' (automatic)':''}</option>)}</select></label>
    <label><span>Stage name</span><input type="text" required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)}/></label>
    <label><span>Highlight color</span><input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
    <div className="svc-stage-preview" aria-label="Stage color preview" style={{backgroundColor:color,color:stageTextColor(color),textDecoration:stages.find(s=>s.key===selected)?.strikethrough?'line-through':'none'}}>{label || 'Stage preview'}</div>
   </div>
   <p>New stages track active work. Use Complete / ready to invoice when billable work is finished. Invoice Sent, Payment Received and Archived remain automatic; changing a label or color does not change their behavior.</p>
   <button type="submit" className="primary-button" disabled={busy || !label.trim()}>{busy?'Saving…':selected?'Save stage':'Add stage'}</button>
  </fieldset></form>
  {error && <StatePanel tone="danger" title="Stage was not saved" description={error} compact/>}
  {message && <StatePanel tone="success" title="Service stages updated" description={message} compact/>}
 </section>;
}
