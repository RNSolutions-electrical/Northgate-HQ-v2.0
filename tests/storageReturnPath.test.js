import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('Count return navigation uses the authorized Storage hierarchy', async t => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { renderPath } = await server.ssrLoadModule('/tests/fixtures/storageReturnPathHarness.jsx');
    const records = [
      { id: 'unit', code: 'E', type: 'unit', parentId: null },
      { id: 'shelf', code: 'E2', type: 'shelf', parentId: 'unit' },
      { id: 'bay', code: 'E24', type: 'bay', parentId: 'shelf' },
      { id: 'bin', code: 'E241', type: 'bin', parentId: 'bay' },
    ];
    await t.test('bin count has direct links to every parent and the bin', () => {
      const html = renderPath(records, 'bin');
      assert.equal((html.match(/<a /g) || []).length, 5);
      for (const row of records) assert.ok(html.includes(`locationId=${row.id}`));
      assert.ok(html.indexOf('Storage unit E') < html.indexOf('Shelf E2'));
      assert.ok(html.indexOf('Shelf E2') < html.indexOf('Bay E24'));
      assert.ok(html.indexOf('Bay E24') < html.indexOf('Bin E241'));
      assert.ok(!html.includes('scanBinId'));
    });
    await t.test('standalone count has no misleading location path', () => {
      assert.equal(renderPath(records, ''), '');
    });
    await t.test('missing or loading hierarchy still offers Storage without invented parents', () => {
      assert.equal((renderPath([], 'bin').match(/<a /g) || []).length, 1);
      assert.equal((renderPath(records, 'unknown').match(/<a /g) || []).length, 1);
    });
    await t.test('moved and archived locations follow actual relationships', () => {
      const moved = records.map(row => row.id === 'bin' ? { ...row, parentId: 'shelf', archived_at: 'today' } : row);
      assert.ok(!renderPath(moved, 'bin').includes('locationId=bay'));
      assert.ok(renderPath(moved, 'bin').includes('locationId=shelf'));
    });
  } finally {
    await server.close();
  }
});
