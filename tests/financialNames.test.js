import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeFinancialNames,resolvedDivisionLabel,resolvedLineName,financialNamePatch} from '../src/modules/jobs/financialNames.js';
import {buildFinancialExportRows,financialExportDivisions} from '../src/modules/jobs/jobFinancialExport.mjs';
import {planFinancialCatalogueImport} from '../src/modules/developer/financialCatalogueImport.js';

test('resolved names retain every original financial field, ID and stored description',()=>{
 const row={id:'line',job_id:'job',description:'Original issued label',project_division_id:'division',project_division:{id:'division',name:'Copied original',code:'07'},actual_cost_amount:6729.59,budget_amount:5500,current_budget_override_amount:0};
 const snapshot=JSON.stringify(row);
 const [resolved]=mergeFinancialNames([row],{lines:[{id:'line',catalogue_line_id:'master-line',effective_name:'Project roof',name_override:'Project roof'}],divisions:[{id:'division',code:'07',catalogue_division_id:'master-division',catalogue_name:'Master envelope',effective_name:'Local envelope',name_override:'Local envelope',name_version:2}]});
 assert.equal(resolvedLineName(resolved),'Project roof');
 assert.equal(resolvedDivisionLabel(resolved.project_division),'Division 07 - Local envelope');
 assert.equal(resolved.description,'Original issued label');
 assert.equal(resolved.actual_cost_amount,6729.59);assert.equal(resolved.current_budget_override_amount,0);
 assert.equal(JSON.stringify(row),snapshot);
 const exported=buildFinancialExportRows([resolved])[0];
 assert.equal(exported.description,'Project roof');assert.equal(exported.projectDivisionName,'Local envelope');assert.equal(exported.budget,0);
});

test('name-only override/reset payloads cannot include financial amounts or change identifiers',()=>{
 const line={id:'l',description:'Stored label',updated_at:'stamp',budget_amount:55};
 assert.deepEqual(financialNamePatch({line,value:'  Local name  '}),{id:'l',description:'Stored label',expected_updated_at:'stamp',name_override:'Local name'});
 assert.deepEqual(financialNamePatch({line,value:''}),{id:'l',description:'Stored label',expected_updated_at:'stamp',name_override:null});
 assert.deepEqual(financialNamePatch({line,division:{_financialName:{name_version:4}},value:'Local division'}),{id:'l',description:'Stored label',expected_updated_at:'stamp',project_division_name_override:'Local division',expected_division_name_version:4});
});

test('unlinked legacy lines use the unique existing project division name without creating links',()=>{
 const division={id:'d',code:'07',name:'Stored name',_financialName:{catalogue_division_id:'master-d',effective_name:'Local envelope'}};
 const rows=buildFinancialExportRows([{id:'a',cost_code:'07.1',description:'A',project_division:division,project_division_id:'d'},
  {id:'b',cost_code:'07.11',description:'B',project_division_id:null,_financialName:{catalogue_division_id:'master-d',catalogue_division_code:'07',catalogue_division_name:'Master envelope',effective_division_name:'Local envelope'}}]);
 assert.equal(rows[0].projectDivisionName,'Local envelope');assert.equal(rows[1].projectDivisionName,'Local envelope');
 assert.equal(financialExportDivisions(rows).length,1);
});

test('reviewed catalogue import preserves omitted defaults and optimistic versions',()=>{
 const catalogue={divisions:[{code:'07',name:'Thermal & Moisture Protection'}],lines:[{cost_code:'07.1',version:4,category:'labor',is_protected_financial:true,notes:'Retain note',subdivision_name:'Roof',sort_order:77}]};
 const planned=planFinancialCatalogueImport([{bad:'ignored'},{Division:'07 Thermal & Moisture Protection','Cost Code':'07.1',Name:'Roofing'}],catalogue)[0];
 assert.equal(planned.expected_version,4);assert.equal(planned.category,'labor');assert.equal(planned.is_protected_financial,true);assert.equal(planned.notes,'Retain note');assert.equal(planned.subdivision_name,'Roof');assert.equal(planned.sort_order,77);
 assert.throws(()=>planFinancialCatalogueImport([{Division:'07 Other name','Cost Code':'07.1',Name:'Roof'}],catalogue),/edit the master division first/);
 assert.throws(()=>planFinancialCatalogueImport([{Division:'07 Thermal & Moisture Protection','Cost Code':'07.1',Name:'A'},{Division:'07 Thermal & Moisture Protection','Cost Code':'07.1',Name:'B'}],catalogue),/Duplicate/);
});
