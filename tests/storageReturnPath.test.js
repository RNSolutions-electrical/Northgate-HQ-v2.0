import test from 'node:test';
import assert from 'node:assert/strict';
import { storageReturnLinks } from '../src/modules/inventory/storageReturnLinks.js';

const records = [
  { id: 'unit', code: 'E', type: 'unit', parentId: null },
  { id: 'shelf', code: 'E2', type: 'shelf', parentId: 'unit' },
  { id: 'bay', code: 'E24', type: 'bay', parentId: 'shelf' },
  { id: 'bin', code: 'E241', type: 'bin', parentId: 'bay' },
];

test('bin count has direct links to every authorized parent and the bin', () => {
  const links = storageReturnLinks(records, 'bin');
  assert.deepEqual(links.map((link) => link.code), ['Storage', 'E', 'E2', 'E24', 'E241']);
  assert.equal(links[0].to, '/inventory?view=storage');
  for (const row of records) {
    const link = links.find((item) => item.id === row.id);
    assert.equal(new URL(link.to, 'https://example.test').searchParams.get('locationId'), row.id);
    assert.ok(!link.to.includes('scanBinId'));
  }
  assert.deepEqual(links.filter((link) => link.current).map((link) => link.id), ['bin']);
  assert.match(links.at(-1).title, /^Bin E241/);
});

test('standalone count has no misleading location path', () => {
  assert.deepEqual(storageReturnLinks(records, ''), []);
});

test('missing or loading hierarchy still offers Storage without invented parents', () => {
  assert.deepEqual(storageReturnLinks([], 'bin').map((link) => link.code), ['Storage']);
  assert.deepEqual(storageReturnLinks(records, 'unknown').map((link) => link.code), ['Storage']);
});

test('moved and archived locations follow actual relationships', () => {
  const moved = records.map((row) => row.id === 'bin' ? { ...row, parentId: 'shelf', archived_at: 'today' } : row);
  const links = storageReturnLinks(moved, 'bin');
  assert.deepEqual(links.map((link) => link.code), ['Storage', 'E', 'E2', 'E241']);
});
