import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastCsv, difference, executionBudget, indexRecords, reportRows, salesPlan } from './financialsV2.js';

const lines = [{id:'a',cost:50},{id:'b',cost:350},{id:'c',cost:600}];
const shares = plan => plan.lines.map(r=>r.fee);

test('Sales starts with proportional fee; only the edited share changes until explicit recalculate',()=>{
 const first=salesPlan(lines,300);
 assert.deepEqual(shares(first),[15,105,180]);
 const pinned=new Map(first.lines.map(r=>[r.id,r.fee]));
 const edited=salesPlan(lines,300,{a:10},pinned);
 assert.deepEqual(shares(edited),[30,105,180]);
 assert.equal(edited.unallocated,-15);
 const recalculated=salesPlan(lines,300,{a:10});
 assert.deepEqual(shares(recalculated),[30,99.47,170.53]);
 assert.equal(recalculated.unallocated,0);
 assert.equal(recalculated.lines.reduce((t,r)=>t+r.sales,0),1300);
});
test('Rejects over-100 override; respects zero overrides and unallocated remainder',()=>{
 assert.throws(()=>salesPlan(lines,100,{a:50,b:50.01}),/100%/);
 assert.deepEqual(shares(salesPlan(lines,100,{a:0,b:10,c:20})),[0,10,20]);
 assert.equal(salesPlan(lines,100,{a:0,b:10,c:20}).unallocated,70);
 assert.equal(salesPlan([{id:'a',cost:0}],100).unallocated,100);
 assert.equal(salesPlan([{id:'a',cost:0}],-10).unallocated,-10);
});
test('Penny remainders are stable; signed credits and partially available values are supported',()=>{
 const input=[{id:'z',cost:1},{id:'a',cost:1},{id:'m',cost:1}];
 assert.deepEqual(shares(salesPlan(input,0.01)),[0,.01,0]);
 assert.deepEqual(shares(salesPlan(input,-0.01)),[0,-.01,0]);
 assert.equal(difference(10,null),null);
 assert.equal(difference(1.01,1),.01);
 assert.equal(executionBudget({cost_code:'26.CO',budget_amount:0,budget_change_amount:20}),20);
 assert.equal(executionBudget({cost_code:'26.CO',budget_amount:20,current_budget_override_amount:0}),0);
});
test('Export keeps report provenance, protects spreadsheet formulas, and suppresses false partial margins',()=>{
 const data={title:'=Danger',asOf:'2026-11-23',cutoff:'2026-11-20',frozen:true,billed:2500,
  contract:{original:50000,current:51000,approved:1000,allocated:49500}, totals:{budget:5000,actual:500,covered:1,final:600},
  lines:[{code:'=A3',label:'Quoted "value"',budget:5000,actual:500,final:600,original:4900},{code:'b',label:'Missing',budget:0}],
  revenue:[{month:'2026-11',expected:2400,retainage:240}]};
 const output=buildForecastCsv(data,['completion','cost','estimate','revenue']);
 assert.match(output,/"Finalized monthly snapshot"/);
 assert.match(output,/"'\=Danger"/);
 assert.match(output,/"'\=A3"/);
 assert.match(output,/"Quoted ""value"""/);
 assert.match(output,/"Estimated gross profit",""/);
 assert.match(output,/"2026-11",2400,240,2160/);
 assert.equal(reportRows({...data,totals:{...data.totals,covered:2}},'completion').find(r=>r[0]==='Estimated gross profit')[1],50400);
 assert.doesNotMatch(buildForecastCsv(data,['revenue']),/Project completion/);
});
test('Record index separates jobs’ record types and scopes within the loaded job',()=>{
 assert.equal(indexRecords([{kind:'forecast',record_key:'2026-11',revision:1},{kind:'billing_plan',record_key:'2026-11',revision:2}])['billing_plan:2026-11'].revision,2);
});
