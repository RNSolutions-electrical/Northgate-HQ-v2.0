import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Clock3, FilePlus2, RefreshCw, Save } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { CLASSIFICATIONS, durationLabel, emptyTimeEntry, entryPayload, formFromEntry, localDateTime, localTimeCandidates, summarizeEntries } from './hqTimeModel.js';
import './hqTime.css';

// In-memory only: preserve unfinished edits across same-user SPA navigation.
// Nothing is stored in localStorage, sent to the server, or shown to another user.
const UNSAVED_DRAFTS = new Map();

function TimeField({ name, label, form, update, disabled, required }) {
  const candidates = localTimeCandidates(form[name], form.time_zone);
  return <label>{label}<input type="datetime-local" required={required ?? name === 'start'} value={form[name]} disabled={disabled}
    onChange={(event) => update({ [name]: event.target.value, [`${name}_occurrence`]: '' })} />
    {candidates.length > 1 && <select aria-label={`${label} repeated hour`} value={form[`${name}_occurrence`]} required
      disabled={disabled} onChange={(event) => update({ [`${name}_occurrence`]: event.target.value })}>
      <option value="">Choose repeated hour</option>{candidates.map((instant, index) =>
        <option value={String(index)} key={instant}>{index === 0 ? 'First' : 'Second'} occurrence ({instant.slice(11, 16)} UTC)</option>)}
    </select>}
  </label>;
}

function errorMessage(error) {
  if (/version|stale|changed/i.test(error?.message || '')) return 'This session changed in another browser. Your edits are still here. Close and reopen the session to review the latest saved version before trying again.';
  if (/does not exist|schema cache|could not find/i.test(error?.message || '')) return 'The HQ Time Log database update is not available in this environment yet. Nothing was saved.';
  return error?.message || 'The request could not be completed. Your unsaved edits are still here.';
}

