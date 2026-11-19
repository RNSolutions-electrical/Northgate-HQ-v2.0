import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogueEditSeed,applyCatalogueFields} from './catalogueLineEdit.mjs';
const line={id:'row',catalogueId:'material',name:'Row description',unit:'EA',qty:7,price:5,hours:2,priceOverride:true,overrideSource:'estimate_only',materialDiscount:{type:'percent',value:10},laborDiscount:{type:'amount',value:3},fixed:true,stage:'Trim',notes:'Keep me'};
const material={id:'material',unit:'EA',name:'Shared description',estimating_price_per_unit:null,labor_rate_hrs:null,hours:null,price:9,updated_at:'new',priceSource:'estimating_master'};
test('fills only blank catalogue values and preserves valid zero',()=>{
 const seeded=catalogueEditSeed(line,material);assert.equal(seeded.estimating_price_per_unit,5);assert.equal(seeded.neca_labor_input.hours,2);assert.equal(material.estimating_price_per_unit,null);
 const zero=catalogueEditSeed(line,{...material,estimating_price_per_unit:0,labor_rate_hrs:0,hours:0,neca_labor_input:{hours:0,per:1,unit:'EA',units_per_catalogue_unit:1}});assert.equal(zero.estimating_price_per_unit,0);assert.equal(zero.neca_labor_input.hours,0);
});
test('rejects stale links, missing materials, different units and labor-only rows',()=>{
 for(const [l,m] of [[line,null],[line,{...material,id:'other'}],[{...line,unit:'FT'},material],[{...line,blankResourceKind:'labor'},material]])assert.throws(()=>catalogueEditSeed(l,m));
});
test('no automatic row changes; chosen fields only, all unrelated overrides preserved',()=>{
 assert.deepEqual(applyCatalogueFields(line,material,[]),line);
 const next=applyCatalogueFields(line,{...material,hours:4},['name','hours']);assert.equal(next.name,'Shared description');assert.equal(next.hours,4);assert.equal(next.price,5);assert.equal(next.priceOverride,true);assert.deepEqual(next.materialDiscount,line.materialDiscount);assert.equal(next.qty,7);assert.equal(next.stage,'Trim');assert.equal(next.notes,'Keep me');
 const price=applyCatalogueFields(line,material,['price']);assert.equal(price.price,9);assert.equal(price.priceOverride,undefined);assert.equal(price.overrideSource,undefined);assert.equal(price.priceSource,'estimating_master');assert.equal(line.priceOverride,true);
});
test('Default editor uses existing permission-gated shared save with isolated modal and retained work draft',()=>{
 const ui=readFileSync(new URL('./BlankSlateEditor.jsx',import.meta.url),'utf8'),route=readFileSync(new URL('./WorkbenchRoute.jsx',import.meta.url),'utf8'),dialog=readFileSync(new URL('./CatalogueLineEditor.jsx',import.meta.url),'utf8');
 assert.match(route,/<BlankSlateEditor canEditCatalog=\{permissions.canEditCatalog&&!permissions.personalOnly\}/);assert.match(ui,/canEditCatalog&&onCatalogueMaterial&&line.catalogueId/);assert.match(ui,/catalogueSaved.current.set\(saved.id,saved\)/);assert.match(dialog,/useState\(\[\]\)/);assert.match(dialog,/even if you later cancel this work item/);assert.doesNotMatch(dialog,/\.rpc\(/);assert.match(ui,/l.catalogueId=''/);
});

test('inherited effective price is not promoted to estimating master; manual or unknown can suggest',()=>{
 const inherited={...line,priceOverride:false,priceSource:'inventory_explicit'};
 assert.equal(catalogueEditSeed(inherited,material).estimating_price_per_unit,null);
 assert.equal(catalogueEditSeed({...inherited,priceSource:'legacy_catalogue'},material).estimating_price_per_unit,null);
 assert.equal(catalogueEditSeed({...inherited,priceSource:'manual'},material).estimating_price_per_unit,5);
 assert.equal(catalogueEditSeed(inherited,{...material,price:null}).estimating_price_per_unit,5);
 assert.equal(catalogueEditSeed(inherited,{...material,price:0}).estimating_price_per_unit,null);
});
test('explicit hours refresh clears only labor override bookkeeping',()=>{
 const before={...line,laborOverride:true};
 assert.equal(applyCatalogueFields(before,material,['hours']).laborOverride,undefined);
 assert.equal(applyCatalogueFields(before,material,['name']).laborOverride,true);
 assert.equal(applyCatalogueFields(before,material,['hours']).priceOverride,true);
});

test('catalogue save returns refreshed row after alias-trigger timestamp changes',()=>{
 const source=readFileSync(new URL('./WorkbenchRoute.jsx',import.meta.url),'utf8');
 assert.match(source,/setCatalogue\(fresh\);return fresh.find\(item=>item.id===saved.id\)\|\|saved/);
});
