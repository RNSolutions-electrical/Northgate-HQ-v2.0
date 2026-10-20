import { useState } from 'react';
import { historicalRows, historicalTemplate, recalledImport, rememberImport } from './scorecardImport.js';

function download(text, name, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ScorecardHistoricalImport({ store, onApplied }) {
  const [preview, setPreview] = useState(null);
  const [identity, setIdentity] = useState(recalledImport);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false); const [stale, setStale] = useState(false);
  async function task(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function upload(file) {
    if (!file) return;
    await task(async () => {
      if (file.size > 4000000) throw new Error('CSV must be within 4 MB.');
      const rows = historicalRows(await file.text());
      const id = crypto.randomUUID(); rememberImport(id); setIdentity(id);
      setPreview(null); setUncertain(false); setStale(false);
      setPreview(await store.previewHistorical(rows, id));
    });
  }
  async function recover() {
    await task(async () => { setPreview(await store.readHistorical(identity)); setStale(false); setUncertain(false); });
  }
  async function apply() {
    await task(async () => {
      try {
        const receipt = await store.applyHistorical(preview.import_id);
        setPreview(receipt); setUncertain(false);
      } catch (e) {
        if (e.code === 'PT409') setStale(true); else setUncertain(true);
        throw e;
      }
      await onApplied?.();
    });
  }
  return <section className="scorecard-import" aria-label="Historical bulk import">
    <h3>Historical bulk import</h3>
    <p>Map each row to an existing metric, category and definition effective for that week. Initialize missing definitions through Manage metrics after review. Owner and target remain optional. This import never creates metrics or overwrites observations.</p>
    <p>Use Monday reporting anchors and preserve the original meeting date separately. Enter explicit measurement dates and percent scale (fraction or 0-100). Blank actuals are held; zero is an actual. Keep comments and mark each row review-needed or reviewed. Omit summary columns.</p>
    <button disabled={busy} onClick={() => download(historicalTemplate(), 'historical-scorecard-template.csv', 'text/csv')}>Download historical template</button>
    <button disabled={busy} onClick={() => task(async () => {
      const all = await store.all();
      download(JSON.stringify({ metrics: all.metrics, categories: all.categories, definitions: all.definitions }, null, 2), 'scorecard-mapping-reference.json', 'application/json');
    })}>Download mapping reference</button>
    <label>Preview historical CSV<input type="file" accept=".csv,text/csv" disabled={busy || uncertain} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
    <label>Import receipt ID<input value={identity} disabled={busy} onChange={(e) => setIdentity(e.target.value)} /></label>
    <button disabled={busy || !identity} onClick={recover}>Recover preview / receipt</button>
    {busy && <p role="status">Waiting for the server. Keep this import identity for recovery.</p>}
    {error && <p role="alert">{error}</p>}
    {uncertain && <p role="status">Apply outcome is unconfirmed. Recover the receipt or retry Apply with the same identity. The server commits the whole batch once or rolls it all back.</p>}
    {stale && <p role="alert">Preview is stale. Upload the source again and review a fresh preview.</p>}
    {preview && <>
      <p role="status">{preview.status}: {preview.success} saved, {preview.ready} ready, {preview.held} held, {preview.errors} errors. Import {preview.import_id}</p>
      <p>Preview expires {preview.expires_at}. Any intervening scorecard write invalidates an unapplied preview. Held rows are excluded. An error prevents the entire apply.</p>
      <button disabled={busy || stale || preview.status !== 'preview' || preview.errors > 0 || preview.ready === 0} onClick={apply}>Apply {preview.ready} reviewed historical observations</button>
      <button disabled={busy} onClick={() => download(JSON.stringify(preview, null, 2), `scorecard-import-${preview.import_id}.json`, 'application/json')}>Download exact preview / receipt</button>
      <details><summary>Review every row, mapping and source comment</summary>
        <ol>{preview.rows.map((row) => <li key={row.row}><strong>{row.status}: {row.message}</strong><pre>{JSON.stringify({ ...row.source, normalized_value: row.value }, null, 2)}</pre></li>)}</ol>
      </details>
    </>}
  </section>;
}
