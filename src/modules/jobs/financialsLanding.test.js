import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedContractChanges, financialContractSummary } from './financialsLanding.js';

const row = (id, price, extra = {}) => ({ id, price_amount: price, status: 'approved', ...extra });

test('approved 10,000 changes the 100,000 contract once, regardless of SOV posting', () => {
  const input = { original: 100000, changeOrders: [row('a', 10000)] };
  const before = financialContractSummary({ ...input, sovLines: [{ scheduled_value_amount: 100000 }] });
  const after = financialContractSummary({ ...input, sovLines: [{ scheduled_value_amount: 100000, approved_change_amount: 10000 }] });
  assert.equal(before.current, 110000);
  assert.equal(after.current, 110000);
  assert.equal(before.unallocated, 10000);
  assert.equal(after.unallocated, 0);
});

test('SOV and cost figures never become an unrecorded signed contract', () => {
  const result = financialContractSummary({ original: null, changeOrders: [], sovLines: [{ scheduled_value_amount: 100000 }] });
  assert.equal(result.current, null);
  assert.equal(result.original, null);
  assert.equal(result.allocated, 100000);
  assert.equal(result.approved, 0);
});

test('pending revisions preserve earlier approvals, approved descendants replace them, and credits subtract', () => {
  const rows = [row('a', 10000), row('b', 15000, { revision_of_id: 'a', status: 'submitted' }), row('c', -3000)];
  assert.equal(approvedContractChanges(rows).cents, 700000);
  assert.equal(approvedContractChanges([...rows, row('d', 19000, { revision_of_id: 'b' })]).cents, 1600000);
  assert.equal(approvedContractChanges([...rows, row('d', 19000, { revision_of_id: 'b', voided_at: 'yes' })]).cents, 700000);
});

test('conflicting approvals, incomplete inputs and invalid history fail closed', () => {
  const root = row('a', 20);
  assert.equal(approvedContractChanges([root, row('b', 30, { revision_of_id: 'a' }), row('c', 50, { revision_of_id: 'a' })]), null);
  assert.equal(approvedContractChanges([row('b', 30, { revision_of_id: 'missing' })]), null);
  assert.equal(approvedContractChanges([row('a', 30, { revision_of_id: 'a' })]), null);
  assert.equal(financialContractSummary({ original: 100, changeOrders: null }).current, null);
});
