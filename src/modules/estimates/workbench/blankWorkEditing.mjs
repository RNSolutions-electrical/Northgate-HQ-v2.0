import {blankItemPricing,blankWorkItem} from './blankSlate.mjs';
export function beginWorkEdit(entry,item,document,newId){
 return {entryId:entry?.id??newId,isNew:!entry,item:structuredClone(item??{...blankWorkItem(newId),laborRateOverride:document.rate,blankSlateHardRate:document.blankSlateHardRate,materialMarkupOverride:document.materialMarkup})};
}
export function includeWorkEdit(document,edit){
 if(!edit.item.name.trim())throw new Error('Enter a work description before including this item.');
 if(Number(edit.item.qty)<=0)throw new Error('Work quantity must be greater than zero.');
 if(!edit.item.lines.length&&!(edit.item.blankQuotes||[]).some(q=>q.mode!=='reference'))throw new Error('Add at least one material, labor resource, or included quote.');
 blankItemPricing(edit.item,document);
 const next=structuredClone(document);next.blankWorkDrafts=(next.blankWorkDrafts||[]).filter(d=>d.item.id!==edit.item.id);
 if(edit.isNew){next.entries.push({id:edit.entryId,number:next.entries.length+1,name:'',section:'',location:'',status:'Not started',items:[structuredClone(edit.item)]});}
 else{const entry=next.entries.find(e=>e.id===edit.entryId),index=entry?.items.findIndex(i=>i.id===edit.item.id);if(!entry||index<0)throw new Error('This work item is no longer available. Close and reopen the editor.');entry.items[index]=structuredClone(edit.item);}
 return next;
}
export function removeWorkItem(document,entryId,itemId){
 const next=structuredClone(document);next.blankWorkDrafts=(next.blankWorkDrafts||[]).filter(d=>d.item.id!==itemId);next.entries=next.entries.map(e=>e.id===entryId?{...e,items:e.items.filter(i=>i.id!==itemId)}:e).filter(e=>e.items.length);return next;
}

export function saveWorkDraft(document,edit){const next=structuredClone(document);next.blankWorkDrafts=[...(next.blankWorkDrafts||[]).filter(d=>d.item.id!==edit.item.id),structuredClone(edit)];return next;}
