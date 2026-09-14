import test from 'node:test';
import assert from 'node:assert/strict';
import { callFinancials, cents, invoiceBalance, allocationRemaining, normalizeCallNumber, previewSource, combinePreview } from '../src/modules/service-calls/serviceCallModel.js';

test('financial information stays absent without server authorization', () => {
  assert.equal(callFinancials({financials:null}),null);
});
test('allocated revenue excludes tax from profit; collection and balance include tax', () => {
  const invoice={status:'posted',revenue_excluding_tax:60,sales_tax:4.2,payments:[{amount:20}],due_date:'2026-09-01'};
  const f=callFinancials({financials:{invoices:[invoice],costs:[{is_active:true,total_hard_cost:30}]}},'2026-09-14');
  assert.equal(f.revenue,60); assert.equal(f.profit,30); assert.equal(f.margin,50);
  assert.equal(f.outstanding,44.2); assert.equal(f.billingStatus,'Overdue');
  assert.equal(invoiceBalance(invoice),44.2);
});
test('missing costs do not fabricate profit and void invoices are excluded', () => {
  const f=callFinancials({financials:{invoices:[{status:'void',revenue_excluding_tax:100}],costs:[]}});
  assert.equal(f.revenue,0); assert.equal(f.profit,null); assert.equal(f.costKnown,false);
});
test('invoice allocations reconcile to cents', () => {
  assert.equal(allocationRemaining('.30',[{amount:'.10'},{amount:'.20'}]),0);
  assert.equal(allocationRemaining('100',[{amount:60},{amount:30}]),10);
  assert.throws(()=>cents('NaN')); assert.throws(()=>cents(Infinity));
});
test('shared invoice only contributes each call allocated share', () => {
  const calls=[60,40].map((value)=>({financials:{invoices:[{status:'posted',revenue_excluding_tax:value,sales_tax:0,payments:[]}],costs:[]}}));
  assert.equal(calls.reduce((sum,c)=>sum+callFinancials(c).revenue,0),100);
});
test('source preview locates headers and flags historical billing without posting', () => {
  const rows=previewSource([['title'],['Job #','First Name','Last Name','Amount Billed','Amount Collected','Date Billed','Due Date'],['26-001','A','B',100,100.01,'','1899-12-30']],'scorecard');
  assert.equal(rows[0].customer,'A B'); assert.equal(rows[0].due_date,'');
  assert.ok(rows[0].issues.some((x)=>x.includes('exceeds')));
  assert.ok(rows[0].issues.some((x)=>x.includes('no ledger')));
});
test('exact number matches are suggestions; conflicts and duplicates remain visible', () => {
  const registry=previewSource([['JOB NUMBER','Customer','Description / Notes','Job Stage'],['26–001','One','Bill calls together','Invoiced'],['26-001','Duplicate','','Upcoming']],'registry');
  const scorecard=previewSource([['Job #','Business Name'],['26-001','Other']],'scorecard');
  const result=combinePreview(registry,scorecard,[{id:'existing',service_call_number:'26-001'}]);
  assert.equal(result.length,1); assert.equal(result[0].match,'Exact number match');
  assert.ok(result[0].issues.some((x)=>x.includes('Duplicate')));
  assert.ok(result[0].issues.some((x)=>x.includes('Different customer')));
  assert.ok(result[0].issues.some((x)=>x.includes('shared billing')));
  assert.equal(normalizeCallNumber(' 26 — 001 '),'26-001');
});
test('preview rejects an unrelated sheet and flags numeric formula errors', () => {
  assert.throws(()=>previewSource([['Other header']],'registry'));
  const rows=previewSource([['Job #','Cost'],['26-002','#VALUE!']],'scorecard');
  assert.equal(rows[0].cost,null); assert.ok(rows[0].issues.length);
});
