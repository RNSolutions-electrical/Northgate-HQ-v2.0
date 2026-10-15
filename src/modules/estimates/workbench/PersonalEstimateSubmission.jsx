import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

// Kept mounted for this estimate: cancel/reopen and failed requests retain the reason.
export default function PersonalEstimateSubmission({locked,promoted=false,workflow,onReason,onSubmit,routeKey,lockedLabel='Submitted for review',lockedMessage='This payload is locked while a reviewer considers it.'}){

 const [open,setOpen]=useState(false),dialog=useRef(null),trigger=useRef(null),status=useRef(null),title=useId(),description=useId();
 useEffect(()=>setOpen(false),[routeKey,locked]);
 useEffect(()=>{
  if(!open)return;
  const element=dialog.current,doc=element.ownerDocument,previous=doc.activeElement;
  const overflow=doc.body.style.overflow;doc.body.style.overflow='hidden';
  element.showModal();element.querySelector('textarea').focus();
  return()=>{
   element.close();doc.body.style.overflow=overflow;
   if(trigger.current?.isConnected&&!trigger.current.disabled)trigger.current.focus();
   else if(status.current?.isConnected)status.current.focus();
   else if(previous?.isConnected&&!previous.disabled)previous.focus();
  };
 },[open]);
 const close=()=>{if(!workflow.busy)setOpen(false);};
 const trapFocus=event=>{
  if(event.key!=='Tab')return;
  const element=event.currentTarget,controls=[...element.querySelectorAll('button:not(:disabled),textarea:not(:disabled)')];
  const first=controls[0],last=controls.at(-1),active=element.ownerDocument.activeElement;
  if(!first){event.preventDefault();element.focus();}
  else if(event.shiftKey&&active===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
 };
 return <>
  <div className="estimate-submission-bar">
   <button ref={trigger} className="primary-button" type="button" disabled={locked||workflow.busy} onClick={()=>setOpen(true)}>{promoted?'Promoted to official estimate':locked?lockedLabel:'Submit for Review'}</button>
   {locked&&<span>{promoted?'This personal source is retained as promotion history.':lockedMessage}</span>}

   {workflow.success&&<p ref={status} tabIndex={-1} role="status">{workflow.success}</p>}
  </div>
  {open&&createPortal(<dialog ref={dialog} tabIndex={-1} className="estimate-submission-dialog" aria-labelledby={title} aria-describedby={description} onKeyDown={trapFocus} onCancel={event=>{event.preventDefault();close();}}>
   <form className="job-financials-form" aria-busy={workflow.busy} onSubmit={onSubmit}>
    <h2 id={title}>Submit for review</h2>
    <p id={description}>Save the estimate, then explain what the reviewer should know.</p>
    <label>Submission reason<textarea value={workflow.reason} onChange={event=>onReason(event.target.value)} disabled={workflow.busy||locked} required maxLength={1000} rows={5}/></label>
    {workflow.error&&<p role="alert">{workflow.error}</p>}
    <div className="job-financials-form__actions">
     <button className="secondary-button" type="button" disabled={workflow.busy} onClick={close}>Cancel</button>
     <button className="primary-button" type="submit" disabled={locked||workflow.busy||!workflow.reason.trim()}>{workflow.busy?'Submitting...':'Confirm submission'}</button>
    </div>
   </form>
  </dialog>,trigger.current.ownerDocument.body)}
 </>;
}
