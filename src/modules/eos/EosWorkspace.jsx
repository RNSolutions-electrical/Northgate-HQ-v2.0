import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { EOS_MODULES, EOS_VIEWS, differentReminderIndex, companyToday, inView, isHighProbabilityOpportunity, isOverdueStart,
  meetingDatePatch, sortPursuits, summarizePursuits } from './eosLogic.js';
import './eos.css';

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const emptyPursuit = () => ({ project_name: '', client_id: null, discussion: '', phase: 'Pursuit',
  planning_value: null, probability: null, potential_start_date: null, go_no_go: null,
  initial_meeting: null, follow_up_7_day: null, meeting_2_week: null, status: 'Active', manager_ids: [] });
const cleanText = (value) => value?.trim() || null;
const FIELDS = [
  ['project_name', 'Project Pursuit', 'text'], ['client_id', 'Client', 'client'],
  ['manager_ids', 'Managers', 'managers'], ['discussion', 'Discuss', 'textarea'],
  ['phase', 'Phase', 'phase'], ['planning_value', 'Value', 'number'],
  ['probability', 'Probability %', 'probability'], ['potential_start_date', 'Potential Start Date', 'date'],
  ['go_no_go', 'Go/No Go', 'decision'], ['initial_meeting', 'Initial Meeting', 'date'],
  ['follow_up_7_day', '7 day follow-up', 'date'], ['meeting_2_week', '2 week meeting', 'date'],
  ['status', 'Status', 'status'],
];
const COLUMNS = [
  ['project_name', 'Project Pursuit'], ['client', 'Client'], ['manager', 'Manager'],
  ['discussion', 'Discuss'], ['phase', 'Phase'], ['planning_value', 'Value'],
  ['probability', 'Probability'], ['potential_start_date', 'Start'],
  ['go_no_go', 'Go/No Go'], ['initial_meeting', 'Initial'],
  ['follow_up_7_day', '7-day'], ['meeting_2_week', '2-week'], ['status', 'Status'],
];

