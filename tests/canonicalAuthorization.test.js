import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920184500_canonical_authorization_foundation.sql', import.meta.url),
  'utf8',
);
const assignmentUi = readFileSync(new URL('../src/modules/developer/DeveloperAssignmentControl.jsx', import.meta.url), 'utf8');

test('Developer authority is modeled as a technical assignment and backfilled before resolver replacement', () => {
  const backfill = migration.indexOf('INSERT INTO public.user_technical_assignments');
  const resolver = migration.indexOf('CREATE OR REPLACE FUNCTION public.current_user_has_developer_access');
  assert.ok(backfill > 0 && resolver > backfill);
  assert.match(migration, /assignment_key text NOT NULL CHECK \(assignment_key = 'developer'\)/);
  assert.match(migration, /permission\.role = 'Developer'/);
  assert.match(migration, /CASE WHEN role = 'Developer' THEN 'Director' ELSE role END/);
  assert.match(migration, /user_has_technical_assignment\(auth\.jwt\(\)->>'sub', 'developer'\)/);
});

test('canonical evaluator defaults unknown and scoped actions to denial', () => {
  assert.match(migration, /'unknown_or_inactive_action'/);
  assert.match(migration, /action\.scope_rule <> 'NONE'/);
  assert.match(migration, /'scope_context_required'/);
  assert.match(migration, /action\.minimum_business_role IS NULL/);
  assert.match(migration, /action_mapping_required/);
  assert.match(migration, /RAISE EXCEPTION 'Authorization denied for action %'/);
});

test('Developer assignment management is non-delegable and protects Primary', () => {
  assert.match(migration, /'V4-002', 'developers\.assignment\.manage'/);
  assert.match(migration, /special_authority = 'manage_developers'/);
  assert.match(migration, /PERFORM public\.require_current_authorization\('V4-002'\)/);
  assert.match(migration, /Primary technical authority cannot be changed/);
  assert.match(migration, /Developer administrators cannot change their own technical assignment/);
  assert.match(migration, /'user_technical_assignments'.*'permission_change'/s);
});

test('Primary receives a dedicated Developer assignment control instead of a role shortcut', () => {
  assert.match(assignmentUi, /permissions\.canManageDevelopers/);
  assert.match(assignmentUi, /read_user_developer_assignment/);
  assert.match(assignmentUi, /set_user_developer_assignment/);
  assert.match(assignmentUi, /Technical access is separate from the user’s business rank/);
});

test('technical and action tables are not directly exposed to clients', () => {
  assert.match(migration, /ALTER TABLE public\.user_technical_assignments ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.user_technical_assignments FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /ALTER TABLE public\.authorization_actions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.authorization_actions FROM PUBLIC, anon, authenticated/);
});
