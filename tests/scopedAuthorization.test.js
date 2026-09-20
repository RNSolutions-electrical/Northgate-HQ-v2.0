import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920201500_v5_action_catalogue_and_scope_evaluator.sql', import.meta.url),
  'utf8',
);

test('the v5 catalogue retains all approved package action IDs', () => {
  const ids = [...migration.matchAll(/\('((?:AUD|CFG|POL|FCT|V\d)-\d{3})',/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, 179);
});

test('custom and scoped-only actions fail closed until specifically mapped', () => {
  assert.match(migration, /action\.base_authority IN \('CUSTOM', 'SCOPED_ONLY', 'CAN_NONE'\)/);
  assert.match(migration, /'action_mapping_required'/);
  assert.match(migration, /'scope_mapping_required'/);
});

test('scope evaluator distinguishes project, assigned PM, service call, and employee contexts', () => {
  for (const rule of ['PROJECT_ACCESS', 'PROJECT_ACCESS_IF_ATTACHED', 'ASSIGNED_PM_OR_DIRECTOR', 'SERVICE_CALL_ACCESS', 'SELF_OR_MANAGED_EMPLOYEE', 'PM_COMPANY_VIEW']) {
    assert.match(migration, new RegExp(`WHEN '${rule}'`));
  }
  assert.match(migration, /assignment\.assignment_role = 'project_manager'/);
  assert.match(migration, /Assigned Project Managers must have Manager or Director business rank/);
});

test('authorization results explain rank, permission, and scope provenance', () => {
  assert.match(migration, /current_permission_provenance/);
  assert.match(migration, /'individual_override'/);
  assert.match(migration, /'assigned_template'/);
  assert.match(migration, /'default_template'/);
  assert.match(migration, /'role_default'/);
  assert.match(migration, /'authority_source'/);
  assert.match(migration, /'scope_source'/);
});
