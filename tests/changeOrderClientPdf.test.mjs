import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('client PDF keeps the authoritative line amount while showing optional details', async () => {
  process.env.VITE_SUPABASE_URL ??= 'https://example.invalid';
  process.env.VITE_SUPABASE_ANON_KEY ??= 'verification-only';
  process.env.VITE_CLERK_PUBLISHABLE_KEY ??= 'pk_test_verification_only';
  const server = await createServer({ configFile: false, server: { middlewareMode: true } });
  try {
    const { clientChangeOrderHtml } = await server.ssrLoadModule('/src/modules/jobs/ChangeOrderWorkspace.jsx');
    const { ChangeOrderWorkspace: nextWorkspace } = await server.ssrLoadModule('/src/modules/jobs/ChangeOrderWorkspaceNext.jsx');
    assert.equal(typeof nextWorkspace, 'function');
    const html = clientChangeOrderHtml({
      order: { co_number: 'CO-012', revision_number: 0 },
      job: { job_number: '26-100', name: 'Example Job', address_line1: '<script>alert(1)</script>' },
      form: { title: 'Additional work', description: 'Approved scope', change_order_date: '2026-10-02' },
      lines: [{
        description: 'Install conduit', material_amount: 100, labor_amount: 0,
        client_breakdown: {
          rows: [
            { description: '3/4" EMT <script>', quantity: 2, unit: 'EA', unit_price: 10, amount: null },
            { description: 'Field coordination', quantity: null, unit_price: null, amount: null },
            { description: 'Manually priced material', quantity: 2, unit: 'EA', unit_price: 10, amount: 25 },
          ],
          show_remaining: true,
          remaining_label: 'Unitemized balance',
        },
      }],
      overallMarkupAmount: 0,
      total: 100,
      logoUrl: 'https://example.invalid/logo.jpg',
    });
    assert.match(html, /Install conduit/);
    assert.match(html, /3\/4&quot; EMT &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Unitemized balance/);
    assert.match(html, /\$55\.00/);
    assert.match(html, /Manually priced material<small>2 EA<\/small>/);
    assert.match(html, /Change Order Total<\/span><span>\$100\.00/);
    assert.doesNotMatch(html, /DRAFT PREVIEW/);

    const preview = clientChangeOrderHtml({
      order: { co_number: 'Unnumbered draft', revision_number: 0 },
      job: { name: 'Example Job' },
      form: { title: 'Unsaved scope update', description: 'Current on-screen draft', change_order_date: '' },
      lines: [{ description: 'Current draft line', material_amount: 100, labor_amount: 0 }],
      overallMarkupAmount: 0,
      total: 100,
      logoUrl: 'https://example.invalid/logo.jpg',
      preview: true,
    });
    assert.match(preview, /DRAFT PREVIEW — not submitted or approved/);
    assert.match(preview, /Unsaved scope update/);
    assert.match(preview, /Current on-screen draft/);
    assert.match(preview, /Unnumbered draft/);
    assert.match(preview, /Change Order Total<\/span><span>\$100\.00/);

    const credit = clientChangeOrderHtml({
      order: { co_number: 'CR-001', record_type: 'credit', revision_number: 0 },
      job: { name: 'Example Job' },
      form: { title: 'Customer credit', description: 'Deleted work', change_order_date: '' },
      lines: [{ description: 'Scope deduction', material_amount: -2500 }],
      overallMarkupAmount: 0,
      total: -2500,
      logoUrl: 'https://example.invalid/logo.jpg',
    });
    assert.match(credit, /<strong>Credit<\/strong>/);
    assert.match(credit, /Credit Total<\/span><span>\-\$2,500\.00/);

    const incomplete = clientChangeOrderHtml({
      order: { co_number: 'Unnumbered draft', revision_number: 0 },
      job: { name: 'Example Job' },
      form: { title: '', description: '', change_order_date: '' },
      lines: [{ description: 'Pricing pending', material_amount: null, labor_amount: '' }],
      overallMarkupAmount: 0,
      total: null,
      logoUrl: 'https://example.invalid/logo.jpg',
      preview: true,
    });
    assert.match(incomplete, /Pricing pending<\/td><td>Not priced<\/td>/);
    assert.match(incomplete, /Change Order Total<\/span><span>Not priced/);
  } finally {
    await server.close();
  }
});
