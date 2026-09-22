import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260922162009_v5_jobs_financials_foundation.sql', import.meta.url),
  'utf8',
);
const jobsWorkspace = readFileSync(
  new URL('../src/modules/jobs/JobsWorkspace.jsx', import.meta.url),
  'utf8',
);
const reviewQueue = readFileSync(
  new URL('../src/modules/jobs/JobFinancialProposalQueue.jsx', import.meta.url),
  'utf8',
);

test('financial baseline metadata does not duplicate financial values', () => {
  assert.match(migration, /CREATE TABLE public\.job_financial_baselines/);
  assert.match(migration, /job_id uuid PRIMARY KEY REFERENCES public\.jobs/);
  assert.doesNotMatch(
    migration.match(/CREATE TABLE public\.job_financial_baselines[\s\S]*?\);/)?.[0] ?? '',
    /budget_amount|scheduled_value_amount|actual_cost_amount/,
  );
  assert.match(migration, /source IN \('legacy_backfill','official_write','reviewed_proposal'\)/);
  assert.match(migration, /ON CONFLICT \(job_id\) DO NOTHING/);
});

test('baseline records are RPC-only and protected by RLS', () => {
  assert.match(migration, /ALTER TABLE public\.job_financial_baselines ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.job_financial_baselines FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE).*job_financial_baselines/i);
  assert.match(migration, /current_user_can_access_job\(p_job_id,'can_view_project_financials'\)/);
});

test('every retained official financial write advances the baseline token', () => {
  assert.match(migration, /CREATE FUNCTION public\.touch_job_financial_baseline/);
  assert.match(migration, /AFTER INSERT OR UPDATE OR DELETE ON public\.job_budget_lines/);
  assert.match(migration, /AFTER INSERT OR UPDATE OR DELETE ON public\.job_revenue_lines/);
  assert.match(migration, /version=public\.job_financial_baselines\.version\+1/);
  assert.match(migration, /northgate\.reviewed_job_financial_apply/);
});

test('contributors can only save constrained project-scoped financial proposals', () => {
  assert.match(migration, /CREATE FUNCTION public\.save_v5_job_financial_proposal/);
  assert.match(migration, /current_scoped_authorization_decision\([\s\S]*?'POL-010'/);
  assert.match(migration, /jsonb_array_length\(p_lines\) NOT BETWEEN 1 AND 500/);
  assert.match(migration, /A proposed financial line contains an unsupported field/);
  assert.match(migration, /current_user_can_read_project_financial_line/);
  assert.match(migration, /Protected financial access is required/);
  assert.match(migration, /public\.save_v5_working_copy/);
});

test('submission chooses baseline or edit authority and snapshots line changes', () => {
  assert.match(migration, /action_id:=CASE WHEN baseline\.job_id IS NULL THEN 'CFG-005' ELSE 'CFG-004' END/);
  assert.match(migration, /'destination_key','official_job_financials'/);
  assert.match(migration, /'before_value'.*CASE WHEN target\.id IS NULL/s);
  assert.match(migration, /'after_value',entry/);
  assert.match(migration, /official financial baseline changed; reload the proposal before submitting/i);
  assert.match(migration, /CREATE FUNCTION public\.guard_job_financial_submission/);
  assert.match(migration, /northgate\.job_financial_submission/);
  assert.match(migration, /Use the Job Financials workflow to submit this proposal/);
});

test('review queue is restricted by exact canonical job financial authority', () => {
  assert.match(migration, /CREATE FUNCTION public\.read_v5_job_financial_review_queue/);
  assert.match(migration, /destination\.action_id IN \('CFG-004','CFG-005'\)/);
  assert.match(migration, /current_scoped_authorization_decision\([\s\S]*?destination\.action_id,destination\.scope_context/);
});

test('application is exact, stale-safe, atomic, and idempotent', () => {
  assert.match(migration, /destination\.status='applied'/);
  assert.match(migration, /destination\.version=p_expected_version\+1/);
  assert.match(migration, /destination\.payload_hash=p_expected_payload_hash/);
  assert.match(migration, /destination\.proposed_payload IS DISTINCT FROM copy\.payload/);
  assert.match(migration, /baseline_version<>COALESCE\(baseline\.version,0\)/);
  const save = migration.indexOf('saved_lines:=public.save_job_financial_batch');
  const baseline = migration.indexOf('SELECT * INTO baseline FROM public.job_financial_baselines', save);
  const complete = migration.indexOf('public.complete_v5_destination_application', save);
  assert.ok(save > 0 && baseline > save && complete > baseline);
});

test('only authenticated callers receive the constrained endpoints', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.read_job_financial_baseline[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.read_job_financial_baseline[\s\S]*TO authenticated/,
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO anon/);
});

test('Job Financials preserves direct approver writes and routes contributors through review', () => {
  assert.match(jobsWorkspace, /const canProposeSelectedBudget = canViewFinancials && permissions\.permissionSource === 'server'/);
  assert.match(jobsWorkspace, /if \(canApproveSelectedBudget\) \{[\s\S]*?save_job_financial_batch/);
  assert.match(jobsWorkspace, /save_v5_job_financial_proposal/);
  assert.match(jobsWorkspace, /submit_v5_job_financial_proposal/);
  assert.match(jobsWorkspace, /was submitted for financial review/);
  assert.match(jobsWorkspace, /<JobFinancialProposalQueue[\s\S]*?onApplied=\{jobBudget\.reload\}/);
});

test('review UI binds every decision to the exact server version and payload hash', () => {
  assert.match(reviewQueue, /read_v5_job_financial_review_queue/);
  assert.match(reviewQueue, /apply_v5_job_financial_proposal/);
  assert.match(reviewQueue, /review_v5_change_destination/);
  assert.match(reviewQueue, /p_expected_version: item\.destination_version/);
  assert.match(reviewQueue, /p_expected_payload_hash: item\.payload_hash/);
  assert.match(reviewQueue, /Return for edits/);
  assert.match(reviewQueue, /Decline/);
});
