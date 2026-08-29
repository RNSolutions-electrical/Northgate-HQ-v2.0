/**
 * Currency-safe calculation helpers for the Job > Billing module.
 * All allocation work is performed in cents so every SOV and fee allocation
 * has a deterministic, auditable remainder reconciliation.
 */
export function toCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

export function fromCents(value) {
  return Number((Math.trunc(Number(value) || 0) / 100).toFixed(2));
}

export function percentOf(value, total) {
  const amount = Number(value) || 0;
  const denominator = Number(total) || 0;
  return denominator === 0 ? 0 : Number(((amount / denominator) * 100).toFixed(6));
}

/**
 * Allocates a fee exactly across eligible non-fee lines. The final cent(s)
 * are assigned by stable source order, so a refresh never changes results.
 */
export function allocateFeeCents(lines, feeCents) {
  const eligible = lines
    .map((line, index) => ({ ...line, _index: index, weight: Math.max(0, toCents(line.weight ?? line.amount)) }))
    .filter((line) => line.weight > 0)
    .sort((left, right) => String(left.id ?? left._index).localeCompare(String(right.id ?? right._index)));

  const allocation = new Map(lines.map((line, index) => [line.id ?? index, 0]));
  const totalWeight = eligible.reduce((sum, line) => sum + line.weight, 0);
  if (!totalWeight || !feeCents) return allocation;

  const direction = feeCents < 0 ? -1 : 1;
  const absoluteFee = Math.abs(Math.trunc(feeCents));
  let assigned = 0;
  eligible.forEach((line) => {
    const cents = Math.floor((absoluteFee * line.weight) / totalWeight);
    allocation.set(line.id ?? line._index, direction * cents);
    assigned += cents;
  });

  let remainder = absoluteFee - assigned;
  for (let index = 0; remainder > 0; index = (index + 1) % eligible.length) {
    const line = eligible[index];
    const key = line.id ?? line._index;
    allocation.set(key, allocation.get(key) + direction);
    remainder -= 1;
  }
  return allocation;
}

export function reconcileSov(lines) {
  const scheduledCents = lines.reduce((sum, line) => sum + toCents(line.scheduledValue), 0);
  const contractCents = lines.reduce((sum, line) => sum + toCents(line.contractValue ?? line.scheduledValue), 0);
  return {
    contractValue: fromCents(contractCents),
    scheduledValue: fromCents(scheduledCents),
    unallocatedValue: fromCents(contractCents - scheduledCents),
    allocatedPercent: percentOf(scheduledCents, contractCents),
    isReconciled: scheduledCents === contractCents,
  };
}

export function derivePayAppLine({ scheduledValue, previousBilled, additionalPercent, finalCurrentAmount }) {
  const scheduledCents = toCents(scheduledValue);
  const previousCents = Math.max(0, toCents(previousBilled));
  const calculatedCents = Math.round((scheduledCents * (Number(additionalPercent) || 0)) / 100);
  const requestedCents = finalCurrentAmount === undefined || finalCurrentAmount === null || finalCurrentAmount === ''
    ? calculatedCents
    : toCents(finalCurrentAmount);
  const currentCents = Math.max(0, Math.min(requestedCents, Math.max(0, scheduledCents - previousCents)));
  const billedCents = previousCents + currentCents;
  return {
    calculatedCurrentAmount: fromCents(calculatedCents),
    finalCurrentAmount: fromCents(currentCents),
    billedToDateAmount: fromCents(billedCents),
    remainingAmount: fromCents(Math.max(0, scheduledCents - billedCents)),
    resultingPercent: percentOf(billedCents, scheduledCents),
    wasClamped: requestedCents !== currentCents,
  };
}
