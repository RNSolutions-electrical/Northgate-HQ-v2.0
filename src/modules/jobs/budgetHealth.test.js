import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBudgetHealth } from './budgetHealth.js';

test('classifies budget boundaries without changing amounts', () => {
  for (const [budget, actual, expected] of [
    [10000, 6000, 'healthy'], [10000, 8000, 'warning'], [10000, 8500, 'warning'],
    [10000, 9500, 'danger'], [10000, 9700, 'danger'], [10000, 10000, 'danger'],
    [10000, 10500, 'over-budget'], [0, 0, 'unavailable'], [null, 10, 'unavailable'],
    [undefined, 10, 'unavailable'], [1000, null, 'unavailable'], [-100, 25, 'unavailable'],
    [1000000000.25, 100, 'healthy'], [10.25, 8.2, 'warning'],
  ]) assert.equal(classifyBudgetHealth(budget, actual).state, expected);
  assert.equal(classifyBudgetHealth(10000, 10500).label, 'OVER BUDGET');
});
