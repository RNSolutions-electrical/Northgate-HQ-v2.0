import {useState,useRef} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {getSupabaseAccessToken} from '../../services/clerkToken.js';
import {createSupabaseClient} from '../../services/supabaseClient.js';
import {financialNamePatch} from './financialNames.js';

export function FinancialNameOverride({line,division,canPropose,canApprove,onSaved}) {
  const metadata=division?._financialName || line?._financialName;
  const [open,setOpen]=useState(false),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),{getToken}=useAuth();
  if(!metadata)return null;
  const linked=division?Boolean(metadata.catalogue_division_id):Boolean(metadata.catalogue_line_id);
  if(!linked)return <small className="financial-name-hint">Job-only custom {division?'division':'line'}</small>;
  const overridden=metadata.name_override!==null && metadata.name_override!==undefined;
  async function save(event){
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const db=createSupabaseClient(await getSupabaseAccessToken(getToken));
      const patch=financialNamePatch({line,division,value});
      if(canApprove){const result=await db.rpc('save_job_financial_batch',{p_job_id:line.job_id,p_lines:[patch],p_reason:null});if(result.error)throw result.error;}
      else {
        const saved=await db.rpc('save_v5_job_financial_proposal',{p_request_id:crypto.randomUUID(),p_working_copy_id:null,p_expected_version:null,p_job_id:line.job_id,p_lines:[patch]});
        if(saved.error)throw saved.error;
        const submitted=await db.rpc('submit_v5_job_financial_proposal',{p_request_id:crypto.randomUUID(),p_working_copy_id:saved.data.id,p_expected_version:saved.data.version,p_reason:null});
        if(submitted.error)throw submitted.error;
      }
      setOpen(false);onSaved?.();
    }catch(e){setError(e.message || 'The project name was not saved.');}finally{lock.current=false;setBusy(false);}
  }
  return <div className="financial-name-control">
    <small className="financial-name-hint">{overridden?'Project name override':'Catalogue name'}{metadata.catalogue_active===false?' · Retired for new use':''}</small>
    {overridden?<small className="financial-name-hint">Catalogue: {metadata.catalogue_name}</small>:null}
    {canPropose?<button type="button" className="text-button" onClick={()=>{setValue(metadata.name_override || '');setError('');setOpen(true);}}>Edit {division?'division':'line'} name</button>:null}
    {open?<div className="ng-dialog-root"><div className="ng-dialog-scrim is-open"/><form className="ng-dialog" role="dialog" aria-modal="true" aria-label={`Project ${division?'division':'line'} name`} onSubmit={save}>
      <header className="ng-dialog__header"><div><h3>Project {division?'division':'line'} name</h3><p>This name applies only to this job. The catalogue code and financial values stay the same.</p></div></header>
      <label><span>Catalogue name</span><strong>{metadata.catalogue_name}</strong></label>
      <label><span>Project name override</span><input aria-label="Project name override" value={value} maxLength={250} disabled={busy} onChange={e=>setValue(e.target.value)} placeholder={metadata.catalogue_name} autoFocus/></label>
      <button type="button" className="text-button" disabled={busy} onClick={()=>setValue('')}>Use catalogue name</button>
      {error?<p role="alert" className="form-error">{error}</p>:null}
      <footer className="ng-dialog__actions"><button type="button" className="ng-dialog__button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="ng-dialog__button ng-dialog__button--primary" disabled={busy}>{busy?'Saving...':canApprove?'Save project name':'Submit name for review'}</button></footer>
    </form></div>:null}
  </div>;
}
