import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260929194805_sync_permission_profile_business_role.sql', import.meta.url), 'utf8');

test('new permission profiles default to the least-privileged business rank', () => {
  assert.match(sql, /ALTER COLUMN business_role SET DEFAULT 'User'/);
});

test('ordinary profile saves synchronize legacy and canonical business ranks', () => {
  assert.match(sql, /SET role = p_role,[\s\S]*?business_role = CASE[\s\S]*?ELSE p_role/);
  assert.match(sql, /WHEN p_role = 'Developer' THEN COALESCE\([\s\S]*?target\.business_role/);
});

test('profile rank changes retain authorization checks and before-after audit data', () => {
  assert.match(sql, /current_user_has_developer_access\(\)/);
  assert.match(sql, /'business_role', target\.business_role/g);
  assert.match(sql, /INSERT INTO public\.change_logs/);
});
