import { useAuth } from '@clerk/clerk-react';
import { FilePlus2, RefreshCw, Save, Shapes } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';

export function SovBuilder({ jobId, department, feePresentationMode = 'distributed', canManage, activeLines, defaultContractAmount, onAddLine, onComplete }) {
 const { getToken } = useAuth();
 const [templates,setTemplates]=useState([]);
 const [selectedId,setSelectedId]=useState('');
 const [contractAmount,setContractAmount]=useState(String(Math.max(0,Number(defaultContractAmount)||0)));
 const [templateName,setTemplateName]=useState('');
 const [open,setOpen]=useState(false);
 const [working,setWorking]=useState('');
 const [message,setMessage]=useState({tone:'',text:''});
 const [feeMode,setFeeMode]=useState(feePresentationMode);
 const [savedFeeMode,setSavedFeeMode]=useState(feePresentationMode);
 const load=useCallback(async()=>{
  if(!canManage)return;
  try{
   const rows=await withSupabaseTokenRetry(getToken,async client=>{
    const {data,error}=await client.from('job_sov_templates').select('id,name,department,created_at,job_sov_template_lines(id,line_code,description,allocation_percent,sort_order)').eq('department',department).eq('is_active',true).order('name');
    if(error)throw error;return data||[];
   });
   setTemplates(rows);setSelectedId(current=>rows.some(row=>row.id===current)?current:rows[0]?.id||'');
  }catch(error){setMessage({tone:'danger',text:error.message||'SOV templates could not be loaded.'});}
 },[canManage,department,getToken]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>{setFeeMode(feePresentationMode);setSavedFeeMode(feePresentationMode);},[feePresentationMode,jobId]);
 useEffect(()=>{if(!open)setContractAmount(String(Math.max(0,Number(defaultContractAmount)||0)));},[defaultContractAmount,open]);
 if(!canManage)return null;
 async function call(name,args,success){
  setWorking(name);setMessage({tone:'',text:''});
  try{
   await withSupabaseTokenRetry(getToken,async client=>{const {error}=await client.rpc(name,args);if(error)throw error;});
   setMessage({tone:'success',text:success});await load();await onComplete?.();return true;
  }catch(error){setMessage({tone:'danger',text:error.message||'The SOV action could not be completed.'});return false;
  }finally{setWorking('');}
 }
 async function saveTemplate(){if(await call('save_job_sov_template',{p_job_id:jobId,p_name:templateName.trim()},'SOV template saved.'))setTemplateName('');}
 async function saveFeeMode(){if(await call('set_job_billing_fee_presentation',{p_job_id:jobId,p_mode:feeMode},feeMode==='separate'?'Fee will appear as separate customer-facing SOV lines after initialization.':'Fee will be retained internally and distributed across customer-facing work lines after initialization.'))setSavedFeeMode(feeMode);}
 return <section className="sov-builder" aria-label="Schedule of Values builder">
  <div className="sov-builder__bar"><div><span className="eyebrow">SOV Setup</span><strong>Build from scratch or use a reusable template</strong></div><div className="sov-builder__actions"><button type="button" className="secondary-button" onClick={onAddLine} disabled={!!working}><FilePlus2/> Add SOV Line</button><button type="button" className="secondary-button" onClick={()=>setOpen(value=>!value)}><Shapes/> {open?'Close Templates':'Templates'}</button></div></div>
  <div className="sov-fee-presentation"><div><span className="eyebrow">Customer presentation</span><strong>OH&amp;P / Fee lines</strong><small>Fee sources always remain visible internally. Choose whether customer-facing SOV values show fee separately or distribute it across the work.</small></div><label><span>Fee presentation</span><select value={feeMode} onChange={event=>setFeeMode(event.target.value)} disabled={!!working}><option value="distributed">Distribute across work lines</option><option value="separate">Show as separate lines</option></select></label><button type="button" className="secondary-button" disabled={!!working||feeMode===savedFeeMode} onClick={saveFeeMode}><Save/> Save presentation</button></div>
  {open?<div className="sov-builder__panel">
   <div className="sov-builder__group"><h4>Use a template</h4><label><span>Template</span><select value={selectedId} onChange={event=>setSelectedId(event.target.value)}><option value="">Select a template</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name} · {template.job_sov_template_lines?.length||0} lines</option>)}</select></label><label><span>Contract amount</span><input type="number" min="0.01" step="0.01" value={contractAmount} onChange={event=>setContractAmount(event.target.value)}/></label><button type="button" className="primary-button" disabled={!selectedId||Number(contractAmount)<=0||activeLines.length>0||!!working} onClick={()=>call('apply_job_sov_template',{p_job_id:jobId,p_template_id:selectedId,p_contract_amount:Number(contractAmount)},'SOV template applied.')}><RefreshCw/> Apply Template</button><small>Templates can only be applied before active SOV lines or Pay App history exists.</small></div>
   <div className="sov-builder__group"><h4>Save this SOV as a template</h4><label><span>Template name</span><input value={templateName} onChange={event=>setTemplateName(event.target.value)} placeholder="Commercial electrical SOV"/></label><button type="button" className="secondary-button" disabled={!templateName.trim()||!activeLines.length||!!working} onClick={saveTemplate}><Save/> Save Template</button><small>The current SOV is stored as percentages, not copied job dollars.</small></div>
  </div>:null}
  {message.text?<StatePanel tone={message.tone} title={message.tone==='danger'?'SOV setup failed':'SOV updated'} description={message.text} compact/>:null}
 </section>;
}
