import { exportRows, parseValue, validDate } from './scorecardLogic.js';
import { observationDraft } from './scorecardStore.js';

export const CSV_COLUMNS = ['metric_id','metric_name','category_id','category','owner_id','owner','unit','goal',
  'definition_id','definition_context','measurement_window','carry_policy','definition_revision','period_id','reporting_anchor','meeting_date','period_revision','revision',
  'actual_value','displayed_value','carried_forward','source_period','source_meeting_date','measurement_start','as_of',
  'display_measurement_start','display_as_of','notes','notes_source_period','recorded_at','updated_at','source_updated_at',
  'aggregation','value_action','notes_action','date_action'];
const EDITABLE = new Set(['actual_value','notes','measurement_start','as_of','value_action','notes_action','date_action']);
function safeText(value) {
  const text = String(value ?? '');
  // Prefix text only; numeric negative amounts remain numeric. Apostrophes are
  // escaped too, making our protective prefix reversible on reimport.
  return /^[\s]*[=+\-@\t\r\n']/.test(text) ? `'${text}` : text;
}
function unprotect(value) { return value.startsWith("'") && /^[\s]*[=+\-@\t\r\n']/.test(value.slice(1)) ? value.slice(1) : value; }
export function toCsv(rows) {
  const quote = (v) => `"${String(v).replaceAll('"', '""')}"`;
  return '\uFEFF' + [CSV_COLUMNS.map(quote).join(','), ...rows.map((row) => CSV_COLUMNS.map((key) =>
    quote(typeof row[key] === 'number' ? row[key] : safeText(row[key]))).join(','))].join('\r\n');
}
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false; let closed = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(unprotect(field)); field = ''; closed = false;
      if (ch !== ',') { rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
    } else { if (closed || ch === '"') throw new Error('Malformed CSV quoting.'); field += ch; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length || closed) { row.push(unprotect(field)); rows.push(row); }
  const headers = rows.shift() || [];
  if (new Set(headers).size !== headers.length || headers.length !== CSV_COLUMNS.length || CSV_COLUMNS.some((h) => !headers.includes(h))) throw new Error('Use the original export columns; unknown or missing columns are not supported.');
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error('CSV row has the wrong number of columns.');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
export function previewCsv(text, state) {
  const imported = parseCsv(text); const seen = new Set(); const results = [];
  const current = new Map(exportRows(state, { scope: 'full', includeRetired: true }).map((r) => [`${r.metric_id}/${r.period_id}`, r]));
  for (const row of imported) {
    const id = `${row.metric_id}/${row.period_id}`;
    try {
      if (seen.has(id)) throw new Error('Duplicate metric/period ID.'); seen.add(id);
      const original = current.get(id); if (!original) throw new Error('Unknown metric/period ID.');
      for (const key of CSV_COLUMNS.filter((c) => !EDITABLE.has(c))) {
        if (row[key] !== String(original[key] ?? '')) throw new Error(`Stale or changed read-only column: ${key}. Re-export and review.`);
      }
      for (const action of ['value_action','notes_action','date_action']) {
        if (!['keep','set','clear'].includes(row[action]) || (action === 'date_action' && row[action] === 'clear')) throw new Error(`Unsupported ${action}.`);
      }
      const period = state.periods.find((p) => p.id === row.period_id);
      const draft = observationDraft(state, row.metric_id, period);
      const definition = state.definitions.find((d) => d.id === draft.definition_id);
      for (const [column, action] of [['actual_value','value_action'],['notes','notes_action'],['measurement_start','date_action'],['as_of','date_action']]) {
        if (row[action] === 'keep' && row[column] !== String(original[column] ?? '')) throw new Error(`Set ${action} explicitly to change ${column}. Blank is not an implicit clear.`);
      }
      if (row.value_action === 'set') {
        if (row.actual_value === '') throw new Error('Use value_action=clear to remove an actual. Zero is a valid set value.');
        draft.value = parseValue(row.actual_value, definition);
      }
      if (row.value_action === 'clear') draft.value = null;
      if (row.notes_action === 'set') {
        if (row.notes === '') throw new Error('Use notes_action=clear for empty notes.');
        draft.notes = row.notes;
      }
      if (row.notes_action === 'clear') draft.notes = '';
      if (row.date_action === 'set') { draft.measurement_start = row.measurement_start; draft.as_of = row.as_of; }
      if (!validDate(draft.measurement_start) || !validDate(draft.as_of) || draft.measurement_start > draft.as_of) throw new Error('Invalid measurement dates.');
      const changed = row.value_action !== 'keep' || row.notes_action !== 'keep' || row.date_action !== 'keep';
      results.push({ id, name: row.metric_name, period: row.reporting_anchor, before: original, change: changed ? draft : null,
        description: changed ? `${row.value_action === 'set' ? 'Set deliberate actual' : row.value_action === 'clear' ? 'CLEAR actual' : 'Keep actual'}; ${row.notes_action} notes; ${row.date_action} measurement dates` : 'Unchanged', error: null });
    } catch (error) { results.push({ id, name: row.metric_name, period: row.reporting_anchor, error: error.message, change: null }); }
  }
  return { rows: results, changes: results.filter((r) => r.change).map((r) => r.change), valid: results.every((r) => !r.error) };
}
