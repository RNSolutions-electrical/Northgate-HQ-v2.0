import { useAuth } from '@clerk/clerk-react';
import { CalendarCheck2, Check, FilePlus2, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2, Undo2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { PAY_APP_TEMPLATE_OPTIONS, getPayAppTemplate } from './billingPayAppTemplates.js';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => MONEY.format(Number(value) || 0);
const date = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString() : '—';
const title = (value) => String(value || '').replace(/(^|_)(\w)/g, (_, space, letter) => `${space ? ' ' : ''}${letter.toUpperCase()}`);
const tone = (value) => value === 'billed' ? 'good' : value === 'approved' ? 'warn' : value === 'voided' ? 'danger' : 'neutral';
const currentTotal = (app) => [...(app.lines || []), ...(app.change_orders || [])].reduce((sum, row) => sum + Number(row.final_current_amount || 0), 0);
const hasPayValue = (row, kind) => Number(kind === 'co' ? row.approved_value : row.scheduled_value_amount) !== 0 || Number(row.additional_percent) !== 0 || Number(row.final_current_amount) !== 0 || Number(row.billed_to_date_amount) !== 0;

function PayLine({ row, kind, editable, correction, onSaved, onFullyBilledAttempt }) {
  const { getToken } = useAuth();
  const scheduled = Number(kind === 'co' ? row.approved_value : row.scheduled_value_amount) || 0;
  const previousBilled = Number(row.previous_billed_amount || 0);
  const previousPercent = scheduled === 0 ? 0 : previousBilled * 100 / scheduled;
  const savedPercent = Number(row.additional_percent || 0);
  const initialPercent = savedPercent === 0 && Math.abs(previousBilled) > 0.005 && Math.abs(Number(row.final_current_amount || 0)) < 0.005
    ? previousPercent
    : savedPercent;
  const [percent, setPercent] = useState(String(initialPercent));
  const [override, setOverride] = useState(row.override_reason ? String(row.final_current_amount ?? '') : '');
  const [reason, setReason] = useState(row.override_reason || '');
  const [state, setState] = useState({ working: false, error: '' });
  const targetBilled = scheduled * (Number(percent) || 0) / 100;
  const preview = override === '' ? targetBilled - previousBilled : Number(override || 0);
  const remainingPreview = scheduled - previousBilled - preview;
  const fullyBilled = Math.abs(Number(row.previous_billed_amount || row.billed_to_date_amount || 0)) >= Math.abs(scheduled) && Math.abs(scheduled) > 0;
  const isCredit = override !== '' && Number(override) < -0.005;
  const rowState = isCredit || Math.abs(preview) > 0.005 ? 'is-in-progress' : fullyBilled ? 'is-complete' : hasPayValue(row, kind) ? 'is-unbilled' : 'is-empty';

  async function save() {
    if (override !== '' && !Number.isFinite(Number(override))) {
      setState({ working: false, error: 'Enter a valid billing amount.' });
      return;
    }
    if (isCredit && previousBilled + Number(override) < -0.005) {
      setState({ working: false, error: `The credit cannot exceed the ${money(previousBilled)} previously billed on this line.` });
      return;
    }
    if (override !== '' && !reason.trim()) {
      setState({ working: false, error: 'Enter a reason for this billing override or customer credit.' });
      return;
    }
    setState({ working: true, error: '' });
    try {
      const fn = kind === 'co' ? 'save_job_pay_application_change_order' : 'save_job_pay_application_line';
      await withSupabaseTokenRetry(getToken, async (client) => {
        const { error } = await client.rpc(fn, { p_line_id: row.id, p_additional_percent: Number(percent || 0), p_override_amount: override === '' ? null : Number(override), p_reason: reason.trim() || null });
        if (error) throw error;
      });
      await onSaved();
    } catch (error) { setState({ working: false, error: error.message || 'Line was not saved.' }); }
  }

  return <tr data-pay-app-row={row.id} data-pay-app-kind={kind} className={`pay-app-table__row--${rowState}`}>
    <td><strong>{kind === 'co' ? row.co_number : row.cost_code || '—'}</strong><span className="pay-app-line-description">{row.description}</span></td>
    <td className="numeric-cell">{money(scheduled)}</td><td className="numeric-cell">{money(row.previous_billed_amount)}</td>
    <td className="pay-app-table__compact">{editable ? <input data-pay-field="percent" aria-label={`Percentage complete for ${row.description}`} type="number" min="0" max="100" step="0.01" value={percent} onClick={() => fullyBilled && onFullyBilledAttempt?.(row)} onChange={(event) => { if (!fullyBilled) setPercent(event.target.value); }} readOnly={fullyBilled} aria-disabled={fullyBilled} /> : `${Number((row.resulting_percent ?? row.additional_percent) || 0).toFixed(2)}%`}</td>
    <td className="pay-app-table__compact">{editable ? <input data-pay-field="override" aria-label={`Override or credit amount for ${row.description}`} title={fullyBilled ? 'Enter a negative amount to apply a customer credit.' : 'Negative amounts apply a customer credit.'} type="number" step="0.01" value={override} onChange={(event) => setOverride(event.target.value)} placeholder={fullyBilled ? 'Enter negative credit' : money(targetBilled - previousBilled)} /> : money(row.final_current_amount)}</td>
    <td className="numeric-cell">{money(editable ? preview : row.final_current_amount)}</td>
    <td className="numeric-cell">{money(editable ? remainingPreview : row.remaining_amount)}</td>
    <td>{editable ? <input data-pay-field="reason" aria-label={`Reason for ${row.description}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={correction || override !== '' ? 'Required reason' : 'Only for overrides'} /> : row.override_reason || '—'}</td>
    <td>{editable ? (fullyBilled && !isCredit ? <button type="button" className="secondary-button" onClick={() => onFullyBilledAttempt?.(row)}>Fully billed</button> : <button type="button" className="secondary-button" onClick={save} disabled={state.working}><Save aria-hidden="true" /> {state.working ? 'Saving' : isCredit ? 'Save Credit' : 'Save'}</button>) : money(row.billed_to_date_amount)}</td>
    {state.error ? <td className="pay-app-line-error">{state.error}</td> : null}
  </tr>;
}

function PayAppWorkflowActions({ selected, canManage, canCorrect, reason, setReason, working, call, historicalDate, setHistoricalDate, onHistorical, onDelete }) {
  if (!canManage) return null;
  return <div className="pay-app-workflow-actions pay-app-workflow-actions--prominent" aria-label="Pay App workflow actions">
    {selected.status !== 'voided' ? <label className="pay-app-workflow-reason"><span>{selected.status === 'billed' ? 'Correction reason' : 'Workflow note'}</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={selected.status === 'billed' ? 'Required for a correction or reversal' : 'Optional unless voiding an approved record or entering history'} /></label> : null}
    {selected.status === 'draft' ? <><span className="pay-app-next-step">Next: review saved line amounts, then approve this Draft. Approval and routine draft disposal are automatically audited.</span><button type="button" className="primary-button" disabled={Boolean(working)} onClick={() => call('set_job_pay_application_status', { p_pay_app_id: selected.id, p_status: 'approved', p_note: reason.trim() || null }, 'Pay App approved and locked for billing.', false, true)}><ShieldCheck aria-hidden="true" /> Approve Pay App</button><button type="button" className="secondary-button" disabled={Boolean(working)} onClick={() => call('void_job_pay_application', { p_pay_app_id: selected.id, p_reason: reason.trim() || null }, 'Draft Pay App discarded.', false, true)}><XCircle aria-hidden="true" /> Discard Draft</button></> : null}
    {selected.status === 'approved' ? <><span className="pay-app-next-step">Next: final review, then permanently record this application as billed.</span><button type="button" className="primary-button" disabled={Boolean(working)} onClick={() => call('finalize_job_pay_application', { p_pay_app_id: selected.id, p_finalization_key: crypto.randomUUID(), p_note: reason.trim() || null }, 'Pay App finalized as Billed.')}><Check aria-hidden="true" /> Mark Billed</button><button type="button" className="secondary-button" disabled={Boolean(working)} onClick={() => call('set_job_pay_application_status', { p_pay_app_id: selected.id, p_status: 'draft', p_note: reason.trim() || null }, 'Pay App returned to Draft.', false, true)}><Undo2 aria-hidden="true" /> Return to Draft</button><button type="button" className="secondary-button secondary-button--danger" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('void_job_pay_application', { p_pay_app_id: selected.id, p_reason: reason.trim() }, 'Approved Pay App voided.', false, true)}><XCircle aria-hidden="true" /> Void Approved</button></> : null}
    {selected.status === 'billed' ? <><span className="pay-app-next-step">Billed history stays immutable. A Correction records an incremental adjustment; a Reversal records the full opposite of this Pay App.</span><button type="button" className="secondary-button" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('create_job_pay_application_correction', { p_source_pay_app_id: selected.id, p_kind: 'correction', p_reason: reason.trim() }, 'Correction Pay App created.', true)}><RotateCcw aria-hidden="true" /> Create Correction</button><button type="button" className="secondary-button secondary-button--danger" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('create_job_pay_application_correction', { p_source_pay_app_id: selected.id, p_kind: 'reversal', p_reason: reason.trim() }, 'Reversal Pay App created.', true)}><Undo2 aria-hidden="true" /> Create Reversal</button></> : null}
    {canCorrect && selected.status === 'draft' ? <div className="pay-app-correction-tools"><label><span>Actual billed date</span><input type="date" max={today()} value={historicalDate} onChange={(event) => setHistoricalDate(event.target.value)} /></label><button type="button" className="secondary-button" disabled={!historicalDate || reason.trim().length < 3 || Boolean(working)} onClick={onHistorical}><CalendarCheck2 aria-hidden="true" /> Record Historical Billed</button></div> : null}
    {canCorrect ? <button type="button" className="secondary-button secondary-button--danger" disabled={Boolean(working)} onClick={onDelete}><Trash2 aria-hidden="true" /> Delete Pay App (Developer)</button> : null}
  </div>;
}

export function BillingActions({ jobId, canManage, canCorrect = false, onComplete }) {
  const { getToken } = useAuth();
  const [apps, setApps] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState({ tone: '', text: '' });
  const [reason, setReason] = useState('');
  const [template, setTemplate] = useState('aia_g702_g703');
  const [periodEnd, setPeriodEnd] = useState(today());
  const [showEmptyLines, setShowEmptyLines] = useState(false);
  const [fullyBilledLine, setFullyBilledLine] = useState(null);
  const [isSaveAllOpen, setIsSaveAllOpen] = useState(false);
  const [historicalDate, setHistoricalDate] = useState(today());
  const [historicalConfirm, setHistoricalConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await withSupabaseTokenRetry(getToken, async (client) => { const { data, error } = await client.rpc('get_job_pay_applications', { p_job_id: jobId }); if (error) throw error; return Array.isArray(data) ? data : []; });
      setApps(data); setSelectedId((current) => data.some((app) => app.id === current) ? current : data[0]?.id || '');
    } catch (error) { setMessage({ tone: 'danger', text: error.message || 'Pay Apps could not be loaded.' }); }
    finally { setLoading(false); }
  }, [getToken, jobId]);

  useEffect(() => { load(); }, [load]);
  const selected = apps.find((app) => app.id === selectedId) || null;
  const editable = canManage && selected?.status === 'draft' && selected?.pay_app_kind !== 'reversal';
  const amount = useMemo(() => selected ? currentTotal(selected) : 0, [selected]);

  async function call(name, args, success, selectResult = false, clearReason = false) {
    setWorking(name); setMessage({ tone: '', text: '' });
    try {
      const result = await withSupabaseTokenRetry(getToken, async (client) => { const { data, error } = await client.rpc(name, args); if (error) throw error; return data; });
      setMessage({ tone: 'success', text: success }); if (clearReason) setReason('');
      await load(); if (selectResult && result) setSelectedId(result); onComplete?.();
    } catch (error) { setMessage({ tone: 'danger', text: error.message || 'Billing action failed.' }); }
    finally { setWorking(''); }
  }

  async function saveHeader(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await call('save_job_pay_application_header', { p_pay_app_id: selected.id, p_period_start: form.get('period_start') || null, p_period_end: form.get('period_end'), p_retainage_percent: Number(form.get('retainage_percent') || 0), p_template_key: form.get('template_key'), p_template_document_id: null }, 'Draft Pay App settings saved.');
  }

  async function saveAll(certification) {
    if (certification.trim().toLowerCase() !== 'i certify that all values are correct') {
      setMessage({ tone: 'danger', text: 'Type the certification exactly to save all edited values.' });
      return;
    }
    const rows = Array.from(document.querySelectorAll('[data-pay-app-row]'));
    const edits = rows.map((element) => ({
      id: element.dataset.payAppRow,
      kind: element.dataset.payAppKind,
      percent: Number(element.querySelector('[data-pay-field="percent"]')?.value || 0),
      override: element.querySelector('[data-pay-field="override"]')?.value,
      reason: element.querySelector('[data-pay-field="reason"]')?.value?.trim() || null,
    })).filter((row) => row.override !== '' || row.percent !== 0 || row.reason);
    if (!edits.length) { setIsSaveAllOpen(false); setMessage({ tone: 'neutral', text: 'There are no entered Pay App values to save.' }); return; }
    setWorking('save-all'); setIsSaveAllOpen(false);
    try {
      await withSupabaseTokenRetry(getToken, async (client) => {
        for (const row of edits) {
          const { error } = await client.rpc(row.kind === 'co' ? 'save_job_pay_application_change_order' : 'save_job_pay_application_line', { p_line_id: row.id, p_additional_percent: row.percent, p_override_amount: row.override === '' ? null : Number(row.override), p_reason: row.reason });
          if (error) throw error;
        }
      });
      setMessage({ tone: 'success', text: `${edits.length} Pay App line${edits.length === 1 ? '' : 's'} saved.` }); await load();
    } catch (error) { setMessage({ tone: 'danger', text: error.message || 'Pay App lines could not be saved.' }); }
    finally { setWorking(''); }
  }

  async function recordHistorical(certification) {
    if (certification.trim().toLowerCase() !== 'i certify this matches the historical billing record') {
      setMessage({ tone: 'danger', text: 'Type the historical billing certification exactly.' });
      return;
    }
    setHistoricalConfirm(null);
    await call('finalize_historical_job_pay_application', { p_pay_app_id: selected.id, p_billed_date: historicalDate, p_reason: reason.trim(), p_certification: certification.trim() }, 'Historical Pay App recorded as Billed.', false, true);
  }

  async function deletePayApp(deleteReason) {
    setDeleteConfirm(null);
    await call('developer_delete_job_pay_application', { p_pay_app_id: selected.id, p_reason: deleteReason }, 'Pay App deleted with a complete audit snapshot and reconciled billing totals.', false, true);
  }

  return <section className="pay-app-workspace" aria-label="Pay Applications">
    <div className="pay-app-command-bar"><div><span className="eyebrow">Pay Applications</span><h3>Progress billing</h3><p>Create, review, approve, bill, and correct immutable applications.</p></div><button type="button" className="secondary-button" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button></div>
    {canManage ? <div className="pay-app-create-row">
      <label><span>SOV initialization reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required only when initializing SOV" /></label>
      <button type="button" className="secondary-button" disabled={Boolean(working) || reason.trim().length < 3} onClick={() => call('initialize_job_sov_from_financials', { p_job_id: jobId, p_reason: reason.trim() }, 'SOV initialized from Financials.')}>Initialize SOV</button>
      <label><span>Period end</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
      <label><span>Form</span><select value={template} onChange={(event) => setTemplate(event.target.value)}>{PAY_APP_TEMPLATE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="button" className="primary-button" disabled={Boolean(working)} onClick={() => call('create_job_pay_application', { p_job_id: jobId, p_period_end: periodEnd, p_template_key: template, p_template_document_id: null }, 'Draft Pay App created.', true)}><FilePlus2 aria-hidden="true" /> Create Draft</button>
    </div> : <p className="muted-copy">Billing is read-only for your role. Server authorization protects all workflow actions.</p>}
    {message.text ? <StatePanel tone={message.tone} title={message.tone === 'danger' ? 'Billing action failed' : 'Billing updated'} description={message.text} compact /> : null}

    <div className="pay-app-layout"><aside className="pay-app-history" aria-label="Pay App history"><h4>Application history</h4>
      {loading ? <p>Loading Pay Apps…</p> : apps.length ? apps.map((app) => <button type="button" key={app.id} className={selectedId === app.id ? 'is-active' : ''} onClick={() => setSelectedId(app.id)}><span><strong>Pay App #{app.pay_app_number}</strong><StatusBadge tone={tone(app.status)}>{title(app.status)}</StatusBadge></span><small>{title(app.pay_app_kind)} · {date(app.billing_period_end)}</small><b>{money(app.total_current_billed || currentTotal(app))}</b></button>) : <p>No Pay Apps have been created.</p>}
    </aside><div className="pay-app-detail">
      {!selected ? <StatePanel tone="neutral" title="No Pay App selected" description="Create a Draft Pay App after the SOV is reconciled." compact /> : <>
        <header className="pay-app-detail-header"><div><span className="eyebrow">{title(selected.pay_app_kind)}</span><h3>Pay App #{selected.pay_app_number}</h3><p>{getPayAppTemplate(selected.template_key).label} · Period ending {date(selected.billing_period_end)}</p></div><StatusBadge tone={tone(selected.status)}>{title(selected.status)}</StatusBadge></header>
        <div className="pay-app-totals"><div><span>Contract</span><strong>{money(selected.current_contract_value)}</strong></div><div><span>Previous</span><strong>{money(selected.total_previous_billed)}</strong></div><div><span>This application</span><strong>{money(amount)}</strong></div><div><span>Retainage</span><strong>{money(selected.status === 'billed' ? selected.retainage_amount : amount * Number(selected.retainage_percent || 0) / 100)}</strong></div><div><span>Remaining</span><strong>{money(selected.status === 'billed' ? selected.remaining_contract_value : Number(selected.current_contract_value) - Number(selected.total_previous_billed || 0) - amount)}</strong></div></div>
        <PayAppWorkflowActions selected={selected} canManage={canManage} canCorrect={canCorrect} reason={reason} setReason={setReason} working={working} call={call} historicalDate={historicalDate} setHistoricalDate={setHistoricalDate} onHistorical={() => setHistoricalConfirm(selected)} onDelete={() => setDeleteConfirm(selected)} />
        {editable ? <div className="pay-app-edit-controls"><label><input type="checkbox" checked={showEmptyLines} onChange={(event) => setShowEmptyLines(event.target.checked)} /> Show zero-value lines</label><button type="button" className="secondary-button" disabled={Boolean(working)} onClick={() => setIsSaveAllOpen(true)}><Save aria-hidden="true" /> Save All</button></div> : null}
        {editable ? <form className="pay-app-settings" onSubmit={saveHeader}><label><span>Period start</span><input name="period_start" type="date" defaultValue={selected.billing_period_start || ''} /></label><label><span>Period end</span><input name="period_end" type="date" defaultValue={String(selected.billing_period_end).slice(0, 10)} required /></label><label><span>Retainage %</span><input name="retainage_percent" type="number" min="0" max="100" step="0.01" defaultValue={selected.retainage_percent || 0} /></label><label><span>Form framework</span><select name="template_key" defaultValue={selected.template_key}>{PAY_APP_TEMPLATE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><button className="secondary-button" type="submit" disabled={Boolean(working)}><Save aria-hidden="true" /> Save settings</button></form> : null}
        <PayTable titleText="Original contract SOV" note={`${selected.lines?.length || 0} immutable source snapshots`} rows={selected.lines || []} kind="sov" editable={editable} correction={selected.pay_app_kind === 'correction'} load={load} showEmptyLines={showEmptyLines} onFullyBilledAttempt={setFullyBilledLine} />
        <PayTable titleText="Approved Change Orders" note="Approved, active Change Orders captured by this Pay App." rows={selected.change_orders || []} kind="co" editable={editable} correction={selected.pay_app_kind === 'correction'} load={load} showEmptyLines={showEmptyLines} onFullyBilledAttempt={setFullyBilledLine} action={editable ? <button type="button" className="secondary-button" onClick={() => call('sync_job_pay_application_change_orders', { p_pay_app_id: selected.id }, 'Approved Change Orders synchronized.')} disabled={Boolean(working)}><RefreshCw aria-hidden="true" /> Sync approved COs</button> : null} />
        <details className="pay-app-audit"><summary>Workflow record and audit history</summary><dl><div><dt>Approval</dt><dd>{selected.approved_by || '—'} · {selected.approved_at ? new Date(selected.approved_at).toLocaleString() : '—'}<br />{selected.approval_note || '—'}</dd></div><div><dt>Billing</dt><dd>{selected.billed_by || '—'} · {selected.billed_at ? new Date(selected.billed_at).toLocaleString() : '—'}<br />{selected.billed_note || '—'}</dd></div><div><dt>Void</dt><dd>{selected.voided_by || '—'} · {selected.voided_at ? new Date(selected.voided_at).toLocaleString() : '—'}<br />{selected.void_reason || '—'}</dd></div></dl></details>
      </>}
    </div></div>
    <ConfirmDialog open={Boolean(fullyBilledLine)} onCancel={() => setFullyBilledLine(null)} onConfirm={() => setFullyBilledLine(null)} title="This line is already fully billed" description={`No additional positive billing can be entered for ${fullyBilledLine?.description || 'this line'}. To apply a customer credit, enter a negative amount in Override and provide a reason.`} confirmLabel="I understand" />
    <ConfirmDialog open={isSaveAllOpen} onCancel={() => setIsSaveAllOpen(false)} onConfirm={saveAll} title="Certify and save all entered values" description="Each entered Draft value will be saved and server-validated. This does not approve or bill the Pay App." confirmLabel="Save all values" requireReason reasonLabel="Certification" reasonHint="Type exactly: I certify that all values are correct." reasonPlaceholder="I certify that all values are correct" />
    <ConfirmDialog open={Boolean(historicalConfirm)} onCancel={() => setHistoricalConfirm(null)} onConfirm={recordHistorical} title={`Record Pay App #${historicalConfirm?.pay_app_number || ''} as historical billing`} description={`This will atomically approve and finalize the Draft using ${date(historicalDate)} as its historical billed date. Billed history remains immutable afterward.`} confirmLabel="Record historical Pay App" requireReason reasonLabel="Certification" reasonHint="Type exactly: I certify this matches the historical billing record" reasonPlaceholder="I certify this matches the historical billing record" isSubmitting={working === 'finalize_historical_job_pay_application'} />
    <ConfirmDialog open={Boolean(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} onConfirm={deletePayApp} title={`Delete Pay App #${deleteConfirm?.pay_app_number || ''}`} description={`Developer Data Correction will permanently remove this ${title(deleteConfirm?.status)} Pay App. A complete JSON snapshot will remain in the audit log, and SOV billed-to-date will be recalculated from the remaining finalized history. Pay Apps must be deleted newest first.`} confirmLabel="Delete Pay App" tone="danger" requireReason reasonLabel="Deletion reason" reasonHint="Explain why this Pay App must be removed during development." isSubmitting={working === 'developer_delete_job_pay_application'} />
  </section>;
}

function PayTable({ titleText, note, rows, kind, editable, correction, load, action, showEmptyLines, onFullyBilledAttempt }) {
  const visibleRows = showEmptyLines ? rows : rows.filter((row) => hasPayValue(row, kind));
  const hiddenCount = rows.length - visibleRows.length;
  const [collapsedDivisions, setCollapsedDivisions] = useState({});
  const groups = kind === 'sov' ? [...visibleRows.reduce((result, row) => {
    const code = row.project_division_code || String(row.cost_code || '').match(/^\d{2}/)?.[0] || '';
    const label = code ? `Division ${code} — ${row.project_division_name || 'Unnamed'}` : 'Unassigned project division';
    const group = result.get(label) || { rows: [], sortOrder: Number(code || 999) };
    group.rows.push(row); result.set(label, group); return result;
  }, new Map()).entries()].sort(([, left], [, right]) => left.sortOrder - right.sortOrder) : [['Approved Change Orders', { rows: visibleRows, sortOrder: 0 }]];
  const table = (groupRows) => <div className="pay-app-table-wrap"><table className="pay-app-table"><thead><tr><th>Line / Description</th><th>{kind === 'co' ? 'Approved' : 'Scheduled'}</th><th>Previous</th><th className="pay-app-table__compact">Percentage Complete</th><th className="pay-app-table__compact">Override</th><th>Current</th><th>Remaining to Bill</th><th>Reason</th><th>{editable ? 'Action' : 'Billed to date'}</th></tr></thead><tbody>{groupRows.map((row) => <PayLine key={`${row.id}-${row.updated_at}`} row={row} kind={kind} editable={editable} correction={correction} onSaved={load} onFullyBilledAttempt={onFullyBilledAttempt} />)}{!groupRows.length ? <tr><td colSpan="9">No billable values are visible. Select “Show zero-value lines” to review them.</td></tr> : null}</tbody></table></div>;
  return <><div className="pay-app-section-heading"><div><h4>{titleText}</h4><p>{note}{hiddenCount ? ` · ${hiddenCount} zero-value line${hiddenCount === 1 ? '' : 's'} collapsed.` : ''}</p></div><div className="pay-app-section-actions">{kind === 'sov' && groups.length > 1 ? <><button type="button" className="secondary-button" onClick={() => setCollapsedDivisions(Object.fromEntries(groups.map(([label]) => [label, false])))}>Expand All</button><button type="button" className="secondary-button" onClick={() => setCollapsedDivisions(Object.fromEntries(groups.map(([label]) => [label, true])))}>Collapse All</button></> : null}{action}</div></div>{kind === 'sov' ? groups.map(([label, group]) => {
    const isCollapsed = collapsedDivisions[label] !== false;
    const scheduled = group.rows.reduce((sum, row) => sum + Number(row.scheduled_value_amount || 0), 0);
    const previous = group.rows.reduce((sum, row) => sum + Number(row.previous_billed_amount || 0), 0);
    const current = group.rows.reduce((sum, row) => sum + Number(row.final_current_amount || 0), 0);
    return <section className="pay-app-division" key={label}><button type="button" className="job-budget-division__toggle" onClick={() => setCollapsedDivisions((state) => ({ ...state, [label]: !isCollapsed }))}><span className="job-budget-division__title"><span>{isCollapsed ? '▸' : '▾'} {label}</span><small>{group.rows.length} billing line{group.rows.length === 1 ? '' : 's'}</small></span><span className="job-budget-division__metrics job-budget-division__metrics--billing"><span><small>Scheduled</small><strong>{money(scheduled)}</strong></span><span><small>Previous</small><strong>{money(previous)}</strong></span><span><small>Current</small><strong>{money(current)}</strong></span></span></button>{!isCollapsed ? table(group.rows) : null}</section>;
  }) : table(visibleRows)}</>;
}