export function HqTimeWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const location = useLocation(), navigate = useNavigate();
  const draftKey = permissions?.userId;
  const initialDraft = useRef(draftKey ? UNSAVED_DRAFTS.get(draftKey) : null).current;
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [month, setMonth] = useState(() => localDateTime().slice(0, 7)), [archived, setArchived] = useState(false);
  const [form, setForm] = useState(() => initialDraft?.form || emptyTimeEntry()), [editing, setEditing] = useState(initialDraft?.editing || null), [open, setOpen] = useState(Boolean(initialDraft));
  const [dirty, setDirty] = useState(Boolean(initialDraft)), [pending, setPending] = useState(null), [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const request = useRef(0), saving = useRef(false), insertId = useRef(initialDraft?.insertId || null), drawerVersion = useRef(0);
  const permitted = permissions?.canTrackHqTime === true;
  useEffect(() => {
    if (!draftKey) return;
    if (open && dirty) UNSAVED_DRAFTS.set(draftKey, { form, editing, insertId: insertId.current });
    else UNSAVED_DRAFTS.delete(draftKey);
  }, [draftKey, form, editing, open, dirty]);
  const rpc = useCallback(async (name, args) => {
    const result = await withSupabaseTokenRetry(getToken, (client) => client.rpc(name, args));
    if (result.error) throw result.error;
    return result.data;
  }, [getToken]);
  const load = useCallback(async () => {
    if (!permitted) return;
    const generation = ++request.current;
    setLoading(true);
    try {
      const data = await rpc('list_hq_time_entries', { p_include_archived: true });
      if (generation === request.current) { setRows(data || []); setLoading(false); }
    } catch (failure) {
      if (generation === request.current) { setError(errorMessage(failure)); setLoading(false); }
    }
  }, [rpc, permitted]);
  useEffect(() => {
    load(); const refresh = () => { if (!saving.current) load(); };
    window.addEventListener('focus', refresh);
    return () => { request.current += 1; window.removeEventListener('focus', refresh); };
  }, [load]);
  useEffect(() => {
    const guard = (event) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy]);
  // Session details have a real history entry: Back asks before losing edits and
  // Close removes that entry. Forward can reopen a saved record without stale UI.
  const detailId = new URLSearchParams(location.search).get('hqSession');
  const previousDetail = useRef(detailId);
  useEffect(() => {
    if (detailId === previousDetail.current) return;
    previousDetail.current = detailId;
    if (!detailId) {
      if (dirty || busy) { previousDetail.current = editing?.id || 'new'; navigate({ search: `?hqSession=${editing?.id || 'new'}` }, { replace: true }); if (!busy) setPending({ title: 'Discard unsaved changes?', description: 'Go back without saving these edits.', confirm: closeNow }); return; }
      setOpen(false); setHistory(null); drawerVersion.current += 1;
    }
  }, [detailId, dirty, busy, editing?.id, navigate]);
  const update = (changes) => { setForm((current) => ({ ...current, ...changes })); setDirty(true); setMessage(''); };
  const closeNow = () => {
    setOpen(false); setDirty(false); setError(''); setHistory(null); drawerVersion.current += 1;
    navigate({ search: '' }, { replace: true });
  };
  const close = () => {
    if (saving.current) return;
    if (dirty) setPending({ title: 'Discard unsaved changes?', description: 'Saved sessions and their history will remain unchanged.', confirm: closeNow });
    else closeNow();
  };
  const show = (row = null, updateUrl = true) => {
    const go = () => {
      setEditing(row); setForm(row ? formFromEntry(row) : emptyTimeEntry()); setDirty(false); setOpen(true);
      setError(''); setMessage(''); setHistory(null); setHistoryError(''); drawerVersion.current += 1;
      insertId.current = row?.id || crypto.randomUUID();
      const search = `?hqSession=${row?.id || 'new'}`;
      previousDetail.current = row?.id || 'new'; if (updateUrl) navigate({ search }, { replace: open });
    };
    if (dirty) setPending({ title: 'Discard unsaved changes?', description: 'Open another session without saving these edits.', confirm: go }); else go();
  };
  useEffect(() => {
    if (loading || open || !detailId || !permitted) return;
    const row = rows.find((item) => item.id === detailId);
    if (detailId === 'new') show(null, false); else if (row) show(row, false);
  }, [loading, detailId, permitted]);
  const visible = useMemo(() => rows.filter((row) => (!month || row.entry_date.startsWith(month)) && (archived || !row.archived_at)), [rows, month, archived]);
  const totals = useMemo(() => summarizeEntries(visible), [visible]);
  let preview = '';
  try { const payload = entryPayload(form); preview = payload.ended_at ? durationLabel((Date.parse(payload.ended_at) - Date.parse(payload.started_at)) / 60000) : 'In progress'; } catch { /* Full validation is shown on Save. */ }
  const save = async (event) => {
    event.preventDefault();
    if (saving.current || editing?.archived_at || !permitted) return;
    let payload; try { if (!editing && !form.end) throw new Error('Enter an end time for a past session, or use Clock in to begin now.'); payload = entryPayload(form); } catch (failure) { setError(errorMessage(failure)); return; }
    saving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const data = await rpc('save_hq_time_entry', { p_id: editing?.id || insertId.current, p_expected_version: editing?.version ?? null, p_payload: payload });
      const saved = Array.isArray(data) ? data[0] : data;
      setEditing(saved); setForm(formFromEntry(saved)); setDirty(false); setHistory(null);
      setRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      previousDetail.current = saved.id; navigate({ search: `?hqSession=${saved.id}` }, { replace: true });
      setMessage('Session saved to HQ.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { saving.current = false; setBusy(false); }
  };
  const changeArchive = async (row) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const data = await rpc('set_hq_time_entry_archived', { p_id: row.id, p_expected_version: row.version, p_archived: !row.archived_at });
      const saved = Array.isArray(data) ? data[0] : data;
      setRows((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditing(saved); setHistory(null); setMessage(saved.archived_at ? 'Session archived. You can restore it from the log.' : 'Session restored.');
      setPending(null);
    } catch (failure) { setError(errorMessage(failure)); setPending(null); }
    finally { saving.current = false; setBusy(false); }
  };
  const loadHistory = async () => {
    const generation = drawerVersion.current;
    setHistoryError('');
    try { const data = await rpc('list_hq_time_entry_history', { p_id: editing.id }); if (generation === drawerVersion.current) setHistory(data || []); }
    catch (failure) { if (generation === drawerVersion.current) setHistoryError(errorMessage(failure)); }
  };
  const active = rows.find((row) => !row.ended_at && !row.archived_at);
  const timerAction = async (stopRow = null) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const data = stopRow
        ? await rpc('clock_out_hq_time_entry', { p_id: stopRow.id, p_expected_version: stopRow.version })
        : await rpc('clock_in_hq_time_entry', { p_id: crypto.randomUUID(), p_activity: 'HQ work', p_classification: null, p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const saved = Array.isArray(data) ? data[0] : data;
      setRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage(stopRow ? 'Clock-out saved. Review this session whenever you are ready.' : 'Clock-in saved. Your timer continues across browsers and reloads.');
      if (editing?.id === saved.id) { setEditing(saved); setForm(formFromEntry(saved)); setDirty(false); setHistory(null); }
    } catch (failure) { setError(errorMessage(failure)); }
    finally { saving.current = false; setBusy(false); }
  };
  if (!permitted) return <StatePanel title="HQ Time Log" description="This tool is available only to users with HQ Developer access." />;
  return <div className="hq-time-workspace">
    <WorkspaceHeader eyebrow="Developer Tools · Developer access" title="HQ Time Log" descriptionIsDiagnostic={false}
      description="A Developer-accessible record of HQ work. Session time and focused-time estimates are separate; neither sets pay, time off, or a compensation agreement."
      actions={<><button type="button" className="secondary-button" disabled={loading || busy} onClick={() => { setError(''); load(); }}><RefreshCw /> Refresh</button>
        <button type="button" className="primary-button" onClick={() => show()} disabled={busy}><FilePlus2 /> Log a session</button></>} />
    <section className="hq-time-timer" aria-label="Session timer">
      <div><strong>{active ? 'Clocked in' : 'Ready when you are'}</strong><p>{active
        ? `${durationLabel(Math.max(0, (now - Date.parse(active.started_at)) / 60000))} elapsed · Started ${new Date(active.started_at).toLocaleString()} · Saved to HQ`
        : 'Clock in to save the start time now, then clock out when you finish.'}</p></div>
      <div className="hq-time-actions">{active && <button type="button" className="secondary-button" onClick={() => show(active)}>Open active session</button>}
        <button type="button" className="primary-button" disabled={busy || loading} onClick={() => timerAction(active || null)}><Clock3 />{busy ? 'Saving…' : active ? 'Clock out' : 'Clock in'}</button></div>
    </section>
    {!open && message && <p role="status" className="hq-time-message">{message}</p>}
    {!open && error && <StatePanel tone="danger" title="Could not complete request" description={error} />}
    <div className="hq-time-summary"><SummaryCard label="Elapsed time" value={durationLabel(totals.elapsed)} detail="Active sessions in the selected period" />
      <SummaryCard label="Outside scheduled hours" value={durationLabel(totals.outside)} detail="Included in elapsed time, not added again" />
      <SummaryCard label="Focused-time estimate" value={durationLabel(totals.focused)} detail={`${totals.estimated} sessions with an estimate; blank is not zero`} /></div>
    <div className="hq-time-filters"><label>Period<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      <button type="button" className="secondary-button" onClick={() => setMonth('')}>All dates</button>
      <label className="hq-time-check"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} /> Show archived sessions</label></div>
    <div className="hq-time-table-wrap"><table className="hq-time-table"><thead><tr><th>Date</th><th>Activity</th><th>Hours</th><th>Elapsed</th><th>Focused estimate</th><th>Work items</th><th>Details</th></tr></thead>
      <tbody>{visible.map((row) => <tr key={row.id} className={row.archived_at ? 'is-archived' : ''}>
        <td>{row.entry_date}</td><td><strong>{row.activity}</strong>{row.archived_at && <small>Archived</small>}</td>
        <td>{CLASSIFICATIONS[row.classification] || 'Needs classification'}</td><td>{row.ended_at ? durationLabel(row.elapsed_minutes) : 'Running'}</td><td>{row.focused_minutes === null ? 'Not estimated' : durationLabel(row.focused_minutes)}</td>
        <td>{(row.work_items || []).filter((item) => item.status === 'completed').length} / {(row.work_items || []).length} complete</td>
        <td><button type="button" className="secondary-button" onClick={() => show(row)} aria-label={`Open ${row.activity}`}>Open</button></td></tr>)}</tbody></table></div>
    {!visible.length && <StatePanel compact title={loading ? 'Loading your HQ log…' : 'No sessions in this period'} description={loading ? 'Reading saved sessions from HQ.' : 'Log a session or choose another period.'} />}
    <Drawer open={open} onClose={close} title={editing ? editing.activity : 'Log an HQ session'} eyebrow="Session details · Developer access" width="min(860px, 100vw)"
      description="Hours belong to this session once. Work-item statuses do not add or remove time.">
      <form className="hq-time-form" onSubmit={save}>
        {error && <div role="alert"><StatePanel tone="danger" title="Session not saved" description={error} compact /></div>}
        {message && <p role="status" className="hq-time-message">{message}</p>}
        {editing?.archived_at && <StatePanel compact title="Archived session" description="Restore this session before editing. Archived sessions are excluded from totals." />}
        {editing && <p className="hq-time-hint">Work performer: {editing.performed_by}. Created by: {editing.created_by}. Last updated by: {editing.updated_by}.</p>}
        <fieldset disabled={busy || Boolean(editing?.archived_at)}>
          <div className="hq-time-grid"><label>Log date<input type="date" required value={form.entry_date} onChange={(event) => update({ entry_date: event.target.value })} /></label>
            <label>Hours classification<select value={form.classification} onChange={(event) => update({ classification: event.target.value })}><option value="">Needs classification</option>{Object.entries(CLASSIFICATIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <label>Activity<input required maxLength={200} value={form.activity} placeholder="What were you working on?" onChange={(event) => update({ activity: event.target.value })} /></label>
          <div className="hq-time-grid"><TimeField name="start" label="Start" form={form} update={update} disabled={Boolean(editing && !editing.ended_at)} /><TimeField name="end" label="End" form={form} update={update} disabled={Boolean(editing && !editing.ended_at)} required={!editing || Boolean(editing.ended_at)} /></div>
          <p className="hq-time-hint"><Clock3 size={16} /> Times use {form.time_zone}. Clock out before correcting a running timer. Change the end date for overnight work.{preview && ` Elapsed: ${preview}.`}</p>
          <label>Focused-time estimate (minutes, optional)<input type="number" min="0" step="0.01" value={form.focused_minutes} onChange={(event) => update({ focused_minutes: event.target.value })} placeholder="Leave blank if not estimated" /></label>
          <label>What I was doing<textarea rows={3} maxLength={5000} value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></label>
          <label>Accomplishments and context<textarea rows={3} maxLength={5000} value={form.accomplishments} onChange={(event) => update({ accomplishments: event.target.value })} /></label>
          <label>Next steps and blockers<textarea rows={3} maxLength={5000} value={form.next_steps} onChange={(event) => update({ next_steps: event.target.value })} /></label>
          <section className="hq-time-items"><h4>Work items</h4><p>Track each item independently. Mark unused items discarded to preserve their history.</p>
            {form.work_items.map((item, index) => {
              const editItem = (changes) => update({ work_items: form.work_items.map((existing) => existing.id === item.id ? { ...existing, ...changes } : existing) });
              return <div className="hq-time-item" key={item.id}><div className="hq-time-grid"><label>Item {index + 1}<input required maxLength={200} value={item.title} onChange={(event) => editItem({ title: event.target.value })} /></label>
                <label>Status<select value={item.status} onChange={(event) => editItem({ status: event.target.value })}><option value="underway">Underway</option><option value="completed">Completed</option><option value="discarded">Discarded</option></select></label></div>
                <label>Item notes<textarea rows={2} maxLength={2000} value={item.notes} onChange={(event) => editItem({ notes: event.target.value })} /></label></div>;
            })}<button type="button" className="secondary-button" disabled={form.work_items.length >= 50} onClick={() => update({ work_items: [...form.work_items, { id: crypto.randomUUID(), title: '', status: 'underway', notes: '' }] })}>Add work item</button>
          </section>
        </fieldset>
        <div className="hq-time-actions"><button type="button" className="secondary-button" onClick={close} disabled={busy}>Close</button>
          {editing && !editing.ended_at && <button type="button" className="primary-button" disabled={busy || dirty} onClick={() => timerAction(editing)}>Clock out</button>}
          {editing && editing.ended_at && <button type="button" className="secondary-button" disabled={busy || dirty} onClick={() => setPending({ title: editing.archived_at ? 'Restore this session?' : 'Archive this session?', description: 'The session and its history are preserved. Archived time is excluded from totals.', confirm: () => changeArchive(editing) })}><Archive /> {editing.archived_at ? 'Restore' : 'Archive'}</button>}
          {!editing?.archived_at && <button type="submit" className="primary-button" disabled={busy || (editing && !dirty)}><Save /> {busy ? 'Saving…' : 'Save session'}</button>}</div>
      </form>
      {editing && <section className="hq-time-history"><button type="button" className="secondary-button" onClick={loadHistory} disabled={busy}>View saved history</button>
        {historyError && <p role="alert">{historyError}</p>}{history && <>{!history.length && <p>No saved changes found.</p>}{history.map((entry, index) => {
          const snapshot = entry.after_data || entry.after_snapshot || entry.new_data || {};
          return <details key={entry.id || index}><summary>{entry.action} · {new Date(entry.created_at || entry.recorded_at).toLocaleString()} · version {snapshot.version || '—'} · editor {entry.actor_id}</summary>
            <p><strong>{snapshot.activity}</strong></p><p>{snapshot.notes}</p><p>{snapshot.accomplishments}</p><p>{snapshot.next_steps}</p>
            <ul>{(snapshot.work_items || []).map((item) => <li key={item.id}><strong>{item.title}</strong> · {item.status}{item.notes && <p>{item.notes}</p>}</li>)}</ul>
          </details>;
        })}</>}
      </section>}
    </Drawer>
    <ConfirmDialog open={Boolean(pending)} title={pending?.title} description={pending?.description} isSubmitting={busy}
      onCancel={() => setPending(null)} onConfirm={() => { const action = pending?.confirm; setPending(null); action?.(); }} />
  </div>;
}
