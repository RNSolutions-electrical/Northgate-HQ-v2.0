import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';

function lineLabel(line) {
  return [line?.cost_code, line?.description].filter(Boolean).join(' — ') || 'Untitled financial line';
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'Invalid amount';
}

export function JobFinancialProposalQueue({ jobId, enabled, onApplied }) {
  const { getToken } = useAuth();
  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState('');
  const [noteById, setNoteById] = useState({});

  const loadQueue = useCallback(async () => {
    if (!enabled || !jobId) {
      setQueue([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error: loadError } = await client.rpc('read_v5_job_financial_review_queue', { p_limit: 100 });
      if (loadError) throw loadError;
      setQueue((data || []).filter((item) => item.job_id === jobId));
    } catch (loadError) {
      setError(loadError);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, getToken, jobId]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  async function decide(item, decision) {
    const note = (noteById[item.destination_id] || '').trim();
    if (!note) {
      setError(new Error('Enter a short review note before applying, returning, or declining this proposal.'));
      return;
    }
    setActiveId(item.destination_id);
    setError(null);
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const request = decision === 'apply'
        ? client.rpc('apply_v5_job_financial_proposal', {
          p_destination_id: item.destination_id,
          p_expected_version: item.destination_version,
          p_expected_payload_hash: item.payload_hash,
          p_note: note,
        })
        : client.rpc('review_v5_change_destination', {
          p_destination_id: item.destination_id,
          p_expected_version: item.destination_version,
          p_expected_payload_hash: item.payload_hash,
          p_decision: decision,
          p_note: note,
        });
      const { error: decisionError } = await request;
      if (decisionError) throw decisionError;
      setNoteById((current) => ({ ...current, [item.destination_id]: '' }));
      await loadQueue();
      if (decision === 'apply') onApplied?.();
    } catch (decisionError) {
      setError(decisionError);
    } finally {
      setActiveId('');
    }
  }

  if (!enabled) return null;
  if (!isLoading && !error && queue.length === 0) return null;

  return (
    <section className="job-financial-proposals" aria-label="Financial proposal review queue">
      <Toolbar
        eyebrow="Review queue"
        title="Proposed financial changes"
        description="Review unpublished changes before they become part of the official job financials."
        actions={<button type="button" className="secondary-button" onClick={loadQueue} disabled={isLoading}>Refresh</button>}
      />
      {error ? <StatePanel tone="danger" title="Financial proposal action failed" description={error.message} compact /> : null}
      {isLoading ? <p className="muted-copy">Loading proposed financial changes…</p> : null}
      {queue.map((item) => {
        const lines = Array.isArray(item.proposed_payload?.lines) ? item.proposed_payload.lines : [];
        const busy = activeId === item.destination_id;
        return (
          <article className="job-financial-proposal" key={item.destination_id}>
            <div className="job-financial-proposal__heading">
              <div>
                <strong>{item.submitted_by_name || 'Northgate user'}</strong>
                <small>{new Date(item.submitted_at).toLocaleString()} · {lines.length} line{lines.length === 1 ? '' : 's'}</small>
              </div>
              <StatusBadge label="Pending review" tone="warn" />
            </div>
            {item.shared_reason ? <p>{item.shared_reason}</p> : null}
            <div className="job-financial-proposal__lines">
              {lines.map((line, index) => (
                <div key={`${line.id || 'new'}-${index}`}>
                  <strong>{lineLabel(line)}</strong>
                  <span>{line.id ? 'Existing line' : 'New line'} · Original {money(line.budget_amount)} · Changes {money(line.budget_change_amount)} · Actual {money(line.actual_cost_amount)} · Forecast {money(line.forecast_final_amount)}</span>
                  {line.is_protected_financial ? <small>Protected project financial</small> : null}
                </div>
              ))}
            </div>
            <label className="job-financial-proposal__note">
              <span>Review note</span>
              <input
                value={noteById[item.destination_id] || ''}
                onChange={(event) => setNoteById((current) => ({ ...current, [item.destination_id]: event.target.value }))}
                placeholder="What was reviewed or what needs correction"
                disabled={busy}
              />
            </label>
            <div className="job-financial-proposal__actions">
              <button type="button" className="primary-button" onClick={() => decide(item, 'apply')} disabled={busy}>{busy ? 'Working…' : 'Apply to Financials'}</button>
              <button type="button" className="secondary-button" onClick={() => decide(item, 'return')} disabled={busy}>Return for edits</button>
              <button type="button" className="secondary-button secondary-button--danger" onClick={() => decide(item, 'decline')} disabled={busy}>Decline</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
