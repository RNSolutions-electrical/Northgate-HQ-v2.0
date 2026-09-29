import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockMaterials } from '../src/modules/inventory/inventorySearch.js';
import { inventoryExportCsv, inventoryExportRows } from '../src/modules/inventory/inventoryExports.js';
import { suggestCatalogueCode } from '../src/lib/catalogueCodeSuggestion.mjs';

const catalogue = [
  { id: 'a', material_code: 'A', name: 'Coupling', broad_category: 'EMT' },
  { id: 'b', material_code: 'B', name: 'Empty item' },
];
const stock = [
  { item_id: 'a', bin_id: 'bin-1', bin_item_id: 'stock-1', quantity_on_hand: 3 },
  { item_id: 'a', bin_id: 'bin-2', bin_item_id: 'stock-2', quantity_on_hand: 4 },
];

test('location scope includes only matching bin quantities and excludes unstocked catalogue items', () => {
  const rows = buildStockMaterials(catalogue, stock, { fullCatalogue: true, locationIds: new Set(['bin-1']) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 3);
  assert.deepEqual(rows[0].locations.map(row => row.bin_id), ['bin-1']);
  assert.equal(buildStockMaterials(catalogue, stock, { fullCatalogue: true }).length, 2);
});

test('blank/current/financial sheets preserve unknown counts and missing prices', () => {
  const rows = [
    { material_code: 'A', item_name: 'Coupling', bin_code: 'B1', unit_of_measure: 'EA', quantity_recorded: true, quantity_on_hand: 2, price_per_unit: 5 },
    { material_code: 'B', item_name: 'Unknown', bin_code: 'B2', unit_of_measure: 'EA', quantity_recorded: false, quantity_on_hand: null, price_per_unit: 0, price_confirmed: false },
  ];
  assert.equal(inventoryExportRows('blank', catalogue, rows)[0].countedQuantity, '');
  assert.equal(inventoryExportRows('current', catalogue, rows)[1].systemQuantity, '');
  const csv = inventoryExportCsv('financial', catalogue, rows);
  assert.match(csv, /Known inventory value total,,,,,10/);
  assert.match(csv, /Unknown,B2,EA,,,/);
});

test('catalogue exports neutralize spreadsheet formulas', () => {
  const csv = inventoryExportCsv('catalogue', [{ id: 'x', material_code: '=2+2', name: '@call' }], []);
  assert.match(csv, /'=2\+2,'@call/);
});

test('suggested catalogue number is editable, unique against loaded codes, and deterministic', () => {
  const hints = { category: 'EMT', size: '3/4', name: 'Coupling' };
  assert.equal(suggestCatalogueCode(hints), 'EMT-3-4-COUPLING');
  assert.equal(suggestCatalogueCode(hints, ['EMT-3-4-COUPLING']), 'EMT-3-4-COUPLING-2');
});
