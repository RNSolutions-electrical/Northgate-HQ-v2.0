import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cents,divisionSources,sovMetrics,validatePlan} from './sovWorkspaceMath.js';

test('Division imports original amounts only, including all explicit lines in that division',()=>{
 const d=[{id:'a',code:'16',effective_name:'Electrical'},{id:'b',code:'15',name:'Mechanical'}];
 const rows=[{project_division_id:'a',budget_amount:48000,currentBudget:50000},
  {project_division_id:'a',budget_amount:99900},{project_division_id:'b',budget_amount:10}];
 assert.equal(divisionSources(d,rows)[0].total,14790000);
 assert.equal(divisionSources(d,rows)[0].name,'Electrical');
});
test('Work remaining and remaining to bill are separate, including missing and overbilled links',()=>{
 const line={basis:'percent',value:'20',complete:'50'};
 const metrics=sovMetrics(14790000,line,{scheduled_value_amount:29580,billed_to_date_amount:10000});
 assert.equal(metrics.amount,2958000);assert.equal(metrics.earned,1479000);
 assert.equal(metrics.workLeft,1479000);assert.equal(metrics.unbilled,1958000);
 assert.equal(sovMetrics(14790000,line).billed,null);
 assert.equal(sovMetrics(14790000,line,{scheduled_value_amount:29580,billed_to_date_amount:29900}).unbilled,-32000);
});
test('Percentage uses cent rounding and validates duplicate links and over-100 completion',()=>{
 assert.equal(sovMetrics(1000,{basis:'percent',value:'33.33',complete:'50'}).earned,167);
 assert.equal(cents('1.025'),null);
 const line={code:'16-1',description:'Underground',basis:'amount',value:'200',complete:'101',link:'a'};
 assert.equal(validatePlan({groups:[{code:'16',name:'Electrical',target:'500',lines:[line,{...line,code:'16-2'}]}]}).length,2);
});
