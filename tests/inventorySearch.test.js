import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockMaterials } from '../src/modules/inventory/inventorySearch.js';
const catalogue = [{ id: '1', name: 'EMT connector', material_code: 'C-1', size: '3/4', manufacturer: 'Acme' }, { id: '2', name: 'Panel' }];
const stock = [{ bin_item_id: 'a', item_id: '1', bin_id: 'bin1', bin_code: 'A1', quantity_on_hand: 3 }, { bin_item_id: 'b', item_id: '1', bin_id: 'bin2', bin_code: 'VAN1', quantity_on_hand: 0 }];
test('stock groups materials and preserves tracked zero stock', () => {
  const rows = buildStockMaterials(catalogue, stock);
  assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 3); assert.equal(rows[0].locations.length, 2);
  assert.equal(buildStockMaterials(catalogue, stock, { location: 'bin2' })[0].quantity, 0);
});
test('multi-term search matches metadata and full catalogue is explicit', () => {
  assert.equal(buildStockMaterials(catalogue, stock, { search: 'ACME 3/4 emt' }).length, 1);
  assert.equal(buildStockMaterials(catalogue, stock, { search: 'Panel' }).length, 0);
  assert.equal(buildStockMaterials(catalogue, stock, { search: 'Panel', fullCatalogue: true }).length, 1);
  assert.equal(buildStockMaterials(catalogue, stock, { fullCatalogue: true, location: 'bin1' }).length, 1);
  assert.equal(buildStockMaterials(catalogue, stock, { search: 'van1' }).length, 1);
});
