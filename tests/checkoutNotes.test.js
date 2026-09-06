import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCheckoutNoteCoverage } from '../src/modules/inventory/checkoutNotes.js';
for (const destination_type of ['job', 'service_call', 'vehicle', 'vendor_return', 'scrap', 'unknown']) {
  test(`${destination_type}: cart or every line, or both; whitespace is empty`, () => {
    const lines = [{ destination_type, note: 'First' }, { destination_type, note: 'Second' }];
    assert.equal(hasCheckoutNoteCoverage(lines, ''), true);
    assert.equal(hasCheckoutNoteCoverage(lines, 'Whole cart'), true);
    lines[1].note = '  ';
    assert.equal(hasCheckoutNoteCoverage(lines, ''), false);
    assert.equal(hasCheckoutNoteCoverage(lines, '  '), false);
    assert.equal(hasCheckoutNoteCoverage(lines, 'Whole cart'), true);
    lines[0].note = '';
    assert.equal(hasCheckoutNoteCoverage(lines, 'Whole cart'), true);
  });
}
