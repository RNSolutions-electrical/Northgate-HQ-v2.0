export const MAX_CLIENT_DETAILS = 40;

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clientDetailAmount(detail) {
  const manualAmount = finiteNumber(detail?.amount);
  if (manualAmount !== null) return Math.round((manualAmount + Number.EPSILON) * 100) / 100;
  const quantity = finiteNumber(detail?.quantity);
  const unitPrice = finiteNumber(detail?.unit_price);
  if (quantity === null || unitPrice === null) return null;
  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}

export function clientDetailSummary(details = [], lineTotal = 0) {
  const priced = details.filter((detail) => clientDetailAmount(detail) !== null);
  const subtotalCents = priced.reduce((sum, detail) => sum + Math.round(clientDetailAmount(detail) * 100), 0);
  const lineCents = Math.round(Number(lineTotal) * 100);
  return {
    pricedCount: priced.length,
    subtotal: subtotalCents / 100,
    remaining: (lineCents - subtotalCents) / 100,
    differsFromLine: priced.length > 0 && subtotalCents !== lineCents,
    hasUnpriced: priced.length !== details.length,
  };
}

export function validateClientDetails(details) {
  if (!Array.isArray(details) || details.length > MAX_CLIENT_DETAILS) {
    throw new Error(`Use no more than ${MAX_CLIENT_DETAILS} client detail rows per Change Order line.`);
  }
  return details.map((detail, index) => {
    const description = String(detail?.description ?? '').trim();
    const unit = String(detail?.unit ?? '').trim();
    const quantity = detail?.quantity === null || detail?.quantity === undefined ? '' : String(detail.quantity).trim();
    const unitPrice = detail?.unit_price === null || detail?.unit_price === undefined ? '' : String(detail.unit_price).trim();
    if (!description || description.length > 500 || unit.length > 30) {
      throw new Error(`Client detail ${index + 1} needs a description of 500 characters or less and a unit of 30 characters or less.`);
    }
    const amount = detail?.amount === null || detail?.amount === undefined ? '' : String(detail.amount).trim();
    if ([quantity, unitPrice, amount].some((value) => value !== '' && finiteNumber(value) === null)) {
      throw new Error(`Client detail ${index + 1} has an invalid quantity, unit price, or amount.`);
    }
    return {
      description,
      quantity: quantity === '' ? null : Number(quantity),
      unit,
      unit_price: unitPrice === '' ? null : Number(unitPrice),
      amount: amount === '' ? null : Number(amount),
    };
  });
}
