import React from 'react';
import {activeConsiderations} from './workbench/finalizationChecklist.mjs';

/** Read only: labels and answers come from the immutable handoff, never current definitions. */
export function EstimateChecklistSummary({checklist}){
 if(!checklist?.definitions)return <section aria-label="Finalization checklist at submission"><h4>Finalization checklist</h4><p>This source record predates the checklist.</p></section>;
 const answers=checklist.answers||{};
 return <section aria-label="Finalization checklist at submission"><h4>Finalization checklist at submission</h4>
  <p>Required consideration; not required inclusion. Recorded allowances do not add to the estimate price.</p>
  <dl>{activeConsiderations(checklist.definitions,answers).map(d=>{
   const answer=answers[d.key]||{};
   return <div key={d.key} style={{padding:'12px 0',borderBottom:'1px solid var(--border-color, #ddd)'}}>
    <dt><strong>{d.label}</strong></dt><dd style={{margin:'6px 0 0'}}>{d.options.find(o=>o.value===answer.status)?.label||'Unanswered'}
     {(d.numeric_fields||[]).filter(f=>f.statuses.includes(answer.status)).map(f=><div key={f.key}>{f.label}: {answer.values?.[f.key]??'Unanswered'} {f.unit}</div>)}
    </dd>
   </div>;
  })}</dl>
 </section>;
}
