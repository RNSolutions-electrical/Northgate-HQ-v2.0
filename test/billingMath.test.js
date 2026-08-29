import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateFeeCents, derivePayAppLine, reconcileSov, toCents } from '../src/modules/jobs/billingMath.js';

test('fee allocation reconciles exactly at the cent', () => {
  const allocation = allocateFeeCents([{ id: 'a', amount: 100 }, { id: 'b', amount: 200 }], toCents(10));
  assert.equal(allocation.get('a') + allocation.get('b'), 1000);
  assert.equal(allocation.get('a'), 334);
  assert.equal(allocation.get('b'), 666);
});

test('SOV reconciliation requires the original contract total', () => {
  assert.equal(reconcileSov([{ scheduledValue: 100, contractValue: 100 }, { scheduledValue: 200, contractValue: 200 }]).isReconciled, true);
  assert.equal(reconcileSov([{ scheduledValue: 99.99, contractValue: 100 }]).isReconciled, false);
});

test('pay-app progress is incremental and never exceeds scheduled value', () => {
  const result = derivePayAppLine({ scheduledValue: 1000, previousBilled: 900, additionalPercent: 20 });
  assert.deepEqual(result, {
    calculatedCurrentAmount: 200,
    finalCurrentAmount: 100,
    billedToDateAmount: 1000,
    remainingAmount: 0,
    resultingPercent: 100,
    wasClamped: true,
  });
});
