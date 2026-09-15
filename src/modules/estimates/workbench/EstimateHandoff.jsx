import React,{useEffect,useState} from 'react';
import {handoffPreview} from './handoff.mjs';
import {money} from './model.mjs';

export function EstimateHandoff({document,client,onSubmit,onOpen,onBack}){
 const [destination,setDestination]=useState('change_order'),[jobs,setJobs]=useState([]),[jobId,setJobId]=useState('');
 const [budget,setBudget]=useState([]),[targets,setTargets]=useState({}),[number,setNumber]=useState(''),[name,setName]=useState(document.name);
 const [coNumber,setCoNumber]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[result,setResult]=useState(null);
 const preview=handoffPreview(document);
 useEffect(()=>{let active=true;(async()=>{try{
  const db=await client(),response=await db.from('jobs').select('id,name,job_number,job_type,division').is('archived_at',null).order('name').limit(1000);
  if(response.error)throw response.error;if(active)setJobs(response.data||[]);
 }catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[client]);
 useEffect(()=>{let active=true;setBudget([]);setTargets({});if(destination!=='change_order'||!jobId||jobId==='new'){setLoading(false);return;}
 setLoading(true);(async()=>{try{const db=await client(),r=await db.from('job_budget_lines').select('id,cost_code,description').eq('job_id',jobId).is('archived_at',null).order('cost_code');
  if(r.error)throw r.error;if(active)setBudget((r.data||[]).filter(l=>/\.CO$/i.test(l.cost_code)));
 }catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[client,jobId,destination]);
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const saved=await onSubmit({destination,jobId:jobId==='new'?null:jobId,newJob:jobId==='new'?{number:number.trim(),name:name.trim()}:null,coNumber:coNumber.trim(),targets});setResult(saved);
 }catch(e){setError(e.message||'Submission failed. No partial handoff was created.');}finally{setBusy(false);}}
 if(result)return <section className="editor"><h2>Ready for review</h2><p>{result.destination==='change_order'?'The draft Change Order is ready to review and edit in the selected job.':'The estimate is attached for review. Existing budgets, actual costs and invoices are unchanged.'}</p><p>Source version {result.source_version} · Saved revision {result.source_revision}</p><div className="actions"><button onClick={onBack}>Back to estimate</button><button className="primary" onClick={()=>onOpen(result)}>Open destination</button></div></section>;
 const complete=preview.lines.length>0&&jobId&&(jobId!=='new'||number.trim())&&(destination!=='change_order'||preview.lines.every(l=>targets[l.key]));
 return <section className="editor estimate-handoff"><button onClick={onBack} disabled={busy}>Back to estimate</button><h2>Submit for review</h2>
 <p>Creates a review copy from this saved estimate. It does not approve work, post a budget, record actual costs or create an invoice.</p>
 {error&&<p role="alert">{error}</p>}<form onSubmit={submit}><fieldset disabled={busy||loading} className="editor-fields">
 <div className="form-grid"><label>Destination<select aria-label="Destination" value={destination} onChange={e=>{setDestination(e.target.value);setJobId('');setError('');}}><option value="change_order">Change Order</option><option value="job">Job</option><option value="service_call">Service Call</option></select></label>
 <label>{destination==='service_call'?'Service call':'Job'}<select aria-label={destination==='service_call'?'Service call':'Job'} required value={jobId} onChange={e=>{setJobId(e.target.value);setError('');}}><option value="">Select a destination</option>{destination!=='change_order'&&<option value="new">Create new {destination==='job'?'job':'service call'}</option>}{jobs.filter(j=>j.job_type===(destination==='service_call'?'service_call':'job')).map(j=><option key={j.id} value={j.id}>{j.job_number} — {j.name} ({j.division})</option>)}</select></label></div>
 {jobId==='new'&&<div className="form-grid"><label>Number<input required value={number} onChange={e=>setNumber(e.target.value)}/></label><label>Name<input required value={name} onChange={e=>setName(e.target.value)}/></label><p>{destination==='job'?'New jobs start On Hold for review.':'New service calls start as Pursuit with quoted billing.'} Department follows the estimate. No work authorization is implied.</p></div>}
 {destination==='change_order'&&<><label>Change Order number<input value={coNumber} onChange={e=>setCoNumber(e.target.value)} placeholder="Leave blank for next available number"/></label><label>Apply project division to all work items<select defaultValue="" onChange={e=>setTargets(Object.fromEntries(preview.lines.map(l=>[l.key,e.target.value])))}><option value="">Choose a division .CO line</option>{budget.map(b=><option key={b.id} value={b.id}>{b.cost_code} — {b.description}</option>)}</select></label>{jobId&&!loading&&!budget.length&&<p role="alert">This job has no available .CO financial lines. Add the project divisions in Job Financials, then reopen this form. Your estimate remains saved.</p>}</>}
 <p><strong>Customer-facing total: {money(preview.total)}</strong>. Each work item becomes a line description and total. Material, labor and markup stay internal.</p>
 <div className="table-scroll"><table><thead><tr><th>Work item</th>{destination==='change_order'&&<th>Project division</th>}<th>Line total</th></tr></thead><tbody>{preview.lines.map(l=><tr key={l.key}><td>{l.reference} — {l.description}</td>{destination==='change_order'&&<td><select aria-label={'Project division for '+l.description} required value={targets[l.key]||''} onChange={e=>setTargets(t=>({...t,[l.key]:e.target.value}))}><option value="">Select</option>{budget.map(b=><option key={b.id} value={b.id}>{b.cost_code} — {b.description}</option>)}</select></td>}<td>{money(l.line_total)}</td></tr>)}</tbody></table></div>
 <p>Changes after handoff are made in the destination workflow. Repeating this action opens the same handoff; it never overwrites destination edits.</p><div className="actions"><button className="primary" disabled={!complete||busy||loading}>{busy?'Submitting…':'Submit for review'}</button></div>
 </fieldset></form></section>;
}
