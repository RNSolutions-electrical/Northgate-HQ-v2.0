import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastPatches, calculateForecastLine, EMPTY_FORECAST_INPUT } from './jobForecast.js';

const row = { id: 'row-a', updated_at: '2026-11-23T10:00:00Z', actual_cost_amount: '100.25', forecast_to_complete_amount: '20', forecast_final_amount: '145' };
const input = (values) => ({ ...EMPTY_FORECAST_INPUT, ...values });
const draft = (values, version = row.updated_at) => ({ [row.id]: { version, input: input(values) } });

test('forecast keeps monthly separate and adds unposted and dollars once', () => {
  assert.deepEqual(calculateForecastLine(row, input({ monthly: '30', remaining: '40.31', unposted: '15.52' })), { monthly: 30, final: 156.08 });
});
test('hours use the supplied cost rate, not the separate monthly forecast', () => {
  assert.deepEqual(calculateForecastLine(row, input({ mode: 'hours', hours: '5.5', rate: '67', monthly: '20' })), { monthly: 20, final: 468.75 });
  assert.throws(() => calculateForecastLine(row, input({ mode: 'hours', hours: '5' })), /both/);
});
test('blank leaves saved values and explicit zero is distinct', () => {
  assert.deepEqual(buildForecastPatches([row], draft({})), []);
  assert.deepEqual(buildForecastPatches([row], draft({monthly:'0'})), [{id: row.id, expected_updated_at: row.updated_at, forecast_to_complete_amount: 0}]);
  assert.deepEqual(buildForecastPatches([row], draft({remaining:'0'})), [{id: row.id, expected_updated_at: row.updated_at, forecast_final_amount: 100.25}]);
});
test('stale snapshots, missing actuals and unposted alone do not save', () => {
  assert.throws(() => buildForecastPatches([row], draft({monthly:'40'}, 'old')), /changed/);
  assert.throws(() => buildForecastPatches([], draft({monthly:'40'})), /changed/);
  assert.throws(() => calculateForecastLine({ actual_cost_amount: null }, input({ remaining:'50' })), /actuals/);
  assert.throws(() => calculateForecastLine(row, input({ unposted:'15' })), /explicitly/);
});
test('batch sends only changed forecast values and optimistic version', () => {
  assert.deepEqual(buildForecastPatches([row], draft({monthly:'20', remaining:'50', unposted:'20'})), [{id:row.id, expected_updated_at:row.updated_at, forecast_final_amount:170.25}]);
  for (const bad of ['1e10', 'Infinity', '-5', '10000000000', 'abc']) {
    assert.throws(() => buildForecastPatches([row], draft({monthly:bad})), /valid/);
  }
});
