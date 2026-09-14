import { callFinancials, cents } from './serviceCallModel.js';

export function dateOnly(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(text + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}
export const isVoidCall = (call) => call.profile?.work_stage === 'void';

// This is a job-profit scorecard, not an accrual ledger. Each call contributes
// its lifetime billed revenue/cost once, grouped by its chosen reporting date.
// Latest invoice/payment avoids duplicating a call's cumulative cost in periods.
export function profitDate(call, basis = 'invoice') {
  if (basis === 'service') return dateOnly(call.profile?.service_date);
  const invoices = (call.financials?.invoices || []).filter((i) => i.status === 'posted');
  const dates = basis === 'paid'
    ? invoices.flatMap((i) => (i.payments || []).map((p) => dateOnly(p.payment_date)))
    : invoices.map((i) => dateOnly(i.invoice_date));
  return dates.filter(Boolean).sort().at(-1) || null;
}
export function inProfitPeriod(call, { year, quarter = 'all', basis = 'invoice', through = null }) {
  const date = profitDate(call, basis);
  if (!date || date.slice(0, 4) !== String(year) || (through && date > through)) return false;
  return quarter === 'all' || Math.ceil(Number(date.slice(5, 7)) / 3) === Number(quarter);
}
export function profitYears(calls, basis, currentYear = new Date().getFullYear()) {
  return [...new Set([currentYear, ...calls.map((c) => Number(profitDate(c, basis)?.slice(0, 4))).filter(Boolean)])].sort((a, b) => b - a);
}
export function summarizeProfit(calls, period) {
  const result = { revenue: 0, cost: 0, profit: null, margin: null, included: 0, missingCost: 0, preliminary: 0, undated: 0, voids: 0 };
  let revenueCents = 0, costCents = 0;
  for (const call of calls) {
    if (!call.financials) continue; // Only server-authorized financial records.
    if (isVoidCall(call)) { result.voids += 1; continue; }
    if (!profitDate(call, period.basis)) { result.undated += 1; continue; }
    if (!inProfitPeriod(call, period)) continue;
    const financials = callFinancials(call);
    if (!financials.costKnown) { result.missingCost += 1; continue; }
    revenueCents += cents(financials.revenue);
    costCents += cents(financials.cost);
    result.included += 1;
    if (call.financials.costs.find((c) => c.is_active)?.reconciliation_status !== 'final') result.preliminary += 1;
  }
  result.revenue = revenueCents / 100;
  result.cost = costCents / 100;
  result.profit = result.included ? (revenueCents - costCents) / 100 : null;
  result.margin = result.included && revenueCents !== 0 ? (revenueCents - costCents) / revenueCents * 100 : null;
  return result;
}

// Review-only inverse calculation. Do not post a guessed subtotal: discrete tax
// and surcharge rounding can make a gross total impossible or ambiguous.
export function reverseServiceCharges(total, { includesTax, includesCardFee }) {
  if (typeof includesTax !== 'boolean' || typeof includesCardFee !== 'boolean') throw new Error('Confirm tax and card-fee treatment first.');
  const gross = cents(total);
  if (gross < 0) throw new Error('Review credits separately from positive invoices.');
  const grossBig = BigInt(gross);
  const taxFactor = includesTax ? 10725n : 10000n;
  const feeFactor = includesCardFee ? 103n : 100n;
  const round = (value, divisor) => (value + divisor / 2n) / divisor;
  const estimate = round(grossBig * 1000000n, taxFactor * feeFactor);
  const matches = [];
  for (let net = estimate > 3n ? estimate - 3n : 0n; net <= estimate + 3n; net++) {
    const tax = includesTax ? round(net * 725n, 10000n) : 0n;
    const fee = includesCardFee ? round((net + tax) * 3n, 100n) : 0n;
    if (net + tax + fee === grossBig) matches.push({ subtotal: Number(net) / 100, tax: Number(tax) / 100, cardFee: Number(fee) / 100, total: gross / 100 });
  }
  return { status: matches.length === 1 ? 'reconciled' : 'review', matches };
}
