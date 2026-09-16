import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeConsiderations,answerConsideration,answerNumber,checklistDefinitions,checklistIssues,checklistNumber,pricedLaborHours} from '../src/modules/estimates/workbench/finalizationChecklist.mjs';
import {sumPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {makeTemplate} from '../src/modules/estimates/workbench/model.mjs';
const definitions=JSON.parse(readFileSync(new URL('./fixtures/estimateChecklistDefinitions.json',import.meta.url)));
const definition=key=>definitions.find(d=>d.key===key);
const draft=()=>({name:'Test',rate:75,materialMarkup:30,feePercent:30,sections:[],entries:[{items:[{qty:10,lines:[{qty:2,price:10,hours:5},{qty:1,price:0,hours:3,fixed:true}]}]}]});
const excluded=()=>['available_fault_current','estimating_labor','supervision_labor'].reduce((d,key)=>answerConsideration(d,definition(key),key==='available_fault_current'?'not_applicable':'excluded'),draft());
test('blank is unanswered, zero is valid, exclusions need no allowance or explanation',()=>{
 assert.equal(checklistIssues(draft(),definitions).length,3);
 assert.equal(checklistIssues(excluded(),definitions).length,0);
 for(const n of [0,'0','0.00','.5',12.5])assert.equal(checklistNumber(n),true);
 for(const n of ['',null,undefined,' ',false,[],{},-1,'NaN','Infinity','1e3','9'.repeat(101)])assert.equal(checklistNumber(n),false);
 let d=answerConsideration(excluded(),definition('estimating_labor'),'included');
 assert.equal(checklistIssues(d,definitions).length,1);
 d=answerNumber(d,definition('estimating_labor'),'hours','0');assert.equal(checklistIssues(d,definitions).length,0);
});
test('all applicable AFC follow-ups need explicit answers, by-others allowed',()=>{
 for(const status of ['completed','included','verified','by_others']){
  let d=answerConsideration(excluded(),definition('available_fault_current'),status);
  assert.equal(checklistIssues(d,definitions).length,5);
  for(const child of definitions.filter(d=>d.parent_key))d=answerConsideration(d,child,'by_others');
  assert.equal(checklistIssues(d,definitions).length,0);
  d=answerConsideration(d,definition('available_fault_current'),'not_applicable');
  assert.equal(activeConsiderations(definitions,d.finalizationChecklist.answers).length,3);
  assert.equal(Object.keys(d.finalizationChecklist.answers).length,8,'hidden prior answers are preserved');
 }
});
test('5% suggestion handles quantity/fixed labor; all values remain editable and pricing unchanged',()=>{
 let d=excluded();const price=sumPricing(d.entries.flatMap(e=>e.items),d).price,supervision=definition('supervision_labor');
 assert.equal(pricedLaborHours(d),103);
 d=answerConsideration(d,supervision,'suggested');
 assert.deepEqual(d.finalizationChecklist.answers.supervision_labor.values,{fieldHours:103,percent:5,hours:5.15});
 d=answerNumber(d,supervision,'percent','2');assert.equal(d.finalizationChecklist.answers.supervision_labor.status,'adjusted');
 assert.equal(d.finalizationChecklist.answers.supervision_labor.values.hours,2.06);
 d=answerNumber(d,supervision,'hours','0');assert.equal(checklistIssues(d,definitions).length,0);
 assert.equal(sumPricing(d.entries.flatMap(e=>e.items),d).price,price);
 d=answerNumber(d,supervision,'fieldHours','');assert.ok(checklistIssues(d,definitions).length>0);
 d=answerConsideration(d,supervision,'excluded');assert.equal(checklistIssues(d,definitions).length,0);
});
test('new/versioned/disabled definitions, saved snapshots and missing configuration',()=>{
 const d=excluded(),changed=structuredClone(definitions);changed[0].version++;
 assert.equal(checklistIssues(d,changed).length,1);
 changed.push({...definition('estimating_labor'),key:'permits',label:'Permits considered?'});
 assert.equal(checklistIssues(d,changed).length,2);
 changed.forEach(x=>x.enabled=false);assert.equal(checklistIssues(d,changed).length,0);
 assert.equal(checklistIssues(d,null)[0].key,'configuration');
 d.finalizationChecklist.definitions=definitions;
 assert.equal(checklistDefinitions(d,changed,{locked:true}),definitions);
 assert.equal(checklistDefinitions(d,changed),changed);
 const parentOff=definitions.map(x=>x.key==='available_fault_current'?{...x,enabled:false}:x);
 assert.equal(activeConsiderations(parentOff,{available_fault_current:{status:'included'}}).length,2);
});
test('templates do not copy project-specific checklist responses',()=>{
 const d=excluded();assert.equal(makeTemplate(d,'Template',true).finalizationChecklist,undefined);
});
