import test from 'node:test';
import assert from 'node:assert/strict';
import { dateOnly, profitDate, inProfitPeriod, profitYears, summarizeProfit, reverseServiceCharges } from '../src/modules/service-calls/serviceProfit.js';
const call=(revenue,cost,date='2026-03-31',extra={})=>({profile:{service_date:'2026-01-01'},financials:{
 invoices:[{status:'posted',invoice_date:date,revenue_excluding_tax:revenue,sales_tax:7.25,payments:[]}],
 costs:cost===null?[]:[{is_active:true,total_hard_cost:cost,reconciliation_status:'final'}]},...extra});
test('profit summary uses weighted margin, net revenue and each cost once',()=>{
 const result=summarizeProfit([call(100,20),call(900,630)],{year:2026,quarter:'1'});
 assert.equal(result.profit,350);assert.equal(result.margin,35);assert.equal(result.revenue,1000);assert.equal(result.cost,650);
});
test('quarter boundaries, year, YTD cutoff and leap dates are explicit',()=>{
 assert.equal(dateOnly('2026-02-29'),null);assert.equal(dateOnly('2024-02-29'),'2024-02-29');
 assert.equal(dateOnly('0.32'),null);assert.equal(dateOnly('N/A'),null);
 assert.equal(inProfitPeriod(call(1,0,'2026-04-01'),{year:2026,quarter:1}),false);
 assert.equal(inProfitPeriod(call(1,0,'2026-03-31'),{year:2026,quarter:1}),true);
 assert.equal(inProfitPeriod(call(1,0,'2025-03-31'),{year:2026,quarter:1}),false);
 assert.equal(inProfitPeriod(call(1,0,'2026-12-31'),{year:2026,through:'2026-09-14'}),false);
});
test('void excluded, archived history retained, unavailable values not fabricated',()=>{
 const result=summarizeProfit([call(100,20,null),call(100,null),call(100,20,undefined,{archived_at:'2026-04-01'}),
  call(500,0,undefined,{profile:{work_stage:'void'}}),{financials:null}],{year:2026});
 assert.equal(result.profit,80);assert.equal(result.voids,1);assert.equal(result.included,1);
 assert.equal(result.missingCost,1);assert.equal(result.undated,1);
 assert.equal(summarizeProfit([call(100,null)],{year:2026}).profit,null);
 assert.equal(summarizeProfit([call(0,20)],{year:2026}).margin,null);
});
test('call reporting dates avoid double-counting multi-invoice costs',()=>{
 const c=call(100,40);c.financials.invoices.push({status:'posted',invoice_date:'2026-04-02',revenue_excluding_tax:100,sales_tax:0,payments:[{payment_date:'2026-07-02'}]});
 c.financials.invoices.push({status:'void',invoice_date:'2027-01-01',revenue_excluding_tax:999});
 assert.equal(profitDate(c),'2026-04-02');assert.equal(profitDate(c,'paid'),'2026-07-02');assert.equal(profitDate(c,'service'),'2026-01-01');
 assert.equal(summarizeProfit([c],{year:2026,quarter:1}).profit,null);
 assert.equal(summarizeProfit([c],{year:2026,quarter:2}).profit,160);
 assert.deepEqual(profitYears([c,call(10,5,'2025-01-01')],'invoice',2026),[2026,2025]);
});
test('preliminary costs remain visibly provisional',()=>{
 const c=call(100,20);c.financials.costs[0].reconciliation_status='preliminary';
 assert.equal(summarizeProfit([c],{year:2026}).preliminary,1);
});
test('inverse tax and final card fee reconcile exactly to cents',()=>{
 assert.deepEqual(reverseServiceCharges(110.47,{includesTax:true,includesCardFee:true}),{status:'reconciled',matches:[{subtotal:100,tax:7.25,cardFee:3.22,total:110.47}]});
 assert.deepEqual(reverseServiceCharges(107.25,{includesTax:true,includesCardFee:false}).matches[0],{subtotal:100,tax:7.25,cardFee:0,total:107.25});
 assert.equal(reverseServiceCharges(103,{includesTax:false,includesCardFee:true}).matches[0].subtotal,100);
 assert.equal(reverseServiceCharges(100,{includesTax:false,includesCardFee:false}).matches[0].subtotal,100);
 assert.throws(()=>reverseServiceCharges(100,{}));assert.throws(()=>reverseServiceCharges(-100,{includesTax:true,includesCardFee:true}));
});
test('inverse calculation flags impossible cent totals instead of forcing a plug',()=>{
 let checked=0;
 for(let net=0;net<2000;net++){
  const tax=Math.round(net*725/10000),fee=Math.round((net+tax)*3/100),gross=net+tax+fee;
  const result=reverseServiceCharges(gross/100,{includesTax:true,includesCardFee:true});
  assert.equal(result.status,'reconciled');assert.equal(result.matches[0].subtotal,net/100);checked++;
 }
 assert.equal(checked,2000);
 assert.equal(reverseServiceCharges(.07,{includesTax:true,includesCardFee:true}).status,'review');
});
