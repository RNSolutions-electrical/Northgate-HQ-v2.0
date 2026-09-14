import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultAssemblyCategories,normalizeCategories,availableCategories,filterAssemblies} from '../src/modules/estimates/workbench/assemblyCategories.mjs';
test('assembly categories include the 12 defaults and deduplicate custom labels',()=>{
 assert.equal(defaultAssemblyCategories.length,12);
 assert.deepEqual(normalizeCategories(['Commercial',' commercial ','HVAC','']),['Commercial','HVAC']);
 assert.ok(availableCategories([{categories:['Old Work']}]).includes('Old Work'));
});
test('assembly search combines keywords and category, sorts without mutating the library',()=>{
 const library=[{name:'Z outlet',categories:['Commercial','Rough-in'],notes:'North wall',lines:[{name:'Copper conductor'}]},
  {name:'A lighting',categories:['Residential'],notes:'',lines:[]}];
 assert.equal(filterAssemblies(library,{query:'copper north',category:'Commercial'})[0].name,'Z outlet');
 assert.equal(filterAssemblies(library,{query:'copper',category:'Residential'}).length,0);
 assert.equal(filterAssemblies(library)[0].name,'A lighting');
 assert.equal(library[0].name,'Z outlet');
});
