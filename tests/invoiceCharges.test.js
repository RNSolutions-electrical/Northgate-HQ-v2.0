import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceCharges } from '../src/modules/service-calls/invoiceCharges.js';
import { invoiceBalance,callFinancials,directoryStatus } from '../src/modules/service-calls/serviceCallModel.js';
test('invoice charges round sequentially and support zero rates',()=>{
 assert.deepEqual(invoiceCharges('100','7.25','3'),{subtotal:100,salesTax:7.25,creditCardFee:3.22,total:110.47});
 assert.equal(invoiceCharges('100','0','0').total,100);
 assert.equal(invoiceCharges('.01','7.25','3').total,.01);
 for(const bad of ['','NaN','Infinity','-1','100.001','101']) assert.throws(()=>invoiceCharges('100',bad,'3'));
 assert.throws(()=>invoiceCharges('1.001','7.25','3'));
});
test('pass-through fees affect collection and paid status, never profit',()=>{
 const invoice={status:'posted',revenue_excluding_tax:100,sales_tax:7.25,credit_card_fee:3.22,payments:[{amount:107.25}]};
 const call={profile:{work_stage:'complete'},financials:{invoices:[invoice],costs:[{is_active:true,total_hard_cost:60}]}};
 assert.equal(invoiceBalance(invoice),3.22);assert.equal(callFinancials(call).profit,40);
 assert.equal(callFinancials(call).margin,40);assert.equal(callFinancials(call).cardFee,3.22);
 assert.notEqual(directoryStatus(call).stage,'payment_received');
 invoice.payments.push({amount:3.22});assert.equal(invoiceBalance(invoice),0);
 assert.equal(directoryStatus(call).stage,'payment_received');assert.equal(callFinancials(call).profit,40);
 delete invoice.credit_card_fee; invoice.payments=[{amount:107.25}];assert.equal(invoiceBalance(invoice),0);
});
