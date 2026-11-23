import { useEffect, useRef, useState } from 'react';
import { buildForecastPatches, calculateForecastLine, EMPTY_FORECAST_INPUT } from './jobForecast.js';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const asMoney = (value) => value == null || value === '' ? 'Not recorded' : money.format(Number(value));
const lineName = (row) => [row.cost_code, row.description].filter(Boolean).join(' · ');

export function JobForecastPanel({ lines, isLoading, loadError, onClose, onSave }) {
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const dirty = Object.keys(drafts).length > 0;
  const visible = lines.filter((row) => lineName(row).toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(row, field, value) {
    setDrafts((previous) => {
      const draft = previous[row.id] || { version: row.updated_at, input: EMPTY_FORECAST_INPUT };
      return { ...previous, [row.id]: { ...draft, input: { ...draft.input, [field]: value } } };
    });
    setMessage('');
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    if (inFlight.current || isLoading || loadError || !dirty) return;
    setError('');
    try {
      const patches = buildForecastPatches(lines, drafts);
      if (!patches.length) { setMessage('No forecast amounts changed.'); setDrafts({}); return; }
      if (!window.confirm(`Save forecast amounts on ${patches.length} line(s) for this job? Budgets, booked actuals, and billing will not change.`)) return;
      inFlight.current = true;
      setSaving(true);
      await onSave(patches);
      setDrafts({});
      setMessage(`Forecast saved on ${patches.length} line(s).`);
    } catch (e) {
      setError(e?.message || 'Could not confirm the save. Check the current forecast before retrying.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function close() {
    if (!dirty || window.confirm('Discard unsaved forecast inputs?')) onClose();
  }

  return <section className="job-financials-section" aria-label="Forecast worksheet">
    <form className="job-financials-compact-form" onSubmit={save}>
      <h3>Forecast worksheet</h3>
      <p>Verify the cutoff for booked actuals first. For completion, use booked actuals + costs already incurred but not yet posted + future work. Do not include an amount twice. The monthly forecast is separate.</p>
      <p>Blank inputs leave the corresponding saved forecast alone. Enter 0 explicitly when no work remains. HQ saves the resulting dollar amounts, not the hours, rates, or unposted-cost calculation details.</p>
      <label><span>Find a cost code or line</span><input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      {loadError ? <p role="alert">Could not load financials. Reopen this job before saving.</p> : null}
      {isLoading ? <p role="status">Loading current financial lines…</p> : null}
      {!isLoading && !loadError && !visible.length ? <p>No matching financial lines.</p> : null}
      {visible.map((row) => {
        const draft = drafts[row.id]?.input || EMPTY_FORECAST_INPUT;
        let preview = null;
        let issue = '';
        try { preview = calculateForecastLine(row, draft); } catch (e) { issue = e.message; }
        const input = (field, label) => <label><span>{label}</span><input type="text" inputMode="decimal" value={draft[field]} onChange={(e) => update(row, field, e.target.value)} /></label>;
        return <fieldset key={row.id} className="job-financials-section" disabled={saving || isLoading || Boolean(loadError) || !row.updated_at}>
          <legend>{lineName(row)}</legend>
          <p>Booked actuals: {asMoney(row.actual_cost_amount)} · Saved monthly: {asMoney(row.forecast_to_complete_amount)} · Saved completion: {asMoney(row.forecast_final_amount)}</p>
          <div className="job-financials-compact-fields">
            {input('monthly', 'New monthly forecast ($)')}
            <label><span>Enter remaining work as</span><select value={draft.mode} onChange={(e) => update(row, 'mode', e.target.value)}><option value="dollars">Dollars</option><option value="hours">Labor hours × cost rate</option></select></label>
            {draft.mode === 'hours' ? <>{input('hours', 'Remaining labor hours')}{input('rate', 'Hourly cost rate ($)')}</> : input('remaining', 'Remaining work ($)')}
            {input('unposted', 'Incurred but unposted ($, optional)')}
          </div>
          {issue ? <p>{issue}</p> : null}
          {preview?.final != null ? <p><strong>Projected final cost: {asMoney(preview.final)}</strong></p> : null}
          {!row.updated_at ? <p>This line needs a saved revision before it can be edited here.</p> : null}
        </fieldset>;
      })}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <div className="job-financials-quick-actions">
        <button className="primary-button" type="submit" disabled={saving || isLoading || Boolean(loadError) || !dirty}>{saving ? 'Saving…' : 'Save forecast amounts'}</button>
        <button className="secondary-button" type="button" disabled={saving} onClick={close}>Close forecast worksheet</button>
      </div>
    </form>
  </section>;
}
