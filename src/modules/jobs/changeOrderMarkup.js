const COST_FIELDS = ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount'];

export function editableChangeOrderLines(lines) {
  return (lines || []).filter((line) => line.is_overall_markup !== true);
}

export function lineSubtotal(line) {
  return COST_FIELDS.reduce((sum, field) => sum + (Number(line[field]) || 0), 0);
}

export function percentMarkupAmount(subtotal, percent) {
  const rate = Number(percent || 0);
  if (!Number.isFinite(rate) || rate < 0) return null;
  const cents = (Number(subtotal) || 0) * rate;
  return Math.sign(cents) * Math.round(Math.abs(cents) + Number.EPSILON) / 100;
}

export function withUpdatedLineMarkup(line, change) {
  const next = { ...line, ...change };
  if (next.markup_mode === 'percent') {
    const calculated = percentMarkupAmount(lineSubtotal(next), next.markup_percent);
    next.markup_amount = calculated === null ? '' : calculated.toFixed(2);
  }
  return next;
}
