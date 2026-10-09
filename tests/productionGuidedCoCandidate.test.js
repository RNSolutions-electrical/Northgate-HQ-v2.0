import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const candidate = await readFile(new URL('../docs/releases/sql/production_guided_co_targeted_candidate_20261009.sql', import.meta.url), 'utf8');
const numbered = await readFile(new URL('../docs/releases/production-migration-candidate/supabase/migrations/20261009170611_staging_promotion_targeted_production.sql', import.meta.url), 'utf8');
const finalStaging = await readFile(new URL('../supabase/migrations/20260923210036_guided_change_order_stale_guard.sql', import.meta.url), 'utf8');
const functionBody = (sql) => sql.match(/AS \$\$([\s\S]*?)END \$\$;/)?.[1];

test('targeted Production guide preserves the final stale-write function body', () => {
  assert.equal(functionBody(candidate), functionBody(finalStaging));
  assert.equal(functionBody(numbered), functionBody(finalStaging));
  assert.match(candidate, /save_job_change_order_draft\(/);
  assert.doesNotMatch(candidate, /CREATE (?:OR REPLACE )?FUNCTION public\.save_job_change_order_draft/);
});

test('targeted Production guide fails closed and grants only authenticated execute', () => {
  assert.match(candidate, /Unexpected Change Order schema; stop and re-review target/);
  assert.match(candidate, /Production draft-save function changed; stop and re-review target/);
  assert.match(candidate, /ALTER COLUMN job_budget_line_id DROP NOT NULL/);
  assert.match(candidate, /REVOKE ALL ON FUNCTION public\.save_guided_change_order_draft[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(candidate, /GRANT EXECUTE ON FUNCTION public\.save_guided_change_order_draft[\s\S]*TO authenticated/);
  assert.match(candidate, /Guided Change Order execute grants failed/);
  assert.match(numbered, /Production draft-save function changed; stop and re-review target/);
  assert.match(numbered, /FROM PUBLIC,anon,authenticated/);
});
