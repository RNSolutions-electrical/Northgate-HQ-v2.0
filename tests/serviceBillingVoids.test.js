import test from 'node:test';
import assert from 'node:assert/strict';
import {activePayments, invoiceBalance, callFinancials, directoryStatus} from '../src/modules/service-calls/serviceCallModel.js';
import {profitDate} from '../src/modules/service-calls/serviceProfit.js';
test('Voided payments preserve history but do not count as collections or reporting dates',()=>{
 const invoice={status:'posted',revenue_excluding_tax:100,sales_tax:7.25,credit_card_fee:3.22,payments:[
  {amount:50,payment_date:'2026-01-01'},{amount:60.47,payment_date:'2026-04-01',voided_at:'2026-09-14'}]};
 const call={profile:{work_stage:'complete'},financials:{invoices:[invoice],costs:[]}};
 assert.equal(activePayments(invoice).length,1);
 assert.equal(invoiceBalance(invoice),60.47);
 assert.equal(callFinancials(call).collected,50);
 assert.equal(callFinancials(call).billingStatus,'Part paid');
 assert.equal(profitDate(call,'paid'),'2026-01-01');
 assert.equal(invoice.payments.length,2);
});
test('Voided invoice is excluded from revenue and returns completed call to invoice-ready status',()=>{
 const call={profile:{work_stage:'complete'},financials:{invoices:[
  {status:'void',revenue_excluding_tax:100,sales_tax:7.25,credit_card_fee:3.22,payments:[{amount:110.47}]}
 ],costs:[]}};
 assert.equal(callFinancials(call).revenue,0);
 assert.equal(callFinancials(call).collected,0);
 assert.equal(callFinancials(call).outstanding,0);
 assert.equal(directoryStatus(call).tone,'ready');
 assert.equal(profitDate(call,'paid'),null);
});
