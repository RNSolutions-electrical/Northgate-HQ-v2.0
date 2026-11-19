import {includeWorkEdit} from './blankWorkEditing.mjs';
import {blankSumPricing,hasResourceAdjustments,requireBlankAccounting} from './blankSlate.mjs';
import {withDraftIdentity} from './draftIdentity.mjs';
// Persist a candidate, never mutate the currently included document or edit.
// Exactly two arguments to onSave: this path cannot propose shared library writes.
export async function saveWorkToEstimate(document,edit,onSave,accountingClient){
 const candidate=withDraftIdentity(includeWorkEdit(document,edit));
 const items=candidate.entries.flatMap(entry=>entry.items||[]);
 blankSumPricing(items,candidate);
 const requiresAccounting=hasResourceAdjustments(candidate)||items.some(item=>(item.blankQuotes||[]).some(q=>q.mode!=='reference'));
 if(requiresAccounting)await requireBlankAccounting(candidate,accountingClient);
 const result=await onSave(candidate,[]);
 if(!result)throw new Error('Save was not completed. Your work item is still open.');
 return result?.document||candidate;
}
