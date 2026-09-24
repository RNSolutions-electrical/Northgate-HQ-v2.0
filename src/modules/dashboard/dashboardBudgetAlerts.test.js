import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardBudgetAlerts } from './dashboardBudgetAlerts.js';

const job = { id: 'job-1', job_number: 'J-1', name: 'Test Job' };
const line = (id, actual, extra = {}) => ({ id, job_id: job.id, cost_code: id,
  description: 'Labor', budget_amount: 100, budget_change_amount: 0,
  current_budget_override_amount: null, actual_cost_amount: actual, ...extra });
const build = (lines, options = {}) => buildDashboardBudgetAlerts({ jobs: [job], lines, ...options });

test('only visible warning/danger/over-budget financial lines become alerts', () => {
  const alerts = build([line('healthy', 79.99), line('warn', 80), line('danger', 95),
    line('over', 100.01), line('zero', 1, { budget_amount: 0 }),
    line('missing', null), line('other-job', 100, { job_id: 'other' })]);
  assert.deepEqual(alerts.map((item) => item.id), ['over', 'danger', 'warn']);
  assert.deepEqual(alerts.map((item) => item.state), ['over-budget', 'danger', 'warning']);
});

test('approved CO postings and explicit current budget override follow Financials', () => {
  const alerts = build([line('co', 80), line('override', 80, { current_budget_override_amount: 75 })], {
    postings: [{ job_budget_line_id: 'co', amount_delta: 20 }],
  });
  assert.deepEqual(alerts.map((item) => item.id), ['override']);
  assert.equal(alerts[0].budget, 75);
});

test('acknowledgement keeps issue visible and expires when financial snapshot changes', () => {
  const acknowledgement = { job_budget_line_id: 'warn', budget_cents: 10000, actual_cents: 8000,
    acknowledged_at: '2026-09-24T12:00:00Z' };
  const accepted = build([line('warn', 80)], { acknowledgements: [acknowledgement] });
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].acknowledged, true);
  const changed = build([line('warn', 81)], { acknowledgements: [acknowledgement] });
  assert.equal(changed[0].acknowledged, false);
});
