import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueMaterial,catalogueChanges,cataloguePriceSnapshot,loadCatalogue} from '../src/modules/estimates/workbench/catalogueService.js';
test('missing values are not confirmed zeroes',()=>{
 assert.equal(catalogueMaterial({price_per_unit:0,labor_rate_hrs:null}).price,null);
 assert.equal(catalogueMaterial({price_per_unit:0,price_confirmed:true,labor_rate_hrs:0}).price,0);
 assert.equal(catalogueMaterial({price_per_unit:1,labor_rate_hrs:null}).hours,null);
});
test('catalogue material exposes effective source and immutable snapshot metadata',()=>{
 const material=catalogueMaterial({price_per_unit:7.8,price_confirmed:true,effective_price_source:'inventory_explicit',inventory_price_updated_at:'2026-09-21T10:00:00Z'});
 assert.equal(material.price,7.8);
 assert.equal(material.priceSource,'inventory_explicit');
 assert.deepEqual(cataloguePriceSnapshot(material,'2026-09-21T11:00:00Z'),{
  priceSource:'inventory_explicit',priceSourceUpdatedAt:'2026-09-21T10:00:00Z',priceSnapshotAt:'2026-09-21T11:00:00Z'
 });
});
test('catalogue patches contain only edited nonblank fields and reject conflicting duplicates',()=>{
 const materials=[{id:'a',unit:'EA',updated_at:null}];
 const line={catalogueId:'a',unit:'EA',price:'0',hours:'',priceOverride:true,laborOverride:true};
 assert.deepEqual(catalogueChanges([line],materials),[{item_id:'a',expected_updated_at:null,changes:{price_per_unit:0}}]);
 assert.throws(()=>catalogueChanges([line,{...line,price:5}],materials),/conflicting/);
 assert.throws(()=>catalogueChanges([{...line,unit:'FT'}],materials),/original material unit/);
 assert.deepEqual(catalogueChanges([{...line,priceOverride:false,laborOverride:false}],materials),[]);
});
test('catalogue reads beyond the first 1000 items',async()=>{
 const data=Array.from({length:1615},(_,id)=>({id,price_per_unit:0}));
 const client={from(){const q={select:()=>q,eq:()=>q,order:()=>q,range:async(a,b)=>({data:data.slice(a,b+1)})};return q;}};
 assert.equal((await loadCatalogue(client)).length,1615);
});
