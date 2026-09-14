import {clone} from './model.mjs';
import {awardQuote} from './packages.mjs';

export function deleteDraftContent(document,entryId,itemId,reason){
 if(document.approvedAt)throw new Error('Approved estimates are locked. Create a revision first.');
 if(!reason?.trim())throw new Error('Enter a deletion reason.');
 const next=clone(document),entry=next.entries.find(e=>e.id===entryId);
 if(!entry)throw new Error('Entry not found. Reopen the estimate.');
 if(itemId){
  const item=entry.items.find(i=>i.id===itemId);
  if(!item)throw new Error('Work item not found. Reopen the estimate.');
  if(item.quoteId)awardQuote(next,entry.packageId,null);else entry.items=entry.items.filter(i=>i.id!==itemId);
 }else{
  next.entries=next.entries.filter(e=>e.id!==entryId);
  if(entry.packageId){next.packages=(next.packages||[]).filter(p=>p.id!==entry.packageId);next.quotes=(next.quotes||[]).filter(q=>q.packageId!==entry.packageId);}
 }
 // Captured with before/after document data by the existing change_logs save audit.
 next.lastEditReason={action:itemId?'delete_work_item':'delete_entry',entryId,itemId:itemId||null,reason:reason.trim()};
 return next;
}
