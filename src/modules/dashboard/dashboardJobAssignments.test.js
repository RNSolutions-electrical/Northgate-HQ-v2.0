import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDashboardJobAssignments } from './dashboardJobAssignments.js';

const job = { id: 'job-1', job_number: '26-001', name: 'Flowers Cottage', status: 'active' };

test('shows controlled responsibility with a readable label', () => {
  const rows = mergeDashboardJobAssignments([], [{ job_id: job.id, responsibility: 'electrical_pm', assigned_at: '2026-09-24' }], [job]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role_labels, 'Electrical Project Manager');
  assert.equal(rows[0].id, job.id);
});

test('combines multiple slots and existing membership without duplicate jobs', () => {
  const rows = mergeDashboardJobAssignments(
    [{ job, assigned_at: '2026-09-23' }],
    [{ job_id: job.id, responsibility: 'superintendent' }, { job_id: job.id, responsibility: 'electrical_lead' }],
    [job],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role_labels, 'Superintendent, Electrical Lead, Project member');
});

test('does not render a responsibility for a job missing from the RLS-filtered job result', () => {
  const rows = mergeDashboardJobAssignments([], [{ job_id: job.id, responsibility: 'superintendent' }], []);
  assert.deepEqual(rows, []);
});

test('retains existing project membership without a controlled slot', () => {
  const rows = mergeDashboardJobAssignments([{ job, assigned_at: '2026-09-23' }], [], []);
  assert.equal(rows[0].role_labels, 'Project member');
});
