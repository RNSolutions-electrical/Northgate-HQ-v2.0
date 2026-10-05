import assert from 'node:assert/strict';
import test from 'node:test';
import { inventorySectionFromSearch, inventorySectionUrl, visibleInventorySections } from './inventoryNavigation.js';

test('Inventory rail keeps ordinary views and limits management destinations', () => {
  const reader = { permissionSource: 'server', canInventoryTransactions: true };
  const keys = visibleInventorySections(reader).map(({ key }) => key);
  assert.deepEqual(keys, ['stock', 'catalog', 'stock_reviews', 'storage', 'history']);
  assert.equal(inventorySectionFromSearch('?view=count', reader), null);
  assert.equal(inventorySectionFromSearch('?view=storage', reader), 'storage');
  assert.equal(inventorySectionFromSearch('?view=cart', reader), null);
  assert.equal(inventorySectionFromSearch('', reader), 'stock');
});

test('Inventory manager sees management views without exposing mobile scan on desktop', () => {
  const manager = { permissionSource: 'server', canManageInventory: true };
  const desktop = visibleInventorySections(manager).map(({ key }) => key);
  assert.ok(desktop.includes('count'));
  assert.ok(desktop.includes('accounting'));
  assert.ok(!desktop.includes('scan'));
  assert.ok(visibleInventorySections(manager, { mobile: true }).some(({ key }) => key === 'scan'));
  assert.equal(inventorySectionFromSearch('?view=locations', manager), 'storage');
  assert.equal(inventorySectionUrl('stock_reviews'), '/inventory?view=stock_reviews');
});

test('diagnostic-only destinations stay out of normal Inventory navigation', () => {
  const manager = { permissionSource: 'server', canManageInventory: true };
  assert.ok(!visibleInventorySections(manager).some(({ key }) => key === 'controls'));
  assert.ok(visibleInventorySections(manager, { diagnostics: true }).some(({ key }) => key === 'controls'));
});
