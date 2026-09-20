import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920173000_primary_identity_foundation.sql', import.meta.url),
  'utf8',
);
const permissionsHook = readFileSync(new URL('../src/hooks/usePermissions.js', import.meta.url), 'utf8');
const developerWorkspace = readFileSync(new URL('../src/modules/developer/DeveloperWorkspace.jsx', import.meta.url), 'utf8');

test('Primary is bound to the confirmed stable authenticated subject', () => {
  assert.match(migration, /'primary',\s*'user_3FUhnQjqCnefFEARvCslkbogRwT'/s);
  assert.doesNotMatch(migration, /lower\(email\)|CRNCMK@gmail\.com/i);
  assert.match(migration, /CREATE FUNCTION public\.current_user_is_primary\(\)/);
});

test('Primary permission state is protected from other accounts and indirect templates', () => {
  assert.match(migration, /protect_primary_user_permission_state/);
  assert.match(migration, /protect_primary_permission_overrides/);
  assert.match(migration, /protect_primary_template_assignment/);
  assert.match(migration, /protect_primary_permission_template_defaults/);
  assert.match(migration, /is_protected_account\(old_user_id, 'primary'\)/);
  assert.match(migration, /is_protected_account\(new_user_id, 'primary'\)/);
  assert.match(migration, /Only the protected Primary account may change Primary access/);
});

test('can_manage_developers is server-derived and excluded from generic editing', () => {
  assert.match(migration, /jsonb_build_object\(\s*'can_manage_developers'/s);
  assert.match(permissionsHook, /can_manage_developers: false/);
  assert.match(permissionsHook, /canManageDevelopers: flags\.can_manage_developers/);
  assert.match(developerWorkspace, /\['can_access_developer', 'can_manage_developers'\]\.includes\(option\.flag\)/);
});
