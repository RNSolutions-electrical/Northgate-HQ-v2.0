import {useEffect,useState} from 'react';
import {Drawer} from '../../components/ui/Drawer.jsx';
import {assignmentName} from './eosAssignmentRoster.js';
export function EosManagerRoster({open,onClose,store,onSaved}) {
 const [data,setData]=useState(null),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 useEffect(()=>{if(open)store.read().then(setData).catch(e=>setError(e.message));},[open,store]);
 useEffect(()=>{if(!form&&!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[form,busy]);
 const edit=row=>{setError('');setForm({kind:row.kind,id:row.kind==='person'?row.user_id.slice(7):undefined,user_id:row.kind==='account'?row.user_id:undefined,display_name:row.display_name,contact_email:row.contact_email||'',employee_profile_id:row.employee_profile_id||'',enabled:row.enabled,expected_revision:row.revision,requestId:crypto.randomUUID()});};
 const change=(key,value)=>setForm(f=>({...f,[key]:value,requestId:crypto.randomUUID()}));
 async function save(e){e.preventDefault();setBusy(true);setError('');let committed=false;try{const {requestId,...input}=form;await store.save(input,requestId);committed=true;setUncertain(false);setForm(null);setData(await store.read());await onSaved?.();}catch(e){setError(committed?`Saved; refresh failed: ${e.message}`:e.code==='PT409'?`${e.message}. Cancel draft, reload roster, and reopen the person to review current data.`:e.message);setUncertain(!committed&&(!e.code||e.code==='EOS_TIMEOUT'));}finally{setBusy(false);}}
 return <Drawer open={open} onClose={()=>{if(!busy&&!uncertain)onClose();}} title="Manager roster" labelledById="eos-roster-title" width="min(48rem,100vw)">
  <p>Choose people for Scorecard ownership and Pursuit management before their first login. Roster entries do not grant EOS access or link accounts by email.</p>
  <p>Closing keeps your draft. Use Cancel draft to discard it. Inactive people remain attached to existing historical assignments.</p>
  {error&&<p role="alert">{error}</p>}{uncertain&&<p role="status">Save outcome is unconfirmed. Recover the unchanged save before editing or closing.</p>}
  {data&&!data.can_manage&&<p>Roster maintenance requires existing EOS and employee-management permissions.</p>}
  <button disabled={busy||uncertain||!!form} onClick={async()=>{setBusy(true);setError('');try{setData(await store.read());}catch(e){setError(e.message);}finally{setBusy(false);}}}>Reload roster</button>
  {data?.can_manage&&!form&&<button onClick={()=>{setError('');setForm({kind:'person',id:crypto.randomUUID(),display_name:'',contact_email:'',employee_profile_id:'',enabled:true,expected_revision:0,requestId:crypto.randomUUID()});}}>Add person</button>}
  {form&&<form className="eos-form" onSubmit={save}>
   {!form.expected_revision&&data.accounts?.length>0&&<label>Existing account (optional)<select aria-label="Existing account (optional)" disabled={busy||uncertain} value={form.kind==='account'?form.user_id:''} onChange={e=>{const account=data.accounts.find(a=>a.user_id===e.target.value);setForm(f=>({...f,kind:account?'account':'person',user_id:account?.user_id,display_name:account?.display_name||'',requestId:crypto.randomUUID()}));}}><option value="">Person without an account</option>{data.accounts.map(a=><option key={a.user_id} value={a.user_id}>{a.display_name} · {a.email}</option>)}</select></label>}
   <label>Name<input required maxLength="160" disabled={busy||uncertain} value={form.display_name} onChange={e=>change('display_name',e.target.value)}/></label>
   {form.kind==='person'&&<><label>Contact email (optional)<input type="email" maxLength="254" disabled={busy||uncertain} value={form.contact_email} onChange={e=>change('contact_email',e.target.value)}/></label>
    <label>Existing pending employee (optional)<select aria-label="Existing pending employee (optional)" disabled={busy||uncertain||form.expected_revision>0} value={form.employee_profile_id} onChange={e=>{const profile=data.profiles.find(p=>p.id===e.target.value);setForm(f=>({...f,employee_profile_id:e.target.value,display_name:profile?.display_name||f.display_name,requestId:crypto.randomUUID()}));}}><option value="">Separate assignment person</option>{data.profiles.map(p=><option key={p.id} value={p.id}>{p.display_name} · {p.id.slice(0,8)}</option>)}{form.employee_profile_id&&!data.profiles.some(p=>p.id===form.employee_profile_id)&&<option value={form.employee_profile_id}>Existing source profile (preserved)</option>}</select></label></>}
   <label><input type="checkbox" disabled={busy||uncertain} checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/>Eligible for new assignments</label>
   <div className="eos-actions"><button disabled={busy}>{uncertain?'Recover unchanged save':'Save roster person'}</button><button type="button" disabled={busy||uncertain} onClick={()=>{setForm(null);setError('');}}>Cancel draft</button></div>
  </form>}
  <ul className="eos-roster-list">{data?.rows.map(row=><li key={row.user_id}><span>{assignmentName(row)}{row.protected?' · Protected Developer identity — not assignable':row.can_assign?'':' · Inactive for new assignments'}</span>{data.can_manage&&!row.protected&&<button disabled={busy||uncertain||!!form} onClick={()=>edit(row)}>Edit {row.display_name}</button>}</li>)}</ul>
 </Drawer>;
}
