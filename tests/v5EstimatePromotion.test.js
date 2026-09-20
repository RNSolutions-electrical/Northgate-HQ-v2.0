import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920223000_v5_estimate_promotion_adapter.sql', import.meta.url),
  'utf8',
);

test('estimate promotion accepts only the exact pending official-estimate destination', () => {
  assert.match(migration, /destination\.status<>'pending' OR destination\.version<>p_expected_version/);
  assert.match(migration, /destination\.payload_hash<>p_expected_payload_hash/);
  assert.match(migration, /destination\.destination_key<>'official_estimate'/);
  assert.match(migration, /destination\.action_id<>'POL-002'/);
});

test('promotion rechecks reviewer authority and Department scope', () => {
  assert.match(migration, /current_scoped_authorization_decision\(destination\.action_id,destination\.scope_context\)/);
  assert.match(migration, /actor_profile\.business_role<>'Director'/);
  assert.match(migration, /actor_profile\.division IS DISTINCT FROM target_division/);
});

test('reviewed personal payload must still match its immutable submitted source', () => {
  assert.match(migration, /change_set\.working_copy_version<>working_copy\.version/);
  assert.match(migration, /change_set\.payload_hash<>working_copy\.payload_hash/);
  assert.match(migration, /destination\.proposed_payload IS DISTINCT FROM working_copy\.payload/);
  assert.match(migration, /validate_workbench_structure\(document,false\)/);
});

test('official draft creation and destination completion share one transaction', () => {
  const insert = migration.indexOf('INSERT INTO public.estimates');
  const workbench = migration.indexOf('INSERT INTO public.estimate_workbenches');
  const complete = migration.indexOf('complete_v5_destination_application');
  assert.ok(insert > 0 && workbench > insert && complete > workbench);
  assert.match(migration, /EXCEPTION WHEN OTHERS/);
  assert.match(migration, /RETURN completion\|\|jsonb_build_object\('idempotent',false\)/);
});
