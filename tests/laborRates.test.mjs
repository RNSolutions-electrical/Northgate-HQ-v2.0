import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveLaborRate,normalizeLaborRates,newLaborRates,inheritAssemblyRate,setEstimateRate,refreshLaborRates,rateNumber,validateLaborRates} from '../src/modules/estimates/workbench/laborRates.mjs';
import {assemblyLibrarySave} from '../src/modules/estimates/workbench/assemblyLibrary.mjs';
import {itemPricing} from '../src/modules/estimates/workbench/pricing.mjs';
import {copyWorkItem} from '../src/modules/estimates/workbench/componentStructure.mjs';
import {loadAssemblyLibrary} from '../src/modules/estimates/workbench/catalogueService.js';
import {pasteWorkItem} from '../src/modules/estimates/workbench/estimateClipboard.mjs';
import {makeTemplate} from '../src/modules/estimates/workbench/model.mjs';
const assembly={id:'a',libraryId:'a',name:'Outlet',libraryLaborRateOverride:90,qty:1,lines:[{name:'Labor',qty:1,price:0,hours:2}]};
const draft=()=>newLaborRates({rate:75,entries:[{items:[]}],materialMarkup:0,feePercent:0},{default_rate:80});
test('four-level precedence including explicit zero at each override level',()=>{
 const d=draft(),i=inheritAssemblyRate(copyWorkItem(assembly),assembly);
 assert.equal(effectiveLaborRate(i,d).rate,90);
 assert.equal(effectiveLaborRate({...i,libraryLaborRateSnapshot:null},d).rate,80);
 assert.equal(effectiveLaborRate(i,setEstimateRate(d,100)).rate,100);
 assert.equal(effectiveLaborRate({...i,laborRateOverride:110},setEstimateRate(d,100)).rate,110);
 assert.equal(effectiveLaborRate({...i,laborRateOverride:0},d).rate,0);
 assert.equal(effectiveLaborRate(i,setEstimateRate(d,0)).rate,0);
 assert.equal(effectiveLaborRate({...i,libraryLaborRateSnapshot:0},d).rate,0);
 assert.equal(effectiveLaborRate({},newLaborRates(d,{default_rate:0})).rate,0);
});
test('legacy rate and item overrides retain historical pricing on normalization',()=>{
 const old={rate:67,entries:[{items:[{...assembly,laborRateOverride:0}]}]};
 const d=normalizeLaborRates(old);assert.equal(d.estimateLaborRateOverride,67);
 assert.equal(effectiveLaborRate({},d).rate,67);assert.equal(effectiveLaborRate(d.entries[0].items[0],d).rate,0);
 assert.equal(old.laborRateVersion,undefined);assert.deepEqual(normalizeLaborRates(d),d);
});
test('save/reload library override, valid zero and reset; project override is excluded',()=>{
 for(const rate of [null,0,95]){
  const a=assemblyLibrarySave({...assembly,libraryLaborRateOverride:rate,laborRateOverride:150},{editingLibrary:true});
  assert.equal(JSON.parse(JSON.stringify(a)).libraryLaborRateOverride,rate);assert.equal(a.laborRateOverride,undefined);
 }
});
test('copied assemblies snapshot their source and rate without an estimate override',()=>{
 const i=inheritAssemblyRate(copyWorkItem(assembly),assembly);
 assert.equal(i.sourceAssemblyId,'a');assert.equal(i.libraryLaborRateSnapshot,90);assert.equal(i.laborRateOverride,null);
 assert.notEqual(i.id,assembly.id);assert.equal(i.libraryId,undefined);
});
test('library changes and library reload do not silently change saved estimate pricing',()=>{
 const d=draft(),i=inheritAssemblyRate(copyWorkItem(assembly),assembly);d.entries[0].items=[i];
 const next={...d,library:[{...assembly,libraryLaborRateOverride:140}]};
 assert.equal(itemPricing(i,next).labor,180);assert.equal(effectiveLaborRate(i,JSON.parse(JSON.stringify(next))).rate,90);
});
test('explicit refresh updates inherited snapshots, preserves overrides, and is idempotent',()=>{
 const d=draft();d.entries[0].items=[inheritAssemblyRate(copyWorkItem(assembly),assembly),{...assembly,laborRateOverride:120}];
 const updated=refreshLaborRates(d,[{...assembly,libraryLaborRateOverride:0}],{default_rate:85});
 assert.equal(effectiveLaborRate(updated.entries[0].items[0],updated).rate,0);
 assert.equal(effectiveLaborRate(updated.entries[0].items[1],updated).rate,120);
 assert.equal(effectiveLaborRate(d.entries[0].items[0],d).rate,90,'preview leaves draft unchanged');
 assert.deepEqual(refreshLaborRates(updated,[{...assembly,libraryLaborRateOverride:0}],{default_rate:85}),updated);
 const explicit=setEstimateRate(d,77),refreshed=refreshLaborRates(explicit,[assembly],{default_rate:85});assert.equal(refreshed.estimateLaborRateOverride,77);assert.equal(effectiveLaborRate(refreshed.entries[0].items[0],refreshed).rate,77);
});
test('removed sources retain snapshot, reset override inherits, locked estimates reject refresh',()=>{
 const d=draft();d.entries[0].items=[inheritAssemblyRate(copyWorkItem(assembly),assembly)];
 const refreshed=refreshLaborRates(d,[],{default_rate:85});assert.equal(refreshed.entries[0].items[0].libraryLaborRateSnapshot,90);
 assert.equal(setEstimateRate(setEstimateRate(d,100),null).estimateLaborRateOverride,null);
 assert.throws(()=>refreshLaborRates({...d,approvedAt:'locked'},[],{default_rate:85}),/Approved/);
});
test('finite nonnegative decimal validation, absent override versus zero',()=>{
 for(const v of ['',null,undefined,-1,'NaN','Infinity','1e3','1x',1000000001])assert.throws(()=>rateNumber(v));
 for(const [input,expected] of [['.2',.2],['7.',7],[0,0],['1000000000',1000000000]])assert.equal(rateNumber(input),expected);
 assert.equal(rateNumber('',{optional:true}),null);
 const d=draft();d.entries[0].items=[{...assembly,laborRateOverride:-1}];assert.throws(()=>validateLaborRates(d));
});
test('library loader selects and reloads saved nullable/zero hourly override within division',async()=>{
 const filters=[],selections=[];
 const client={from(){const query={select(fields){selections.push(fields);return query;},eq(k,v){filters.push([k,v]);return query;},is(){return query;},order(){return query;},async range(){return {data:[{id:'a',name:'Zero',division:'Electrical',labor_rate_override:0,assembly_items:[]},{id:'b',name:'Inherited',labor_rate_override:null,assembly_items:[]}]};}};return query;}};
 const rows=await loadAssemblyLibrary(client,'Electrical');
 assert.equal(rows[0].libraryLaborRateOverride,0);assert.equal(rows[1].libraryLaborRateOverride,null);
 assert.ok(selections[0].includes('labor_rate_override'));assert.ok(filters.some(([k,v])=>k==='division'&&v==='Electrical'));
});
test('clipboard and template copies preserve snapshots and explicit overrides',()=>{
 const d=draft();d.name='Fixture';d.sections=[];d.entries[0].items=[{...inheritAssemblyRate(copyWorkItem(assembly),assembly),laborRateOverride:0}];
 const copied=pasteWorkItem(d.entries[0].items[0],[]);assert.equal(copied.laborRateOverride,0);assert.equal(copied.libraryLaborRateSnapshot,90);assert.equal(copied.sourceAssemblyId,'a');
 const template=makeTemplate(setEstimateRate(d,0),'Template',true);assert.equal(template.estimateLaborRateOverride,0);assert.equal(template.libraryDefaultRateSnapshot,80);assert.equal(template.entries[0].items[0].laborRateOverride,0);
});
