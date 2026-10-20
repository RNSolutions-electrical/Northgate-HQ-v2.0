import { useEffect, useMemo, useState } from 'react';
import { shiftCalendarDate } from './eosLogic.js';
import { AGGREGATIONS, CARRY, UNITS, WINDOWS, eligibleMembers, exportRows, formatValue, makePeriod, resolveCell, scopedPeriods } from './scorecardLogic.js';
import { observationDraft, validateMetricCategory } from './scorecardStore.js';
import { previewCsv, toCsv } from './scorecardCsv.js';
import { printScorecard, scorecardPrintHtml } from './scorecardPrint.js';
import './scorecard.css';
import candidateReference from './scorecardCandidates.json';
import { ScorecardBulkEditor } from './ScorecardBulkEditor.jsx';

const windowLabels = { 'point-in-time': 'Current snapshot', period: 'Weekly / total for entered dates', QTD: 'Quarter to date (cumulative)', YTD: 'Year to date (cumulative)', 'rolling-30': 'Rolling 30 days' };
const summaryLabels = { none: 'No calculated total', last: 'Latest reported value', sum: 'Sum separate period totals', average: 'Average reported values' };
const carryLabels = { none: 'Leave missing values blank', continuous: 'Show last value until updated', year: 'Show last value within the year', quarter: 'Show last value within the quarter' };
const weeklyRange = (p) => { const end = shiftCalendarDate(p.anchor, 2); return shiftCalendarDate(end, -7) + ' to ' + end; };
const uuid = () => crypto.randomUUID();
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const initialDefinition = (date) => ({ name: '', context: '', category_id: '', owner_id: '', unit: 'number', goal: '',
  effective_from: date, carry: 'none', window: 'point-in-time', aggregation: 'none' });

