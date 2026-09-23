import test from 'node:test';
import assert from 'node:assert/strict';
import { lineSubtotal, percentMarkupAmount, withUpdatedLineMarkup } from './changeOrderMarkup.js';

test('line percentages affect only their own subtotal and round to cents', () => {
  assert.equal(percentMarkupAmount(5000, 15), 750);
  assert.equal(percentMarkupAmount(3000, 10), 300);
  assert.equal(percentMarkupAmount(2000, 0), 0);
  assert.equal(percentMarkupAmount(123.45, 7.5), 9.26);
  assert.equal(percentMarkupAmount(100, -1), null);
  assert.equal(percentMarkupAmount(100, 'not a number'), null);
  assert.equal(lineSubtotal({ material_amount: 5000, labor_amount: 1 }), 5001);
  assert.equal(withUpdatedLineMarkup({ material_amount: '5000', markup_mode: 'percent', markup_percent: '15' }, { material_amount: '6000' }).markup_amount, '900.00');
  assert.equal(withUpdatedLineMarkup({ material_amount: '5000', markup_mode: 'legacy', markup_amount: '750' }, { material_amount: '6000' }).markup_amount, '750');
  const lines = [
    withUpdatedLineMarkup({ material_amount: 5000, markup_mode: 'percent', markup_percent: 15 }, {}),
    withUpdatedLineMarkup({ material_amount: 3000, markup_mode: 'percent', markup_percent: 10 }, {}),
    withUpdatedLineMarkup({ material_amount: 2000, markup_mode: 'percent', markup_percent: 0 }, {}),
  ];
  assert.deepEqual(lines.map((line) => Number(line.markup_amount)), [750, 300, 0]);
  assert.equal(lines.reduce((sum, line) => sum + lineSubtotal(line) + Number(line.markup_amount), 0), 11050);
});
