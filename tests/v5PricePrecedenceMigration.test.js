import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20260921150906_v5_price_precedence_and_snapshots.sql',import.meta.url),'utf8');

test('v5 explicit inventory price takes precedence while retaining the compatibility price',()=>{
 assert.match(sql,/COALESCE\(NEW\.inventory_price_per_unit,NEW\.estimating_price_per_unit,0\)/);
 assert.match(sql,/inventory_explicit/);
 assert.match(sql,/estimating_master/);
});

test('v5 records immutable inventory and catalogue price provenance',()=>{
 assert.match(sql,/CREATE TABLE public\.item_price_history/);
 assert.match(sql,/unit_cost_source/);
 assert.match(sql,/snapshot_transaction_item_price_source/);
 assert.match(sql,/CREATE TRIGGER snapshot_transaction_item_price_source BEFORE INSERT/);
 assert.match(sql,/snapshot_assembly_item_price_source/);
});

test('v5 inventory overrides are permission checked and reason gated',()=>{
 assert.match(sql,/current_scoped_authorization_decision\('V3-013'/);
 assert.match(sql,/A shared-price change reason is required/);
 assert.match(sql,/Use the inventory price approval workflow/);
});
