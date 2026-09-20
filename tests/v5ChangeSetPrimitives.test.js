import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260920214500_v5_working_copy_change_set_primitives.sql', import.meta.url),
  'utf8',
);

test('working copies are durable, owner-scoped, versioned, and never direct client tables', () => {
  assert.match(migration, /CREATE TABLE public\.v5_working_copies/);
  assert.match(migration, /owner_user_id text NOT NULL/);
  assert.match(migration, /version integer NOT NULL DEFAULT 1/);
  assert.match(migration, /WHERE id=p_working_copy_id AND owner_user_id=actor FOR UPDATE/);
  assert.match(migration, /Working copy changed; reload before saving/);
  assert.match(migration, /CREATE TABLE public\.v5_working_copy_requests/);
  assert.match(migration, /Request id was already used for different working-copy content/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.v5_working_copies/);
});

test('one submission snapshots the exact draft into independent destinations', () => {
  assert.match(migration, /UNIQUE \(initiated_by, request_id\)/);
  assert.match(migration, /UNIQUE \(working_copy_id, working_copy_version\)/);
  assert.match(migration, /UNIQUE \(change_set_id, destination_key\)/);
  assert.match(migration, /proposed_payload,payload_hash,source_version/);
  assert.match(migration, /COALESCE\(destination->'payload',copy\.payload\)/);
  assert.match(migration, /Destination keys must be unique within one save/);
  assert.match(migration, /Every changed item needs a unique key and distinct before\/after values/);
  assert.match(migration, /'v5_change_set_items'/);
});

test('review binds exact version and hash and cannot mark a destination applied', () => {
  assert.match(migration, /destination\.version<>p_expected_version OR destination\.payload_hash<>p_expected_payload_hash/);
  assert.match(migration, /p_decision NOT IN \('return','decline'\)/);
  assert.doesNotMatch(migration.match(/CREATE FUNCTION public\.review_v5_change_destination[\s\S]*?\$function\$;/)?.[0] ?? '', /SET\s+status='applied'/);
});

test('only a private module adapter can complete an applied destination', () => {
  assert.match(migration, /CREATE FUNCTION public\.complete_v5_destination_application/);
  assert.match(migration, /No client role receives EXECUTE/);
  const grant = migration.match(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO authenticated;/)?.[0] ?? '';
  assert.doesNotMatch(grant, /complete_v5_destination_application/);
  assert.match(migration, /IF aggregate_status='applied' THEN/);
});

test('payloads are bounded and internal reasons remain in controlled audit records', () => {
  assert.match(migration, /pg_column_size\(p_payload\) > 1048576/);
  assert.match(migration, /shared_reason text CHECK/);
  assert.match(migration, /public\.change_logs/);
  assert.doesNotMatch(migration, /customer_export|customer_document|customer_email/i);
});
