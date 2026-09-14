import test from 'node:test';
import assert from 'node:assert/strict';
import {directoryStatus} from '../src/modules/service-calls/serviceCallModel.js';
const today='2026-09-14';
const call=(invoices=[])=>({status:'complete',profile:{work_stage:'complete'},financials:{invoices}});
const invoice=(paid=0,due='2026-09-30')=>({status:'posted',revenue_excluding_tax:100,sales_tax:7.25,due_date:due,payments:[{amount:paid}]});
test('ready, invoiced, partial, paid, and overdue use ledger balances including tax',()=>{
 assert.equal(directoryStatus(call(),today).tone,'ready');
 assert.equal(directoryStatus(call([invoice()]),today).label,'Invoice Sent');
 assert.equal(directoryStatus(call([invoice(20)]),today).label,'Invoice Sent · Part paid');
 assert.equal(directoryStatus(call([invoice(100)]),today).stage,'invoice_sent');
 assert.deepEqual(directoryStatus(call([invoice(107.25)]),today),{stage:'payment_received',label:'Payment Received',tone:'paid'});
 assert.equal(directoryStatus(call([invoice(20,'2026-09-13')]),today).tone,'overdue');
 assert.equal(directoryStatus(call([invoice(0,today)]),today).tone,'');
 assert.equal(directoryStatus(call([invoice(0,null)]),today).tone,'');
});
test('void, archived and restricted records do not infer paid status or ready billing actions',()=>{
 const paid=call([invoice(107.25)]);
 assert.equal(directoryStatus({...paid,archived_at:today},today).tone,'');
 assert.equal(directoryStatus({...paid,profile:{work_stage:'void'}},today).label,'Void');
 assert.equal(directoryStatus({...paid,financials:null},today).tone,'');
 assert.equal(directoryStatus({...paid,financials:null},today).stage,'complete');
 assert.equal(directoryStatus(call([{...invoice(107.25),status:'void'}]),today).tone,'ready');
});
test('any unpaid overdue invoice takes precedence over other paid invoices',()=>{
 assert.equal(directoryStatus(call([invoice(107.25),invoice(0,'2026-09-01')]),today).tone,'overdue');
});
