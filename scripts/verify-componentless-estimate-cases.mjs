import assert from 'node:assert/strict';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
export async function verifyComponentless({db,doc,actor,save,submit,review,one,checks}){
 const original=structuredClone(doc),manual=structuredClone(doc),quoted=structuredClone(doc);
 manual.entries[0].items[0].components=[];for(const line of manual.entries[0].items[0].lines)delete line.componentId;
 quoted.entries[0].items[0]={...quoted.entries[0].items[0],quoteId:'quoted',components:[],lines:[]};
 quoted.quotes=[{id:'quoted',name:'Supplier fixture',vendor:'Fixture vendor',materialAmount:100.25,otherAmount:42.5}];
 const placeholder=structuredClone(quoted);placeholder.entries[0].items[0].components=[{id:'optional',name:''}];
 const charged=structuredClone(quoted);charged.proposal={...charged.proposal,salesTaxPercent:5,creditCardPercent:3};
 const zero=structuredClone(quoted);zero.quotes[0].materialAmount=0;zero.quotes[0].otherAmount=0;
 for(const document of [original,manual,quoted,placeholder,charged,zero]){
  await actor('developer');const saved=await save(document),request=await submit(saved.estimate_id);
  await actor('reviewer');const approved=await review(request);
  const snapshot=await one('select row_to_json(s) from estimate_snapshots s where id=$1',[approved.approved_snapshot_id]);
  assert.equal(Number(snapshot.pricing_total),sumPricing(document.entries.flatMap(e=>e.items),document).price);
  assert.deepEqual(snapshot.workbench_document.entries,document.entries);
  await assert.rejects(()=>db.query('update estimate_snapshots set pricing_total=0 where id=$1',[snapshot.id]),/permission|immutable/);
 }
 for(const kind of ['missing','duplicate','negative','blank','invalid','quantity','unnamed','unpriced']){
  await actor('developer');const document=structuredClone(quoted),item=document.entries[0].items[0];
  if(kind==='missing')document.quotes=[];
  if(kind==='duplicate')document.quotes.push({...document.quotes[0]});
  if(kind==='negative')document.quotes[0].materialAmount=-1;
  if(kind==='blank')document.quotes[0].materialAmount='';
  if(kind==='invalid')document.quotes[0].otherAmount='no price';
  if(kind==='quantity')item.qty='';
  if(kind==='unnamed')item.name='';
  if(kind==='unpriced'){delete item.quoteId;document.quotes=[];}
  const saved=await save(document);
  await assert.rejects(()=>submit(saved.estimate_id));
  await assert.rejects(()=>one('select approve_workbench_estimate($1,null)',[saved.estimate_id]));
  assert.equal(await one('select count(*)::int from estimate_snapshots where estimate_id=$1',[saved.estimate_id]),0);
 }
 await actor('developer');const stale=structuredClone(quoted);stale.quotes[0].archivedAt='2026-10-16';stale.quotes[0].archiveReason='Fixture archived';await assert.rejects(()=>save(stale),/Archived/);
 checks.push('componentless hotfix: flat manual/grouped/quoted/placeholder/zero/charged submission and approval preserve totals and snapshots; missing/duplicate/archived/invalid/unpriced sources reject both paths');
}
