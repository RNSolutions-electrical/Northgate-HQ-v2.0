import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDocument,blankSumPricing} from './blankSlate.mjs';
import {beginWorkEdit,includeWorkEdit,removeWorkItem} from './blankWorkEditing.mjs';
const doc=()=>({...blankDocument(),rate:60,blankSlateHardRate:35,materialMarkup:20});
const valid=()=>({id:'i',name:'Outlet',qty:2,lines:[{id:'m',qty:1,price:10,hours:.5}]});
test('uncommitted editing does not change saved values or totals',()=>{const d=doc();d.entries=[{id:'e',items:[valid()]}];const edit=beginWorkEdit(d.entries[0],d.entries[0].items[0],d);edit.item.lines[0].price=100;assert.equal(d.entries[0].items[0].lines[0].price,10);assert.equal(blankSumPricing(d.entries.flatMap(e=>e.items),d).price,84);const result=includeWorkEdit(d,edit);assert.equal(result.entries[0].items[0].lines[0].price,100);assert.equal(d.entries[0].items[0].lines[0].price,10);});
test('new work retains pricing defaults and only enters totals when included',()=>{const d=doc(),e=beginWorkEdit(null,null,d,'new');assert.equal(e.item.laborRateOverride,60);assert.equal(d.entries.length,0);e.item={...e.item,...valid()};const next=includeWorkEdit(d,e);assert.equal(next.entries.length,1);assert.equal(d.entries.length,0);});
test('invalid work is rejected without touching originals',()=>{const d=doc(),e=beginWorkEdit(null,null,d,'x');assert.throws(()=>includeWorkEdit(d,e),/description/);e.item=valid();e.item.qty=0;assert.throws(()=>includeWorkEdit(d,e),/greater than zero/);});
test('remove one item preserves siblings and unrelated entries',()=>{const d=doc();d.entries=[{id:'e',items:[valid(),{...valid(),id:'s'}]},{id:'other',items:[{...valid(),id:'o'}]}];assert.deepEqual(removeWorkItem(d,'e','i').entries.map(e=>e.items.map(i=>i.id)),[['s'],['o']]);assert.equal(d.entries[0].items.length,2);});

test('work and resource review state survives include, serialization and reopen without repricing',()=>{
 const d=doc(),item=valid();d.entries=[{id:'e',items:[item]}];
 const before=blankSumPricing([item],d);
 const edit=beginWorkEdit(d.entries[0],item,d);edit.item.internalReview=true;edit.item.lines[0].internalReview=true;
 const included=JSON.parse(JSON.stringify(includeWorkEdit(d,edit)));
 assert.deepEqual(blankSumPricing(included.entries[0].items,included),before);
 assert.equal(item.internalReview,undefined);assert.equal(item.lines[0].internalReview,undefined);
 const reopened=beginWorkEdit(included.entries[0],included.entries[0].items[0],included);
 assert.equal(reopened.item.internalReview,true);assert.equal(reopened.item.lines[0].internalReview,true);
 reopened.item.lines[0].internalReview=false;
 assert.equal(includeWorkEdit(included,reopened).entries[0].items[0].lines[0].internalReview,false);
});
