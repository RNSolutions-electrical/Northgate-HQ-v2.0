import { clientDetailAmount, clientDetailSummary } from './changeOrderClientDetails.mjs';

const MONEY_FIELDS = ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount', 'markup_amount'];

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineTotal(line) {
  return MONEY_FIELDS.reduce((total, field) => total + numberValue(line[field]), 0);
}

function money(value) {
  if (value === null || value === undefined || value === '') return 'Not priced';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function htmlMultiline(value, fallback = '') {
  return htmlEscape(value || fallback).replace(/\n/g, '<br>');
}

export function clientChangeOrderHtml({ order, job, form, lines, overallMarkupAmount, total, logoUrl, preview = false }) {
  const documentType = order.record_type === 'credit' ? 'Credit' : 'Change Order';
  const projectAddress = [job.address_line1, job.address_line2, [job.city, job.state, job.postal_code].filter(Boolean).join(', ')]
    .filter(Boolean).map(htmlEscape).join('<br>');
  const rows = lines.map((line, index) => {
    const priced = MONEY_FIELDS.some((field) => line[field] !== null && line[field] !== undefined && String(line[field]).trim() !== '');
    const displayedTotal = priced ? lineTotal(line) : null;
    const breakdown = line.client_breakdown;
    const details = Array.isArray(breakdown?.rows) ? breakdown.rows : [];
    const summary = clientDetailSummary(details, displayedTotal ?? 0);
    const detailRows = details.map((detail) => {
      const quantity = detail.quantity === null || detail.quantity === undefined ? '' : String(detail.quantity);
      const calculatedFromRate = clientDetailAmount({ ...detail, amount: null });
      const manualAmount = detail.amount === null || detail.amount === undefined ? null : clientDetailAmount({ amount: detail.amount });
      const showUnitPrice = manualAmount === null || manualAmount === calculatedFromRate;
      const price = showUnitPrice && detail.unit_price !== null && detail.unit_price !== undefined ? money(detail.unit_price) : '';
      const detailText = [quantity && `${quantity}${detail.unit ? ` ${detail.unit}` : ''}`, price && `@ ${price}`].filter(Boolean).join(' ');
      const amount = clientDetailAmount(detail);
      return `<tr class="detail-row"><td></td><td>${htmlMultiline(detail.description)}${detailText ? `<small>${htmlEscape(detailText)}</small>` : ''}</td><td>${amount === null ? '' : money(amount)}</td></tr>`;
    }).join('');
    const remainingRow = breakdown?.show_remaining && details.length
      ? `<tr class="detail-row detail-row--remaining"><td></td><td>${htmlEscape(breakdown.remaining_label || 'Remaining balance')}</td><td>${money(summary.remaining)}</td></tr>`
      : '';
    return `<tr class="pricing-row"><td>${index + 1}</td><td>${htmlMultiline(line.description, `${documentType} item`)}</td><td>${money(displayedTotal)}</td></tr>${detailRows}${remainingRow}`;
  }).join('')
    + (overallMarkupAmount ? `<tr><td>${lines.length + 1}</td><td>General Contractor Fee</td><td>${money(overallMarkupAmount)}</td></tr>` : '');
  const issuedDate = form.change_order_date ? new Date(`${form.change_order_date}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(order.co_number)} ${documentType}</title><style>
    @page{size:letter;margin:.4in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#17202a;font-size:9.75pt;line-height:1.32;background:#fff}.sheet{max-width:7.7in;margin:0 auto}.preview-notice{margin-bottom:10px;padding:7px 10px;border:1px solid #bf8b2e;background:#fff5d8;color:#5d410f;font-weight:700;text-align:center}.brand{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:5px solid #c9202f;padding:0 0 8px}.brand__identity{width:330px}.brand__logo{width:310px;height:76px;display:flex;align-items:center}.brand__logo img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center}.document-title{text-align:right}.document-title strong{display:block;font-size:18pt;text-transform:uppercase}.document-title span{color:#c9202f;font-size:11.5pt;font-weight:700}.meta{display:grid;grid-template-columns:1.25fr .75fr;margin:13px 0;border:1px solid #cbd2d8}.meta__project,.meta__order{padding:10px 12px}.meta__order{border-left:1px solid #cbd2d8}.label{display:block;color:#65717a;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}.value{font-weight:700}.meta dl{display:grid;grid-template-columns:1fr 1fr;gap:7px 15px;margin:0}.meta dt,.meta dd{margin:0}.section{margin:12px 0}.section h2{margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #27333d;font-size:11pt;text-transform:uppercase;letter-spacing:.06em}.scope{min-height:42px}.scope p:last-child{margin-bottom:0}.subject{font-size:12pt;font-weight:700;margin:0 0 5px}table{width:100%;border-collapse:collapse;margin-top:7px}th{background:#27333d;color:#fff;font-size:8pt;text-transform:uppercase;letter-spacing:.06em}th,td{padding:6px 8px;border:1px solid #cbd2d8;text-align:left;vertical-align:top}th:first-child,td:first-child{width:42px;text-align:center}th:last-child,td:last-child{width:116px;text-align:right;white-space:nowrap}.pricing-row{font-weight:700}.detail-row{background:#f6f8f9;color:#39454e;font-size:8.75pt}.detail-row td{padding-top:4px;padding-bottom:4px}.detail-row small{display:block;margin-top:2px;color:#64717a}.detail-row--remaining{font-weight:700}tr{break-inside:avoid;page-break-inside:avoid}.total{display:flex;justify-content:flex-end;margin-top:8px}.total div{min-width:320px;border:2px solid #27333d;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:28px;font-size:12.5pt;font-weight:800}.total span{white-space:nowrap}.authorization{background:#f4f6f7;border-left:5px solid #c9202f;padding:9px 12px}.authorization p{margin:0 0 5px}.authorization p:last-child{margin-bottom:0}.signature-section{break-inside:avoid;page-break-inside:avoid;padding-top:3px;min-height:184px}.signature-intro{margin:10px 0 0}.signature-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:25px 36px;margin-top:31px}.signature-line{border-top:1px solid #17202a;padding-top:5px;min-height:35px}.signature-grid .wide{grid-column:1/-1}.footer{display:flex;justify-content:space-between;gap:20px;padding-top:7px;border-top:1px solid #cbd2d8;color:#6a747c;font-size:7.5pt}.no-print{margin:0 auto 18px;display:block;padding:9px 16px;border:0;background:#c9202f;color:#fff;font-weight:700;cursor:pointer}@media print{.no-print{display:none}.sheet{max-width:none}.authorization,.signature-section{break-inside:avoid;page-break-inside:avoid}}@media screen{body{padding:24px;background:#e9edf0}.sheet{background:#fff;padding:.4in;box-shadow:0 3px 18px #0002}}
  </style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><main class="sheet">${preview ? '<div class="preview-notice">DRAFT PREVIEW — not submitted or approved</div>' : ''}
    <header class="brand"><div class="brand__identity"><div class="brand__logo"><img src="${htmlEscape(logoUrl)}" alt="The Northgate Group logo"></div></div><div class="document-title"><strong>${documentType}</strong><span>${htmlEscape(order.co_number)}</span></div></header>
    <section class="meta"><div class="meta__project"><span class="label">Project</span><div class="value">${htmlEscape(job.job_number || '')}${job.job_number ? ' — ' : ''}${htmlEscape(job.name)}</div>${projectAddress ? `<div>${projectAddress}</div>` : ''}</div><div class="meta__order"><dl><div><dt class="label">${documentType}</dt><dd class="value">${htmlEscape(order.co_number)}</dd></div><div><dt class="label">Date Issued</dt><dd>${htmlEscape(issuedDate)}</dd></div><div><dt class="label">Revision</dt><dd>${Number(order.revision_number) ? `Revision ${Number(order.revision_number)}` : 'Original'}</dd></div><div><dt class="label">Status</dt><dd>For Client Authorization</dd></div></dl></div></section>
    <section class="section scope"><h2>Change Description</h2><p class="subject">${htmlEscape(form.title)}</p><p>${htmlMultiline(form.description, 'The following change to the project scope is submitted for authorization.')}</p></section>
    <section class="section"><h2>Pricing</h2><table><thead><tr><th>Item</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><div><span>${documentType} Total</span><span>${money(total)}</span></div></div></section>
    <div class="signature-section"><section class="section"><h2>Authorization</h2><div class="authorization"><p>By signing below, the Client authorizes The Northgate Group One, LLC to proceed with the work described in this ${documentType} and acknowledges the stated adjustment to the project price.</p><p>Unless specifically modified above, the remaining terms of the existing agreement remain unchanged. Any schedule impact will be coordinated with the project team.</p></div></section>
    <p class="signature-intro">The undersigned confirms that they are authorized to approve this ${documentType} on behalf of the Client.</p><section class="signature-grid"><div class="signature-line">Authorized Client Signature</div><div class="signature-line">Date</div><div class="signature-line">Printed Name</div><div class="signature-line">Title</div><div class="signature-line wide">Client / Company</div></section></div>
    <footer class="footer"><span>The Northgate Group One, LLC</span><span>${documentType} ${htmlEscape(order.co_number)} · ${htmlEscape(job.job_number || job.name)}</span></footer>
  </main></body></html>`;
}
