import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMaterials,searchMaterials,canEditMaterialAliases} from '../src/lib/materialResolver.js';
import {buildStockMaterials} from '../src/modules/inventory/inventorySearch.js';
const items=[
 {id:'a',material_code:'FMC-050',name:'Flexible Metal Conduit 1/2',item_aliases:[{alias:'Greenfield'},{alias:'flex'},{alias:'FMC'},{alias:'old slang',archived_at:'2026-01-01'}]},
 {id:'b',material_code:'FMC-075',name:'Flexible Metal Conduit 3/4',item_aliases:[{alias:'Greenfield'},{alias:'flex'}]},
 {id:'c',material_code:'XYZ',name:'Greenfield',item_aliases:[]},
];
test('identifier and canonical exact match precede aliases; duplicate slang stays ambiguous',()=>{
 assert.equal(resolveMaterials(items,'FMC-050').candidates[0].item.id,'a');
 assert.equal(resolveMaterials(items,'a').candidates[0].match,'identifier');
 const result=resolveMaterials(items,'Greenfield');assert.equal(result.candidates[0].item.id,'c');
 assert.equal(resolveMaterials(items.slice(0,2),' GREENFIELD ').ambiguous,true);
 assert.equal(resolveMaterials(items,'flex').requiresConfirmation,true);
 assert.equal(searchMaterials(items,'old slang').length,0);
});
test('normalized and fuzzy suggestions never change canonical records or match a different fractional size',()=>{
 const before=structuredClone(items);
 assert.equal(searchMaterials(items,'FMC 050')[0].id,'a');
 assert.equal(resolveMaterials(items,'Greenfeld').candidates[0].match,'suggestion');
 assert.equal(searchMaterials(items,'conduit 3/4')[0].id,'b');
 assert.equal(searchMaterials(items,'conduit 1/4').length,0);
 assert.deepEqual(items,before);assert.equal(searchMaterials(items,'does not exist').length,0);
 assert.equal(searchMaterials(items,'').length,3);
});
test('mapping without balance remains different from confirmed zero in inventory summary',()=>{
 const rows=buildStockMaterials(items,[{item_id:'a',bin_id:'bin',quantity_on_hand:0,quantity_recorded:false},{item_id:'b',bin_id:'bin',quantity_on_hand:0,quantity_recorded:true}],{search:'flex'});
 assert.equal(rows.find(r=>r.id==='a').uncountedLocations,1);
 assert.equal(rows.find(r=>r.id==='b').uncountedLocations,0);
});
test('catalogue alias controls respect server permission and department scope',()=>{
 assert.equal(canEditMaterialAliases({role:'Manager',canEditCatalog:true,permissionSource:'server'},'Construction'),true);
 assert.equal(canEditMaterialAliases({role:'Supervisor',canEditCatalog:true,department:'Electrical',permissionSource:'server'},'Construction'),false);
 assert.equal(canEditMaterialAliases({role:'Developer',canEditCatalog:true,permissionSource:'fallback'},'Electrical'),false);
});
