import React,{useId,useRef,useState} from 'react';

// Save commits to the owning draft only; closing always discards the overlay buffer.
export default function EstimateNote({label,value='',readOnly=false,disabled=false,onSave,shared=false}){
 const [draft,setDraft]=useState(''),dialog=useRef(null),trigger=useRef(null),heading=useId();
 const present=Boolean(value?.trim());
 const close=()=>{dialog.current.close();trigger.current?.focus();};
 return <span className="estimate-note-control">
  <button ref={trigger} type="button" className={'text-button estimate-note-button '+(present?'has-note':'')} disabled={disabled} aria-label={`${present?'View':'Add'} ${label}`} onClick={()=>{setDraft(value||'');dialog.current.showModal();}}>{present?'● Note':'＋ Note'}</button>
  <dialog ref={dialog} aria-labelledby={heading} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!readOnly){event.preventDefault();onSave(draft);close();}}}>
   <header><h2 id={heading}>{label}</h2><button type="button" aria-label="Close note" onClick={close}>×</button></header>
   <p className="muted">{shared?'Reusable assembly note. Copied into estimates when this assembly is added.':'Internal estimate annotation. Save the estimate to persist changes; excluded from customer proposals.'}</p>
   <label>Note<textarea autoFocus rows={6} value={draft} readOnly={readOnly} onChange={event=>setDraft(event.target.value)}/></label>
   <div className="dialog-actions"><button type="button" onClick={close}>{readOnly?'Close':'Cancel'}</button>{!readOnly&&<><button type="button" onClick={()=>setDraft('')}>Clear</button><button type="button" className="primary" onClick={()=>{onSave(draft);close();}}>Save note</button></>}</div>
  </dialog>
 </span>;
}
