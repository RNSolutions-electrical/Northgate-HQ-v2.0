import { calculateForecastLine, EMPTY_FORECAST_INPUT } from './jobForecast.js';

const CASH = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const validPart = (raw, label) => {
  const value = String(raw ?? '').trim();
  if (!CASH.test(value) || !Number.isFinite(Number(value)) || Number(value) > 9999999999.99) throw new Error(`Enter a valid ${label}.`);
  return Number(value);
};

export const emptyPreview = (row) => ({
  monthly: '', mode: row.category === 'labor' ? 'crew' : row.category === 'material' ? 'materials' : 'dollars',
  remaining: '', unposted: '', workers: '1', duration: '', unit: 'days', dayHours: '8', rate: '',
  quoted: '', allowance: '',
});

export function previewForecast(row, draft) {
  let input = { ...EMPTY_FORECAST_INPUT, monthly: draft.monthly, unposted: draft.unposted };
  const active = (k) => String(draft[k] ?? '').trim() !== '';
  let hours = null;
  let future = null;
  if (draft.mode === 'crew' && (active('duration') || active('rate'))) {
    const workers = validPart(draft.workers, 'worker count');
    if (workers < 1 || !Number.isInteger(workers)) throw new Error('Enter a whole worker count of at least 1.');
    const duration = validPart(draft.duration, 'duration per worker');
    const hoursPerDay = draft.unit === 'days' ? validPart(draft.dayHours, 'hours per day') : 1;
    if (!hoursPerDay) throw new Error('Hours per day must be greater than zero.');
    hours = workers * duration * hoursPerDay;
    const rate = validPart(draft.rate, 'labor cost rate');
    future = hours * rate;
    input = { ...input, mode: 'hours', hours, rate };
  } else if (draft.mode === 'materials' && (active('quoted') || active('allowance'))) {
    future = (active('quoted') ? validPart(draft.quoted, 'quoted materials cost') : 0) +
      (active('allowance') ? validPart(draft.allowance, 'unquoted allowance') : 0);
    input.remaining = future;
  } else if (draft.mode === 'dollars') {
    input.remaining = draft.remaining;
    future = active('remaining') ? validPart(draft.remaining, 'remaining work amount') : null;
  }
  return { ...calculateForecastLine(row, input), input, hours, future };
}

export function previewTotals(rows, previews) {
  function sum(values) {
    const known = values.filter((v) => v != null && v !== '' && Number.isFinite(Number(v)));
    return { known: known.length, value: known.reduce((a, b) => a + Math.round(Number(b) * 100), 0) / 100 };
  }
  return {
    budget: sum(rows.map((row) => row.currentBudget)),
    actual: sum(rows.map((row) => row.actual_cost_amount)),
    monthly: sum(rows.map((row) => previews[row.id]?.monthly ?? row.forecast_to_complete_amount)),
    final: sum(rows.map((row) => previews[row.id]?.final ?? row.forecast_final_amount)),
  };
}
