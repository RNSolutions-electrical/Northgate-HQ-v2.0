import test from 'node:test';
import assert from 'node:assert/strict';
import { clientChangeOrderHtml } from '../src/modules/jobs/ChangeOrderClientForm.mjs';
import { clientDetailAmount, clientDetailSummary, validateClientDetails } from '../src/modules/jobs/changeOrderClientDetails.mjs';

test('client detail rows preserve blank prices and compare against, not replace, the line total', () => {
  const rows = validateClientDetails([
    { description: 'Conduit', quantity: '2', unit: 'EA', unit_price: '10', amount: '' },
    { description: 'Coordination', quantity: '', unit: '', unit_price: '', amount: '' },
    { description: 'Manual price', quantity: '2', unit: 'EA', unit_price: '10', amount: '25' },
  ]);
  assert.equal(clientDetailAmount(rows[0]), 20);
  assert.equal(clientDetailAmount(rows[1]), null);
  assert.equal(clientDetailAmount(rows[2]), 25);
  assert.deepEqual(clientDetailSummary(rows, 100), {
    pricedCount: 2, subtotal: 45, remaining: 55, differsFromLine: true, hasUnpriced: true,
  });
  assert.throws(() => validateClientDetails([{ description: '<bad>', quantity: 'not a number' }]));
});

test('client PDF and draft preview keep the authoritative amount and escape details', () => {
    const html = clientChangeOrderHtml({
      order: { co_number: 'CO-012', revision_number: 0 },
      job: { job_number: '26-100', name: 'Example Job', address_line1: '<script>alert(1)</script>' },
      form: { title: 'Additional work', description: 'Approved scope', change_order_date: '2026-10-02' },
      lines: [{ description: 'Install conduit', material_amount: 100, client_breakdown: {
        rows: [{ description: '3/4" EMT <script>', quantity: 2, unit: 'EA', unit_price: 10, amount: null }],
        show_remaining: true, remaining_label: 'Unitemized balance',
      } }],
      overallMarkupAmount: 0, total: 100, logoUrl: 'https://example.invalid/logo.jpg', preview: true,
    });
    assert.match(html, /DRAFT PREVIEW — not submitted or approved/);
    assert.match(html, /3\/4&quot; EMT &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /Unitemized balance/);
    assert.match(html, /\$80\.00/);
    assert.match(html, /Change Order Total<\/span><span>\$100\.00/);
});
