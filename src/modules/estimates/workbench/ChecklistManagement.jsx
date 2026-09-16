import React,{useState} from 'react';
export default function ChecklistManagement({definitions,canAdd,isDeveloper,onSave}){
 const [adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retiring,setRetiring]=useState(null);
 if(!onSave||(!canAdd&&!isDeveloper))return null;
 async function save(values){setBusy(true);setError('');try{await onSave(values);setAdding(false);setRetiring(null);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="checklist-management"><div className="section-heading"><h3>Shared checklist template</h3>{canAdd&&<button disabled={busy} onClick={()=>setAdding(!adding)}>Add Checklist Item</button>}</div><p className="muted">Additions apply to future finalizations, including drafts when definitions are refreshed. Approved checklists stay unchanged. Removal retires an item; it does not erase history.</p>
 {error&&<p className="save-error" role="alert">{error}</p>}
 {adding&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);save({key:'custom_'+crypto.randomUUID().replaceAll('-',''),label:f.get('label'),description:f.get('description')});}}><fieldset disabled={busy} className="resource-fields"><label>Checklist item<input name="label" required maxLength={500}/></label><label>Description<input name="description"/></label><button className="primary">Add shared item</button></fieldset></form>}
 {isDeveloper&&<details><summary>Developer: retire checklist items</summary>{definitions?.filter(d=>d.enabled).map(d=><div className="actions" key={d.key}><span>{d.label}</span><button disabled={busy} onClick={()=>setRetiring(d)}>Retire</button></div>)}</details>}
 {retiring&&<form onSubmit={e=>{e.preventDefault();save({key:retiring.key,retire:true,reason:new FormData(e.currentTarget).get('reason')});}}><p>Retire “{retiring.label}” from future checklists?</p><label>Removal reason<textarea name="reason" required disabled={busy}/></label><div className="actions"><button type="button" disabled={busy} onClick={()=>setRetiring(null)}>Cancel</button><button disabled={busy}>Retire item</button></div></form>}
 </section>;
}
