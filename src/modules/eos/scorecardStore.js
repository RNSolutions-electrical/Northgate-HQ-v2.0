import { eosRpc } from './eosRequest.js';
import {validateCycles} from './scorecardQuarters.js';
import { AGGREGATIONS, CARRY, UNITS, WINDOWS, canManageEos, definitionAt, eligibleMembers, makePeriod, measurementWindow, observation, parseValue, validDate } from './scorecardLogic.js';

const clone = (value) => structuredClone(value);
export function validateMetricCategory(categoryId, categories) {
  if (typeof categoryId !== 'string' || !categoryId.trim()) throw new Error('Choose a category before saving.');
  if (categories && !categories.some((c) => c.id === categoryId)) throw new Error('Choose an existing category. Your draft is retained.');
}
export const emptyScorecard = () => ({ metrics: [], categories: [], definitions: [], periods: [], observations: [], members: [], audit: [], requests: {}, quarterSchedule: {revision:0,cycles:[]} });
function assertRevision(actual, expected) {
  if (!Number.isInteger(expected) || actual !== expected) throw new Error('Conflict: this record changed. Reload and review your draft before retrying.');
}
function validateDefinition(state, d, prior) {
  if (!d.name?.trim() || !d.context?.trim() || !validDate(d.effective_from)) throw new Error('Name, definition/context and effective reporting date are required.');
  if (!UNITS.includes(d.unit) || !CARRY.includes(d.carry) || !WINDOWS.includes(d.window) || !AGGREGATIONS.includes(d.aggregation)) throw new Error('Invalid metric configuration.');
  if (d.aggregation === 'sum' && (d.unit === 'percent' || d.unit === 'text' || ['YTD', 'QTD', 'rolling-30'].includes(d.window))) throw new Error('Do not sum cumulative, rolling, percentage or text observations.');
  if (d.unit === 'text' && d.aggregation === 'average') throw new Error('Text cannot be averaged.');
  if (d.owner_id && d.owner_id !== prior?.owner_id && !eligibleMembers(state.members).some((m) => m.user_id === d.owner_id)) throw new Error('New owners must be active E.O.S. members.');
  if (!state.categories.some((c) => c.id === d.category_id)) throw new Error('Choose an existing category.');
  parseValue(d.goal, d);
}

/** Transactional reference implementation for disposable local verification only.
 * It is never a fallback for shared data or a substitute for database RLS. */
