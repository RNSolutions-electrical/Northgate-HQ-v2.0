import test from 'node:test';import assert from 'node:assert/strict';
import {createFinancialDivisionResolver,groupFinancialDivisions,validateFinancialDivisionEntry} from '../src/modules/jobs/financialDivisionGroups.js';
import {buildFinancialExportRows,financialExportDivisions} from '../src/modules/jobs/jobFinancialExport.mjs';
const master={id:'m16',code:'16',name:'Electrical & Lighting',sort_order:16,is_active:true};
const project={id:'p16',code:'16',catalogue_division_id:'m16',catalogue_name:master.name,effective_name:'Local electrical',name_override:'Local electrical',catalogue_active:true};
const linked={id:'catalogued',cost_code:'16.1',budget_amount:100,actual_cost_amount:20,_financialName:{catalogue_division_id:'m16',catalogue_division_code:'16',catalogue_division_name:master.name,catalogue_active:true}};
const custom={id:'custom',cost_code:'16.5',category:'ohp_fee',is_protected_financial:true,is_job_only_custom:true,budget_amount:34131,forecast_final_amount:34131,project_division_id:null};
const options={catalogueDivisions:[master],projectDivisions:[project]};
test('Catalogue and unlinked custom rows share one canonical display group without reclassification',()=>{
 const rows=[linked,custom],before=structuredClone(rows),groups=groupFinancialDivisions(rows,options);assert.equal(groups.length,1);
 const [key,g]=groups[0];assert.equal(key,'master:m16');assert.equal(g.label,'Division 16 - Local electrical');assert.equal(g.projectDivisionId,'p16');assert.deepEqual(g.rows,rows);assert.deepEqual(rows,before);assert.equal(g.rows[1].category,'ohp_fee');assert.equal(g.rows[1].catalogue_line_id,undefined);
});
test('Group identity, labels, action target and totals are independent of row order and master renames',()=>{
 const rows=[linked,{...custom,project_division_id:'p16'},custom];const summarize=rows=>groupFinancialDivisions(rows,options).map(([key,g])=>({key,label:g.label,target:g.projectDivisionId,ids:g.rows.map(r=>r.id).sort(),budget:g.rows.reduce((n,r)=>n+(r.budget_amount||0),0)}));
 assert.deepEqual(summarize(rows),summarize([...rows].reverse()));const renamed=groupFinancialDivisions(rows,{...options,catalogueDivisions:[{...master,name:'Renamed master'}]});assert.equal(renamed[0][0],'master:m16');assert.equal(renamed[0][1].label,'Division 16 - Local electrical');
 const reset=groupFinancialDivisions(rows,{...options,projectDivisions:[{...project,name_override:null,effective_name:'Renamed master'}]});assert.equal(reset[0][1].label,'Division 16 - Renamed master');
});
test('Inferred Add Line is available without inventing a physical project division',()=>{
 const resolver=createFinancialDivisionResolver({rows:[linked,custom],catalogueDivisions:[master]});const context=resolver.resolve(custom);assert.equal(context.key,'master:m16');assert.equal(context.action,'add');assert.equal(context.projectDivisionId,null);assert.equal(validateFinancialDivisionEntry(context,{cost_code:'16.999'}),'');assert.match(validateFinancialDivisionEntry(context,{cost_code:'07.31'}),/beginning with 16/);assert.match(validateFinancialDivisionEntry(context,{cost_code:'CUSTOM'}),/beginning with 16/);
});
test('Explicit Add Line resolves active context even when no visible row references its ID',()=>{
 const context=createFinancialDivisionResolver(options).resolve(custom);assert.equal(context.projectDivisionId,'p16');assert.equal(context.projectDivision._financialName.effective_name,'Local electrical');assert.equal(validateFinancialDivisionEntry(context,{cost_code:'CUSTOM'}),'');assert.match(validateFinancialDivisionEntry(context,{cost_code:'07.99'}),/beginning with 16/);
});
test('Ambiguous physical or master codes never select an arbitrary inferred target',()=>{
 const other={...project,id:'other',effective_name:'Other electrical'};const r=createFinancialDivisionResolver({...options,projectDivisions:[project,other]});assert.equal(r.resolve(custom).action,'blocked');assert.equal(r.resolve({...custom,project_division_id:'other'}).projectDivisionId,'other');assert.deepEqual(r.choices().map(c=>c.projectDivisionId).sort(),['other','p16']);
 const duplicate=createFinancialDivisionResolver({catalogueDivisions:[master,{...master,id:'duplicate'}]});assert.equal(duplicate.resolve(custom).action,'blocked');
});
test('Retired entries remain grouped, archived targets are not reused, unassigned rows require a choice',()=>{
 const retired=createFinancialDivisionResolver({...options,catalogueDivisions:[{...master,is_active:false}]}).resolve(custom);assert.equal(retired.key,'master:m16');assert.equal(retired.action,'blocked');assert.match(retired.disabledReason,/retired/);
 const archived=createFinancialDivisionResolver({...options,projectDivisions:[{...project,archived_at:'2026-01-01'}]}).resolve(custom);assert.equal(archived.projectDivisionId,null);assert.equal(archived.action,'add');
 const unassigned=createFinancialDivisionResolver(options).resolve({id:'legacy-co',cost_code:'CO'});assert.equal(unassigned.key,'unassigned');assert.equal(unassigned.action,'choose');
});
test('An explicit custom project division wins over a conflicting numeric cost-code inference',()=>{
 const customDivision={id:'custom-project',code:'SPECIAL',name:'Special scope',archived_at:null};const context=createFinancialDivisionResolver({...options,projectDivisions:[project,customDivision]}).resolve({...custom,project_division_id:'custom-project'});assert.equal(context.key,'project:custom-project');assert.equal(context.code,'SPECIAL');assert.equal(context.projectDivisionId,'custom-project');
});
test('Numeric-prefix matching tolerates outer whitespace without changing the stored code',()=>{
 const row={...custom,cost_code:' 16.5 '},before=structuredClone(row);assert.equal(createFinancialDivisionResolver(options).resolve(row).key,'master:m16');assert.deepEqual(row,before);
});
test('Current export membership shares canonical grouping and retains every supplied amount',()=>{
 const rows=[linked,custom],before=structuredClone(rows),exported=buildFinancialExportRows(rows,new Map(),options);assert.equal(financialExportDivisions(exported).length,1);assert.equal(exported[0].projectDivisionKey,'m16');assert.equal(exported[1].projectDivisionName,'Local electrical');assert.equal(exported[1].budget,34131);assert.equal(exported[1].completionForecast,34131);assert.equal(exported[1].category,'ohp_fee');assert.deepEqual(rows,before);
});
