import test from 'node:test';
import assert from 'node:assert/strict';
import { signedBudgetBalance, budgetBalanceClass } from '../src/modules/jobs/budgetBalance.js';
import { effectiveCurrentBudget } from '../src/modules/jobs/currentBudget.js';

const remaining = (rows, postings = []) => signedBudgetBalance(
  rows.reduce((total, row) => total + effectiveCurrentBudget(row, postings.filter(p => p.line === row.id).reduce((sum, p) => sum + p.amount, 0)), 0),
  rows.reduce((total, row) => total + Number(row.actual_cost_amount || 0), 0),
);

test('Toro separate billing lines aggregate signed actual remaining without cost transfers', () => {
  const rows = [
    {id:'labor', budget_amount:5500, actual_cost_amount:0, forecast_final_amount:0},
    {id:'material', budget_amount:0, actual_cost_amount:6729.59, forecast_final_amount:0},
  ];
  assert.equal(remaining(rows), -1229.59);
  assert.equal(signedBudgetBalance(0, 6729.59), -6729.59);
  assert.equal(remaining(rows.map(row => ({...row, actual_cost_amount:row.id === 'labor' ? 6729.59 : 0}))), -1229.59);
  assert.equal(remaining(rows.map(row => ({...row, forecast_final_amount:9000}))), -1229.59);
  assert.equal(rows[1].actual_cost_amount, 6729.59);
});

test('actual credits, zero budgets, and negative adjustments stay signed', () => {
  for (const [budget, actual, expected] of [[0,0,0],[0,100,-100],[0,-25,25],[100,-25,125],[-100,-50,-50],[-100,-150,50]]) {
    assert.equal(signedBudgetBalance(budget, actual), expected);
  }
  assert.equal(remaining([{id:'l', budget_amount:1000, budget_change_amount:-200, actual_cost_amount:700}], [{line:'l',amount:300},{line:'l',amount:-500}]), -100);
});

test('zero and positive current-budget overrides precede all calculated adjustments', () => {
  const row = {id:'l', budget_amount:1000, budget_change_amount:-200, actual_cost_amount:100};
  const postings = [{line:'l',amount:300},{line:'l',amount:-50}];
  assert.equal(remaining([{...row, current_budget_override_amount:0}], postings), -100);
  assert.equal(remaining([{...row, current_budget_override_amount:1200}], postings), 1100);
  assert.equal(remaining([{...row, current_budget_override_amount:null}], postings), 950);
});

test('decimal arithmetic and empty totals have a neutral exact zero with no clamp', () => {
  assert.equal(signedBudgetBalance(0.1 + 0.2, 0.3), 0);
  assert.equal(signedBudgetBalance('10.25', '10.26'), -0.01);
  assert.equal(remaining([]), 0);
  for (const [amount, css] of [[-0.01,'is-negative'],[0,'is-neutral'],[0.01,'is-positive']]) {
    assert.equal(budgetBalanceClass(amount), css);
  }
});