export function createLocalScorecardStore(initial, actor, { now = () => new Date().toISOString() } = {}) {
  let state = clone(initial); let failNext = false;
  function authorize() { if (!canManageEos(actor, state.members)) throw new Error('Active E.O.S. membership required.'); }
  function transact(requestId, body, operation) {
    authorize();
    if (!requestId) throw new Error('A retry identity is required.');
    const fingerprint = JSON.stringify(body);
    if (state.requests[requestId]) {
      if (state.requests[requestId].fingerprint !== fingerprint) throw new Error('Retry identity was reused for a different change.');
      return clone(state.requests[requestId].result);
    }
    if (failNext) { failNext = false; throw new Error('Simulated connection failure. Your draft is retained; retry Save.'); }
    const next = clone(state); const timestamp = now();
    const audit = (table, id, before, after) => next.audit.push({ table, id, actor_id: actor.id, at: timestamp, before: clone(before), after: clone(after) });
    const result = operation(next, timestamp, audit);
    next.requests[requestId] = { fingerprint, result }; state = next; return clone(result);
  }
  return {
    localOnly: true,
    async read() { authorize(); return clone(state); },
    // Full export always obtains all pages through the same repository interface.
    async all() { authorize(); return clone(state); },
    async periods(before = null, limit = 12) {
      authorize(); return clone(state.periods.filter((p) => !before || p.anchor < before).sort((a, b) => b.anchor.localeCompare(a.anchor)).slice(0, limit));
    },
    simulateFailure() { failNext = true; },
    async saveQuarterSchedule(input, requestId) {
      return transact(requestId, input, (next, timestamp, audit) => {
        const old = next.quarterSchedule || {revision:0,cycles:[]};
        assertRevision(old.revision, input.expected_revision);
        const cycles = validateCycles(input.cycles);
        if (old.cycles.some(c=>!cycles.some(n=>n.id===c.id))) throw new Error('Existing cycles must be retained. Edit their name or start date instead.');
        const saved = {revision:old.revision+1,cycles};
        next.quarterSchedule=saved; audit('quarter_schedule','main',old,saved); return saved;
      });
    },
    async savePeriod(input, requestId) {
      return transact(requestId, input, (next, timestamp, audit) => {
        const old = next.periods.find((p) => p.id === input.id);
        assertRevision(old?.revision || 0, input.expected_revision);
        const period = old || makePeriod(input.anchor);
        if (period.id !== input.id || period.anchor !== input.anchor || !validDate(input.meeting_date)) throw new Error('Stable period identity or meeting date is invalid.');
        const saved = { ...period, meeting_date: input.meeting_date, revision: period.revision + 1, updated_at: timestamp };
        next.periods = next.periods.filter((p) => p.id !== saved.id).concat(saved); audit('period', saved.id, old || null, saved); return saved;
      });
    },
    async saveCategory(input, requestId) {
      return transact(requestId, input, (next, timestamp, audit) => {
        const old = next.categories.find((c) => c.id === input.id); assertRevision(old?.revision || 0, input.expected_revision);
        if (!input.name?.trim()) throw new Error('Category name is required.');
        const saved = { id: input.id, name: input.name.trim(), revision: (old?.revision || 0) + 1 };
        next.categories = next.categories.filter((c) => c.id !== input.id).concat(saved); audit('category', input.id, old || null, saved); return saved;
      });
    },
    async saveMetric(input, requestId) {
      return transact(requestId, input, (next, timestamp, audit) => {
        const old = next.metrics.find((m) => m.id === input.id); assertRevision(old?.revision || 0, input.expected_revision);
        const prior = definitionAt(next, input.id, input.definition.effective_from);
        validateDefinition(next, input.definition, prior);
        const revision = (old?.revision || 0) + 1;
        const d = { ...input.definition, id: `${input.id}:v${revision}`, metric_id: input.id, revision,
          goal: parseValue(input.definition.goal, input.definition),
          category_label: next.categories.find((c) => c.id === input.definition.category_id).name,
          owner_label: next.members.find((m) => m.user_id === input.definition.owner_id)?.display_name || prior?.owner_label || '',
          recorded_at: timestamp };
        const saved = { id: input.id, retired: Boolean(input.retired), revision };
        next.metrics = next.metrics.filter((m) => m.id !== input.id).concat(saved); next.definitions.push(d);
        audit('metric', saved.id, old ? { metric: old, definition: prior } : null, { metric: saved, definition: d }); return saved;
      });
    },
    async saveObservations(changes, requestId) {
      return transact(requestId, changes, (next, timestamp, audit) => {
        const seen = new Set(); const saved = [];
        for (const change of changes) {
          const id = `${change.metric_id}/${change.period_id}`;
          if (seen.has(id)) throw new Error('Duplicate metric/period identity.'); seen.add(id);
          const metric = next.metrics.find((m) => m.id === change.metric_id);
          const period = next.periods.find((p) => p.id === change.period_id);
          if (!metric || !period) throw new Error('Unknown metric or period ID.');
          const old = observation(next, change.metric_id, change.period_id);
          const d = old ? next.definitions.find((d) => d.id === old.definition_id) : definitionAt(next, metric.id, period.anchor);
          if (!d || d.id !== change.definition_id) throw new Error('Conflict: metric definition changed. Reload and review.');
          assertRevision(period.revision, change.period_revision);
          assertRevision(old?.revision || 0, change.expected_revision);
          const value = parseValue(change.value, d);
          if (!validDate(change.as_of) || !validDate(change.measurement_start) || change.measurement_start > change.as_of) throw new Error('Valid measurement start and as-of dates are required.');
          const row = { metric_id: metric.id, period_id: period.id, definition_id: d.id, value,
            notes: String(change.notes || ''), measurement_start: change.measurement_start, as_of: change.as_of,
            revision: (old?.revision || 0) + 1, recorded_at: old?.recorded_at || timestamp, updated_at: timestamp, actor_id: actor.id };
          next.observations = next.observations.filter((o) => !(o.metric_id === metric.id && o.period_id === period.id)).concat(row);
          audit('observation', id, old || null, row); saved.push(row);
        }
        return saved;
      });
    },
  };
}

export function observationDraft(state, metricId, period) {
  const old = observation(state, metricId, period.id);
  const d = old ? state.definitions.find((d) => d.id === old.definition_id) : definitionAt(state, metricId, period.anchor);
  return { metric_id: metricId, period_id: period.id, definition_id: d.id, period_revision: period.revision,
    expected_revision: old?.revision || 0, value: old?.value ?? '', notes: old?.notes || '',
    ...measurementWindow(d, period), ...(old ? { as_of: old.as_of, measurement_start: old.measurement_start } : {}) };
}

