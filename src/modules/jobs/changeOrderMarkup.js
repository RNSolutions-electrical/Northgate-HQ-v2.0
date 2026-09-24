const COST_FIELDS = ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount'];

export function editableChangeOrderLines(lines) {
  return (lines || []).filter((line) => line.is_overall_markup !== true);
}

export function lineSubtotal(line) {
  return COST_FIELDS.reduce((sum, field) => sum + (Number(line[field]) || 0), 0);
}

export function percentMarkupAmount(subtotal, percent) {
  const amount = Number(subtotal);
  const rawRate = String(percent === '' || percent == null ? '0' : percent).trim();
  const match = /^\+?(\d*)(?:\.(\d*))?$/.exec(rawRate);
  if (!Number.isFinite(amount) || !match || !(match[1] || match[2])) return null;
  const amountCents = Math.round(Math.abs(amount) * 100);
  if (!Number.isSafeInteger(amountCents)) return null;
  const decimals = match[2] || '';
  const rateDigits = BigInt(`${match[1] || '0'}${decimals}`);
  const denominator = 100n * (10n ** BigInt(decimals.length));
  const roundedCents = (BigInt(amountCents) * rateDigits + denominator / 2n) / denominator;
  if (roundedCents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Math.sign(amount) * Number(roundedCents) / 100;
}

export function withUpdatedLineMarkup(line, change) {
  const next = { ...line, ...change };
  if (next.markup_mode === 'percent') {
    const calculated = percentMarkupAmount(lineSubtotal(next), next.markup_percent);
    next.markup_amount = calculated === null ? '' : calculated.toFixed(2);
  }
  return next;
}
