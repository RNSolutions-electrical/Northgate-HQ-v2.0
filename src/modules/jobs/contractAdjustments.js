export const ADJUSTMENT_MONEY_FIELDS = ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount', 'markup_amount'];
export const isBlankAmount = (value) => value == null || String(value).trim() === '';
export const isEditableAdjustment = (order) => !order?.archived_at && ['draft', 'potential', 'proposed', 'submitted'].includes(order?.status);

export function adjustmentLineTotal(line) {
  const values = ADJUSTMENT_MONEY_FIELDS.map((field) => line[field]);
  if (values.every(isBlankAmount)) return null;
  return values.reduce((cents, value) => cents + (isBlankAmount(value) ? 0 : Math.round(Number(value) * 100)), 0) / 100;
}

// Explicit allowlist: never submit server-calculated totals or stale source IDs.
export function serializeAdjustmentLines(lines) {
  return lines.filter((line) => !line.is_overall_markup).map((line, index) => ({
    job_budget_line_id: line.job_budget_line_id || null,
    description: line.description || '', vendor_name: line.vendor_name || null,
    ...Object.fromEntries(ADJUSTMENT_MONEY_FIELDS.map((field) => [field, isBlankAmount(line[field]) ? null : line[field]])),
    ...(line.markup_mode === 'percent' && !isBlankAmount(line.markup_percent) ? { markup_percent: line.markup_percent } : {}),
    sort_order: index,
  }));
}

export function filterAdjustments(rows, view = 'all') {
  if (view === 'credits') return rows.filter((row) => row.record_type === 'credit');
  if (view === 'potential') return rows.filter((row) => row.record_type !== 'credit' && ['potential', 'proposed'].includes(row.status));
  return rows;
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const currency = (value) => isBlankAmount(value) ? 'Not priced' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
export function adjustmentLogHtml(job, rows, title = 'Contract adjustments') {
  const currentApproved = rows.filter((row) => row.status === 'approved' && !rows.some((revision) => revision.status === 'approved' && revision.revision_of_id === row.id));
  const approvedNet = currentApproved.reduce((cents, row) => cents + Math.round(Number(row.price_amount || 0) * 100), 0) / 100;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:letter landscape;margin:.5in}body{font:11pt Arial;color:#17202a}h1{border-bottom:4px solid #b9202f;padding-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccd2d8;padding:9px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#f1f3f5}td:nth-child(4){white-space:nowrap}@media print{button{display:none}tr{break-inside:avoid}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(title)}</h1><p>${escapeHtml(job.job_number)} · ${escapeHtml(job.name)}</p><p><strong>Net approved adjustment in this selection: ${currency(approvedNet)}</strong></p><p>Selected records only. Statuses and revision numbers are shown; unapproved and superseded versions are not additional financial commitments.</p><table><thead><tr><th>Number</th><th>Type</th><th>Description</th><th>Value</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.co_number)}</td><td>${row.record_type === 'credit' ? 'Credit' : 'Change Order'}</td><td>${escapeHtml(row.title)}${row.description ? '<br>' + escapeHtml(row.description) : ''}</td><td>${currency(row.price_amount)}</td><td>${escapeHtml(row.status)}</td></tr>`).join('')}</tbody></table></body></html>`;
}