/** Versioned RPC contract. No legacy/direct-table write fallback. */
export function createRemoteScorecardStore(call) {
  let oldestLoaded = null;
  let loadedSnapshot = null;
  let loadedCategories = null;
  const rpc = (name, args = {}) => call(async (client, signal) => {
    const { data, error } = await eosRpc(client, name, args, signal);
    if (error) throw Object.assign(new Error(error.code === 'PT409' ? `${error.message}. Reload the current data before revising your retained draft.` : `Scorecard server contract unavailable or rejected: ${error.message}`), { code: error.code });
    return data;
  });
  async function withQuarterSchedule(state) {
    try {
      const {reporting_dates=[],...quarterSchedule}=await rpc('eos_scorecard_quarters_read_v1',{p_snapshot:state.snapshot});
      return {...state,quarterSchedule,reportingDates:reporting_dates};
    }
    catch(e) {
      if (!['PGRST202','42883'].includes(e.code)) throw e;
      return {...state,quarterSchedule:{revision:0,cycles:[],unavailable:true}};
    }
  }
  return {
    localOnly: false,
    saveQuarterSchedule:(input,requestId)=>rpc('eos_scorecard_quarters_save_v1',{p_input:input,p_request_id:requestId}),
    exportBulk: (cells, id) => rpc('eos_scorecard_bulk_export_v1', {p_cells:cells,p_export_id:id}),
    previewBulk: (rows, id) => rpc('eos_scorecard_bulk_preview_v1', {p_rows:rows,p_import_id:id}),
    readBulk: id => rpc('eos_scorecard_bulk_receipt_v1', {p_import_id:id}),
    applyBulk: id => rpc('eos_scorecard_bulk_apply_v1', {p_import_id:id}),
    previewHistorical: (rows, requestId) => rpc('eos_scorecard_import_preview_v1', { p_rows: rows, p_import_id: requestId }),
    readHistorical: (id) => rpc('eos_scorecard_import_receipt_v1', { p_import_id: id }),
    applyHistorical: (id) => rpc('eos_scorecard_import_apply_v1', { p_import_id: id }),
    async read() {
      const state = await rpc('eos_scorecard_read_v1'); loadedSnapshot = state.snapshot; loadedCategories = state.categories;
      let cursor = state.next_cursor;
      while (cursor && oldestLoaded && cursor > oldestLoaded) {
        const page = await rpc('eos_scorecard_history_v1', { p_cursor: cursor, p_snapshot: state.snapshot });
        state.periods = [...new Map([...state.periods, ...page.periods].map((p) => [p.id, p])).values()];
        state.observations = [...new Map([...state.observations, ...page.observations].map((o) => [`${o.metric_id}/${o.period_id}`, o])).values()];
        if (page.next_cursor === cursor) throw new Error('History pagination did not advance.');
        cursor = page.next_cursor;
      }
      return withQuarterSchedule(state);
    },
    async history(before) {
      const page = await rpc('eos_scorecard_history_v1', { p_cursor: before, p_snapshot: loadedSnapshot });
      const first = page.periods.filter((p) => !p.context_only).map((p) => p.anchor).sort()[0];
      if (first && (!oldestLoaded || first < oldestLoaded)) oldestLoaded = first;
      return page;
    },
    async all() {
      const state = await rpc('eos_scorecard_read_v1');
      let cursor = null; const periods = []; const observations = [];
      do {
        const page = await rpc('eos_scorecard_history_v1', { p_cursor: cursor, p_snapshot: state.snapshot });
        periods.push(...page.periods); observations.push(...page.observations);
        if (page.next_cursor && page.next_cursor === cursor) throw new Error('History pagination did not advance.');
        cursor = page.next_cursor;
      } while (cursor);
      return withQuarterSchedule({ ...state, periods: [...new Map(periods.map((p) => [p.id, p])).values()].filter((p) => !p.context_only),
        observations: [...new Map(observations.map((o) => [`${o.metric_id}/${o.period_id}`, o])).values()] });
    },
    savePeriod: (input, requestId) => rpc('eos_scorecard_save_period_v1', { p_input: input, p_request_id: requestId }),
    saveCategory: (input, requestId) => rpc('eos_scorecard_save_category_v1', { p_input: input, p_request_id: requestId }),
    async saveMetric(input, requestId) {
      validateMetricCategory(input.definition?.category_id, loadedCategories);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.definition.category_id)) throw new Error('Choose a valid category before saving.');
      return rpc('eos_scorecard_save_metric_v1', { p_input: input, p_request_id: requestId });
    },
    saveObservations: (changes, requestId) => rpc('eos_scorecard_save_observations_v1', { p_changes: changes, p_request_id: requestId }),
  };
}
