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

test('zero and negative budgets retain over-budget status without a percentage denominator', () => {
  const classify = (budget, actual) => classifyBudgetHealth(budget, actual, { signedRemaining: true });
  assert.deepEqual(classify(0, 6729.59), { state: 'over-budget', label: 'OVER BUDGET', remainingPercent: null });
  assert.equal(classify(-100, -50).state, 'over-budget');
  assert.equal(classify(-100, -150).remainingPercent, null);
  assert.deepEqual(classify(0, 0), { state: 'neutral', label: 'At budget', remainingPercent: null });
  assert.equal(classify(100, 100).state, 'neutral');
  assert.equal(classify(0.3, 0.1 + 0.2).state, 'neutral');
});
