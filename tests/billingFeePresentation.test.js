import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260921190000_billing_fee_presentation_mode.sql', import.meta.url), 'utf8');
const jobs = fs.readFileSync(new URL('../src/modules/jobs/JobsWorkspace.jsx', import.meta.url), 'utf8');
const billing = fs.readFileSync(new URL('../src/modules/jobs/BillingActions.jsx', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../src/modules/jobs/SovBuilder.jsx', import.meta.url), 'utf8');

test('fee presentation is per job and defaults to the existing distributed behavior', () => {
  assert.match(migration, /billing_fee_presentation text NOT NULL DEFAULT 'distributed'/);
  assert.match(migration, /CHECK \(billing_fee_presentation IN \('distributed','separate'\)\)/);
  assert.match(builder, /Distribute across work lines/);
  assert.match(builder, /Show as separate lines/);
});

test('fee source lines are retained and distributed values reconcile deterministically', () => {
  assert.doesNotMatch(migration, /category<>'ohp_fee' AND b\.budget_amount>=0/);
  assert.match(migration, /category='ohp_fee' AND presentation='distributed' THEN 0/);
  assert.match(migration, /division_fee\*direct_through\/division_direct/);
  assert.match(migration, /scheduled_total <> contract_total/);
});

test('billed history locks the fee presentation setting', () => {
  assert.match(migration, /status='billed'/);
  assert.match(migration, /Fee presentation is locked because this job has billed Pay App history/);
  assert.match(migration, /status='approved'/);
});

test('SOV and Pay App interfaces group lines into collapsible project divisions', () => {
  assert.match(jobs, /collapsedRevenueDivisions/);
  assert.match(jobs, /revenueGroups\.map/);
  assert.match(billing, /collapsedDivisions/);
  assert.match(billing, /Division \$\{code\}/);
  assert.match(billing, /Collapse All/);
});
