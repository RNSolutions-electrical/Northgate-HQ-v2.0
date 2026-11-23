const MAX_AMOUNT = 9999999999.99;

function amount(value, label, { optional = false, signed = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    if (value == null && optional) return null;
    throw new Error(`Enter ${label}.`);
  }
  const raw = String(value).trim();
  if (!raw && optional) return null;
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) throw new Error(`Enter a valid ${label}.`);
  const number = Number(raw);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_AMOUNT || (!signed && number < 0)) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return number;
}

const cents = (value) => Math.sign(value) * Math.round((Math.abs(value) + Math.max(1, Math.abs(value)) * Number.EPSILON) * 100) / 100;
export const EMPTY_FORECAST_INPUT = Object.freeze({ monthly: '', mode: 'dollars', remaining: '', hours: '', rate: '', unposted: '' });

export function calculateForecastLine(row, input) {
  const monthly = amount(input.monthly, 'monthly forecast amount', { optional: true });
  const future = input.mode === 'hours'
    ? (() => {
      const hours = amount(input.hours, 'remaining hours', { optional: true });
      const rate = amount(input.rate, 'hourly cost rate', { optional: true });
      if (hours === null && rate === null) return null;
      if (hours === null || rate === null) throw new Error('Enter both remaining hours and hourly cost rate.');
      return hours * rate;
    })()
    : amount(input.remaining, 'remaining work amount', { optional: true });
  const unposted = amount(input.unposted, 'unposted amount', { optional: true });
  if (future === null && unposted !== null) throw new Error('Enter remaining work, or explicitly enter 0 if no work remains.');
  if (future === null) return { monthly: monthly === null ? null : cents(monthly), final: null };

  const actual = amount(row.actual_cost_amount, 'booked actuals', { signed: true });
  const final = cents(cents(actual) + cents(unposted ?? 0) + cents(future));
  if (!Number.isFinite(final) || final < 0 || final > MAX_AMOUNT) throw new Error('Projected final cost is outside the allowable range.');
  return { monthly: monthly === null ? null : cents(monthly), final };
}

export function buildForecastPatches(rows, drafts) {
  const current = new Map(rows.map((row) => [row.id, row]));
  const patches = [];
  for (const [id, draft] of Object.entries(drafts)) {
    const row = current.get(id);
    if (!row || !draft.version || row.updated_at !== draft.version) {
      throw new Error('A financial line changed. Close and reopen Forecast, then review the current values before saving.');
    }
    const { monthly, final } = calculateForecastLine(row, draft.input);
    const patch = { id, expected_updated_at: draft.version };
    if (monthly !== null && (row.forecast_to_complete_amount == null || monthly !== Number(row.forecast_to_complete_amount))) {
      patch.forecast_to_complete_amount = monthly;
    }
    if (final !== null && (row.forecast_final_amount == null || final !== Number(row.forecast_final_amount))) {
      patch.forecast_final_amount = final;
    }
    if (Object.keys(patch).length > 2) patches.push(patch);
  }
  if (patches.length > 500) throw new Error('Save at most 500 changed lines at once.');
  return patches;
}
