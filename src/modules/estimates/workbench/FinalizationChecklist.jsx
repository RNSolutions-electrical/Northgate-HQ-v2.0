import React from 'react';
import {activeConsiderations,answerConsideration,answerNumber,checklistIssues,pricedLaborHours,suggestedNumber} from './finalizationChecklist.mjs';

/** @param {{document:object,definitions:import('./finalizationChecklist.mjs').ChecklistDefinition[]|null,locked?:boolean,historical?:boolean,busy?:boolean,onChange:Function,onSave:Function,onReload:Function}} props */
export function FinalizationChecklist({document,definitions,locked=false,historical=false,busy=false,onChange,onSave,onReload}){
 const answers=document.finalizationChecklist?.answers||{},active=activeConsiderations(definitions,answers),issues=checklistIssues(document,definitions);
 const unanswered=new Set(issues.map(i=>i.key)).size;
 if(!definitions)return <section className="finalization-checklist"><h2>Estimate Finalization Checklist</h2><p role="alert">Checklist could not be loaded. Draft saving remains available. Reload before finalizing.</p><button disabled={busy} onClick={onReload}>Reload checklist</button></section>;
 if(historical&&!document.finalizationChecklist?.definitions)return <section className="finalization-checklist"><h2>Estimate Finalization Checklist</h2><p>This approval predates the checklist. Its original record is preserved. New editable revisions use the current considerations.</p></section>;
 return <section className="finalization-checklist" aria-label="Estimate Finalization Checklist">
  <div className="section-heading"><div><h2>Estimate Finalization Checklist</h2><p><strong>Required consideration; not required inclusion.</strong></p></div><span role="status">{unanswered?unanswered+' considerations need a response':'All applicable considerations answered'}</span></div>
  <p>Answer each enabled consideration before submitting for review or approving. Zero is acceptable; blank is unanswered. Adjustments, exclusions and “Not Applicable” need no explanation.</p>
  <p className="checklist-pricing-note">Allowances here record your consideration. Include chosen labor through the existing pricing work items; these answers do not add costs.</p>
  {locked&&!historical&&<p>Your access allows review. An estimator must complete or change these responses.</p>}
  {!historical&&<button disabled={busy} onClick={onReload}>Reload checklist definitions</button>}
  {active.map(d=>{
   const answer=answers[d.key]||{},values=answer.values||{},stale=answer.status&&answer.version!==d.version;
   const fields=(d.numeric_fields||[]).filter(f=>f.statuses.includes(answer.status));
   return <fieldset className={'checklist-item'+(d.parent_key?' checklist-child':'')} key={d.key} disabled={locked||busy}>
    <legend>{d.label}</legend>{d.description&&<p>{d.description}</p>}
    <label><span>Response</span><select aria-label={d.label} value={answer.status||''} onChange={e=>onChange(answerConsideration(document,d,e.target.value))}>
     <option value="">Choose a response</option>{d.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select></label>
    {stale&&<p className="checklist-warning">This consideration changed. <button type="button" onClick={()=>onChange(answerConsideration(document,d,answer.status))}>Confirm this response</button></p>}
    {!!fields.length&&<div className="checklist-numbers">{fields.map(f=><label key={f.key}><span>{f.label}</span><input aria-label={f.label} type="number" min="0" step="any" value={values[f.key]??''} placeholder="Enter 0 if none" onChange={e=>onChange(answerNumber(document,d,f.key,e.target.value))}/><small>{f.unit}</small></label>)}</div>}
    {fields.some(f=>f.suggestion==='priced_labor_hours')&&<p className="muted">Pricing currently contains {pricedLaborHours(document)??'unanswered'} labor hours. Check the field-hours basis if that includes estimating or management labor.</p>}
    {fields.filter(f=>f.suggestion==='percentage_of_field_hours').map(f=><p key={f.key} className="muted">Current calculation: {suggestedNumber(f,values,document)===''?'enter the field hours and percentage':suggestedNumber(f,values,document)+' hours'}. Your allowance remains editable.</p>)}
    {fields.filter(f=>!((values[f.key]===0)||String(values[f.key]??'').trim())).map(f=><p key={f.key} className="checklist-warning">{f.label}: zero is valid; enter a value before finalizing.</p>)}
   </fieldset>;
  })}
  {!active.length&&<p>No considerations are currently enabled.</p>}
  {!locked&&<div className="actions"><button className="primary" disabled={busy} onClick={onSave}>Save checklist</button><span>Unanswered items may be saved in a draft.</span></div>}
 </section>;
}
