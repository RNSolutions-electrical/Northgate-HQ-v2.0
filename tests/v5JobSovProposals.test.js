import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260922165714_v5_job_sov_proposals_and_atomic_archive.sql', import.meta.url),
  'utf8',
);
const workspace = readFileSync(new URL('../src/modules/jobs/JobsWorkspace.jsx', import.meta.url), 'utf8');
const queue = readFileSync(new URL('../src/modules/jobs/JobFinancialProposalQueue.jsx', import.meta.url), 'utf8');

test('official SOV adapter is stale-safe, atomic, and protects billing history', () => {
  assert.match(migration, /CREATE FUNCTION public\.apply_job_sov_line_change/);
  assert.match(migration, /target\.updated_at IS DISTINCT FROM expected_updated_at/);
  assert.match(migration, /revised contract value cannot be below billed-to-date/i);
  assert.match(migration, /Billed-to-date is controlled by finalized Pay Apps/i);
  assert.match(migration, /change_order_sov_allocations/);
  assert.match(migration, /job_pay_application_lines/);
  assert.match(migration, /UPDATE public\.job_revenue_lines SET archived_at=now\(\)/);
  assert.match(migration, /INSERT INTO public\.change_logs/);
});

test('SOV proposals are constrained to Job Billing and canonical AUD-046 review', () => {
  assert.match(migration, /CREATE FUNCTION public\.save_v5_job_sov_proposal/);
  assert.match(migration, /current_scoped_authorization_decision\('POL-010'/);
  assert.match(migration, /'jobs','sov_proposal'/);
  assert.match(migration, /'destination_key','official_job_sov','action_id','AUD-046'/);
  assert.match(migration, /CREATE TRIGGER guard_job_sov_submission/);
  assert.match(migration, /Use the Job Billing workflow to submit this SOV proposal/);
});

test('review application is exact, baseline-bound, and idempotent', () => {
  assert.match(migration, /CREATE FUNCTION public\.apply_v5_job_sov_proposal/);
  assert.match(migration, /destination\.status='applied'/);
  assert.match(migration, /destination\.version=p_expected_version\+1/);
  assert.match(migration, /destination\.payload_hash=p_expected_payload_hash/);
  assert.match(migration, /destination\.proposed_payload IS DISTINCT FROM copy\.payload/);
  assert.match(migration, /official financial baseline changed; reload before applying/i);
  const apply = migration.indexOf('saved:=public.apply_job_sov_line_change');
  const complete = migration.indexOf('public.complete_v5_destination_application', apply);
  assert.ok(apply > 0 && complete > apply);
});

test('SOV endpoints are authenticated-only', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.apply_job_sov_line_change[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.apply_job_sov_line_change[\s\S]*TO authenticated/);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO anon/);
});

test('Billing UI routes contributors through review and approvers through the official adapter', () => {
  assert.match(workspace, /if \(canApproveSelectedBudget\) \{[\s\S]*?apply_job_sov_line_change/);
  assert.match(workspace, /save_v5_job_sov_proposal/);
  assert.match(workspace, /submit_v5_job_sov_proposal/);
  assert.match(workspace, /was submitted for Billing review/);
  assert.match(workspace, /const editableRevenueValue = \(row, field, content, label\) => canProposeSelectedBudget/);
  assert.doesNotMatch(workspace, /\.from\('job_revenue_lines'\)[\s\S]{0,200}\.update\(\{[\s\S]{0,200}archived_at/);
});

test('financial review queue combines Budget and SOV without blending proposal payloads', () => {
  assert.match(queue, /read_v5_job_financial_review_queue/);
  assert.match(queue, /read_v5_job_sov_review_queue/);
  assert.match(queue, /proposal_type: 'budget'/);
  assert.match(queue, /proposal_type: 'sov'/);
  assert.match(queue, /apply_v5_job_sov_proposal/);
  assert.match(queue, /Apply to Billing/);
});
