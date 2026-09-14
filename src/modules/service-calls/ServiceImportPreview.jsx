import { useState } from 'react';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { previewSource, combinePreview } from './serviceCallModel.js';

export function ServiceImportPreview({ existing }) {
  const [sources, setSources] = useState({ registry: [], scorecard: [] });
  const [files, setFiles] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  async function load(file, source) {
    if (!file) return;
    setBusy(true); setError(''); setSelected(null);
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Choose a workbook smaller than 15 MB.');
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const expected = source === 'registry' ? 'Job #s' : 'All Service Calls';
      const sheetName = workbook.SheetNames.includes(expected) ? expected : workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : null;
      if (!sheetName) throw new Error('Workbook must contain the "' + expected + '" sheet.');
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
        .map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 10) : cell));
      const origin = XLSX.utils.decode_range(sheet['!ref'] || 'A1').s.r;
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith('!') || !(cell.t === 'e' || (cell.f && cell.v === undefined))) continue;
        const position = XLSX.utils.decode_cell(address);
        const rowIndex = position.r - origin;
        if (rows[rowIndex]) rows[rowIndex][position.c] = cell.w || '#FORMULA_ERROR';
      }
      const parsed = previewSource(rows, source);
      setSources((current) => ({ ...current, [source]: parsed }));
      setFiles((current) => ({ ...current, [source]: file.name }));
    } catch (e) {
      setSources((current) => ({ ...current, [source]: [] }));
      setFiles((current) => ({ ...current, [source]: '' }));
      setError(e.message);
    } finally { setBusy(false); }
  }
  const rows = combinePreview(sources.registry, sources.scorecard, existing);
  return <section className="svc-section">
    <h2>Spreadsheet import preview</h2>
    <p>Preview only. Files stay in this browser; no calls, invoices, or payments are created. Exact job-number matches are suggested, never automatically merged.</p>
    <div className="svc-grid">
      <label>Job-number registry export
        <input disabled={busy} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => load(e.target.files[0], 'registry')} />
        <small>{files.registry || 'Export the Google sheet as Excel or CSV. Use the Job #s tab.'}</small>
      </label>
      <label>Electrical scorecard
        <input disabled={busy} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => load(e.target.files[0], 'scorecard')} />
        <small>{files.scorecard || 'Use the All Service Calls tab.'}</small>
      </label>
    </div>
    {error && <StatePanel title="Preview could not be loaded" description={error} tone="warning" />}
    {rows.length > 0 && <p>{rows.length} job numbers · {rows.filter((r) => r.match === 'Exact number match').length} exact existing matches · Select a row to compare its sources.</p>}
    <DataTable rows={rows} columns={[
      { key: 'number', header: 'Job #' }, { key: 'customer', header: 'Customer' },
      { key: 'match', header: 'Existing record' },
      { key: 'issues', header: 'Review', render: (row) => row.issues.join('; ') || 'Compare sources before importing' },
    ]} getRowKey={(r) => r.number} onRowClick={setSelected} minWidth="700px" emptyTitle="Select source files to preview matches" />
    {selected && <section className="svc-section">
      <h3>{selected.number} — source comparison</h3>
      <div className="svc-grid">{selected.sources.map((source, i) => <div key={i}>
        <h4>{source.source === 'registry' ? 'Job-number registry' : 'Scorecard'} · row {source.row}</h4>
        <dl className="svc-facts">{Object.entries(source).filter(([k]) => !['source','row','issues'].includes(k)).map(([key, value]) =>
          <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value === null || value === '' ? '—' : String(value)}</dd></div>)}</dl>
      </div>)}</div>
    </section>}
  </section>;
}
