import { useState } from 'react';
import { adjustmentLogHtml, filterAdjustments } from './contractAdjustments.js';

export function ContractAdjustmentTools({ job, rows, view, onViewChange }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const selected = filterAdjustments(rows, view).filter((row) => !status || row.status === status);
  function preview() {
    const popup = window.open('', '_blank');
    if (!popup) { setError('Allow pop-ups to open the print preview.'); return; }
    popup.document.write(adjustmentLogHtml(job, selected, view === 'credits' ? 'Credits' : view === 'potential' ? 'Potential Change Order Log' : 'Contract Changes'));
    popup.document.close();
    popup.opener = null;
    setError('');
  }
  return <div className="change-order-workspace__panel">
    <div className="change-order-form__grid">
      <label><span>Directory / report view</span><select value={view} onChange={(event) => onViewChange(event.target.value)}><option value="all">Contract Changes — COs &amp; Credits</option><option value="potential">Potential Change Orders</option><option value="credits">Standalone Credits</option></select></label>
      <label><span>Report status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses in this view</option>{[...new Set(rows.map((row) => row.status))].sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <button className="secondary-button" type="button" onClick={preview} disabled={!selected.length}>Preview / Print log ({selected.length})</button>
    </div>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
