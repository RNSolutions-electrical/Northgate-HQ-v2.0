import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPreview, previewForecast, previewTotals } from './financialsPreview.js';
import { buildForecastPatches } from './jobForecast.js';
const labor = { id: 'l', category: 'labor', updated_at: 'revision1', actual_cost_amount: 100, currentBudget: 1000, forecast_to_complete_amount: 75, forecast_final_amount: 900 };
const materials = { id: 'm', category: 'material', updated_at: 'revision1', actual_cost_amount: 60, currentBudget: 150, forecast_to_complete_amount: null, forecast_final_amount: null };
const forecast = (row, input) => previewForecast(row, { ...emptyPreview(row), ...input });
test('crew defaults to days and shows per-worker hours; monthly remains separate', () => {
 const a = forecast(labor, { workers: '3', duration: '2', rate: '50', monthly: '35', unposted: '25' });
 assert.equal(a.hours, 48);
 assert.equal(a.final, 2525);
 assert.equal(a.monthly,35);
 assert.equal(forecast(labor, { workers: '3', duration: '16', rate: '50', unit:'hours', dayHours:'ignored' }).hours,48);
});
test('materials keeps quoted and unquoted portions distinct and leaves an empty forecast alone', () => {
 assert.equal(forecast(materials, {quoted:'25',allowance:'14',unposted:'1'}).final, 100);
 assert.equal(forecast(labor,{}).final,null);
 assert.equal(forecast(labor,{mode:'dollars',remaining:'0'}).final,100);
 assert.throws(() => forecast(labor,{unposted:'12'}), /remaining work/);
 assert.throws(() => forecast(labor,{workers:'1.5',duration:'2',rate:'2'}), /whole worker/);
 assert.throws(() => forecast(labor,{duration:'2',rate:''}), /rate/);
});
test('save patches only two forecast dollar fields and refuses a concurrent revision', () => {
 const a = forecast(labor,{mode:'dollars',remaining:'25',monthly:'40'});
 const drafts = {l:{version:labor.updated_at,input:a.input}};
 assert.deepEqual(buildForecastPatches([labor,materials],drafts),[{id:'l',expected_updated_at:'revision1',forecast_to_complete_amount:40,forecast_final_amount:125}]);
 assert.throws(() => buildForecastPatches([{...labor,updated_at:'revision2'}],drafts), /changed/);
});
test('totals keep unknown rows distinct from explicit zero and overlay only edited values', () => {
 assert.deepEqual(previewTotals([labor,materials],{}).final,{known:1,value:900});
 const totals = previewTotals([labor,materials],{l:{monthly:0,final:125},m:{final:60}});
 assert.deepEqual(totals.monthly,{known:1,value:0});
 assert.deepEqual(totals.final,{known:2,value:185});
 assert.deepEqual(totals.budget,{known:2,value:1150});
 assert.deepEqual(totals.actual,{known:2,value:160});
});
