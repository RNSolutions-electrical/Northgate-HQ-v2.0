import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/modules/estimates/workbench/WorkbenchRoute.jsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../src/hooks/usePermissions.js', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../src/modules/registry.js', import.meta.url), 'utf8');
const authorization = readFileSync(
  new URL('../supabase/migrations/20260920184500_canonical_authorization_foundation.sql', import.meta.url),
  'utf8',
);

test('personal work access is server-derived and defaults to deny in the client', () => {
  assert.match(authorization, /'can_save_personal_work', true/);
  assert.match(permissions, /can_save_personal_work: false/);
  assert.match(permissions, /canSavePersonalWork: flags\.can_save_personal_work/);
  assert.match(registry, /'canSavePersonalWork'/);
});

test('My Estimates uses the RPC-only durable working-copy store', () => {
  assert.match(route, /read_my_v5_working_copies/);
  assert.match(route, /save_v5_working_copy/);
  assert.match(route, /p_module_key:'estimating'/);
  assert.match(route, /p_work_type:'estimate'/);
  assert.match(route, /crypto\.randomUUID\(\)/);
});

test('personal estimates cannot directly approve, hand off, or mutate shared catalogue records', () => {
  assert.match(route, /onApprove=\{personalMode\?undefined:approve\}/);
  assert.match(route, /onHandoff=\{personalMode\?undefined:submitHandoff\}/);
  assert.match(route, /onCatalogueMaterial=\{!personalMode&&permissions\.canEditCatalog\?catalogueSave:undefined\}/);
  assert.match(route, /reviewProposals/);
  assert.match(route, /submit_v5_estimate_for_review/);
  assert.doesNotMatch(route, /Shared library and catalogue changes must be submitted as separate review destinations/);
});

test('personal estimate search uses the readable shared catalogue and assembly library',()=>{
  assert.match(route,/Promise\.all\(\[loadCatalogue\(db\),loadAssemblyLibrary\(db\)\]\)/);
  assert.doesNotMatch(route,/library\.current=\[\];setCatalogue\(\[\]\)/);
});

test('authorized estimators can switch between official and personal views', () => {
  assert.match(route, /setView\(next\)/);
  assert.match(route, /switchView\('official'\)/);
  assert.match(route, /switchView\('personal'\)/);
  assert.match(route, /Official estimates/);
  assert.match(route, /My Estimates/);
  assert.match(route, /Private working estimates remain unpublished until submitted for review/);
});
