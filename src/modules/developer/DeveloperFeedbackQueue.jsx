import { useAuth } from '@clerk/clerk-react';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const STATUS_OPTIONS = ['new', 'triaged', 'planned', 'in_progress', 'resolved', 'closed'];

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

function toneForImpact(impact) {
  return impact === 'blocking' ? 'danger' : impact === 'high' ? 'warn' : 'neutral';
}

const COLUMNS = [
  { key: 'created_at', header: 'Submitted', render: (row) => formatDate(row.created_at) },
  { key: 'feedback_type', header: 'Type', render: (row) => <StatusBadge tone="neutral">{row.feedback_type}</StatusBadge> },
  { key: 'title', header: 'Feedback', render: (row) => <div className="developer-note-cell"><strong>{row.title}</strong><span>{row.submitter_name || row.submitter_email || row.submitted_by}</span></div> },
  { key: 'impact', header: 'Impact', render: (row) => <StatusBadge tone={toneForImpact(row.impact)}>{row.impact}</StatusBadge> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge tone={row.status === 'new' ? 'warn' : row.status === 'resolved' ? 'good' : 'neutral'}>{row.status.replace('_', ' ')}</StatusBadge> },
];

export function DeveloperFeedbackQueue({ permissions, onCountChange }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ isLoading: true, error: null, rows: [] });
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedId, setSelectedId] = useState(null);
  const [review, setReview] = useState({ status: 'triaged', resolution_note: '', isSaving: false, error: null, success: '' });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setState((current) => ({ ...current, isLoading: true, error: null }));
      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.from('app_feedback').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (mounted) {
          const rows = data ?? [];
          setState({ isLoading: false, error: null, rows });
          onCountChange?.(rows.filter((row) => !['resolved', 'closed'].includes(row.status)).length);
        }
      } catch (error) {
        console.error('Developer feedback queue failed to load', error);
        if (mounted) setState({ isLoading: false, error, rows: [] });
      }
    }
    load();
    return () => { mounted = false; };
  }, [getToken, refreshKey, onCountChange]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return state.rows;
    if (statusFilter === 'active') return state.rows.filter((row) => !['resolved', 'closed'].includes(row.status));
    return state.rows.filter((row) => row.status === statusFilter);
  }, [state.rows, statusFilter]);
  const selected = state.rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setReview({ status: selected.status, resolution_note: selected.resolution_note || '', isSaving: false, error: null, success: '' });
  }, [selected]);

  async function saveReview(event) {
    event.preventDefault();
    if (!selected || review.isSaving) return;
    setReview((current) => ({ ...current, isSaving: true, error: null, success: '' }));
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.from('app_feedback').update({
        status: review.status,
        resolution_note: review.resolution_note.trim() || null,
        reviewed_by: permissions.userId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', selected.id);
      if (error) throw error;
      setReview((current) => ({ ...current, isSaving: false, success: 'Feedback review saved and audit logged.' }));
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Feedback review save failed', error);
      setReview((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  return (
    <section className="developer-feedback developer-console-page" aria-label="User feedback queue">
      <Toolbar eyebrow="User Feedback" title="Issues and feature requests" description="Review feedback submitted from anywhere in Northgate HQ. Select a row to triage it and record a resolution." actions={<button type="button" className="secondary-button" onClick={() => setRefreshKey((current) => current + 1)} disabled={state.isLoading}><RefreshCw aria-hidden="true" /> Refresh</button>} />
      <div className="developer-feedback__filters">
        <label><span>Queue</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Active feedback</option><option value="all">All feedback</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
        <p>{filteredRows.length} shown · {state.rows.length} total</p>
      </div>
      <DataTable columns={COLUMNS} rows={filteredRows} getRowKey={(row) => row.id} permissions={permissions} isLoading={state.isLoading} error={state.error} dense minWidth="820px" onRowClick={(row) => setSelectedId(row.id)} selectedRowKey={selectedId} emptyTitle="No feedback in this queue" emptyDescription="New reports and requests submitted by users will appear here." />
      {selected ? (
        <div className="developer-feedback__detail">
          <header><div><p className="eyebrow">Selected Feedback</p><h3>{selected.title}</h3><p>{selected.submitter_name || selected.submitter_email || selected.submitted_by} · {formatDate(selected.created_at)}</p></div><StatusBadge tone={toneForImpact(selected.impact)}>{selected.impact}</StatusBadge></header>
          <div className="developer-feedback__context"><p>{selected.details}</p><dl><div><dt>Page</dt><dd>{selected.page_path || 'Not captured'}</dd></div><div><dt>Type</dt><dd>{selected.feedback_type}</dd></div><div><dt>Viewport</dt><dd>{selected.app_context?.viewport || 'Not captured'}</dd></div></dl></div>
          <form className="developer-feedback__review" onSubmit={saveReview}>
            <label><span>Status</span><select value={review.status} onChange={(event) => setReview((current) => ({ ...current, status: event.target.value, error: null, success: '' }))}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
            <label><span>Developer response / resolution</span><textarea rows={4} maxLength={2000} value={review.resolution_note} onChange={(event) => setReview((current) => ({ ...current, resolution_note: event.target.value, error: null, success: '' }))} placeholder="Record the decision, planned work, workaround, or resolution." /></label>
            <button type="submit" className="primary-button" disabled={review.isSaving}>{review.isSaving ? 'Saving...' : 'Save Review'}</button>
          </form>
          {review.error ? <StatePanel tone="danger" eyebrow="Save Failed" title="Feedback review was not saved" description={review.error.message || 'Please try again.'} compact /> : null}
          {review.success ? <StatePanel tone="success" eyebrow="Saved" title="Feedback updated" description={review.success} compact /> : null}
        </div>
      ) : <StatePanel tone="neutral" title="Select feedback to review" description="Choose a row to see its complete details, page context, and review controls." compact />}
    </section>
  );
}
