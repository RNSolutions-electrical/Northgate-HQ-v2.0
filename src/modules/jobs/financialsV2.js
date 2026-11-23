import { fromCents, toCents } from './billingMath.js';
import { effectiveCurrentBudget } from './currentBudget.js';

export const REPORTS = [['completion','Project completion'], ['cost','Execution / cost'], ['estimate','Estimate comparison'], ['revenue','Revenue forecast']];
export const sum = (rows, select) => rows.reduce((a, row) => a + toCents(select(row)), 0) / 100;
export const optional = (value) => value === '' || value == null ? null : Number(value);
export const difference = (a,b) => a == null || b == null ? null : fromCents(toCents(a)-toCents(b));
export const executionLine = (row) => row.category !== 'ohp_fee';
// Pass no CO selling-price postings into the execution cost calculation.
export const executionBudget = (row) => effectiveCurrentBudget(row);
export function indexRecords(records) {
  return Object.fromEntries(records.map(row => [`${row.kind}:${row.record_key}`,row]));
}

function spread(cents, weighted) {
  const denominator = weighted.reduce((a,r) => a + r.weight, 0n);
  if (!denominator || !cents) return new Map();
  const ordered = weighted.filter(r => r.weight > 0n).map(r => {
    const product = BigInt(cents) * r.weight;
    return { id:r.id, value:Number(product / denominator), remainder:product % denominator };
  }).sort((a,b) => a.remainder === b.remainder ? String(a.id).localeCompare(String(b.id)) : a.remainder > b.remainder ? -1 : 1);
  const rest = cents - ordered.reduce((a,r) => a+r.value,0);
  return new Map(ordered.map((r,i) => [r.id,r.value + (i < rest ? 1 : 0)]));
}

// Editing overrides only changes edited rows until the user asks to redistribute the remainder.
export function salesPlan(rows, fee, overrides = {}, pinned = null) {
  const cents = toCents(fee);
  const fixed = rows.filter(r => overrides[r.id] != null).map(r => ({
    id:r.id, weight:BigInt(Math.round(Number(overrides[r.id])*100)),
  }));
  const total = fixed.reduce((a,r) => a + Number(r.weight),0);
  if (total > 10000) throw new Error('Manual fee percentages add up to more than 100%.');
  const sign = cents < 0 ? -1 : 1;
  const fixedTotal = Number((BigInt(Math.abs(cents)) * BigInt(total) + 5000n) / 10000n);
  const fixedShares = spread(fixedTotal, fixed);
  const other = rows.filter(r => overrides[r.id] == null);
  const remainingShares = pinned ? null : spread(Math.abs(cents)-fixedTotal,other.map(r => ({
    id:r.id, weight:BigInt(Math.max(0,toCents(r.cost))),
  })));
  const lines = rows.map(row => {
    const share = overrides[row.id] != null ? sign * (fixedShares.get(row.id) || 0)
      : pinned ? toCents(pinned.get(row.id)) : sign * (remainingShares.get(row.id) || 0);
    return { ...row, fee:fromCents(share), sales:fromCents(share + toCents(row.cost)) };
  });
  return { fee, overrides, lines, unallocated:difference(fee,sum(lines,r=>r.fee)) };
}

export function reportRows(data, type) {
  const contract = data.contract ?? {}, totals = data.totals ?? {};
  if (type === 'cost') return [
    ['Code','Description','Execution budget','Posted actual','Incurred unposted (forecast input)','Future work (forecast input)','Monthly forecast','Completion forecast','Execution budget less completion','Forecast labor hours','Forecast labor cost rate','Forecast basis','Forecast inputs'],
    ...data.lines.map(r=>[r.code,r.label,r.budget,r.actual,r.unposted,r.future,r.monthly,r.final,difference(r.budget,r.final),r.hours,r.rate,r.basis,r.input ? JSON.stringify(r.input) : '']),
  ];
  if (type === 'estimate') return [
    ['Baseline reference',data.baselineSource ?? 'No locked original baseline'],
    ['Approved contract changes (not included in original cost baseline)',contract.approved],
    ['Code','Description','Locked original budget','Current execution budget','Completion forecast','Original less completion'],
    ...data.lines.map(r=>[r.code,r.label,r.original,r.budget,r.final,difference(r.original,r.final)]),
    ...(data.baselineOnly || []).map(r=>[r.code,r.label,r.original,null,null,null]),
  ];
  if (type === 'revenue') return [
    ['Original signed contract',contract.original],['Approved change orders and credits',contract.approved],['Current contract',contract.current],
    ['SOV allocated',contract.allocated],['Recorded billed to date',data.billed],['Contract remaining to bill',difference(contract.current,data.billed)],
    ['Month','Planned billing','Planned retainage','Planned net (not a receipt)'],
    ...data.revenue.map(r=>[r.month,r.expected,r.retainage,r.retainage == null ? null : difference(r.expected,r.retainage)]),
  ];
  return [
    ['Original signed contract',contract.original],['Approved changes',contract.approved],['Current contract',contract.current],
    ['Execution budget',totals.budget],['Posted actuals',totals.actual],['Saved or drafted completion (recorded lines only)',totals.final],
    ['Completion coverage',`${totals.covered ?? 0} of ${data.lines.length} lines`],
    ['Estimated gross profit',totals.covered === data.lines.length ? difference(contract.current,totals.final) : null],
    ['Estimated gross margin (%)',contract.current > 0 && totals.final != null && totals.covered === data.lines.length ? Math.round((contract.current-totals.final)/contract.current*10000)/100 : null],
    ['Budget less forecast',totals.covered === data.lines.length ? difference(totals.budget,totals.final) : null],
  ];
}

const csvCell = (value) => {
  if (value == null) return '""';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '""';
  let text = String(value);
  if (/^[\x00-\x20]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
};
export function buildForecastCsv(data, types) {
  const sections = REPORTS.filter(([id])=>types.includes(id)).flatMap(([id,title]) => [[title], ...reportRows(data,id), []]);
  return [['Northgate HQ · Internal Financials V2',data.title,data.frozen ? 'Finalized monthly snapshot' : 'Live / draft preview'],
    ['As of',data.asOf,'Posted cutoff',data.cutoff || 'Not entered'],[],...sections].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