function Control({ field, type, value, onChange, clients, directory }) {
  if (type === 'client') return <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
    <option value="">No client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.display_name}</option>)}
  </select>;
  if (type === 'managers') return <div className="eos-manager-options">{directory.map((person) =>
    <label key={person.user_id}><input type="checkbox" checked={(value || []).includes(person.user_id)}
      disabled={!person.is_active && !(value || []).includes(person.user_id)}
      onChange={(e) => onChange(e.target.checked ? [...(value || []), person.user_id]
        : (value || []).filter((id) => id !== person.user_id))} />{person.display_name}{!person.is_active ? ' (inactive)' : ''}</label>)}</div>;
  const options = {
    phase: [['', 'Unset'], ['Pursuit', 'Pursuit'], ['Estimate', 'Estimate'], ['Awarded', 'Awarded']],
    decision: [['', 'Unset'], ['Go', 'Go'], ['No Go', 'No Go']],
    status: [['Active', 'Active'], ['Dormant', 'Dormant']],
  }[type];
  if (options) return <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
    {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select>;
  if (type === 'textarea') return <textarea rows="4" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  return <input aria-label={field} type={type} step={type === 'number' || type === 'probability' ? 'any' : undefined}
    min={type === 'probability' ? '0' : undefined} max={type === 'probability' ? '100' : undefined}
    value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

function normalizePatch(field, value) {
  if (field === 'manager_ids') return { manager_ids: value };
  if (field === 'initial_meeting') return meetingDatePatch(value);
  if (['planning_value', 'probability'].includes(field)) return { [field]: value === '' ? null : Number(value) };
  if (['client_id', 'phase', 'go_no_go', 'potential_start_date', 'follow_up_7_day', 'meeting_2_week'].includes(field))
    return { [field]: value || null };
  return { [field]: value };
}

export function EosWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [moduleKey, setModuleKey] = useState('pursuits');
  const [view, setView] = useState('Active');
  const [metricFilter, setMetricFilter] = useState('');
  const [source, setSource] = useState('All');
  const [search, setSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState('All');
  const [sort, setSort] = useState({ field: 'project_name', direction: 'asc' });
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [reminderIndex, setReminderIndex] = useState(0);
  const [editor, setEditor] = useState(null);
  const [clientEditor, setClientEditor] = useState(null);
  const [reminderEditor, setReminderEditor] = useState(null);
  const [award, setAward] = useState(null);
  const [jobLink, setJobLink] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobLookup, setJobLookup] = useState('');
  const [inline, setInline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const call = useCallback(async (fn) => withSupabaseTokenRetry(getToken, fn), [getToken]);
  const load = useCallback(async () => {
    if (permissions.canManageEos !== true) return;
    try {
      const result = await call(async (client) => {
        const requests = await Promise.all([
          client.from('eos_pursuits').select('*,eos_clients(id,display_name,company),eos_pursuit_managers(user_id)').is('deleted_at', null).order('project_name'),
          client.from('eos_clients').select('*').order('display_name'),
          client.rpc('eos_manager_directory'),
          client.from('eos_leadership_reminders').select('*').order('created_at'),
        ]);
        const failed = requests.find((response) => response.error);
        if (failed) throw failed.error;
        return requests.map((response) => response.data || []);
      });
      setRows(result[0]); setClients(result[1]); setDirectory(result[2]); setReminders(result[3]); setError('');
    } catch (cause) { setError(cause.message || 'EOS data could not be loaded.'); }
  }, [call, permissions.canManageEos]);
  useEffect(() => { load(); }, [load]);

  const enabledReminders = useMemo(() => reminders.filter((reminder) => reminder.enabled), [reminders]);
  useEffect(() => {
    if (!enabledReminders.length) return;
    const index = differentReminderIndex(enabledReminders, sessionStorage.getItem('northgate:eos:last-reminder'));
    setReminderIndex(index);
    sessionStorage.setItem('northgate:eos:last-reminder', enabledReminders[index].id);
  }, [enabledReminders]);
  useEffect(() => {
    if (enabledReminders.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) setReminderIndex((index) => {
        const next = (index + 1) % enabledReminders.length;
        sessionStorage.setItem('northgate:eos:last-reminder', enabledReminders[next].id);
        return next;
      });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [enabledReminders.length]);

  const nameFor = (row) => (row.eos_pursuit_managers || []).length
    ? row.eos_pursuit_managers.map(({ user_id }) =>
      directory.find((person) => person.user_id === user_id)?.display_name || user_id).join(', ')
    : row.source_manager_labels?.length ? `Unresolved: ${row.source_manager_labels.join(', ')}` : '';
  const sourceRows = useMemo(() => rows.filter((row) => source === 'All' || row.source_sheet === source), [rows, source]);
  const unresolvedManagerLabels = useMemo(() => [...new Set(rows.flatMap((row) => row.source_manager_labels || []))].sort(), [rows]);
  const summary = useMemo(() => summarizePursuits(sourceRows), [sourceRows]);
  const visible = useMemo(() => sortPursuits(sourceRows.filter((row) => inView(row, view))
    .filter((row) => !metricFilter || ({ estimates: row.phase === 'Estimate',
      pursuits: row.phase === 'Pursuit', likely: isHighProbabilityOpportunity(row),
      awards: row.phase === 'Awarded' })[metricFilter])
    .filter((row) => managerFilter === 'All'
      || (managerFilter.startsWith('source:')
        ? row.source_manager_labels?.includes(managerFilter.slice(7))
        : row.eos_pursuit_managers?.some((item) => item.user_id === managerFilter)))
    .filter((row) => !search || `${row.project_name} ${row.eos_clients?.display_name || ''} ${row.discussion || ''} ${row.original_job_number || ''}`.toLowerCase().includes(search.toLowerCase())),
  sort.field, sort.direction, nameFor), [sourceRows, view, metricFilter, managerFilter, search, sort, directory]);

  async function run(operation, success = 'Saved.') {
    setBusy(true); setError(''); setNotice('');
    try { const result = await call(operation); await load(); setNotice(success); return result; }
    catch (cause) { setError(cause.message || 'Action failed.'); return null; }
    finally { setBusy(false); }
  }

  async function savePursuit(form, { allowUnlinkedAward = false } = {}) {
    const name = cleanText(form.project_name);
    if (!name) { setError('Project Pursuit name is required.'); return false; }
    if (form.probability != null && (Number(form.probability) < 0 || Number(form.probability) > 100)) {
      setError('Probability must be between 0 and 100.'); return false;
    }
    // Awarded is a controlled handoff, never a direct status edit.
    const priorPhase = rows.find((row) => row.id === form.id)?.phase || 'Pursuit';
    if (form.phase === 'Awarded' && priorPhase !== 'Awarded' && !allowUnlinkedAward) {
      if (!form.id) setError('Save the pursuit first, then use Award / Link to create or link its Job.');
      else {
        const saved = await savePursuit({ ...form, phase: priorPhase }, { allowUnlinkedAward: true });
        if (saved) startAward(form);
      }
      return false;
    }
    const managerIds = form.manager_ids || [];
    const payload = Object.fromEntries(['project_name','client_id','discussion','phase','planning_value','probability',
      'potential_start_date','go_no_go','initial_meeting','follow_up_7_day','meeting_2_week','status']
      .map((field) => [field, form[field] === '' ? null : form[field]]));
    payload.project_name = name;
    const result = await run(async (client) => {
      const response = await client.rpc('eos_save_pursuit', {
        p_id: form.id || null, p_data: payload, p_manager_ids: managerIds,
      });
      if (response.error) throw response.error;
      return response.data;
    }, 'Pursuit saved.');
    if (result) { setEditor(null); setInline(null); return true; }
    return false;
  }

  async function saveClient(form) {
    if (!cleanText(form.display_name)) { setError('Client name is required.'); return; }
    const payload = Object.fromEntries(['first_name','last_name','display_name','company','phone','email','address','notes']
      .map((field) => [field, cleanText(form[field]) ]));
    const saved = await run(async (client) => {
      const response = form.id ? await client.from('eos_clients').update(payload).eq('id', form.id).select('id').single()
        : await client.from('eos_clients').insert(payload).select('id').single();
      if (response.error) throw response.error;
      return response.data;
    }, 'Shared client saved.');
    if (saved) { setClientEditor(null); if (editor) setEditor({ ...editor, client_id: saved.id }); }
  }

  async function saveReminder(form) {
    const payload = Object.fromEntries(['text','reminder_type','source_label','book','source_url','edition','page','enabled']
      .map((field) => [field, form[field] === '' ? null : form[field]]));
    const saved = await run(async (client) => {
      const response = form.id ? await client.from('eos_leadership_reminders').update(payload).eq('id', form.id).select('id').single()
        : await client.from('eos_leadership_reminders').insert(payload).select('id').single();
      if (response.error) throw response.error;
      return response.data;
    }, 'Reminder saved.');
    if (saved) setReminderEditor(null);
  }

  async function deletePursuit(row) {
    // Recoverable direct removal: no modal/reason; clients and Jobs remain.
    const result = await run(async (client) => {
      const response = await client.rpc('eos_set_pursuit_removed', { p_id: row.id, p_removed: true });
      if (response.error) throw response.error;
      return true;
    }, `${row.project_name} removed. Undo is available below.`);
    if (result) setNotice(<>{row.project_name} removed. <button type="button" className="link-button" onClick={() =>
      run(async (client) => {
        const response = await client.rpc('eos_set_pursuit_removed', { p_id: row.id, p_removed: false });
        if (response.error) throw response.error;
        return true;
      }, 'Pursuit restored.')}>Undo</button></>);
  }

  async function startAward(row) {
    setAward({ ...row, existing_job_id: row.job_id || '', division: permissions.department || 'Construction', job_number: '' });
    setJobLookup('');
    await searchJobs('', row.job_id);
  }
  async function startJobLink(row) {
    setJobLink({ row, selected_job_id: row.job_id || '' });
    setJobLookup('');
    await searchJobs('', row.job_id);
  }
  async function searchJobs(term, currentJobId = jobLink?.row.job_id || award?.job_id) {
    try {
      const matches = await call(async (client) => {
        const base = () => client.from('jobs').select('id,job_number,name,division').is('archived_at', null);
        const query = term.trim();
        const requests = query ? [base().ilike('name', `%${query}%`).limit(50),
          base().ilike('job_number', `%${query}%`).limit(50)] : [base().order('name').limit(100)];
        if (currentJobId) requests.push(base().eq('id', currentJobId).limit(1));
        const results = await Promise.all(requests);
        const failed = results.find((item) => item.error);
        if (failed) throw failed.error;
        return [...new Map(results.flatMap((item) => item.data || []).map((job) => [job.id, job])).values()];
      });
      setJobs(matches); setError('');
    } catch (cause) { setError(cause.message || 'Jobs could not be searched.'); }
  }
  async function finishAward() {
    const id = await run(async (client) => {
      const response = await client.rpc('eos_award_pursuit', {
        p_pursuit_id: award.id, p_existing_job_id: award.existing_job_id || null,
        p_division: award.existing_job_id ? null : award.division,
        p_job_number: award.existing_job_id ? null : award.job_number,
      });
      if (response.error) throw response.error;
      return response.data;
    }, 'Award linked to Job. Planning value was not posted as a budget.');
    if (id) { setAward(null); setEditor(null); setInline(null); setMetricFilter(''); setView('Awards'); }
  }
  async function saveJobLink(jobId) {
    if (!jobLink) return;
    const result = await run(async (client) => {
      const response = await client.rpc('eos_set_pursuit_job', {
        p_pursuit_id: jobLink.row.id,
        p_job_id: jobId || null,
        p_expected_job_id: jobLink.row.job_id || null,
      });
      if (response.error) throw response.error;
      return true;
    }, jobId ? 'Job linked. Pursuit status and Job financials were unchanged.'
      : 'Job unlinked. Pursuit status and Job financials were unchanged.');
    if (result) setJobLink(null);
  }

  function openEditor(row) { setEditor({ ...row, manager_ids: row.eos_pursuit_managers?.map((item) => item.user_id) || [] }); }
  function fieldValue(row, field) {
    if (field === 'client') return row.eos_clients?.display_name || '—';
    if (field === 'manager') return nameFor(row) || '—';
    if (field === 'planning_value') return row.planning_value == null ? '—' : money(row.planning_value);
    if (field === 'probability') return row.probability == null ? '—' : `${row.probability}%`;
    return row[field] || '—';
  }
  function showInline(row, field) {
    if (row.phase === 'Awarded' && (field === 'phase' || field === 'status')) {
      setError('An awarded pursuit remains in Awards. A reversal workflow is not defined.');
      return;
    }
    const key = field === 'client' ? 'client_id' : field === 'manager' ? 'manager_ids' : field;
    const value = key === 'manager_ids' ? row.eos_pursuit_managers?.map((item) => item.user_id) || [] : row[key];
    setInline({ row, key, value });
  }
  function commitInline() {
    if (!inline || busy) return;
    savePursuit({ ...inline.row,
      manager_ids: inline.row.eos_pursuit_managers?.map((item) => item.user_id) || [],
      ...normalizePatch(inline.key, inline.value) });
  }

  if (permissions.canManageEos !== true) return <StatePanel title="E.O.S access required" tone="warning"
    description="Access is assigned to selected Manager and Director accounts." />;
  return <div className="eos-workspace">
    <nav className="eos-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => navigate('/dashboard')}>Dashboard</button>
      <span aria-hidden="true">›</span><button type="button" onClick={() => setModuleKey('pursuits')}>E.O.S</button>
      <span aria-hidden="true">›</span><span>{moduleKey === 'reminders' ? 'Leadership reminders' : 'Project Pursuit Tracker'}</span></nav>
    <WorkspaceHeader eyebrow="MANAGEMENT" title="Entrepreneurial Operating System"
      actions={<button className="primary-button" type="button" onClick={() => openEditor(emptyPursuit())}>New Pursuit</button>} />
    {error && <div role="alert" className="eos-message eos-message--error">{error}</div>}
    {notice && <div role="status" className="eos-message">{notice}</div>}
    {enabledReminders.length > 0 && <section className="eos-reminder" aria-label="Leadership reminder">
      <div><span className="eyebrow">LEADERSHIP REMINDER</span>
        <p>{enabledReminders[reminderIndex % enabledReminders.length]?.text}</p>
        <small>{enabledReminders[reminderIndex % enabledReminders.length]?.reminder_type === 'quotation' ? 'Quotation' : 'Original reminder'} · {enabledReminders[reminderIndex % enabledReminders.length]?.source_label}
          {enabledReminders[reminderIndex % enabledReminders.length]?.source_url && <> · <a href={enabledReminders[reminderIndex % enabledReminders.length].source_url} target="_blank" rel="noreferrer">Source</a></>}</small></div>
      <div className="eos-actions"><button type="button" className="secondary-button" onClick={() => setReminderIndex((index) => {
        const next = (index + 1) % enabledReminders.length;
        sessionStorage.setItem('northgate:eos:last-reminder', enabledReminders[next].id);
        return next;
      })}>Next reminder</button>
        <button type="button" className="secondary-button" onClick={() => setModuleKey('reminders')}>Manage</button></div>
    </section>}
    <nav className="eos-module-nav" aria-label="EOS tools">
      {EOS_MODULES.map((item) => <button key={item.key} type="button" disabled={!item.available}
        className={moduleKey === item.key ? 'is-active' : ''} onClick={() => setModuleKey(item.key)}>
        {item.label}{!item.available && <small>Coming soon</small>}</button>)}
    </nav>
    {moduleKey === 'reminders' ? <section className="card eos-panel"><div className="eos-panel-heading"><h3>Leadership reminders</h3>
      <button className="secondary-button" type="button" onClick={() => setModuleKey('pursuits')}>Back to tracker</button>
      <button className="primary-button" type="button" onClick={() => setReminderEditor({ text: '', reminder_type: 'original', source_label: 'Northgate leadership reminder', enabled: true })}>Add reminder</button></div>
      {reminders.map((item) => <div className="eos-reminder-row" key={item.id}><span>{item.text} <small>· {item.enabled ? 'Enabled' : 'Disabled'}</small></span>
        <button className="secondary-button" type="button" onClick={() => setReminderEditor(item)}>Edit</button></div>)}
    </section> : <>
      <div className="eos-summary">
        {[['estimates','Total Estimates','Estimate'],['pursuits','Total Pursuits','Pursuit'],
          ['likely','Pursuits / Estimates >50%','Pursuit'],['awards','Total Awards','Awarded']].map(([key,label,phase]) =>
          <button type="button" key={key} className="summary-card eos-summary-card"
            aria-pressed={metricFilter === key}
            onClick={() => { setView(phase === 'Awarded' ? 'Awards' : 'Active'); setMetricFilter(key); setSearch(''); }}>
            <span className="summary-card__label">{label}</span><strong className="summary-card__value">{summary[key].count} · {money(summary[key].value)}</strong>
            <span className="summary-card__detail">{summary[key].missing} missing value{summary[key].missing === 1 ? '' : 's'}</span>
          </button>)}
      </div>
      <div className="eos-indicators">Weighted pipeline {money(summary.weighted)} · Overdue starts {summary.overdue} · Missing probability {summary.missingProbability} · Missing phase {summary.missingPhase}</div>
      <section className="card eos-panel"><div className="eos-panel-heading"><h3>Project Pursuit Tracker</h3><span>{visible.length} shown</span></div>
        <div className="eos-filters"><label>View<select value={view} onChange={(e) => { setView(e.target.value); setMetricFilter(''); }}>{EOS_VIEWS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Source<select value={source} onChange={(e) => setSource(e.target.value)}><option>All</option>{[...new Set(rows.map((row) => row.source_sheet).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Manager<select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}><option value="All">All</option>{directory.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}
            {unresolvedManagerLabels.map((label) => <option key={`source:${label}`} value={`source:${label}`}>Unresolved: {label}</option>)}</select></label>
          <label>Sort by<select value={sort.field} onChange={(e) => setSort({ ...sort, field: e.target.value })}>
            {COLUMNS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button type="button" className="secondary-button" aria-label={`Sort ${sort.direction === 'asc' ? 'descending' : 'ascending'}`}
            onClick={() => setSort({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}>
            {sort.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button>
          <label className="eos-search">Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project, client, notes, job" /></label></div>
        {metricFilter && <button type="button" className="eos-mini" onClick={() => setMetricFilter('')}>Clear {metricFilter} card filter</button>}
        <div className="eos-table-wrap"><table className="eos-table"><thead><tr>{COLUMNS.map(([key,label]) => <th key={key} scope="col"><button type="button"
          aria-label={`Sort by ${label}`} onClick={() => setSort((current) => ({ field: key,
            direction: current.field === key && current.direction === 'asc' ? 'desc' : 'asc' }))}>
          {label}{sort.field === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>)}<th>Actions</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id} className={`eos-row eos-row--${row.go_no_go === 'Go' ? 'go' : row.go_no_go === 'No Go' ? 'no-go' : 'default'} ${isOverdueStart(row) ? 'eos-row--overdue' : ''}`}>
            {COLUMNS.map(([field,label]) => <td key={field} data-label={label}>
              {inline?.row.id === row.id && inline.key === (field === 'client' ? 'client_id' : field === 'manager' ? 'manager_ids' : field) ?
                <div className="eos-inline" onKeyDown={(e) => {
                  if (e.key === 'Escape') setInline(null);
                  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
                    e.preventDefault(); commitInline();
                  }
                }}>
                  <Control field={field} type={FIELDS.find(([key]) => key === inline.key)?.[2]}
                    value={inline.value} onChange={(value) => setInline({ ...inline, value })} clients={clients} directory={directory} />
                  <button type="button" disabled={busy} onClick={commitInline}>Save</button>
                  <button type="button" onClick={() => setInline(null)}>Cancel</button>
                </div> : field === 'project_name' ? <button type="button" className="eos-link" onClick={() => openEditor(row)} title={row.project_name}>{row.project_name}</button>
                : field === 'client' ? <><button type="button" className="eos-link" onClick={() => row.eos_clients && setClientEditor(clients.find((item) => item.id === row.client_id))} title={fieldValue(row,field)}>{fieldValue(row,field)}</button>
                  <button type="button" className="eos-mini" aria-label={`Change client for ${row.project_name}`} onClick={() => showInline(row,field)}>Change</button></>
                : <button type="button" className="eos-cell-button" title={fieldValue(row,field)} onClick={() => showInline(row,field)}>{fieldValue(row,field)}
                  {field === 'potential_start_date' && isOverdueStart(row) && <span className="eos-overdue">Overdue</span>}</button>}
            </td>)}<td data-label="Actions"><div className="eos-row-actions">
              {row.job_id && <button type="button" onClick={() => navigate('/jobs', { state: { openJobId: row.job_id } })}>Job</button>}
              <button type="button" onClick={() => startJobLink(row)}>{row.job_id ? 'Change Job link' : 'Link Job'}</button>
              {row.phase !== 'Awarded' && <button type="button" onClick={() => startAward(row)}>Award</button>}
              <button type="button" disabled={busy} onClick={() => deletePursuit(row)}>Delete</button>
            </div></td></tr>)}</tbody></table>
          {!visible.length && <p className="eos-empty">No pursuits in this view.</p>}</div>
      </section>
    </>}
    {editor && <Drawer open onClose={() => setEditor(null)} title={editor.id ? 'Edit Pursuit' : 'New Pursuit'} labelledById="eos-pursuit-title" width="min(56rem, 100vw)">
      <div className="eos-form">{FIELDS.map(([field,label,type]) => <label key={field}>{label}
        {editor.phase === 'Awarded' && (field === 'phase' || field === 'status')
          ? <span>{editor[field]} · Award reversal is not available</span>
          : <Control field={label} type={type} value={editor[field]} clients={clients} directory={directory}
            onChange={(value) => setEditor({ ...editor, ...normalizePatch(field,value) })} />}
        {field === 'client_id' && <button type="button" className="eos-mini" onClick={() => setClientEditor({ display_name: '' })}>Add client</button>}
      </label>)}</div>
      <div className="eos-actions"><button type="button" className="secondary-button" onClick={() => setEditor(null)}>Cancel</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => savePursuit(editor)}>Save Pursuit</button></div>
    </Drawer>}
    {clientEditor && <Drawer open onClose={() => setClientEditor(null)} title="Client contact card" labelledById="eos-client-title" width="min(50rem, 100vw)">
      <div className="eos-form">{[['display_name','Display name'],['first_name','First name'],['last_name','Last name'],['company','Company'],['phone','Phone'],['email','Email'],['address','Address'],['notes','Notes']].map(([key,label]) =>
        <label key={key}>{label}{key === 'notes' ? <textarea value={clientEditor[key] || ''} onChange={(e) => setClientEditor({ ...clientEditor, [key]: e.target.value })} />
          : <input value={clientEditor[key] || ''} onChange={(e) => setClientEditor({ ...clientEditor, [key]: e.target.value })} />}</label>)}</div>
      <div className="eos-actions"><button type="button" className="secondary-button" onClick={() => setClientEditor(null)}>Cancel</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => saveClient(clientEditor)}>Save Client</button></div>
    </Drawer>}
    {reminderEditor && <Drawer open onClose={() => setReminderEditor(null)} title="Leadership reminder" labelledById="eos-reminder-title" width="min(50rem, 100vw)">
      <div className="eos-form">{[['text','Text'],['source_label','Author / source label'],['book','Verified book'],['source_url','Source URL'],['edition','Edition'],['page','Page']].map(([key,label]) =>
        <label key={key}>{label}<input value={reminderEditor[key] || ''} onChange={(e) => setReminderEditor({ ...reminderEditor, [key]: e.target.value })} /></label>)}
        <label>Type<select value={reminderEditor.reminder_type} onChange={(e) => setReminderEditor({ ...reminderEditor, reminder_type: e.target.value })}><option value="original">Original reminder</option><option value="quotation">Quotation</option></select></label>
        <label><input type="checkbox" checked={reminderEditor.enabled} onChange={(e) => setReminderEditor({ ...reminderEditor, enabled: e.target.checked })} />Enabled</label></div>
      <div className="eos-actions"><button type="button" onClick={() => setReminderEditor(null)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={() => saveReminder(reminderEditor)}>Save</button></div>
    </Drawer>}
    {award && <Drawer open onClose={() => setAward(null)} title="Award / Job handoff" labelledById="eos-award-title" width="min(48rem, 100vw)">
      <p>{award.job_id ? 'Mark this pursuit Awarded using its current Job link.'
        : 'Link an existing Job or create one to award this pursuit.'} The planning value remains in EOS and is not posted to the Job budget.</p>
      {!award.job_id && <div className="eos-form"><label>Search existing Jobs<input value={jobLookup} onChange={(e) => setJobLookup(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchJobs(jobLookup); } }} /></label>
        <button type="button" className="secondary-button" onClick={() => searchJobs(jobLookup)}>Find Jobs</button>
        <label>Existing Job<select value={award.existing_job_id || ''} onChange={(e) => setAward({ ...award, existing_job_id: e.target.value })}>
        <option value="">Create new Job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job_number || 'No number'} · {job.name}</option>)}</select></label>
        {!award.existing_job_id && <><label>Department<select value={award.division || 'Construction'} onChange={(e) => setAward({ ...award, division: e.target.value })}><option>Construction</option><option>Electrical</option><option>Admin</option></select></label>
          <label>Job number<input value={award.job_number || ''} onChange={(e) => setAward({ ...award, job_number: e.target.value })} /></label></>}</div>}
      {award.job_id && <p>This pursuit is already linked to a Job. Awarding it will retain that link. To change the Job, cancel and use Change Job link first.</p>}
      <div className="eos-actions"><button type="button" onClick={() => setAward(null)}>Cancel</button><button type="button" className="primary-button" disabled={busy || (!award.existing_job_id && !award.job_number)} onClick={finishAward}>Confirm award handoff</button></div>
    </Drawer>}
    {jobLink && <Drawer open onClose={() => setJobLink(null)} title="Job link" labelledById="eos-job-link-title" width="min(42rem, 100vw)">
      <p>Link this pursuit to an existing Job, or remove its current link. This does not award or un-award the pursuit, delete a Job, or change Job financials.</p>
      <div className="eos-form"><label>Search Jobs<input value={jobLookup} onChange={(e) => setJobLookup(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchJobs(jobLookup); } }} /></label>
        <button type="button" className="secondary-button" onClick={() => searchJobs(jobLookup)}>Find Jobs</button>
        <label>Existing Job<select value={jobLink.selected_job_id} onChange={(e) => setJobLink({ ...jobLink, selected_job_id: e.target.value })}>
          <option value="">Select a Job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job_number || 'No number'} · {job.name}</option>)}
        </select></label></div>
      <div className="eos-actions"><button type="button" onClick={() => setJobLink(null)}>Cancel</button>
        {jobLink.row.job_id && <button type="button" className="secondary-button" disabled={busy} onClick={() => saveJobLink(null)}>Unlink Job</button>}
        <button type="button" className="primary-button" disabled={busy || !jobLink.selected_job_id || jobLink.selected_job_id === jobLink.row.job_id}
          onClick={() => saveJobLink(jobLink.selected_job_id)}>Save Job link</button></div>
    </Drawer>}
  </div>;
}
