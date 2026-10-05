import test from 'node:test';
import assert from 'node:assert/strict';
import { clientDetailAmount, clientDetailSummary, validateClientDetails } from '../src/modules/jobs/changeOrderClientDetails.mjs';

test('optional client details preserve descriptive rows and signed prices', () => {
  const details = validateClientDetails([
    { description: 'Remove old work', quantity: '-2', unit: 'EA', unit_price: '12.25' },
    { description: 'Field note', quantity: '', unit_price: '' },
  ]);
  assert.deepEqual(details[0], { description: 'Remove old work', quantity: -2, unit: 'EA', unit_price: 12.25, amount: null });
  assert.equal(clientDetailAmount(details[0]), -24.5);
  assert.equal(clientDetailAmount(details[1]), null);
  assert.deepEqual(clientDetailSummary(details, -24.5), {
    pricedCount: 1, subtotal: -24.5, remaining: 0, differsFromLine: false, hasUnpriced: true,
  });
});

test('a mismatch warns without changing the authoritative Change Order line', () => {
  const details = validateClientDetails([{ description: 'Conduit', quantity: 3, unit_price: 7.8 }]);
  assert.deepEqual(clientDetailSummary(details, 100), {
    pricedCount: 1, subtotal: 23.4, remaining: 76.6, differsFromLine: true, hasUnpriced: false,
  });
});

test('manual amount is permitted with or without quantity and price', () => {
  const details = validateClientDetails([
    { description: 'Manual allowance', amount: '55.15' },
    { description: 'Count without a quoted price', quantity: '2', unit: 'EA' },
  ]);
  assert.equal(clientDetailAmount(details[0]), 55.15);
  assert.equal(clientDetailAmount(details[1]), null);
  assert.equal(clientDetailSummary(details, 100).remaining, 44.85);
});

test('invalid numbers and blank descriptions are rejected', () => {
  assert.throws(() => validateClientDetails([{ description: 'Conduit', quantity: 'NaN', unit_price: 1 }]), /invalid quantity/);
  assert.throws(() => validateClientDetails([{ description: '', quantity: 1, unit_price: 1 }]), /needs a description/);
});
