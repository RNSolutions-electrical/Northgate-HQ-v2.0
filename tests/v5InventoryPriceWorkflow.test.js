import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20260921152634_v5_inventory_price_review_adapter.sql',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/modules/inventory/InventoryPriceWorkspace.jsx',import.meta.url),'utf8');
const browser=readFileSync(new URL('../src/modules/inventory/InventoryStockBrowser.jsx',import.meta.url),'utf8');

test('approved estimate price proposals become explicit inventory prices',()=>{
 assert.match(migration,/set_inventory_item_price/);
 assert.match(migration,/Material pricing changed after submission/);
 assert.match(migration,/labor_rate_hrs/);
 assert.match(migration,/complete_v5_destination_application/);
 assert.match(migration,/v5_destination_review_action/);
 assert.match(migration,/THEN 'V3-013'/);
});

test('inventory price workspace exposes precedence, history, set and reset',()=>{
 assert.match(workspace,/Estimating master/);
 assert.match(workspace,/Inventory override/);
 assert.match(workspace,/item_price_history/);
 assert.match(workspace,/set_inventory_item_price/);
 assert.match(workspace,/clear_inventory_item_price/);
 assert.match(workspace,/Shared-price change reason/);
 assert.match(browser,/Manage Price/);
});
