import { parseCsv } from './scorecardCsv.js';

// Separate from round-trip editing: explicit historical mapping, insert only.
export const HISTORY_COLUMNS = ['source_id', 'source_revision', 'source_cell', 'metric_id', 'definition_id', 'category_id',
  'unit', 'percent_scale', 'reporting_anchor', 'source_meeting_date', 'measurement_start', 'as_of', 'actual_value', 'comments', 'review_status'];
export function historicalRows(text) {
  const rows = parseCsv(text, HISTORY_COLUMNS);
  if (!rows.length || rows.length > 2000) throw new Error('Provide 1–2000 historical rows.');
  return rows;
}
export const historicalTemplate = () => HISTORY_COLUMNS.join(',') + '\r\n';
export const importStorageKey = 'northgate-scorecard-import-v1';
// Only opaque server identity is retained on this device, never source rows.
export function rememberImport(id) { localStorage.setItem(importStorageKey, id); }
export function recalledImport() { return localStorage.getItem(importStorageKey) || ''; }
