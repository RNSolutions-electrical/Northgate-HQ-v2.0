import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialExportRows, filterFinancialExportRows, financialExportColumns, financialExportCsv, financialExportDivisions, financialExportPdf, financialExportSummary } from '../src/modules/jobs/jobFinancialExport.mjs';

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

test('financial export groups and filters authorized rows by project division',()=>{
 const rows=buildFinancialExportRows([
  {id:'a',project_division_id:'d16',project_division:{id:'d16',code:'16',name:'Electrical',sort_order:16},cost_code:'16.11',description:'Materials',budget_amount:100},
  {id:'b',project_division_id:'d01',project_division:{id:'d01',code:'01',name:'General Requirements',sort_order:1},cost_code:'01.1',description:'Supervision',budget_amount:50},
  {id:'c',cost_code:'',description:'Unassigned',budget_amount:25},
 ]);
 assert.deepEqual(financialExportDivisions(rows).map(({key,label,lineCount})=>({key,label,lineCount})),[
  {key:'d01',label:'01 — General Requirements',lineCount:1},
  {key:'d16',label:'16 — Electrical',lineCount:1},
  {key:'unassigned',label:'Unassigned project division',lineCount:1},
 ]);
 const filtered=filterFinancialExportRows(rows,new Set(['d16','unassigned']));
 assert.deepEqual(filtered.map(row=>row.costCode),['16.11','']);
 const csv=financialExportCsv(filtered,{budget:true,costs:false,changeOrders:false,monthlyForecast:false,completionForecast:false,notes:false});
 assert.match(csv,/16\.11,Materials,100\.00/);
 assert.match(csv,/Unassigned,25\.00/);
 assert.doesNotMatch(csv,/01\.1|Supervision/);
 assert.match(csv,/TOTAL,,125\.00/);
});

test('financial export summary is calculated only from the filtered project divisions',()=>{
 const rows=buildFinancialExportRows([
  {id:'a',project_division_id:'d16',project_division:{id:'d16',code:'16',name:'Electrical'},category:'ohp_fee',cost_code:'16.7',description:'Fee',budget_amount:100,budget_change_amount:5,actual_cost_amount:20,committed_cost_amount:9,forecast_final_amount:90},
  {id:'b',project_division_id:'d01',project_division:{id:'d01',code:'01',name:'General'},category:'labor',cost_code:'01.1',description:'Labor',budget_amount:200,actual_cost_amount:100,committed_cost_amount:50,forecast_final_amount:180},
 ],new Map([['a',10],['b',20]]));
 const summary=financialExportSummary(filterFinancialExportRows(rows,new Set(['d16'])));
 assert.deepEqual(summary,{currentBudget:115,actualCosts:20,committedCosts:9,completionForecast:90,forecastedRemainingBudget:25,estimatedProfit:115,projectedGrossProfit:25,projectedMargin:25/115,changeTotal:15,overrideCount:0});
});

test('financial PDF accepts multiline notes and expands rows across pages',async()=>{
 const rows=buildFinancialExportRows(Array.from({length:28},(_,index)=>({id:String(index),cost_code:`16.${index+1}`,description:`Detailed financial line ${index+1}`,budget_amount:100,actual_cost_amount:20,committed_cost_amount:5,forecast_final_amount:80,note:'A longer project note that must wrap onto multiple lines in the printed financial report without being clipped or replaced by an ellipsis.'})));
 const bytes=await financialExportPdf({job:{job_number:'TEST-1',name:'Print Layout'},rows,selected:{budget:true,costs:true,changeOrders:true,monthlyForecast:true,completionForecast:true,notes:true}});
 assert.ok(bytes.length>1000);
 const {PDFDocument}=await import('pdf-lib');
 const pdf=await PDFDocument.load(bytes);
 assert.ok(pdf.getPageCount()>1);
});
