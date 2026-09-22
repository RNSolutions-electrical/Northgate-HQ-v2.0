import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppEnvironment, validateBuildEnvironment, validateRuntimeEnvironment } from '../src/lib/environmentContract.mjs';

const productionUrl = 'https://keogysnoukbendfkfjcn.supabase.co';
const isolatedUrl = 'https://abcdefghijklmnopqrst.supabase.co';

test('existing main production builds retain their identity', () => {
  assert.equal(resolveAppEnvironment({}), 'production');
  assert.equal(validateBuildEnvironment({ BRANCH: 'main', CONTEXT: 'production', VITE_SUPABASE_URL: productionUrl }), 'production');
});

test('branch and preview builds cannot silently use the Production identity', () => {
  assert.throws(() => validateBuildEnvironment({ BRANCH: 'staging', VITE_SUPABASE_URL: productionUrl }), /non-main branch/i);
  assert.throws(() => validateBuildEnvironment({ CONTEXT: 'branch-deploy', VITE_SUPABASE_URL: productionUrl }), /non-production deploy/i);
});

test('staging and development builds must not connect to Production Supabase', () => {
  for (const name of ['staging', 'development']) {
    assert.throws(() => validateBuildEnvironment({ VITE_APP_ENV: name, VITE_SUPABASE_URL: productionUrl }), /isolated Supabase/i);
    assert.throws(() => validateBuildEnvironment({ VITE_APP_ENV: name, VITE_SUPABASE_URL: '' }), /isolated Supabase/i);
    assert.equal(validateBuildEnvironment({ VITE_APP_ENV: name, VITE_SUPABASE_URL: isolatedUrl }), name);
  }
});

test('unknown environment identities fail closed', () => {
  assert.throws(() => resolveAppEnvironment({ VITE_APP_ENV: 'preview' }), /VITE_APP_ENV/);
});

test('the local dev server cannot silently connect to Production', () => {
  assert.throws(() => validateRuntimeEnvironment({ VITE_SUPABASE_URL: productionUrl }, true), /Local development/i);
  assert.throws(() => validateRuntimeEnvironment({ VITE_APP_ENV: 'development', VITE_SUPABASE_URL: productionUrl }, true), /isolated Supabase/i);
  assert.equal(validateRuntimeEnvironment({ VITE_APP_ENV: 'development', VITE_SUPABASE_URL: isolatedUrl }, true), 'development');
});
