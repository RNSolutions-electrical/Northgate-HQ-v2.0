import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260921170000_v5_change_order_action_reconciliation.sql', import.meta.url),
  'utf8',
);
const jobsWorkspace = fs.readFileSync(new URL('../src/modules/jobs/JobsWorkspace.jsx', import.meta.url), 'utf8');

test('project assignment roles can be managed through a scoped server workflow', () => {
  assert.match(migration, /set_job_user_assignment_v5/);
  assert.match(migration, /current_scoped_authorization_decision\('V4-006'/);
  assert.match(migration, /assignment_role=normalized_role/);
  assert.match(migration, /a reason is required to change a project assignment role/);
  assert.match(jobsWorkspace, /read_job_assignment_directory_v5/);
  assert.match(jobsWorkspace, /Project Manager authority can affect financial approval scope/);
});

test('Change Order reconciliation is additive and uses the scoped v5 evaluator', () => {
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.change_orders/);
  assert.match(migration, /current_scoped_authorization_decision\(/);
  assert.match(migration, /jsonb_build_object\('job_id', NEW\.job_id\)/);
  assert.match(migration, /ERRCODE = '42501'/);
});

test('Change Order lifecycle paths map to canonical v5 actions', () => {
  for (const action of ['AUD-019', 'AUD-017', 'CFG-007', 'V3-001', 'V3-005', 'AUD-018', 'AUD-021']) {
    assert.match(migration, new RegExp(`'${action}'`));
  }
});

test('trigger helper is not exposed as a client RPC', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.enforce_v5_change_order_action\(\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});

test('approval posting remains on the legacy atomic RPC until PM assignments exist', () => {
  assert.match(migration, /CFG-009 is intentionally staged/);
  assert.match(migration, /WHEN OLD\.status = 'submitted' AND NEW\.status = 'approved' THEN NULL/);
  assert.doesNotMatch(migration, /BEFORE INSERT ON public\.change_order_financial_postings/);
});
