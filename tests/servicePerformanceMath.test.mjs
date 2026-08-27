import assert from 'node:assert/strict';
import test from 'node:test';
import { grossMargin, grossProfit, servicePerformanceTotals, weightedGrossMargin } from '../src/modules/service-performance/servicePerformanceMath.js';

test('gross profit and margin exclude sales tax inputs by accepting revenue excluding tax', () => {
  assert.equal(grossProfit(1000, 650), 350);
  assert.equal(grossMargin(1000, 650), 35);
});

test('zero revenue produces an empty margin rather than division by zero', () => {
  assert.equal(grossMargin(0, 100), null);
  assert.equal(weightedGrossMargin([]), null);
});

test('losses remain negative', () => {
  assert.equal(grossProfit(500, 725), -225);
  assert.equal(grossMargin(500, 725), -45);
});

test('department margin is weighted from totals, not averaged from job percentages', () => {
  const rows = [
    { invoiced_revenue: 1000, total_hard_cost: 500, gross_profit: 500, collected: 1000, outstanding: 0 },
    { invoiced_revenue: 100, total_hard_cost: 90, gross_profit: 10, collected: 0, outstanding: 100 },
  ];
  assert.equal(Number(weightedGrossMargin(rows).toFixed(4)), 46.3636);
  assert.deepEqual(servicePerformanceTotals(rows), { revenue: 1100, collected: 1000, cost: 590, profit: 510, outstanding: 100 });
});
