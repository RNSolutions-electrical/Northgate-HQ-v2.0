import { classifyBudgetHealth } from '../jobs/budgetHealth.js';
import { effectiveCurrentBudget } from '../jobs/currentBudget.js';

const severity = { 'over-budget': 0, danger: 1, warning: 2 };

export function buildDashboardBudgetAlerts({ jobs = [], lines = [], postings = [], acknowledgements = [] }) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const postingsByLine = new Map();
  for (const posting of postings) {
    postingsByLine.set(posting.job_budget_line_id,
      (postingsByLine.get(posting.job_budget_line_id) || 0) + Number(posting.amount_delta || 0));
  }
  const acknowledgementsByLine = new Map(acknowledgements.map((row) => [row.job_budget_line_id, row]));
  return lines.flatMap((line) => {
    const job = jobsById.get(line.job_id);
    if (!job) return [];
    const budget = effectiveCurrentBudget(line, postingsByLine.get(line.id) || 0);
    const actual = Number(line.actual_cost_amount);
    const health = classifyBudgetHealth(budget, line.actual_cost_amount);
    if (!(health.state in severity)) return [];
    const acknowledgement = acknowledgementsByLine.get(line.id);
    const acknowledged = acknowledgement?.budget_cents === Math.round(budget * 100)
      && acknowledgement?.actual_cents === Math.round(actual * 100);
    return [{
      id: line.id,
      jobId: job.id,
      jobLabel: [job.job_number, job.name].filter(Boolean).join(' — '),
      lineLabel: [line.cost_code, line.description].filter(Boolean).join(' — '),
      budget,
      actual,
      remaining: budget - actual,
      ...health,
      acknowledged,
      acknowledgedAt: acknowledged ? acknowledgement.acknowledged_at : null,
    }];
  }).sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged)
    || severity[a.state] - severity[b.state]
    || a.jobLabel.localeCompare(b.jobLabel)
    || a.lineLabel.localeCompare(b.lineLabel));
}
