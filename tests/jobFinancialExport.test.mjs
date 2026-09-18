import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialExportRows, financialExportColumns, financialExportCsv } from '../src/modules/jobs/jobFinancialExport.mjs';

test('financial export always includes cost code and description and only selected details',()=>{
 const selected={budget:true,costs:false,changeOrders:true,monthlyForecast:false,completionForecast:true,notes:false};
 assert.deepEqual(financialExportColumns(selected).map(column=>column.label),['Cost Code','Description','Budget','Change Orders','Completion Forecast']);
 const rows=buildFinancialExportRows([{id:'a',cost_code:'16.11',description:'Materials',budget_amount:100,budget_change_amount:5,actual_cost_amount:20,forecast_final_amount:90,note:'private note'}],new Map([['a',10]]));
 assert.equal(rows[0].budget,115);
 const csv=financialExportCsv(rows,selected);
 assert.match(csv,/Cost Code,Description,Budget,Change Orders,Completion Forecast/);
 assert.match(csv,/16.11,Materials,115.00,10.00,90.00/);
 assert.doesNotMatch(csv,/private note|Costs to Date|Monthly Forecast/);
 assert.match(csv,/TOTAL,,115.00,10.00,90.00/);
});

test('financial export respects a current-budget override without exposing omitted fields',()=>{
 const rows=buildFinancialExportRows([{id:'a',cost_code:'01.1',description:'General',budget_amount:100,current_budget_override_amount:80,actual_cost_amount:30,note:'shown'}]);
 const csv=financialExportCsv(rows,{budget:true,costs:true,changeOrders:false,monthlyForecast:false,completionForecast:false,notes:true});
 assert.match(csv,/01.1,General,80.00,30.00,shown/);
});

test('financial export neutralizes spreadsheet formulas in user-authored text',()=>{
 const rows=buildFinancialExportRows([{id:'a',cost_code:'01.1',description:'=HYPERLINK("unsafe")',budget_amount:-10,note:'+SUM(A1:A2)'}]);
 const csv=financialExportCsv(rows,{budget:true,costs:false,changeOrders:false,monthlyForecast:false,completionForecast:false,notes:true});
 assert.match(csv,/"'=HYPERLINK\(""unsafe""\)"/);
 assert.match(csv,/-10\.00/);
 assert.match(csv,/'\+SUM\(A1:A2\)/);
});
