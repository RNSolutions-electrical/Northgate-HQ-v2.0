import { companyToday, shiftCalendarDate } from './eosLogic.js';
import {quarterRange,reportingDateChoices,entryReportingDate,entryInScope} from './scorecardQuarters.js';

export const UNITS = ['number', 'count', 'currency', 'percent', 'text'];
export const CARRY = ['none', 'continuous', 'year', 'quarter'];
export const WINDOWS = ['point-in-time', 'rolling-30', 'YTD', 'QTD', 'period'];
export const AGGREGATIONS = ['none', 'last', 'sum', 'average'];
export const keyFor = (metric, period) => `${metric}/${period}`;
export function validDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function weekAnchor(date = companyToday()) {
  if (!validDate(date)) throw new Error('A valid calendar date is required.');
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftCalendarDate(date, -((day + 6) % 7));
}
export function makePeriod(date = companyToday()) {
  const anchor = weekAnchor(date);
  return { id: anchor, anchor, meeting_date: shiftCalendarDate(anchor, 2), revision: 0 };
}
export const quarter = (date) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
export function measurementWindow(definition, period) {
  const asOf = period.meeting_date;
  const start = definition.window === 'YTD' ? `${asOf.slice(0, 4)}-01-01`
    : definition.window === 'QTD' ? `${asOf.slice(0, 4)}-${String(Math.floor((Number(asOf.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
      : definition.window === 'rolling-30' ? shiftCalendarDate(asOf, -29)
        : definition.window === 'period' ? shiftCalendarDate(asOf, -7) : asOf;
  return { measurement_start: start, as_of: asOf };
}
export const canManageEos = (actor, members) => Boolean(actor?.id && actor.active && members.some((m) => m.user_id === actor.id && m.is_active && m.is_member));
export const eligibleMembers = (members) => members.filter((m) => m.is_active && m.is_member);
export function definitionAt(state, metricId, anchor) {
  return state.definitions.filter((d) => d.metric_id === metricId && d.effective_from <= anchor)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.revision - a.revision)[0] || null;
}
export function parseValue(raw, definition) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (definition.unit === 'text') return String(raw);
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw).trim())) throw new Error('Enter an unformatted number (no currency symbol, comma, or %). Percentages use 0–100.');
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error('Value must be finite.');
  if (definition.unit === 'count' && !Number.isInteger(n)) throw new Error('Counts must be whole numbers.');
  if (definition.unit === 'percent' && (n < 0 || n > 100)) throw new Error('Percentages use 0–100, not a fraction or a % suffix.');
  return n;
}
export function formatValue(value, definition) {
  if (value === null || value === undefined) return '—';
  if (definition.unit === 'text') return String(value);
  return new Intl.NumberFormat('en-US', definition.unit === 'currency'
    ? { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }
    : { maximumFractionDigits: 4 }).format(value) + (definition.unit === 'percent' ? '%' : '');
}
export function observation(state, metricId, periodId) {
  return state.observations.find((o) => o.metric_id === metricId && o.period_id === periodId) || null;
}
export function resolveCell(state, metricId, period) {
  const actual = observation(state, metricId, period.id);
  const definition = (actual && state.definitions.find((d) => d.id === actual.definition_id)) || definitionAt(state, metricId, period.anchor);
  if (!definition) return { definition: null, actual: null, value: null, source: null, carried: false, notes: '' };
  let source = actual?.value != null ? actual : null;
  if (!source && definition.carry !== 'none') {
    const candidates = state.observations.filter((o) => o.metric_id === metricId && o.value != null)
      .map((o) => ({ o, p: state.periods.find((p) => p.id === o.period_id), d: state.definitions.find((d) => d.id === o.definition_id) }))
      .filter(({ p, d }) => p && p.anchor < period.anchor && d && d.unit === definition.unit && d.window === definition.window && d.context === definition.context)
      .filter(({ o }) => definition.carry !== 'year' || o.as_of.slice(0, 4) === period.meeting_date.slice(0, 4))
      .filter(({ o }) => definition.carry !== 'quarter' || quarter(o.as_of) === quarter(period.meeting_date))
      .sort((a, b) => b.p.anchor.localeCompare(a.p.anchor));
    source = candidates[0]?.o || null;
  }
  const sourcePeriod = source && state.periods.find((p) => p.id === source.period_id);
  return { definition, actual, value: source?.value ?? null, source, sourcePeriod,
    carried: Boolean(source && source.period_id !== period.id), notes: actual?.notes || '' };
}
export function scopedPeriods(state, { scope = 'current', periodId, from, to, quarterView = 'calendar', quarterScheduleRevision,referenceDate } = {}) {
  const selected = state.periods.find((p) => p.id === periodId);
  if (scope === 'quarter' && quarterView === 'management' && quarterScheduleRevision !== undefined && quarterScheduleRevision !== (state.quarterSchedule?.revision || 0)) throw new Error('Management cycle schedule changed. Reload latest before exporting.');
  const range = scope === 'quarter' ? quarterRange(state, {periodId,quarterView,referenceDate}) : null;
  const year=selected&&(validDate(referenceDate)?referenceDate:reportingDateChoices(state,selected)[0]).slice(0,4);
  if (scope === 'custom' && (!validDate(from) || !validDate(to) || from > to)) throw new Error('Choose a valid inclusive reporting-anchor date range.');
  return [...state.periods].filter((p) => scope === 'full' || (scope === 'current' && p.id === periodId)
    || (scope === 'quarter' && range && reportingDateChoices(state,p).some(date=>date>=range.from&&(!range.to||date<=range.to)))
    || (scope === 'year' && year && reportingDateChoices(state,p).some(date=>date.slice(0,4)===year))
    || (scope === 'custom' && p.anchor >= from && p.anchor <= to)).sort((a, b) => a.anchor.localeCompare(b.anchor));
}
export function exportRows(state, filters) {
  return scopedPeriods(state, filters).flatMap((period) => state.metrics.flatMap((metric) => {
    if (metric.retired && !filters.includeRetired) return [];
    if (!entryInScope(state,metric.id,period,filters)) return [];
    const cell = resolveCell(state, metric.id, period); const d = cell.definition;
    if (!d || (filters.owner && d.owner_id !== filters.owner) || (filters.category && d.category_id !== filters.category)) return [];
    const report=entryReportingDate(state,metric.id,period);
    return [{ reporting_date:report.date,reporting_date_basis:report.basis,reporting_date_ambiguous:report.ambiguous,
      source_reporting_date:cell.sourcePeriod?entryReportingDate(state,metric.id,cell.sourcePeriod).date:'',
      metric_id: metric.id, metric_name: d.name, category_id: d.category_id, category: d.category_label,
      owner_id: d.owner_id || '', owner: d.owner_label || '', unit: d.unit, goal: d.goal ?? '',
      definition_id: d.id, definition_context: d.context, measurement_window: d.window, carry_policy: d.carry,
      definition_revision: d.revision, period_id: period.id, reporting_anchor: period.anchor,
      meeting_date: period.meeting_date, period_revision: period.revision, revision: cell.actual?.revision || 0,
      actual_value: cell.actual?.value ?? '', displayed_value: cell.value ?? '', carried_forward: cell.carried ? 'yes' : 'no',
      source_period: cell.source?.period_id || '', source_meeting_date: cell.sourcePeriod?.meeting_date || '',
      measurement_start: cell.actual?.measurement_start || '', as_of: cell.actual?.as_of || '',
      display_measurement_start: cell.source?.measurement_start || '', display_as_of: cell.source?.as_of || '',
      notes: cell.notes, notes_source_period: cell.notes ? period.id : '',
      recorded_at: cell.actual?.recorded_at || '', updated_at: cell.actual?.updated_at || '',
      source_updated_at: cell.source?.updated_at || '', aggregation: d.aggregation,
      value_action: 'keep', notes_action: 'keep', date_action: 'keep' }];
  }));
}
export function aggregateRows(rows) {
  const result = [];
  // Different historical definitions are never silently combined.
  for (const id of new Set(rows.map((r) => r.definition_id))) {
    const group = rows.filter((r) => r.definition_id === id); const rule = group[0].aggregation;
    const values = group.filter((r) => r.actual_value !== '').map((r) => r.actual_value);
    result.push({ definition_id: id, rule, value: rule === 'none' || !values.length || (rule === 'sum' && ['QTD','YTD','rolling-30'].includes(group[0].measurement_window)) ? null
      : rule === 'last' ? values.at(-1) : rule === 'sum' ? values.reduce((a, b) => a + b, 0)
        : values.reduce((a, b) => a + b, 0) / values.length });
  }
  return result;
}
