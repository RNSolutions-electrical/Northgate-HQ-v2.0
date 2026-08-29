import { useAuth } from '@clerk/clerk-react';
import { Check, FilePlus2, RefreshCw, RotateCcw, Save, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { PAY_APP_TEMPLATE_OPTIONS, getPayAppTemplate } from './billingPayAppTemplates.js';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => MONEY.format(Number(value) || 0);
const date = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString() : '—';
const title = (value) => String(value || '').replace(/(^|_)(\w)/g, (_, space, letter) => `${space ? ' ' : ''}${letter.toUpperCase()}`);
const tone = (value) => value === 'billed' ? 'good' : value === 'approved' ? 'warn' : value === 'voided' ? 'danger' : 'neutral';
const currentTotal = (app) => [...(app.lines || []), ...(app.change_orders || [])].reduce((sum, row) => sum + Number(row.final_current_amount || 0), 0);

function PayLine({ row, kind, editable, correction, onSaved }) {
  const { getToken } = useAuth();
  const [percent, setPercent] = useState(String(row.additional_percent ?? 0));
  const [override, setOverride] = useState(row.override_reason ? String(row.final_current_amount ?? '') : '');
  const [reason, setReason] = useState(row.override_reason || '');
  const [state, setState] = useState({ working: false, error: '' });
  const scheduled = Number(kind === 'co' ? row.approved_value : row.scheduled_value_amount) || 0;
  const preview = override === '' ? scheduled * (Number(percent) || 0) / 100 : Number(override || 0);

  async function save() {
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

  return <tr>
    <td><strong>{kind === 'co' ? row.co_number : row.cost_code || '—'}</strong><span className="pay-app-line-description">{row.description}</span></td>
    <td className="numeric-cell">{money(scheduled)}</td><td className="numeric-cell">{money(row.previous_billed_amount)}</td>
    <td>{editable ? <input aria-label={`Additional percent for ${row.description}`} type="number" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} /> : `${Number(row.additional_percent || 0).toFixed(2)}%`}</td>
    <td>{editable ? <input aria-label={`Override amount for ${row.description}`} type="number" step="0.01" value={override} onChange={(event) => setOverride(event.target.value)} placeholder={money(scheduled * (Number(percent) || 0) / 100)} /> : money(row.final_current_amount)}</td>
    <td className="numeric-cell">{money(editable ? preview : row.final_current_amount)}</td>
    <td>{editable ? <input aria-label={`Reason for ${row.description}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={correction || override !== '' ? 'Required reason' : 'Only for overrides'} /> : row.override_reason || '—'}</td>
    <td>{editable ? <button type="button" className="secondary-button" onClick={save} disabled={state.working}><Save aria-hidden="true" /> {state.working ? 'Saving' : 'Save'}</button> : money(row.billed_to_date_amount)}</td>
    {state.error ? <td className="pay-app-line-error">{state.error}</td> : null}
  </tr>;
}

export function BillingActions({ jobId, canManage, onComplete }) {
  const { getToken } = useAuth();
  const [apps, setApps] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState({ tone: '', text: '' });
  const [reason, setReason] = useState('');
  const [template, setTemplate] = useState('aia_g702_g703');
  const [periodEnd, setPeriodEnd] = useState(today());

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

  async function call(name, args, success, selectResult = false) {
    setWorking(name); setMessage({ tone: '', text: '' });
    try {
      const result = await withSupabaseTokenRetry(getToken, async (client) => { const { data, error } = await client.rpc(name, args); if (error) throw error; return data; });
      setMessage({ tone: 'success', text: success }); setReason('');
      await load(); if (selectResult && result) setSelectedId(result); onComplete?.();
    } catch (error) { setMessage({ tone: 'danger', text: error.message || 'Billing action failed.' }); }
    finally { setWorking(''); }
  }

  async function saveHeader(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await call('save_job_pay_application_header', { p_pay_app_id: selected.id, p_period_start: form.get('period_start') || null, p_period_end: form.get('period_end'), p_retainage_percent: Number(form.get('retainage_percent') || 0), p_template_key: form.get('template_key'), p_template_document_id: null }, 'Draft Pay App settings saved.');
  }

  return <section className="pay-app-workspace" aria-label="Pay Applications">
    <div className="pay-app-command-bar"><div><span className="eyebrow">Pay Applications</span><h3>Progress billing</h3><p>Create, review, approve, bill, and correct immutable applications.</p></div><button type="button" className="secondary-button" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button></div>
    {canManage ? <div className="pay-app-create-row">
      <label><span>Audit reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for workflow actions" /></label>
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
        {editable ? <form className="pay-app-settings" onSubmit={saveHeader}><label><span>Period start</span><input name="period_start" type="date" defaultValue={selected.billing_period_start || ''} /></label><label><span>Period end</span><input name="period_end" type="date" defaultValue={String(selected.billing_period_end).slice(0, 10)} required /></label><label><span>Retainage %</span><input name="retainage_percent" type="number" min="0" max="100" step="0.01" defaultValue={selected.retainage_percent || 0} /></label><label><span>Form framework</span><select name="template_key" defaultValue={selected.template_key}>{PAY_APP_TEMPLATE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><button className="secondary-button" type="submit" disabled={Boolean(working)}><Save aria-hidden="true" /> Save settings</button></form> : null}
        <PayTable titleText="Original contract SOV" note={`${selected.lines?.length || 0} immutable source snapshots`} rows={selected.lines || []} kind="sov" editable={editable} correction={selected.pay_app_kind === 'correction'} load={load} />
        <PayTable titleText="Approved Change Orders" note="Approved, active Change Orders captured by this Pay App." rows={selected.change_orders || []} kind="co" editable={editable} correction={selected.pay_app_kind === 'correction'} load={load} action={editable ? <button type="button" className="secondary-button" onClick={() => call('sync_job_pay_application_change_orders', { p_pay_app_id: selected.id }, 'Approved Change Orders synchronized.')} disabled={Boolean(working)}><RefreshCw aria-hidden="true" /> Sync approved COs</button> : null} />
        {canManage ? <div className="pay-app-workflow-actions">
          {selected.status === 'draft' ? <><button type="button" className="primary-button" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('set_job_pay_application_status', { p_pay_app_id: selected.id, p_status: 'approved', p_note: reason.trim() }, 'Pay App approved and locked for billing.')}><ShieldCheck aria-hidden="true" /> Approve</button><button type="button" className="secondary-button secondary-button--danger" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('void_job_pay_application', { p_pay_app_id: selected.id, p_reason: reason.trim() }, 'Draft Pay App voided.')}><XCircle aria-hidden="true" /> Void Draft</button></> : null}
          {selected.status === 'approved' ? <><button type="button" className="primary-button" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('finalize_job_pay_application', { p_pay_app_id: selected.id, p_finalization_key: crypto.randomUUID(), p_note: reason.trim() }, 'Pay App finalized as Billed.')}><Check aria-hidden="true" /> Mark Billed</button><button type="button" className="secondary-button" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('set_job_pay_application_status', { p_pay_app_id: selected.id, p_status: 'draft', p_note: reason.trim() }, 'Pay App returned to Draft.')}><Undo2 aria-hidden="true" /> Return to Draft</button><button type="button" className="secondary-button secondary-button--danger" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('void_job_pay_application', { p_pay_app_id: selected.id, p_reason: reason.trim() }, 'Approved Pay App voided.')}><XCircle aria-hidden="true" /> Void</button></> : null}
          {selected.status === 'billed' ? <><button type="button" className="secondary-button" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('create_job_pay_application_correction', { p_source_pay_app_id: selected.id, p_kind: 'correction', p_reason: reason.trim() }, 'Correction Pay App created.', true)}><RotateCcw aria-hidden="true" /> Create Correction</button><button type="button" className="secondary-button secondary-button--danger" disabled={reason.trim().length < 3 || Boolean(working)} onClick={() => call('create_job_pay_application_correction', { p_source_pay_app_id: selected.id, p_kind: 'reversal', p_reason: reason.trim() }, 'Reversal Pay App created.', true)}><Undo2 aria-hidden="true" /> Create Reversal</button></> : null}
        </div> : null}
        <dl className="pay-app-audit"><div><dt>Approval</dt><dd>{selected.approved_by || '—'} · {selected.approved_at ? new Date(selected.approved_at).toLocaleString() : '—'}<br />{selected.approval_note || '—'}</dd></div><div><dt>Billing</dt><dd>{selected.billed_by || '—'} · {selected.billed_at ? new Date(selected.billed_at).toLocaleString() : '—'}<br />{selected.billed_note || '—'}</dd></div><div><dt>Void</dt><dd>{selected.voided_by || '—'} · {selected.voided_at ? new Date(selected.voided_at).toLocaleString() : '—'}<br />{selected.void_reason || '—'}</dd></div></dl>
      </>}
    </div></div>
  </section>;
}

function PayTable({ titleText, note, rows, kind, editable, correction, load, action }) {
  return <><div className="pay-app-section-heading"><div><h4>{titleText}</h4><p>{note}</p></div>{action}</div><div className="pay-app-table-wrap"><table className="pay-app-table"><thead><tr><th>Line / Description</th><th>{kind === 'co' ? 'Approved' : 'Scheduled'}</th><th>Previous</th><th>Additional %</th><th>Override</th><th>Current</th><th>Reason</th><th>{editable ? 'Action' : 'Billed to date'}</th></tr></thead><tbody>{rows.map((row) => <PayLine key={`${row.id}-${row.updated_at}`} row={row} kind={kind} editable={editable} correction={correction} onSaved={load} />)}{!rows.length ? <tr><td colSpan="8">No lines are included.</td></tr> : null}</tbody></table></div></>;
}
