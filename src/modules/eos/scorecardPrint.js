import { aggregateRows, formatValue } from './scorecardLogic.js';
const escape = (text) => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function scorecardPrintHtml(rows, scopeLabel) {
  const summaries = aggregateRows(rows);
  const printRows = rows.flatMap((row) => {
    const chunks = []; let remaining = row.notes || '';
    while (remaining.length > 700) { const space = remaining.lastIndexOf(' ', 700); const cut = space > 350 ? space + 1 : 700; chunks.push(remaining.slice(0, cut)); remaining = remaining.slice(cut); }
    chunks.push(remaining);
    return chunks.map((notes, index) => ({ ...row, notes, notePart: chunks.length > 1 ? `Notes part ${index + 1} of ${chunks.length}` : '' }));
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Northgate Company Scorecard</title>
  <style>@page{size:letter portrait;margin:16mm}body{font:11pt/1.45 Arial,sans-serif;color:#18232b;margin:0}h1{font-size:20pt;margin-bottom:4pt}p{margin:4pt 0 14pt}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{text-align:left;background:#e8edf0;padding:8pt;border-bottom:2pt solid #9f2630}td{vertical-align:top;padding:9pt 8pt;border-bottom:1pt solid #cbd5db;overflow-wrap:anywhere;white-space:pre-wrap}th:first-child{width:40%}.meta{font-size:9pt;color:#45545d}.notes{white-space:pre-wrap}.entry{break-inside:avoid}strong{color:#92232b}@media screen{body{max-width:760px;margin:32px auto;padding:0 20px}}</style></head><body>
  <h1>Company Scorecard</h1><p>${escape(scopeLabel)}<br><span class="meta">Scope uses logical reporting anchors (Monday), inclusive. Meeting dates are editable local calendar dates in America/New_York. Missing actual observations remain missing.</span></p>
  <table><thead><tr><th>Metric / owner / goal</th><th>Reporting period · value · notes</th></tr></thead><tbody>
  ${printRows.map((r) => `<tr class="entry"><td><strong>${escape(r.metric_name)}</strong><br>${escape(r.category)} · ${escape(r.owner || 'Unassigned')}<br>${escape(r.unit)} · Goal ${escape(r.goal === '' ? 'Not set' : formatValue(r.goal, r))}<br><span class="meta">Metric ${escape(r.metric_id)}<br>Definition ${escape(r.definition_id)}<br>${escape(r.definition_context)}<br>${escape(r.measurement_window)} · Carry policy ${escape(r.carry_policy)}</span></td><td>Reporting ${escape(r.reporting_anchor)} · Meeting ${escape(r.meeting_date)}<br><b>${escape(formatValue(r.displayed_value === '' ? null : r.displayed_value, r))}</b>${r.carried_forward === 'yes' ? `<br>Auto-filled from meeting ${escape(r.source_meeting_date)}; actual updated ${escape(r.source_updated_at)}` : ''}<br><span class="meta">Actual: ${escape(formatValue(r.actual_value === '' ? null : r.actual_value, r))}<br>Measurement ${escape(r.display_measurement_start || '—')} to ${escape(r.display_as_of || '—')}<br>Recorded ${escape(r.recorded_at || '—')} · Updated ${escape(r.updated_at || '—')}</span><br><span class="meta">${escape(r.notePart)}</span><br><span class="notes">${escape(r.notes || 'No notes for this period.')}</span>${r.notes ? `<br><span class="meta">Notes source: ${escape(r.notes_source_period || r.period_id)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table><h2>Configured summaries</h2><p class="meta">Actual observations only; carried displays never counted. Historical definitions are summarized separately.</p>
  ${summaries.map((s) => `<p>${escape(rows.find((r) => r.definition_id === s.definition_id)?.metric_name)} (${escape(s.definition_id)}): ${s.rule === 'none' ? 'No aggregate configured' : `${escape(s.rule)} — ${escape(s.value ?? 'No actual observations')}`}</p>`).join('')}</body></html>`;
}
export function printScorecard(html, printWindow) {
  const win = printWindow || window.open('', '_blank');
  if (!win) throw new Error('Allow the print window, then retry PDF.');
  let printed = false;
  const print = () => { if (!printed) { printed = true; win.focus(); win.print(); } };
  win.document.open(); win.document.write(html); win.document.close();
  win.onload = print;
  if (win.document.readyState === 'complete') print();
}
