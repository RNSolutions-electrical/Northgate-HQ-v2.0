import test from 'node:test';
import assert from 'node:assert/strict';
import {vendorAverage,laborHoursPerUnit,cataloguePayload} from '../src/lib/materialCatalogueDetails.mjs';
test('vendor prices normalize packaging before averaging and include explicit zero',()=>{
 assert.equal(vendorAverage([{price:100,quantity:100},{price:30,quantity:10},{price:0,quantity:1}]),4/3);
 assert.equal(vendorAverage([]),null);
 assert.throws(()=>vendorAverage([{price:'',quantity:1}]),/required/);
 assert.throws(()=>vendorAverage([{price:1,quantity:0}]),/positive|greater/);
 assert.throws(()=>vendorAverage([{price:Infinity,quantity:1}]),/finite/);
});
test('labor normalizes M, C, feet and each without guessing cross-unit conversion',()=>{
 assert.equal(laborHoursPerUnit({hours:24,per:1000,unit:'FT',units_per_catalogue_unit:1},'FT'),0.024);
 assert.equal(laborHoursPerUnit({hours:24,per:1000,unit:'FT',units_per_catalogue_unit:10},'EA'),0.24);
 assert.equal(laborHoursPerUnit({hours:12,per:100,unit:'EA',units_per_catalogue_unit:1},'EA'),0.12);
 assert.equal(laborHoursPerUnit({hours:0,per:1,unit:'EA',units_per_catalogue_unit:1},'EA'),0);
 assert.equal(laborHoursPerUnit({hours:''},'EA'),null);
 assert.throws(()=>laborHoursPerUnit({hours:1,per:0,unit:'EA',units_per_catalogue_unit:1},'EA'),/positive/);
 assert.throws(()=>laborHoursPerUnit({hours:1,per:1,unit:'EA',units_per_catalogue_unit:10},'EA'),/conversion of 1/);
});
test('optional suggested count stays unknown and links reject script schemes',()=>{
 const values={unit:'EA',price:'',aliases:' EMT\nEMT\nThinwall ',vendor_prices:[],neca_labor:{hours:''},stock:{in_stock:true,quantity:''}};
 assert.equal(cataloguePayload(values).stock.quantity,null);
 assert.deepEqual(cataloguePayload(values).aliases,['EMT','Thinwall']);
 assert.equal(cataloguePayload({...values,stock:{quantity:0}}).stock.quantity,0);
 assert.throws(()=>cataloguePayload({...values,vendor_prices:[{vendor:'V',price:1,quantity:1,url:'javascript:alert(1)'}]}),/https/);
});
