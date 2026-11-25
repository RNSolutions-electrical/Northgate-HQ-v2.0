import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDocument,blankEstimateSummary,blankSumPricing} from './blankSlate.mjs';

const resource=(name,qty,hours,price=0,extra={})=>({name,qty,hours,price,...extra});

test('summary uses exact resource sales after line adjustments without allocating estimate charges',()=>{
 const data={...blankDocument(),materialMarkup:20,rate:60,blankSlateHardRate:30,feePercent:10,estimateDiscount:{type:'percent',value:10},proposal:{salesTaxPercent:5,creditCardPercent:3}};
 const items=[{qty:2,lines:[
  resource('Conduit',3,.25,5,{blankResourceKind:'material',materialAdjustment:{direction:'discount',type:'amount',value:6}}),
  resource('Supervision Labor',1,2,0,{fixed:true,laborAdjustment:{direction:'addition',type:'amount',value:5}}),
  resource('Estimating Labor',1,1.25),
  resource('Troubleshooting Labor (Mechanic)',1,1),
  resource('Additional labor',1,.5),
 ],blankQuotes:[{id:'reference',mode:'reference',cost:''},{id:'included',mode:'add',cost:10,markup:25}]}];
 const {materialSell,laborSell,quoteSell,hoursByRole,...totals}=blankEstimateSummary(items,data);
 assert.deepEqual(totals,blankSumPricing(items,data));
 assert.deepEqual(hoursByRole,{field:3.5,supervision:2,estimating:2.5,unclassified:1});
 assert.equal(totals.hours,9);
 assert.deepEqual([totals.material,totals.labor,totals.other],[30,270,20]);
 assert.deepEqual([materialSell,laborSell,quoteSell],[30,545,25]);
 assert.equal(materialSell+laborSell+quoteSell,totals.subtotal);
 assert.notEqual(totals.price,totals.subtotal);
});

test('replacement quotes suppress their resource costs, selling prices and hours',()=>{
 const data={...blankDocument(),rate:100,blankSlateHardRate:50,blankWorkDrafts:[{item:{qty:1,lines:[resource('Supervision Labor',1,99)]}}]};
 const items=[{qty:3,lines:[resource('Estimating Labor',1,9)],blankQuotes:[{id:'replace',mode:'replace',cost:100}]}];
 const result=blankEstimateSummary(items,data);
 assert.deepEqual(result.hoursByRole,{field:0,supervision:0,estimating:0,unclassified:0});
 assert.deepEqual([result.materialSell,result.laborSell,result.quoteSell,result.hours,result.cost,result.price],[0,0,300,0,300,300]);
});
