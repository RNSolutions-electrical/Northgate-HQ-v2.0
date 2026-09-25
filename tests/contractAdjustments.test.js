import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustmentLineTotal, serializeAdjustmentLines, isEditableAdjustment, filterAdjustments, adjustmentLogHtml } from '../src/modules/jobs/contractAdjustments.js';
import { withUpdatedLineMarkup } from '../src/modules/jobs/changeOrderMarkup.js';

test('blank pricing remains unknown; explicit zero is a priced no-cost item', () => {
  assert.equal(adjustmentLineTotal({}), null);
  assert.equal(adjustmentLineTotal({material_amount: '', labor_amount: null}), null);
  assert.equal(adjustmentLineTotal({material_amount: 0}), 0);
  assert.equal(adjustmentLineTotal({material_amount: -2500}), -2500);
  assert.equal(adjustmentLineTotal({material_amount: 10000, labor_amount: -2500}), 7500);
  assert.equal(adjustmentLineTotal({material_amount: '0.1', labor_amount: '0.2'}), 0.3);
});
test('nullable draft serialization retains explicit zero without leaking server fields', () => {
  const [line] = serializeAdjustmentLines([{id: 'old', description: '', material_amount: 0, labor_amount: '', markup_percent: '', markup_mode: 'percent', line_total: 999}]);
  assert.equal(line.material_amount, 0);
  assert.equal(line.labor_amount, null);
  assert.equal(line.description, '');
  assert.equal('markup_percent' in line, false);
  assert.equal('line_total' in line, false);
  assert.equal('id' in line, false);
});
test('editing a description does not fabricate zero markup or completed pricing', () => {
  const line = withUpdatedLineMarkup({markup_mode: 'percent', markup_percent: ''}, {description:'Incomplete'});
  assert.equal(line.markup_amount, '');
  assert.equal(adjustmentLineTotal(line), null);
  assert.equal(withUpdatedLineMarkup({markup_mode:'percent',material_amount:100}, {markup_percent:'7.5'}).markup_amount, '7.50');
});
test('editable states exclude finalized or archived records', () => {
  for(const status of ['draft','potential','proposed','submitted']) assert.equal(isEditableAdjustment({status}), true);
  for(const status of ['approved','denied','waived','voided']) assert.equal(isEditableAdjustment({status}), false);
  assert.equal(isEditableAdjustment({status:'draft',archived_at:'2026-09-25'}), false);
});
test('log filters preserve signed amounts, missing pricing and escaped descriptions', () => {
  const rows=[{co_number:'CO-001',status:'potential',title:'<script>',price_amount:null},{co_number:'CR-001',record_type:'credit',status:'approved',price_amount:-2500}];
  assert.equal(filterAdjustments(rows,'potential').length,1);
  assert.equal(filterAdjustments(rows,'credits')[0].co_number,'CR-001');
  const html=adjustmentLogHtml({name:'A&B'}, rows);
  assert.match(html,/Not priced/);
  assert.match(html,/-\$2,500.00/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/A&amp;B/);
});
