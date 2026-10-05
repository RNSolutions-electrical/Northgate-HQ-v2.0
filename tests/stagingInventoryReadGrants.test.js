import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Staging inventory read repair preserves authenticated RLS boundaries', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261005190103_restore_staging_inventory_read_grants.sql', import.meta.url), 'utf8');
  for (const table of ['items', 'storage_units', 'shelves', 'bays', 'bins', 'inventory_balances']) {
    assert.match(sql, new RegExp(`public\\.${table}\\b`));
  }
  assert.match(sql, /c\.relrowsecurity/);
  assert.match(sql, /'authenticated'::regrole::oid = ANY\(p\.polroles\)/);
  assert.match(sql, /GRANT SELECT ON TABLE[\s\S]*TO authenticated;/);
  assert.doesNotMatch(sql, /GRANT\s+ALL|TO\s+anon\s*;/i);
});

test('Inventory review badge uses environment-aware Clerk token selection', () => {
  const source = readFileSync(new URL('../src/modules/inventory/InventoryWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /getSupabaseAccessToken\(getToken\)\.then\(token => createSupabaseClient\(token\)\.rpc\('read_catalogue_stock_reviews'\)\)/);
  assert.doesNotMatch(source, /getToken\(\{\s*template:\s*['"]supabase['"]\s*\}\)/);
});
