import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueCreateSeed,linkCataloguePreservingEstimate,makeCatalogueCreatePayload,possibleCatalogueDuplicates} from './catalogueLineCreate.mjs';

const original={id:'resource',name:'Custom conduit',unit:'FT',price:'12.50',hours:'0.3',qty:'17',priceOverride:true,overrideSource:'estimate_only',laborOverride:true,notes:'Job only',fixed:true,stage:'Trim',materialDiscount:{type:'percent',value:10}};
const material={id:'saved',name:'Catalog conduit',unit:'FT',material_code:'C-FT',price:9,hours:null,updated_at:'today',item_aliases:[{alias:'Custom conduit'}]};

test('catalogue create seeds reusable details but does not promote a job price or labor',()=>{
 assert.deepEqual(catalogueCreateSeed(original),{name:'Custom conduit',material_code:'',unit:'FT',price:''});
 assert.equal(catalogueCreateSeed({...original,priceOverride:false,priceSource:'estimating_master',price:0}).price,0);
 assert.equal(catalogueCreateSeed({...original,priceOverride:true,priceSource:'estimating_master'}).price,'');
 const payload=makeCatalogueCreatePayload({...catalogueCreateSeed(original),material_code:' C-FT ',price:'0'});
 assert.equal(payload.material_code,'C-FT');assert.equal(payload.price,'0');
 for(const field of ['qty','hours','notes','stage','materialDiscount','fixed','priceOverride'])assert.ok(!(field in payload));
 assert.equal(payload.neca_labor.hours,'');assert.equal(payload.stock.in_stock,false);
 assert.throws(()=>makeCatalogueCreatePayload(catalogueCreateSeed(original)),/catalogue number/i);
});

test('duplicate candidates match case-insensitive codes or same-unit descriptions and active aliases',()=>{
 assert.deepEqual(possibleCatalogueDuplicates([material],{name:'Custom  CONDUIT',unit:'ft',material_code:''}),[material]);
 assert.deepEqual(possibleCatalogueDuplicates([material],{name:'Unrelated',unit:'EA',material_code:' c-ft '}),[material]);
 assert.deepEqual(possibleCatalogueDuplicates([material],{name:'Custom conduit',unit:'EA',material_code:''}),[]);
 assert.deepEqual(possibleCatalogueDuplicates([{...material,item_aliases:[{alias:'Custom conduit',archived_at:'old'}]}],{name:'Custom conduit',unit:'FT',material_code:''}),[]);
});

test('linking preserves the entire estimate row while tracking differences as estimate-specific',()=>{
 const linked=linkCataloguePreservingEstimate(original,material);
 assert.deepEqual(linked,{...original,catalogueId:'saved',catalogueUpdatedAt:'today'});
 assert.notStrictEqual(linked,original);
 assert.throws(()=>linkCataloguePreservingEstimate(original,{...material,unit:'EA'}),/same unit/);
 assert.equal(linkCataloguePreservingEstimate({...original,priceOverride:false},material).priceOverride,true);
 assert.equal(linkCataloguePreservingEstimate({...original,laborOverride:false},material).laborOverride,true);
});

test('Default editor routes writes through the existing permission-checked save and hydrates the live catalogue',()=>{
 const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
 assert.match(read('./BlankSlateEditor.jsx'),/canEditCatalog&&onCatalogueMaterial&&!line.catalogueId/);
 assert.match(read('./WorkbenchRoute.jsx'),/!permissions.canEditCatalog\|\|personalMode/);
 assert.match(read('./WorkbenchRoute.jsx'),/db.rpc\('save_full_material_catalogue'/);
 assert.match(read('./WorkbenchRoute.jsx'),/setCatalogue\(\[\.\.\.catalogue.filter\(item=>item.id!==saved.id\),saved\]\)/);
 assert.doesNotMatch(read('./CatalogueLineCreate.jsx'),/\.rpc\(/);
});
