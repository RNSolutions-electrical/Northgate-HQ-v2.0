import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseTokenOptions } from '../src/services/clerkToken.js';

test('production retains the established Clerk Supabase JWT template', () => {
  assert.deepEqual(supabaseTokenOptions('production'), { template: 'supabase' });
  assert.deepEqual(supabaseTokenOptions('development', { skipCache: true }), {
    template: 'supabase', skipCache: true,
  });
});

test('staging requests native Clerk session tokens without a template', () => {
  assert.deepEqual(supabaseTokenOptions('staging'), {});
  assert.deepEqual(supabaseTokenOptions('staging', { skipCache: true }), { skipCache: true });
});