export function ScorecardWorkspace({ store }) {
  const [state, setState] = useState(null); const [view, setView] = useState('Meeting');
  const [periodId, setPeriodId] = useState(''); const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('name'); const [descending, setDescending] = useState(false);
  const [owner, setOwner] = useState(''); const [category, setCategory] = useState(''); const [includeRetired, setIncludeRetired] = useState(false);
  const [scope, setScope] = useState('current'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [historyCount, setHistoryCount] = useState(8); const [editing, setEditing] = useState(null); const [metricForm, setMetricForm] = useState(null);
  const [periodForm, setPeriodForm] = useState(null); const [categoryForm, setCategoryForm] = useState(null);
  const [preview, setPreview] = useState(null); const [applyId, setApplyId] = useState(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function refresh() {
    const data = await store.read(); setState(data);
    setPeriodId((id) => id || [...data.periods].sort((a, b) => b.anchor.localeCompare(a.anchor))[0]?.id || '');
    return data;
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [store]);
  async function run(operation, done) {
    setBusy(true); setError(''); setMessage('Saving…');
    try { await operation(); await refresh(); done?.(); setMessage('Saved.'); }
    catch (e) { setError(e.message); setMessage('Save could not be confirmed. Draft retained; retry uses the same request identity.'); }
    finally { setBusy(false); }
  }
  const periods = useMemo(() => [...(state?.periods || [])].filter((p) => !p.context_only).sort((a, b) => a.anchor.localeCompare(b.anchor)), [state]);
  const period = periods.find((p) => p.id === periodId) || periods.at(-1);
  const previous = period && (periods.find((p) => p.anchor === shiftCalendarDate(period.anchor, -7)) || { ...makePeriod(shiftCalendarDate(period.anchor, -7)), unpersisted: true });
  const filters = { scope, periodId: period?.id, owner, category, includeRetired, from, to };
  let scopePeriods = []; let scopeError = '';
  if (state) { try { scopePeriods = scopedPeriods(state, filters).filter((p) => !p.context_only); } catch (e) { scopeError = e.message; } }
  const displayedPeriods = view === 'Meeting' ? [previous, period].filter(Boolean) : scopePeriods.slice(-historyCount);
  const rows = useMemo(() => {
    if (!state || !period) return [];
    return state.metrics.filter((m) => includeRetired || !m.retired).map((m) => ({ ...m, d: resolveCell(state, m.id, period).definition }))
      .filter(({ id, d }) => d && (view === 'All history' ? scopePeriods : [period]).some((p) => {
        const historical = resolveCell(state, id, p).definition;
        return historical && (!owner || historical.owner_id === owner) && (!category || historical.category_id === category);
      }))
      .sort((a, b) => {
        const val = (m) => sort === 'updated_at' || sort === 'recorded_at' ? state.observations.filter((o) => o.metric_id === m.id).map((o) => o[sort]).sort().at(-1) || ''
          : sort === 'owner' ? m.d.owner_label : sort === 'category' ? m.d.category_label : m.d.name;
        return (descending ? -1 : 1) * String(val(a) || '').localeCompare(String(val(b) || '')) || a.id.localeCompare(b.id);
      });
  }, [state, period, includeRetired, owner, category, sort, descending, view, scope, from, to]);
  // Snapshot the ordering at edit start; updates never move an in-progress row.
  const orderedRows = editing?.order ? [...rows].sort((a, b) => editing.order.indexOf(a.id) - editing.order.indexOf(b.id)) : rows;
  function beginEdit(metricId, p, focus) {
    if (busy) return;
    if (p.unpersisted) { setError('Add this reporting week before entering an observation.'); return; }
    setEditing({ draft: observationDraft(state, metricId, p), requestId: uuid(), order: rows.map((r) => r.id), focus }); setError('');
  }
  const updateDraft = (key, value) => setEditing((e) => ({ ...e, requestId: uuid(), draft: { ...e.draft, [key]: value } }));
  const saveDraft = () => editing && run(() => store.saveObservations([editing.draft], editing.requestId), () => setEditing(null));
  async function exportData(kind) {
    // Open during the click gesture, before the asynchronous snapshot fetch.
    const printWindow = kind === 'pdf' ? window.open('', '_blank') : null;
    setBusy(true); setError('');
    try {
      if (kind === 'pdf' && !printWindow) throw new Error('Allow the print window, then retry PDF.');
      const all = await store.all(); const data = exportRows(all, filters);
      if (kind === 'csv') download(toCsv(data), `company-scorecard-${scope}.csv`, 'text/csv;charset=utf-8');
      else printScorecard(scorecardPrintHtml(data, `${scope} · owner ${owner || 'all'} · category ${category || 'all'} · retired ${includeRetired ? 'included' : 'excluded'}`), printWindow);
      setMessage(`${data.length} period observations exported.`);
    } catch (e) { printWindow?.close(); setError(e.message); } finally { setBusy(false); }
  }
  async function previewImport(text) {
    setPreview(null); setError('');
    try { const all = await store.all(); setPreview(previewCsv(text, all)); setApplyId(uuid()); }
    catch (e) { setError(e.message); }
  }
  async function applyImport() {
    if (!preview?.valid || !preview.changes.length || !store.localOnly) return;
    // The transaction rechecks all revisions atomically. Reuse the exact approved
    // body and identity if a response is lost after commit.
    await run(() => store.saveObservations(preview.changes, applyId), () => setPreview(null));
  }
  async function loadOlder() {
    setBusy(true); setError('');
    try {
      if (store.history) {
        const page = await store.history(periods[0]?.anchor || null);
        setState((s) => ({ ...s, periods: [...new Map([...s.periods, ...page.periods].map((p) => [p.id, p])).values()],
          observations: [...new Map([...s.observations, ...page.observations].map((o) => [`${o.metric_id}/${o.period_id}`, o])).values()] }));
      }
      setHistoryCount((count) => count + 12);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const editorPanel = editing ? (<form className="scorecard-editor" onSubmit={(e) => { e.preventDefault(); saveDraft(); }} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setEditing(null); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft(); } }}>
        <h3>Update metric · {state.definitions.find((d) => d.id === editing.draft.definition_id)?.name} · {editing.draft.period_id}</h3>
        <p>Actual value only. An empty value explicitly clears this observation; auto-filled values are never copied into this editor. Percentages use 0–100. Ctrl/⌘+Enter saves; Escape cancels.</p>
        <label>Value for these dates<input autoFocus={editing.focus === 'value'} value={editing.draft.value ?? ''} onChange={(e) => updateDraft('value', e.target.value)} /></label>
        <label>Notes<textarea aria-label="Notes" autoFocus={editing.focus === 'notes'} rows="4" value={editing.draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} /></label>
        <label>Period starts<input required type="date" value={editing.draft.measurement_start} onChange={(e) => updateDraft('measurement_start', e.target.value)} /></label>
        <label>Through / as of<input required type="date" value={editing.draft.as_of} onChange={(e) => updateDraft('as_of', e.target.value)} /></label>
        <button disabled={busy}>Save observation</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
      </form>) : null;
  function cell(metric, p) {
    const c = resolveCell(state, metric.id, p);
    if (!c.definition) return <td colSpan="2" key={p.id}>Not defined in this period</td>;
    if (view === 'All history' && ((owner && c.definition.owner_id !== owner) || (category && c.definition.category_id !== category))) return <td colSpan="2" key={p.id}>Outside filters</td>;
    const isEditing = editing?.draft.metric_id === metric.id && editing?.draft.period_id === p.id;
    return <FragmentCell key={p.id}>
      <td><button className="scorecard-cell" disabled={busy} onClick={() => beginEdit(metric.id, p, 'value')} aria-label={`Edit value: ${c.definition.name}, ${p.anchor}`}>
        <strong>{formatValue(c.value, c.definition)}</strong>
        {c.carried && <small className="scorecard-carry">Auto-filled · meeting {c.sourcePeriod.meeting_date}<br />Updated {c.source.updated_at}<br />Measurement {c.source.measurement_start} to {c.source.as_of}</small>}
        {!c.carried && c.actual && <small>Measurement {c.actual.measurement_start} to {c.actual.as_of}</small>}
        {view === 'All history' && <small>{c.definition.name} · {c.definition.owner_label || 'Unassigned'}<br />{c.definition.category_label} · {c.definition.unit} · Goal {formatValue(c.definition.goal, c.definition)}</small>}
      </button>{isEditing && editorPanel}</td>
      <td><button className="scorecard-cell scorecard-notes" disabled={busy} onClick={() => beginEdit(metric.id, p, 'notes')} aria-label={`Edit notes: ${c.definition.name}, ${p.anchor}`}>{c.notes || 'Add notes'}</button>
        {c.notes && <small>Notes for {p.anchor}</small>}</td>
    </FragmentCell>;
  }
  return <section className="scorecard-workspace" aria-label="Company Scorecard">
    <div className="scorecard-heading"><div><p className="eyebrow">E.O.S. / LEADERSHIP</p><h2>Company Scorecard</h2><p>Weekly observations, shared ownership, complete history.</p></div>
      {store.localOnly && <span className="scorecard-local">LOCAL VERIFICATION · SYNTHETIC DATA</span>}</div>
    {error && <div role="alert" className="eos-message eos-message--error">{error} <button disabled={busy} onClick={() => refresh().catch((e) => setError(e.message))}>Reload latest</button></div>}
    <div role="status" className="scorecard-status">{busy ? 'Working…' : message}</div>
    {!state ? <p>Scorecard requires the reviewed server contract. <button onClick={() => refresh().catch((e) => setError(e.message))}>Retry loading</button></p> : <>
      <nav className="scorecard-tabs" aria-label="Scorecard views">{['Meeting', 'All history', 'Manage metrics'].map((name) => <button key={name} aria-pressed={view === name} onClick={() => { setView(name); if (name === 'All history') setScope('full'); else if (name === 'Meeting') setScope('current'); }}>{name}</button>)}</nav>
      <div className="scorecard-toolbar">
        {view === 'Meeting' && <><label>Meeting / reporting week<select aria-label="Reporting week" value={period?.id || ''} onChange={(e) => setPeriodId(e.target.value)}>{periods.map((p) => <option key={p.id} value={p.id}>Meeting {p.meeting_date} (week of {p.anchor})</option>)}</select></label>
        <button disabled={busy} onClick={() => { const p = makePeriod(); setPeriodForm({ ...p, expected_revision: 0, requestId: uuid(), isNew: true }); }}>Add reporting week</button>
        {period && <button onClick={() => setPeriodForm({ ...period, expected_revision: period.revision, requestId: uuid() })}>Change meeting date</button>}</>}
        <label>Owner<select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All owners</option>{state.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}{!m.is_member || !m.is_active ? ' (historical)' : ''}</option>)}</select></label>
        <label>Category<select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <details className="scorecard-more"><summary>More filters</summary><div className="scorecard-toolbar"><label className="scorecard-check"><input type="checkbox" checked={includeRetired} onChange={(e) => setIncludeRetired(e.target.checked)} />Include retired</label>
        <label>Sort by<select aria-label="Sort by" disabled={Boolean(editing)} value={sort} onChange={(e) => setSort(e.target.value)}>{['name','category','owner','recorded_at','updated_at'].map((s) => <option key={s}>{s}</option>)}</select></label>
        <button disabled={Boolean(editing)} onClick={() => setDescending(!descending)}>{descending ? 'Descending' : 'Ascending'}</button></div></details>
      </div>
      {periodForm && view === 'Meeting' && <form className="scorecard-editor" onSubmit={(e) => { e.preventDefault(); run(() => store.savePeriod(periodForm, periodForm.requestId), () => { setPeriodId(periodForm.id); setPeriodForm(null); }); }}>
        <h3>{periodForm.isNew ? 'Add meeting week' : 'Change meeting date'}</h3>
        <label>Week containing<input type="date" disabled={!periodForm.isNew} value={periodForm.anchor} onChange={(e) => { if (e.target.value) setPeriodForm({ ...periodForm, ...makePeriod(e.target.value), requestId: uuid() }); }} /></label>
        <label>Meeting date<input required type="date" value={periodForm.meeting_date} onChange={(e) => setPeriodForm({ ...periodForm, meeting_date: e.target.value, requestId: uuid() })} /></label>
        <p>Wednesday is the default meeting day. Choose another date when needed. The weekly reference range stays Wednesday to Wednesday; each entry keeps its own measurement dates. Changing the meeting date does not move saved values.</p>
        <button disabled={busy}>Save meeting</button><button type="button" disabled={busy} onClick={() => setPeriodForm(null)}>Cancel</button>
      </form>}
      {period && view === 'Meeting' && <p className="scorecard-help">Meeting {period.meeting_date} · Weekly reference: {weeklyRange(period)}. Click a value or note to update it. Quarterly, YTD and snapshot metrics use their own measurement dates.</p>}
      {view !== 'Manage metrics' && <>
        <div className="scorecard-toolbar"><label>Reporting period<select aria-label="Screen / export scope" value={scope} onChange={(e) => { setScope(e.target.value);  }}>{[['current','Selected week'],['quarter','Selected week’s quarter'],['year','Selected week’s year'],['custom','Custom range'],['full','Full history']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {scope === 'custom' && <><label>From week of<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Through week of<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>}
          {store.localOnly && <button disabled={busy || !!scopeError} onClick={() => exportData('csv')}>Export CSV</button>}<button disabled={busy || !!scopeError} onClick={() => exportData('pdf')}>PDF / Print</button>
          {store.localOnly && <details><summary>Import updates from CSV</summary><label>Preview edited CSV<input aria-label="Preview edited CSV" type="file" accept=".csv,text/csv" onChange={async (e) => { if (e.target.files[0]) await previewImport(await e.target.files[0].text()); e.target.value = ''; }} /></label></details>}
        </div>
        <p className="scorecard-help">Meeting compares last week and this week. Reporting period controls history and exports; quarter/year follow the selected week even if its meeting moves. Notes belong only to the week shown.</p>
        {scopeError && <p role="alert">{scopeError}</p>}
        <div className="scorecard-scroll" tabIndex="0" aria-label="Scrollable scorecard table"><table className="scorecard-table"><thead><tr><th className="scorecard-identity">Metric / owner / target</th>{displayedPeriods.map((p) => <th colSpan="2" key={p.id}>{view === 'Meeting' ? p.id === period.id ? 'This week' : 'Last week' : 'Week of ' + p.anchor}<small>Weekly reference: {weeklyRange(p)}<br />Meeting {p.meeting_date}{view === 'Meeting' ? p.id === period.id ? ' · Selected' : ' · Previous' : ''}</small></th>)}</tr><tr><th className="scorecard-identity">{orderedRows.length} measurables</th>{displayedPeriods.map((p) => <FragmentCell key={p.id}><th>Value / measurement</th><th>Visible notes</th></FragmentCell>)}</tr></thead>
          <tbody>{orderedRows.map((m) => <tr key={m.id} data-metric-id={m.id} className={selected === m.id ? 'is-selected' : ''} onClick={(e) => { if (!e.target.closest('button,input,textarea,select')) setSelected(m.id); }}><th scope="row" className="scorecard-identity"><button className="scorecard-selector" aria-pressed={selected === m.id} onClick={() => setSelected(selected === m.id ? null : m.id)}>{m.d.name}</button><small>{m.d.category_label} · {m.d.owner_label || 'Unassigned'}{m.retired ? ' · Retired' : ''}<br />Target {formatValue(m.d.goal, m.d)} · {m.d.unit}<br />{windowLabels[m.d.window]}<details><summary>Metric details</summary>{m.d.context}<br />Summary: {summaryLabels[m.d.aggregation]}</details></small></th>{displayedPeriods.map((p) => cell(m, p))}</tr>)}</tbody></table></div>
        {!orderedRows.length && <p>No metrics in this view. Add definitions in Manage metrics.</p>}
        {view === 'All history' && <button disabled={busy} onClick={loadOlder}>Load older periods</button>}
      </>}
      {view === 'Manage metrics' && <>
        <p>Add a metric, choose its owner and target, then return to Meeting to enter a value or note. All active E.O.S. members can update metrics. Definition changes apply from the selected week; past entries retain their original settings.</p>
        <details><summary>Source details · optional workbook reference</summary><p>Scorecard tab · October 7, 2026. Choose actual members when creating definitions. Dave is confirmed for Electrical Estimates; other account mappings and conflicting goals need review. No quarterly summary is assumed authoritative.</p><ol>{candidateReference.candidates.map((c) => <li key={c.source_row}><strong>{c.category}: {c.name}</strong> · source owner {c.owner_label} · source goal {String(c.source_goal ?? 'blank')}<br />{c.review}<button onClick={() => setMetricForm({ id: uuid(), expected_revision: 0, retired: false, requestId: uuid(), definition: { ...initialDefinition(period?.anchor || makePeriod().anchor), name: c.name, context: `${c.name} — provisional; verify unit, goal and measurement basis.`, category_id: state.categories.find((category) => category.name === c.category)?.id || '' } })}>Prepare definition for {c.name}</button></li>)}</ol><p>Historical Tuesday dates, MN22 exception and MI33 profit-method note remain in the source workbook; no history is loaded. Cross-year receipt attribution remains deferred.</p></details>
        <button onClick={() => setMetricForm({ id: uuid(), expected_revision: 0, retired: false, definition: initialDefinition(period?.anchor || makePeriod().anchor), requestId: uuid() })}>Add metric</button>
        <button onClick={() => setCategoryForm({ id: uuid(), expected_revision: 0, name: '', requestId: uuid() })}>Add category</button>
        <div className="scorecard-category-list">{state.categories.map((c) => <button key={c.id} onClick={() => setCategoryForm({ ...c, expected_revision: c.revision, requestId: uuid() })}>Rename {c.name}</button>)}</div>
        {categoryForm && <form className="scorecard-editor" onSubmit={(e) => { e.preventDefault(); run(() => store.saveCategory(categoryForm, categoryForm.requestId), () => setCategoryForm(null)); }}><label>Category name<input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value, requestId: uuid() })} /></label><button disabled={busy}>Save category</button><button type="button" onClick={() => setCategoryForm(null)}>Cancel</button></form>}
        <div className="scorecard-metrics">{rows.map((m) => <article key={m.id}><strong>{m.d.name}</strong><span>{m.d.owner_label || 'Unassigned'} · {m.d.unit} · {windowLabels[m.d.window]} · {carryLabels[m.d.carry]} · {summaryLabels[m.d.aggregation]}{m.retired ? ' · Retired' : ''}</span><button onClick={() => setMetricForm({ id: m.id, expected_revision: m.revision, retired: m.retired, definition: { ...m.d, effective_from: period.anchor }, requestId: uuid() })}>Edit / retire {m.d.name}</button></article>)}</div>
      </>}
      {metricForm && <form className="scorecard-editor" onSubmit={(e) => { e.preventDefault(); run(() => { validateMetricCategory(metricForm.definition.category_id, state.categories); return store.saveMetric(metricForm, metricForm.requestId); }, () => setMetricForm(null)); }}>
        <h3>Metric settings</h3><p>For quarterly or YTD cumulative entries, use Latest reported value (or no calculated total). Sum is only for separate, non-overlapping period totals. Existing entries are never converted.</p>{[['name','Metric name'],['context','What this value measures'],['goal','Target (optional)'],['effective_from','Apply settings from week of']].map(([key,label]) => <label key={key}>{label}<input required={key !== 'goal'} type={key === 'effective_from' ? 'date' : 'text'} value={metricForm.definition[key] ?? ''} onChange={(e) => setMetricForm({ ...metricForm, requestId: uuid(), definition: { ...metricForm.definition, [key]: e.target.value } })} /></label>)}
        {[['category_id','Category',state.categories.map((c) => [c.id,c.name])],['owner_id','Owner', [...new Map([...eligibleMembers(state.members), ...state.members.filter((m) => m.user_id === metricForm.definition.owner_id), ...(metricForm.definition.owner_id && !state.members.some((m) => m.user_id === metricForm.definition.owner_id) ? [{ user_id: metricForm.definition.owner_id, display_name: `${metricForm.definition.owner_label || metricForm.definition.owner_id} (historical)` }] : [])].map((m) => [m.user_id,m])).values()].map((m) => [m.user_id,m.display_name])],['unit','Format',UNITS.map((v) => [v,v])],['window','Values represent',WINDOWS.map((v) => [v,windowLabels[v]])],['carry','When an update is missing',CARRY.map((v) => [v,carryLabels[v]])],['aggregation','Report calculation',AGGREGATIONS.map((v) => [v,summaryLabels[v]])]].map(([key,label,options]) => <label key={key}>{label}<select aria-label={label} required={key === 'category_id'} value={metricForm.definition[key]} onChange={(e) => setMetricForm({ ...metricForm, requestId: uuid(), definition: { ...metricForm.definition, [key]: e.target.value } })}>{key === 'category_id' && <option value="" disabled>Choose a category (required)</option>}{key === 'owner_id' && <option value="">Unassigned</option>}{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>)}
        <label className="scorecard-check"><input type="checkbox" checked={metricForm.retired} onChange={(e) => setMetricForm({ ...metricForm, retired: e.target.checked, requestId: uuid() })} />Retired (uncheck to restore; history retained)</label>
        <button disabled={busy}>Save metric settings</button><button type="button" disabled={busy} onClick={() => setMetricForm(null)}>Cancel</button>
      </form>}
      {store.exportBulk && <ScorecardBulkEditor store={store} filters={filters} onApplied={refresh} />}
      {preview && <section className="scorecard-import"><h3>CSV change preview - no writes yet</h3><p>Only actual_value, notes and measurement dates are editable, with explicit set/clear actions. Blank with keep means unchanged. Omitted rows never delete or retire anything. Displayed/carry fields are read-only provenance.</p>
        <ul>{preview.rows.map((r,i) => <li key={`${r.id}/${i}`}>{r.name} · {r.period}: {r.error || r.description}{r.change && <pre>{JSON.stringify({ before: { value: r.before.actual_value, notes: r.before.notes }, after: { value: r.change.value, notes: r.change.notes, measurement_start: r.change.measurement_start, as_of: r.change.as_of } }, null, 2)}</pre>}</li>)}</ul>
        {!store.localOnly && <p>Round-trip CSV editing is disabled for shared data. Use Historical bulk import for validated, insert-only historical observations.</p>}
        <button disabled={busy || !store.localOnly || !preview.valid || !preview.changes.length} onClick={applyImport}>Apply {preview.changes.length} reviewed changes</button><button onClick={() => setPreview(null)}>Cancel import</button>
      </section>}
    </>}
  </section>;
}
function FragmentCell({ children }) { return <>{children}</>; }
