import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblyLibraryCsv} from '../src/modules/estimates/workbench/assemblyExport.mjs';
test('assembly backup includes identifiers, components and safely quoted notes',()=>{
 const csv=assemblyLibraryCsv([{id:'a',name:'=formula',notes:'Notes, with "quotes"',division:'Electrical',lines:[{id:'line',catalogueId:'material',name:'Wire',qty:2,price:0,hours:null,stage:'Trim-out',fixed:true}]}]);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=formula"'));assert.ok(csv.includes('"Notes, with ""quotes"""'));
 assert.ok(csv.includes('"material"'));assert.ok(csv.includes('"Trim-out","true"'));assert.ok(csv.includes('"0",""'));
});
