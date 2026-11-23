import { fromCents, toCents } from './billingMath.js';

const money = (value) => value !== '' && value != null && Number.isFinite(Number(value));
const hasApproval = (row) => row.status === 'approved' && !row.voided_at && !row.archived_at;

// One approved leaf per revision family. Pending revisions never supersede an approval.
export function approvedContractChanges(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const approvals = rows.filter(hasApproval);
  const superseded = new Set();
  const rootById = new Map();
  for (const row of rows) {
    let cursor = row;
    const seen = new Set();
    while (cursor.revision_of_id) {
      if (seen.has(cursor.id) || !byId.has(cursor.revision_of_id)) return null;
      seen.add(cursor.id);
      cursor = byId.get(cursor.revision_of_id);
      if (hasApproval(row)) superseded.add(cursor.id);
    }
    rootById.set(row.id, cursor.id);
  }
  const active = approvals.filter((row) => !superseded.has(row.id));
  if (active.some((row) => !money(row.price_amount)) ||
      new Set(active.map((row) => rootById.get(row.id))).size !== active.length) return null;
  return {
    ids: new Set(active.map((row) => row.id)),
    count: active.length,
    cents: active.reduce((sum, row) => sum + toCents(row.price_amount), 0),
  };
}

// The accepted contract is not a budget or an SOV total. Never infer the original value from either.
export function financialContractSummary({ original, changeOrders, sovLines }) {
  const approved = changeOrders == null ? null : approvedContractChanges(changeOrders);
  const originalCents = money(original) ? toCents(original) : null;
  const current = originalCents == null || approved == null ? null : originalCents + approved.cents;
  const allocated = sovLines?.length ? sovLines.reduce((sum, row) =>
    sum + toCents(row.scheduled_value_amount) + toCents(row.approved_change_amount), 0) : null;
  return {
    original: originalCents == null ? null : fromCents(originalCents),
    approved: approved == null ? null : fromCents(approved.cents),
    count: approved?.count ?? 0,
    current: current == null ? null : fromCents(current),
    allocated: allocated == null ? null : fromCents(allocated),
    unallocated: current == null || allocated == null ? null : fromCents(current - allocated),
  };
}
