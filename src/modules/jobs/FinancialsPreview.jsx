import { useEffect, useMemo, useRef, useState } from 'react';
import { buildForecastPatches } from './jobForecast.js';
import { emptyPreview, previewForecast, previewTotals } from './financialsPreview.js';
import './financialsPreview.css';

const dollar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n) => n == null || n === '' ? '—' : dollar.format(Number(n));
const name = (row) => [row.cost_code, row.description].filter(Boolean).join(' · ');
const modeLabel = { crew: 'Crew hours × cost rate', dollars: 'Remaining dollars', materials: 'Quotes + allowance' };

export function FinancialsPreview({ title, lines, isLoading, loadError, onClose, onSave }) {
  const [view, setView] = useState('overview');
  const [period, setPeriod] = useState('all');
  const [query, setQuery] = useState('');
  const [lineId, setLineId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const saving = useRef(false);
  const editor = useRef(null);
  const dirty = Object.keys(drafts).length > 0;
  const { values, issues } = useMemo(() => {
    const values = {}, issues = {};
    for (const row of lines) if (drafts[row.id]) {
      try { values[row.id] = previewForecast(row, drafts[row.id].input); }
      catch (e) { issues[row.id] = e.message; }
    }
    return { values, issues };
  }, [drafts, lines]);
  const totals = previewTotals(lines, {});
  const projection = previewTotals(lines, values);
  const shown = lines.filter(row =>
    name(row).toLowerCase().includes(query.trim().toLowerCase()) &&
    (period === 'all' || Boolean(drafts[row.id])));
  const selected = lines.find((row) => row.id === lineId);
  const entry = selected ? drafts[selected.id]?.input ?? emptyPreview(selected) : null;

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => { if (lineId && view === "forecast") editor.current?.focus(); }, [lineId, view]);

  function edit(row, field, value) {
    setDrafts(d => ({ ...d, [row.id]: { version: d[row.id]?.version ?? row.updated_at, input: { ...(d[row.id]?.input ?? emptyPreview(row)), [field]: value } } }));
    setResult(null);
  }
  function reset(row) {
    setDrafts(d => { const copy = { ...d }; delete copy[row.id]; return copy; });
    setResult(null);
  }
  async function save() {
    if (!dirty || saving.current || isLoading || loadError) return;
    try {
      if (Object.keys(issues).length) throw new Error('Review the flagged forecast lines before saving.');
      const draftsToSave = Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [
        id, { version: draft.version, input: values[id]?.input },
      ]));
      if (Object.values(draftsToSave).some(d => !d.input)) throw new Error('A financial line is no longer available. Back out and review the latest job values.');
      const patches = buildForecastPatches(lines, draftsToSave);
      if (!patches.length) { setResult({ text: 'No forecast amounts changed.' }); return; }
      if (!window.confirm(`Save monthly and completion forecast amounts for ${patches.length} line(s) on this job? Budget, posted costs and billing will not change.`)) return;
      saving.current = true; setBusy(true); setResult(null);
      await onSave(patches);
      setDrafts({});
      setResult({ text: `Saved forecast amounts for ${patches.length} line(s).` });
    } catch (e) {
      setResult({ error: true, text: e?.message || 'The save could not be confirmed. Check saved totals before retrying.' });
    } finally { saving.current = false; setBusy(false); }
  }
  const input = (row, field, label) => <label key={field}><span>{label}</span><input type="text" inputMode="decimal" value={entry[field]} onChange={ev => edit(row, field, ev.target.value)} /></label>;
  const summary = (label, cell, note) => <div key={label} className="fn-preview__metric"><span>{label}</span><strong>{isLoading || loadError || !cell.known ? '—' : money(cell.value)}</strong><small>{note || (cell.known < lines.length ? `${cell.known} of ${lines.length} lines recorded` : 'All available cost lines')}</small></div>;

  return <section className="fn-preview" aria-label="Financials workspace">
    <header className="fn-preview__header">
      <div><span className="eyebrow">Jobs / Financials</span><h2>Financials workspace</h2><p>{title}</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Leave the workspace and discard unsaved forecast inputs?')) onClose(); }}>Back to Financials</button>
    </header>
    <div className="fn-preview__metrics" aria-label="Saved job totals">
      {summary('Current budget', totals.budget)}
      {summary('Booked actuals', totals.actual, 'Posted costs, not an inferred report cutoff')}
      {summary('Monthly forecast', totals.monthly)}
      {summary('Completion forecast', totals.final)}
    </div>
    <nav className="fn-preview__nav" aria-label="Financials workspace sections">
      {[['overview','Overview'],['budget','Budget & actuals'],['forecast','Forecast to finish']].map(([id, label]) =>
        <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
    </nav>
    {loadError ? <p role="alert" className="fn-preview__notice">Could not load job costs. Reopen Financials before using these totals.</p> : null}
    {isLoading ? <p role="status">Loading cost lines…</p> : null}
    {view === 'overview' ? <div className="fn-preview__card">
      <h3>How is this job doing?</h3>
      <p>Start with budget and posted costs, then forecast what remains. Use today’s cost report and your accounting cutoff to reconcile any incurred but unposted work.</p>
      {!isLoading && !loadError && !lines.length ? <p>No cost lines yet. Use the existing Financials screen to add or import them before forecasting.</p> : null}
      <div className="fn-preview__actions"><button className="primary-button" type="button" onClick={() => setView('forecast')}>Forecast to finish</button><button className="secondary-button" type="button" onClick={() => setView('budget')}>Review budget & actuals</button></div>
      <p className="muted-copy">Billing, change orders, documents and cost imports still use their existing HQ screens. Nothing here issues a bill.</p>
    </div> : null}
    {view !== 'overview' && !isLoading && !loadError ? <>
      <div className="fn-preview__card">
        <div className="fn-preview__list-head"><div><h3>{view === 'forecast' ? 'Forecast to finish' : 'Budget & actuals'}</h3>
        <p>{view === 'forecast' ? 'Monthly is a separate period estimate. Completion is booked actuals + unposted costs + future work.' : 'Current budget includes recorded changes and overrides. Actuals below are the dollars already posted in HQ.'}</p></div>
        <div className="fn-preview__actions"><label><span>Find cost code or description</span><input type="search" value={query} onChange={ev => setQuery(ev.target.value)} /></label>
        {view === 'forecast' ? <label><span>Show</span><select value={period} onChange={ev => setPeriod(ev.target.value)}><option value="all">All lines</option><option value="draft">Edited lines</option></select></label> : null}</div></div>
        <div className="fn-preview__scroll" tabIndex={0} role="region" aria-label="Job cost lines">
          <table className="fn-preview__grid"><thead><tr><th scope="col">Cost code / description</th><th scope="col">Budget</th><th scope="col">Actual</th>{view === 'forecast' ? <><th scope="col">Monthly</th><th scope="col">Completion</th><th scope="col">Action</th></> : <th scope="col">Budget left</th>}</tr></thead>
          <tbody>{shown.map(row => <tr key={row.id} className={selected?.id === row.id && view === 'forecast' ? 'is-selected' : ''}>
            <th scope="row">{name(row)}{issues[row.id] ? <small className="fn-preview__error">Check input</small> : null}</th>
            <td>{money(row.currentBudget)}</td><td>{money(row.actual_cost_amount)}</td>
            {view === 'forecast' ? <><td>{money(values[row.id]?.monthly ?? row.forecast_to_complete_amount)}</td><td>{money(values[row.id]?.final ?? row.forecast_final_amount)}</td><td><button type="button" className="secondary-button" aria-pressed={selected?.id === row.id} disabled={!row.updated_at || busy} onClick={() => setLineId(row.id)} aria-label={`Edit forecast for ${name(row)}`}>{drafts[row.id] ? 'Review edit' : 'Edit'}</button></td></> :
            <td>{money(row.actual_cost_amount == null ? null : row.currentBudget - Number(row.actual_cost_amount))}</td>}
          </tr>)}</tbody></table>
          {!shown.length ? <p>No matching cost lines.</p> : null}
        </div>
      </div>
      {view === 'forecast' && selected ? <fieldset ref={editor} tabIndex={-1} className="fn-preview__card fn-preview__editor" disabled={busy}>
        <legend>{name(selected)}</legend>
        <div className="fn-preview__form">
          {input(selected, 'monthly', 'Monthly forecast ($)')}
          <label><span>Remaining work basis</span><select value={entry.mode} onChange={ev => edit(selected, 'mode', ev.target.value)}>{Object.entries(modeLabel).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label>
          {entry.mode === 'crew' ? <>
            {input(selected, 'workers', 'Workers')}
            <label><span>Duration unit</span><select value={entry.unit} onChange={ev => edit(selected, 'unit', ev.target.value)}><option value="days">Days per worker</option><option value="hours">Hours per worker</option></select></label>
            {input(selected, 'duration', entry.unit === 'days' ? 'Days per worker' : 'Hours per worker')}
            {entry.unit === 'days' ? input(selected, 'dayHours', 'Hours per day') : null}
            {input(selected, 'rate', 'Hourly cost rate ($)')}
          </> : entry.mode === 'materials' ? <>{input(selected, 'quoted', 'Quoted materials ($)')}{input(selected, 'allowance', 'Unquoted allowance ($)')}</> : input(selected, 'remaining', 'Remaining work ($)')}
          {input(selected, 'unposted', 'Incurred but unposted ($, optional)')}
        </div>
        <p className="muted-copy">Blank leaves the corresponding forecast unchanged. Enter zero if no work remains. Don’t double count costs already booked.</p>
        {issues[selected.id] ? <p className="fn-preview__error">{issues[selected.id]}</p> : null}
        {values[selected.id]?.final != null ? <p className="fn-preview__math"><strong>{money(values[selected.id].final)} projected at completion</strong><span>{money(selected.actual_cost_amount)} actual + {money(Number(entry.unposted || 0))} unposted + {money(values[selected.id].future)} remaining{values[selected.id].hours != null ? ` (${values[selected.id].hours} hr × ${money(entry.rate)})` : ''}</span></p> : null}
        {drafts[selected.id] ? <button type="button" className="secondary-button" onClick={() => reset(selected)}>Revert this line</button> : null}
      </fieldset> : null}
      {view === 'forecast' ? <div className="fn-preview__save">
        <div><strong>{dirty ? `${Object.keys(drafts).length} ${Object.keys(drafts).length === 1 ? 'line' : 'lines'} edited · ${projection.final.known ? money(projection.final.value) : '—'} projected${projection.final.known < lines.length ? ' on recorded lines' : ''}` : 'No unsaved forecast edits'}</strong>
        <small>Save writes dollar totals only. Hours, rates and breakdowns aren’t retained.</small></div>
        <button className="primary-button" type="button" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Review & save totals'}</button>
      </div> : null}
    </> : null}
    {result ? <p role={result.error ? 'alert' : 'status'} className={result.error ? 'fn-preview__error' : 'fn-preview__notice'}>{result.text}</p> : null}
  </section>;
}
