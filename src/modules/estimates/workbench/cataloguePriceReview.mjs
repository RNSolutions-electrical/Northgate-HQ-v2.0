import {blankSumPricing,blankItemPricing} from './blankSlate.mjs';
import {cataloguePriceSnapshot} from './catalogueService.js';
const known=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1e9;
const unit=v=>String(v??'').trim().toUpperCase();
function rows(document){
 const result=[],draftItems=new Set((document.blankWorkDrafts||[]).map(d=>d.item?.id));
 for(const entry of document.entries||[])for(const item of entry.items||[])if(!draftItems.has(item.id))for(const line of item.lines||[])result.push({scope:'included',entryId:entry.id,itemId:item.id,lineId:line.id,itemName:item.name,line});
 for(const draft of document.blankWorkDrafts||[])for(const line of draft.item?.lines||[])result.push({scope:'draft',entryId:draft.entryId,itemId:draft.item.id,lineId:line.id,itemName:draft.item.name,line});
 return result;
}
export function cataloguePriceUpdates(document,materials){
 if(document.approvedAt)return {updates:[],skipped:0};
 const master=new Map(materials.map(m=>[m.id,m])),updates=[];let skipped=0;
 for(const row of rows(document)){
  const {line}=row;if(!line.catalogueId||line.blankResourceKind==='labor')continue;
  const material=master.get(line.catalogueId);
  if(!material||!unit(line.unit)||unit(line.unit)!==unit(material.unit??material.unit_of_measure)){skipped++;continue;}
  for(const field of ['price','hours']){
   const next=material[field];if(!known(next)){skipped++;continue;}if(known(line[field])&&Number(line[field])===Number(next))continue;
   const sourceTime=field==='price'?material.priceSourceUpdatedAt:material.updated_at;
   const snapshotTime=field==='price'?line.priceSourceUpdatedAt??line.catalogueUpdatedAt:line.laborSourceUpdatedAt??line.catalogueUpdatedAt??line.priceSnapshotAt;
   // Old unmarked labor differences may be intentional. Offer only a demonstrably newer source.
   if(field==='hours'&&!line.laborOverride&&!(Date.parse(sourceTime)>Date.parse(snapshotTime))){skipped++;continue;}
   const revision=JSON.stringify([material.id,unit(material.unit??material.unit_of_measure),field,String(next),field==='price'?material.priceSource:material.labor_value_source,String(line[field]??''),field==='price'?line.priceOverride===true:line.laborOverride===true]);
   if(line.cataloguePricingReview?.[field]?.revision===revision)continue;
   const key=JSON.stringify([row.scope,row.entryId,row.itemId,row.lineId,field]);
   const manual=field==='price'?(line.priceOverride===true||['manual','estimate_override'].includes(line.priceSource)||line.overrideSource==='estimate_only'):line.laborOverride===true;
   updates.push({...row,key,field,revision,oldValue:line[field],newValue:next,manual,material});
  }
 }
 return {updates,skipped};
}
export function reviewCataloguePrices(document,materials,choices,at=new Date().toISOString()){
 if(document.approvedAt)throw Error('Approved estimates cannot be repriced.');
 const current=cataloguePriceUpdates(document,materials).updates,next=structuredClone(document),targets=new Map(rows(next).map(r=>[JSON.stringify([r.scope,r.entryId,r.itemId,r.lineId]),r.line]));
 const byKey=new Map(current.map(c=>[c.key,c]));
 for(const choice of choices){
  const candidate=byKey.get(choice.key);
  if(!candidate||candidate.revision!==choice.revision||!['accept','keep'].includes(choice.decision))throw Error('Pricing review changed. Reopen it before applying choices.');
  const {field,material}=candidate,line=targets.get(JSON.stringify([candidate.scope,candidate.entryId,candidate.itemId,candidate.lineId]));
  line.cataloguePricingReview={...line.cataloguePricingReview,[field]:{revision:candidate.revision,decision:choice.decision,reviewedAt:at,previousValue:candidate.oldValue??null,masterValue:candidate.newValue,sourceUpdatedAt:field==='price'?material.priceSourceUpdatedAt??null:material.updated_at??null}};
  if(choice.decision==='accept'){
   line[field]=candidate.newValue;
   if(field==='price'){Object.assign(line,cataloguePriceSnapshot(material,at));delete line.priceOverride;delete line.overrideSource;}
   else{line.laborSnapshotAt=at;line.laborSourceUpdatedAt=material.updated_at??null;delete line.laborOverride;}

  }
 }
 if(choices.some(c=>c.decision==='accept')){blankSumPricing((next.entries||[]).flatMap(e=>e.items||[]),next);for(const draft of next.blankWorkDrafts||[])if(choices.some(c=>byKey.get(c.key)?.scope==='draft'&&byKey.get(c.key)?.itemId===draft.item.id&&c.decision==='accept'))blankItemPricing(draft.item,next);}
 return next;
}

export function linkedPricingIds(document){return [...new Set(rows(document).map(r=>r.line.catalogueId).filter(Boolean))];}
