import {ServiceCallFields,EMPTY_SERVICE_CALL} from './ServiceCallForm.jsx';
import {AttachedEstimates} from '../estimates/AttachedEstimates.jsx';
import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';
import { uiElementAttributes } from '../../config/uiTerminology.js';
import { ServiceImportPreview } from './ServiceImportPreview.jsx';
import { ServiceProfitSummary } from './ServiceProfitSummary.jsx';
import { ServiceMonthlyReport } from './ServiceMonthlyReport.jsx';
import { serviceAttention, serviceScorecardCsv } from './serviceScorecard.js';
import { invoiceCharges } from './invoiceCharges.js';
import { DEFAULT_SERVICE_STAGES, noChargeStage, stageRowStyle } from './serviceStages.js';
import { inProfitPeriod, isVoidCall, profitDate } from './serviceProfit.js';
import { directoryStatus, BILLING_METHODS, money, callFinancials, invoiceBalance, allocationRemaining } from './serviceCallModel.js';
import './serviceCalls.css';

const today = () => new Date().toLocaleDateString('en-CA');
const EMPTY = EMPTY_SERVICE_CALL;

export function ServiceCallsWorkspace({ permissions, initialJobId = null, onJobs, onResources, onReturnList,
  embedded = false, onSaved, onPanelState, initialDirectoryView = 'operations', initialTab = 'details' }) {
  const { getToken } = useAuth();
  const [calls, setCalls] = useState([]);
  const [stages, setStages] = useState(DEFAULT_SERVICE_STAGES);
  const [archivedCalls, setArchivedCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(initialJobId);
  const [mode, setMode] = useState('browse');
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(initialTab==='billing'&&(permissions?.canViewProjectFinancials||permissions?.can_view_project_financials)?'billing':'details');
  const [form, setForm] = useState(EMPTY);
  const [invoice, setInvoice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [directoryView, setDirectoryView] = useState(initialDirectoryView === 'financials' && (permissions?.can_view_project_financials === true || permissions?.canViewProjectFinancials === true) ? 'financials' : 'operations');
  const [attentionOnly,setAttentionOnly] = useState(false);
  const [period, setPeriod] = useState({year:new Date().getFullYear(),quarter:'all',basis:'invoice'});
  const [includeUndated, setIncludeUndated] = useState(false);
  const [panelId, setPanelId] = useState(null);
  const [panelState, setPanelState] = useState({dirty:false,busy:false});
  const [discardPanel, setDiscardPanel] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leaveAction, setLeaveAction] = useState(null);
  const sequence = useRef(0);
  useEffect(() => { onPanelState?.({dirty,busy}); }, [dirty,busy,onPanelState]);
  useEffect(() => {
    if (!embedded || !dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue=''; };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  }, [embedded,dirty]);

  const rpc = useCallback((name, args) => withSupabaseTokenRetry(getToken, async (client) => {
    const { data, error: failure } = await client.rpc(name, args);
    if (failure) throw failure;
    return data;
  }), [getToken]);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const read = async (archived) => {
        const result = [];
        for (let offset = 0; ; offset += 200) {
          const page = await rpc('svc_read_calls', { p_archived: archived, p_offset: offset, p_limit: 200 });
          result.push(...page);
          if (page.length < 200) return result;
        }
      };
      const [active, archived, catalogue] = await Promise.all([read(false), read(true), rpc('svc_read_stages', {})]);
      if (request !== sequence.current) return;
      setCalls(active); setArchivedCalls(archived);
      if (!Array.isArray(catalogue)) throw new Error('Service stages could not be loaded. Refresh before editing.');
      setStages(catalogue);
    } catch (e) { if (request === sequence.current) setError(e.message); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [rpc]);
  useEffect(() => { reload(); return () => { sequence.current += 1; }; }, [reload]);
  useEffect(() => { setSelectedId(initialJobId); setMode('browse'); }, [initialJobId]);
  const all = [...calls, ...archivedCalls];
  const call = all.find((item) => item.id === selectedId);
  const workStages = Object.fromEntries(stages.filter(s=>s.kind==='work').map(s=>[s.key,s.label]));
  const statusFor = item => directoryStatus(item, today(), stages);
  const canInvoice = item => item.can_bill && !item.profile?.financially_closed_at && (item.status === 'complete' || noChargeStage(item));
  const financials = call && callFinancials(call);
  const canCreate = permissions?.can_create_jobs === true || permissions?.canCreateJobs === true;
  const canViewFinance = permissions?.can_view_project_financials === true || permissions?.canViewProjectFinancials === true;
  const open = (item) => { setSelectedId(item.id); setMode('browse'); setTab('details'); setError(''); setMessage(''); setDirty(false); };
  const guard = action => { if (busyRef.current) return; if (embedded && dirty) setLeaveAction(()=>action); else action(); };
  const back = () => guard(() => { setMode('browse'); setError(''); setMessage(''); setDirty(false); });
  const list = () => { setSelectedId(null); back(); onReturnList?.(); };
  const change = (key, value) => { setDirty(true); setForm((current) => ({ ...current, [key]: value })); };
  const closePanel = () => { if (panelState.busy) return; if (panelState.dirty) setDiscardPanel(true); else setPanelId(null); };
  const openDirectoryCall = item => {
    if (directoryView === 'financials' && !embedded) { setPanelState({dirty:false,busy:false}); setPanelId(item.id); }
    else open(item);
  };
  const field = (key, label, type = 'text', required = false) => <label key={key}>{label}
    <input type={type} value={form[key] ?? ''} onChange={(e) => change(key, e.target.value)} required={required}
      {...(type === 'number' ? { step: '0.01' } : {})} />
  </label>;
  const select = (key, label, options) => <label>{label}<select value={form[key] || ''} onChange={(e) => change(key, e.target.value)}>
    {Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
  </select></label>;
  async function write(name, args, success) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const id = await rpc(name, args);
      setDirty(false);
      setConfirm(null);
      setVoidTarget(null);
      await reload();
      if (name === 'svc_save_call') setSelectedId(id);
      if (name === 'svc_archive_call') { setSelectedId(null); setFilter('archived'); onReturnList?.(); }
      setMode('browse'); setMessage(success);
      await onSaved?.();
    } catch (e) { setError(e.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function startEdit() {
    setForm({ ...EMPTY, ...call, ...call.profile, related_job_id:call.profile?.related_job_id || '',
      work_stage:call.profile?.work_stage || (call.status === 'complete' ? 'complete' : 'upcoming') });
    setMode('edit'); setError(''); setMessage(''); setDirty(false);
  }
  function commercial(action, data = {}) { setForm(action === 'payment' ? {...data,request_id:crypto.randomUUID()} : data); setMode(action); setError(''); setMessage(''); setDirty(false); }
  function startInvoice() {
    setInvoice({ requestId:crypto.randomUUID(), invoice_number:'', invoice_date:today(), due_date:'',
      total_revenue:noChargeStage(call)?'0':'', sales_tax_percent:'7.25', credit_card_percent:'3', certify_complete:false, note:'', allocations:[{ job_id:call.id, amount:noChargeStage(call)?'0':'', expected_updated_at:call.updated_at }] });
    setMode('invoice'); setError(''); setMessage(''); setDirty(false);
  }
  const updateInvoice = (key, value) => { setDirty(true); setInvoice((old) => ({ ...old, [key]:value })); };
  const saveCommercial = (event) => {
    event.preventDefault();
    write('svc_save_commercial', { p_job_id:call.id, p_action:mode, p_data:form, p_expected_updated_at:call.updated_at }, 'Financial information saved.');
  };
  const posted = call?.financials?.invoices?.filter((item) => item.status === 'posted') || [];
  const rows = (filter === 'archived' ? archivedCalls : calls).filter((item) => {
    const stage = statusFor(item).stage;
    return (filter === 'active' || filter === 'archived' || stage === filter) &&
      [item.service_call_number,item.name,item.description,item.profile?.business_name,item.address_line1,item.profile?.lead_name].join(' ').toLowerCase().includes(search.toLowerCase());
  });
  const directoryRows = directoryView === 'financials' && canViewFinance
    ? rows.filter((item) => (inProfitPeriod(item, {...period,through:today()}) || (includeUndated && !profitDate(item,period.basis))) && (!attentionOnly || serviceAttention(item,today()).length > 0)) : rows;
  function exportScorecard() {
    if (!canViewFinance) return;
    const blob = new Blob([serviceScorecardCsv(directoryRows,period,today(),stages)],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href=url; anchor.download=`northgate-service-scorecard-${period.year}-${period.quarter === 'all' ? 'year' : 'Q'+period.quarter}.csv`;
    anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const parent = all.find((item) => item.id === call?.profile?.related_job_id);
  const linked = call ? all.filter((item) => item.id !== call.id && (item.profile?.related_job_id === call.id ||
    item.id === call.profile?.related_job_id || (call.profile?.related_job_id && item.profile?.related_job_id === call.profile.related_job_id))) : [];
  const isFinancialMode = ['quote','cost','payment','invoice'].includes(mode);
  let invoiceRemaining = null;
  let charges=null,chargeError='';
  try { if (invoice) charges=invoiceCharges(invoice.total_revenue,invoice.sales_tax_percent,invoice.credit_card_percent); }
  catch (e) { chargeError=e.message; }
  try { if (invoice) invoiceRemaining = allocationRemaining(invoice.total_revenue || 0,invoice.allocations); } catch { /* Invalid input remains editable; the server validates on save. */ }
  return <div className={'svc-workspace'+(embedded ? ' svc-workspace--panel' : '')} {...uiElementAttributes('MODULE','Service Calls')}>
    {embedded ? <div className="svc-panel-heading"><h2>{call ? (call.service_call_number || call.job_number)+' — '+call.name : 'Loading service call…'}</h2>
      {mode !== 'browse' && <button className="secondary-button" onClick={back} disabled={busy}>Cancel editing</button>}
    </div> : <WorkspaceHeader eyebrow="Workspace" title={mode === 'create' ? 'Create Service Call' : call ? (call.service_call_number || call.job_number) + ' — ' + call.name : 'Service Calls'}
      description="Track the work, then record its costs, invoice, and payments."
      actions={<div className="svc-actions">
        <button className="secondary-button" onClick={mode !== 'browse' ? back : call ? list : onJobs} disabled={busy}>{mode !== 'browse' ? 'Cancel' : call ? 'Back to Service Calls' : 'Back to Jobs'}</button>
        {mode === 'browse' && !call && canCreate && <button className="primary-button" onClick={() => {setForm(EMPTY);setMode('create');setError('');}}>Create Service Call</button>}
      </div>} />}
    <div className="card workspace-card svc-content">
      {error && <StatePanel tone="warning" title="Service call action needs attention" description={error} />}
      {message && <StatePanel tone="success" title="Service Calls updated" description={message} />}
      {loading && <p role="status">Loading service calls…</p>}
      {selectedId && !call && !loading && <StatePanel title="Service call unavailable" description="Refresh or return to the directory. It may be outside your current access." />}
      <fieldset disabled={busy || loading} className="svc-fieldset">
      {(mode === 'create' || mode === 'edit') && <form onSubmit={(event) => {event.preventDefault(); write('svc_save_call', {
        p_job_id:mode === 'create' ? null : call.id, p_data:form, p_expected_updated_at:mode === 'create' ? null : call.updated_at,
      }, 'Service call saved.');}}>
        <ServiceCallFields form={form} change={change} stages={stages} calls={calls} call={call} creating={mode === 'create'} /><button className="primary-button" type="submit">Save service call</button>
      </form>}
      {mode === 'preview' && <ServiceImportPreview existing={all} />}
      {mode === 'invoice' && invoice && <form onSubmit={(e) => {e.preventDefault(); setConfirm('invoice');}}>
        <h2>Record invoice</h2><p>Record an invoice issued through your billing system. Allocate its subtotal across the completed calls below. This does not generate or send an invoice.</p>
        <div className="svc-grid">{[['invoice_number','Invoice number','text'],['invoice_date','Invoice date','date'],['due_date','Due date (optional)','date']].map(([key,label,type]) =>
          <label key={key}>{label}<input type={type} value={invoice[key]} onChange={(e) => updateInvoice(key,e.target.value)} required={key !== 'due_date'} {...(type === 'number' ? {min:0,step:'.01'} : {})} /></label>)}</div>
        <section className="svc-section"><h3>Invoice total</h3>
          <div className="svc-charge-grid">
            <label>Subtotal<input type="number" min={noChargeStage(call)?'0':'0.01'} step=".01" required value={invoice.total_revenue} onChange={e=>updateInvoice('total_revenue',e.target.value)} /></label><output aria-label="Subtotal amount">{charges?money(charges.subtotal):'—'}</output>
            <label>Sales Tax %<input type="number" min="0" max="100" step=".01" required value={invoice.sales_tax_percent} onChange={e=>updateInvoice('sales_tax_percent',e.target.value)} /></label><output aria-label="Sales tax amount">{charges?money(charges.salesTax):'—'}</output>
            <label>Credit Card Fee %<input type="number" min="0" max="100" step=".01" required value={invoice.credit_card_percent} onChange={e=>updateInvoice('credit_card_percent',e.target.value)} /></label><output aria-label="Credit card fee amount">{charges?money(charges.creditCardFee):'—'}</output>
            <strong>Total</strong><output aria-label="Invoice total"><strong>{charges?money(charges.total):'—'}</strong></output>
          </div>
          <p>Tax applies to the subtotal. The card fee applies to subtotal + tax. Both are pass-through charges, excluded from profit. Set either percentage to 0 when it does not apply. Confirm rates against the issued invoice.</p>
          {chargeError && <p role="status">{chargeError}</p>}
        </section>
        <section className="svc-section"><h3>Invoice allocations</h3>
          {invoice.allocations.map((allocation,index) => <div className="svc-allocation" key={allocation.job_id}>
            <label>Service call<select value={allocation.job_id} onChange={(e) => {
              const item = calls.find((row) => row.id === e.target.value);
              updateInvoice('allocations',invoice.allocations.map((row,i) => i === index ? {...row,job_id:item.id,expected_updated_at:item.updated_at} : row));
            }}>{calls.filter((row) => canInvoice(row) && (row.id === allocation.job_id || !invoice.allocations.some((a) => a.job_id === row.id))).map((row) =>
              <option key={row.id} value={row.id}>{row.service_call_number} — {row.name}</option>)}</select></label>
            <label>Allocated amount<input type="number" min={noChargeStage(calls.find(c=>c.id===allocation.job_id))?'0':'.01'} step=".01" value={allocation.amount} required onChange={(e) =>
              updateInvoice('allocations',invoice.allocations.map((row,i) => i === index ? {...row,amount:e.target.value} : row))} /></label>
            <button type="button" className="secondary-button" disabled={invoice.allocations.length === 1} onClick={() => updateInvoice('allocations',invoice.allocations.filter((_,i) => i !== index))}>Remove</button>
          </div>)}
          <div className="svc-actions"><button type="button" className="secondary-button" onClick={() => {
            const next = calls.find((row) => row.can_bill && row.status === 'complete' && !invoice.allocations.some((a) => a.job_id === row.id));
            if (next) updateInvoice('allocations',[...invoice.allocations,{job_id:next.id,amount:'',expected_updated_at:next.updated_at}]);
          }} disabled={!calls.some((row) => row.can_bill && row.status === 'complete' && !invoice.allocations.some((a) => a.job_id === row.id))}>Add another call</button>
          <strong>Unallocated: {invoiceRemaining === null ? 'Check amounts' : money(invoiceRemaining)}</strong></div>
          <p>Tax and card fees are distributed proportionately and reconciled to the cent. Allocate only the subtotal; each call shows its own share of all charges and payments.</p>
        </section>
        {charges?.total === 0 && <label className="svc-checkbox"><input type="checkbox" checked={invoice.certify_complete} onChange={e=>updateInvoice('certify_complete',e.target.checked)} />I confirm the work is complete and this Warranty / Pro-Bono call can be closed with no payment due.</label>}
        <button className="primary-button" disabled={invoiceRemaining !== 0 || !charges || (charges.total===0 && (!invoice.certify_complete || invoice.allocations.length!==1 || !noChargeStage(calls.find(c=>c.id===invoice.allocations[0]?.job_id))))}>Review & record invoice</button>
      </form>}
      {isFinancialMode && mode !== 'invoice' && call && <form onSubmit={saveCommercial}>
        <h2>{mode === 'quote' ? 'Estimate / quoted amount' : mode === 'cost' ? 'Update cumulative cost' : 'Record allocated payment'}</h2>
        <p>{mode === 'cost' ? 'Enter total costs to date, not just new costs. The previous snapshot remains in history. Inventory and timesheet amounts are not automatically added again.' :
          mode === 'payment' ? 'For a shared invoice, record only the payment allocated to this call, including its share of tax and card fees.' : 'Changes adjust the expected quoted amount, not invoices already recorded.'}</p>
        <div className="svc-grid">
          {mode === 'quote' && <>{field('quote_amount','Original estimate / quote','number')}{field('changes_amount','Approved changes (+ / −)','number')}</>}
          {mode === 'cost' && <>{field('labor_hard_cost','Labor cost to date','number',true)}{field('material_hard_cost','Material cost to date','number',true)}{field('other_hard_cost','Other cost to date','number',true)}{field('cost_through','Cost through','date',true)}
            {select('reconciliation_status','Cost status',{preliminary:'Preliminary',final:'Final'})}{field('source_note','Cost source / reason','text',true)}</>}
          {mode === 'payment' && <><label>Invoice<select required value={form.invoice_id || ''} onChange={(e) => change('invoice_id',e.target.value)}>
            <option value="">Select invoice</option>{posted.filter((item) => invoiceBalance(item) > 0).map((item) => <option value={item.id} key={item.id}>{item.invoice_number} — {money(invoiceBalance(item))} outstanding</option>)}
          </select></label>{field('amount','This call’s payment share','number',true)}{field('payment_date','Payment date','date',true)}{field('reference','Payment reference')}{field('note','Note')}</>}
        </div><button className="primary-button" type="submit">Save</button>
      </form>}
      {mode === 'browse' && !selectedId && <>
        {canViewFinance && <ServiceProfitSummary calls={all} period={period} onChange={setPeriod} today={today()} />}
        <Toolbar title="Service Call Directory" description="Row colors follow the work stage. Invoice Sent and Payment Received follow recorded billing; overdue balances remain flagged. Recording an invoice does not send it."
          search={<label><span className="sr-only">Search service calls</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, customer, scope or lead…" /></label>}
          actions={<div className="svc-actions"><label>View<select aria-label="View" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">All non-archived</option>{stages.filter(s=>s.key!=='archived' && (canViewFinance || s.kind==='work')).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}<option value="archived">{stages.find(s=>s.key==='archived')?.label || 'Archived'}</option>
          </select></label><button className="secondary-button" onClick={reload}>Refresh</button>
            {canCreate && canViewFinance && <button className="secondary-button" onClick={() => setMode('preview')}>Import preview</button>}
          </div>} />
        <nav className="jobs-directory-tabs" aria-label="Service call directory views">
          <button className={directoryView === 'operations' ? 'is-active' : ''} onClick={() => setDirectoryView('operations')}>Operations</button>
          {canViewFinance && <button className={directoryView === 'financials' ? 'is-active' : ''} onClick={() => setDirectoryView('financials')}>Financial scorecard</button>}
        </nav>
        {directoryView === 'financials' && canViewFinance && <div className="svc-actions" {...uiElementAttributes('MODULE','Service Scorecard')}>
          <label className="svc-checkbox"><input type="checkbox" checked={includeUndated} onChange={(e) => setIncludeUndated(e.target.checked)} />Show calls with no reporting date for review</label>
          <label className="svc-checkbox"><input type="checkbox" checked={attentionOnly} onChange={(e)=>setAttentionOnly(e.target.checked)} />Needs attention only</label>
          <button className="secondary-button" onClick={exportScorecard} {...uiElementAttributes('FUNCTION','Export Service Scorecard')}>Export CSV</button>
        </div>}
        <DataTable rows={directoryRows} getRowKey={(row) => row.id} selectedRowKey={panelId} rowClassName={() => 'svc-stage-row'} rowStyle={row=>stageRowStyle(stages.find(s=>s.key===statusFor(row).stage))} onRowClick={openDirectoryCall} minWidth="1100px" emptyTitle="No service calls in this view" columns={[
          {key:'service_call_number',header:'Call #',render:row=><button className="svc-call-link" onClick={event=>{event.stopPropagation();openDirectoryCall(row);}} aria-label={'Open service call '+row.service_call_number}>{row.service_call_number}</button>}, {key:'name',header:'Customer / call'}, {key:'division',header:'Department'},
          ...(directoryView === 'financials' && canViewFinance ? [
            {key:'reporting_date',header:'Reporting date',render:(row) => profitDate(row,period.basis) || 'Needs review'},
            ...[['revenue','Billed (ex tax)'],['cost','Cost'],['profit','Profit $'],['margin','Profit %'],['collected','Collected'],['outstanding','Outstanding']].map(([key,header]) => ({key,header,render:(row) => {
              const f = callFinancials(row); return isVoidCall(row) ? 'Void' : !f || (key === 'cost' && !f.costKnown) || f[key] === null ? '—' : key === 'margin' ? f[key].toFixed(1)+'%' : money(f[key]);
            }})),
            {key:'billing_status',header:'Billing',render:(row) => callFinancials(row)?.billingStatus || 'Restricted'},
            ...(attentionOnly ? [{key:'attention',header:'Needs attention',render:row=>serviceAttention(row,today()).join(' · ')}] : []),
          ] : [
            {key:'billing_method',header:'Billing type',render:(row) => BILLING_METHODS[row.profile?.billing_method] || 'Not set'},
            {key:'service_date',header:'Service date',render:(row) => row.profile?.service_date || '—'},
            {key:'lead_name',header:'Lead',render:(row) => row.profile?.lead_name || '—'},
          ]),
          {key:'work_stage',header:'Work stage',render:(row) => statusFor(row).label},
        ]} />
        {directoryView === 'financials' && canViewFinance && <ServiceMonthlyReport calls={all} period={period} today={today()} />}
      </>}
      {mode === 'browse' && call && <>
        <nav className="jobs-directory-tabs" aria-label="Service call workspace">
          <button className={tab === 'details' ? 'is-active' : ''} onClick={() => setTab('details')}>Details & linked calls</button>
          {call.financials && <button className={tab === 'billing' ? 'is-active' : ''} onClick={() => setTab('billing')}>Costs & Billing</button>}
          {!call.archived_at && ['assignments','documents','permits','transactions','schedule','history'].map((key) => <button key={key} onClick={() => onResources(call,key)}>{key==='permits'?'Permits & Inspections':key[0].toUpperCase()+key.slice(1)}</button>)}
        </nav>
        {call.archived_at && <StatePanel title="Archived service call" description={call.archive_reason || 'This call and its billing history are preserved. Editing is disabled.'} tone="neutral" />}
        {tab === 'details' && <>
          <Toolbar title={statusFor(call).label} actions={<div className="svc-actions">
            {call.can_manage && <button className="primary-button" onClick={startEdit}>Edit details / link call</button>}
            {call.can_manage && call.can_archive && <button className="secondary-button danger-button" onClick={() => setConfirm('archive')}>Archive</button>}
          </div>} />
          <dl className="svc-facts svc-grid">{[
            ['Billing type',BILLING_METHODS[call.profile?.billing_method]],['Business',call.profile?.business_name],
            ['Customer',[call.profile?.first_name,call.profile?.last_name].filter(Boolean).join(' ')],
            ['Contact',call.profile?.contact_name],['Phone',call.profile?.phone],['Billing email',call.profile?.billing_email],
            ['Service address',[call.address_line1,call.city,call.state,call.postal_code].filter(Boolean).join(', ')],
            ['Service date',call.profile?.service_date],['Lead',call.profile?.lead_name],['Scope',call.description],['Notes',call.notes],
          ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
          <section className="svc-section"><h3>Linked service calls</h3><p>{parent ? 'Original / related call: ' + parent.service_call_number : call.profile?.related_job_id ? 'Related call is outside this directory’s access.' : 'No original call linked.'} Links keep split work and follow-ups together; invoices are allocated separately.</p>
            <div className="svc-actions">{linked.map((item) => <button key={item.id} className="secondary-button" onClick={() => open(item)}>{item.service_call_number} — {item.name}{item.archived_at ? ' (archived)' : ''}</button>)}</div>
          </section>
        </>}
        {tab === 'billing' && financials && <>
          <AttachedEstimates jobId={call.id} permissions={permissions} onUseQuote={call.can_bill?(total)=>commercial('quote',{quote_amount:total,changes_amount:call.financials.changes_amount||0}):undefined}/>
          <div className="module-fact-grid">
            <SummaryCard label="Billed before tax" value={money(financials.revenue)} />
            <SummaryCard label="Cost to date" value={financials.costKnown ? money(financials.cost) : 'Not entered'} />
            <SummaryCard label="Gross profit" value={financials.profit === null ? 'Not available' : money(financials.profit)} detail={financials.margin === null ? 'Enter costs to calculate profit' : financials.margin.toFixed(1)+'% margin'} />
            <SummaryCard label="Collected" value={money(financials.collected)} detail="Includes allocated tax" />
            <SummaryCard label="Outstanding" value={money(financials.outstanding)} detail={financials.billingStatus} />
          </div>
          <Toolbar title="Estimate, costs & billing" description={'Estimate: '+(call.financials.quote_amount === null ? 'Not entered' : money(call.financials.quote_amount))+' · Changes: '+money(call.financials.changes_amount || 0)}
            actions={call.can_bill && <div className="svc-actions">
              <button className="secondary-button" onClick={() => commercial('quote',{quote_amount:call.financials.quote_amount ?? '',changes_amount:call.financials.changes_amount || 0})}>Edit estimate</button>
              <button className="secondary-button" onClick={() => {const c=call.financials.costs.find((item) => item.is_active); commercial('cost',{labor_hard_cost:c?.labor_hard_cost || 0,material_hard_cost:c?.material_hard_cost || 0,other_hard_cost:c?.other_hard_cost || 0,cost_through:today(),reconciliation_status:'preliminary',source_note:''});}}>Update costs</button>
              <button className="primary-button" disabled={!canInvoice(call) || !!call.profile?.financially_closed_at} onClick={startInvoice}>Record invoice</button>
              <button className="secondary-button" disabled={!posted.some((item) => invoiceBalance(item) > 0)} onClick={() => commercial('payment',{payment_date:today(),amount:'',invoice_id:''})}>Record payment</button>
            </div>} />
          {call.can_bill && !call.profile?.job_id && <p>Save the call’s details before entering costs or payments.</p>}
          {call.status !== 'complete' && !noChargeStage(call) && <p>Set the work stage to Complete / ready to invoice when work is finished to enable invoice recording.</p>}
          {noChargeStage(call) && <p>{call.profile?.financially_closed_at ? 'Closed with no payment due. Void the closeout invoice if this needs correction.' : 'Record a zero-dollar invoice when the work is complete to close this call with no payment due.'}</p>}
          <h3>Invoices — this call’s allocated share</h3>
          <DataTable rows={posted} getRowKey={(row) => row.id} minWidth="700px" emptyTitle="No invoices recorded" columns={[
            {key:'invoice_number',header:'Invoice'}, {key:'invoice_date',header:'Date'},{key:'due_date',header:'Due'},
            {key:'revenue_excluding_tax',header:'Before tax',render:(row) => money(row.revenue_excluding_tax)},
            {key:'sales_tax',header:'Tax',render:(row) => money(row.sales_tax)},
            {key:'credit_card_fee',header:'Card fee',render:(row) => money(row.credit_card_fee || 0)},
            {key:'total',header:'Total',render:(row) => money(Number(row.revenue_excluding_tax)+Number(row.sales_tax)+Number(row.credit_card_fee || 0))},
            {key:'outstanding',header:'Outstanding',render:(row) => money(invoiceBalance(row))},
            {key:'invoice_group_id',header:'Billing group',render:(row) => row.invoice_group_id ? 'Allocated invoice' : 'Existing invoice'},
            ...(call.can_bill ? [{key:'actions',header:'Actions',render:(row) => <button className="secondary-button danger-button" onClick={() => {setError('');setVoidTarget({kind:'invoice',id:row.id,label:row.invoice_number,shared:!!row.invoice_group_id});}}>Void invoice</button>}] : []),
          ]} />
          {posted.map((item) => <details className="svc-section" key={item.id}><summary>{item.invoice_number} — payment history</summary>
            <div className="svc-actions">{all.filter((other) => other.id !== call.id && item.invoice_group_id && other.financials?.invoices?.some((i) => i.invoice_group_id === item.invoice_group_id)).map((other) =>
              <button type="button" className="secondary-button" key={other.id} onClick={() => open(other)}>Same invoice: {other.service_call_number} — {other.name}</button>)}</div>
            <DataTable rows={item.payments || []} getRowKey={(row) => row.id} minWidth="500px" emptyTitle="No payments recorded" columns={[
              {key:'payment_date',header:'Date'},{key:'amount',header:'Allocated payment',render:(row) => money(row.amount)},{key:'reference',header:'Reference'},{key:'created_by',header:'Recorded by'},{key:'created_at',header:'Recorded at'},
              {key:'voided_at',header:'Status',render:(row) => row.voided_at ? 'Voided · '+row.void_reason+' · '+row.voided_at : 'Recorded'},
              ...(call.can_bill ? [{key:'actions',header:'Actions',render:(row) => !row.voided_at && <button className="secondary-button danger-button" onClick={() => {setError('');setVoidTarget({kind:'payment',id:row.id,label:money(row.amount)+' — '+item.invoice_number});}}>Void payment</button>}] : []),
            ]} />
          </details>)}
          <details className="svc-section"><summary>Voided invoices</summary>
            <DataTable rows={(call.financials.invoices || []).filter(item => item.status === 'void')} getRowKey={row=>row.id} minWidth="500px" emptyTitle="No voided invoices" columns={[
              {key:'invoice_number',header:'Invoice'},{key:'revenue_excluding_tax',header:'Original subtotal',render:row=>money(row.revenue_excluding_tax)},
              {key:'void_reason',header:'Reason'},{key:'voided_by',header:'Voided by'},{key:'voided_at',header:'Voided at'},
              {key:'payments',header:'Preserved payments',render:row=>(row.payments || []).map(p=>money(p.amount)+' — '+(p.void_reason || 'Historical payment')).join('; ') || 'None'},
            ]} />
          </details>
          <details className="svc-section"><summary>Cost history</summary><DataTable rows={call.financials.costs || []} getRowKey={(row) => row.id} minWidth="650px" emptyTitle="No cost snapshots" columns={[
            {key:'cost_through',header:'Through'},{key:'total_hard_cost',header:'Total to date',render:(row) => money(row.total_hard_cost)},
            {key:'source_note',header:'Source / reason'},{key:'reconciliation_status',header:'Status'},{key:'is_active',header:'Version',render:(row) => row.is_active ? 'Current' : 'Historical'},
          ]} /></details>
          <details className="svc-section"><summary>Financial audit history</summary><DataTable rows={call.financials.audit || []} getRowKey={(row) => row.created_at + row.note} minWidth="600px" emptyTitle="No financial changes recorded" columns={[
            {key:'created_at',header:'Recorded at'},{key:'user_name',header:'Recorded by'},{key:'note',header:'Action'},
          ]} /></details>
        </>}
      </>}
      </fieldset>
    </div>
    {!embedded && panelId && <Drawer open onClose={closePanel} title="Service call" eyebrow="Financial scorecard" description="Edit the call without leaving your scorecard." width="min(880px, 100vw)" closeLabel="Close service call panel" labelledById="service-scorecard-panel-title">
      <ServiceCallsWorkspace key={panelId} embedded permissions={permissions} initialJobId={panelId} onSaved={reload} onPanelState={setPanelState}
        onJobs={closePanel} onReturnList={()=>{requestAnimationFrame(()=>setPanelId(null));reload();}} onResources={(item,section)=>{setPanelId(null);onResources(item,section);}} />
    </Drawer>}
    <ConfirmDialog open={!!voidTarget} title={voidTarget?.kind === 'payment' ? 'Void payment?' : 'Void invoice?'}
      description={voidTarget?.kind === 'payment' ? 'Remove this payment from collected totals. This only corrects the recorded payment; it does not issue a refund. The original record and reason remain in history.' : 'Remove this invoice from billing totals. Any recorded payments must be voided first. Original records remain in history; no external invoice is cancelled.'}
      requireReason reasonHint="At least 3 characters. Recorded with your name and timestamp." tone="danger" confirmLabel={voidTarget?.kind === 'payment' ? 'Void payment' : 'Void invoice'} isSubmitting={busy}
      onCancel={()=>{setVoidTarget(null);setError('');}} onConfirm={reason=>write('svc_void_billing',{p_job_id:call.id,p_kind:voidTarget.kind,p_record_id:voidTarget.id,p_reason:reason,p_expected_updated_at:call.updated_at},'Billing record voided. Totals updated; history preserved.')}>
      <p>{voidTarget?.label}</p>
      {voidTarget?.shared && <p>This voids the entire shared invoice, including every linked call’s allocation. You must have billing permission on all those calls.</p>}
      {error && <p role="alert">{error}</p>}
    </ConfirmDialog>
    <ConfirmDialog open={discardPanel} title="Discard unsaved changes?" description="Your service call edits have not been saved. Keep editing or discard them and return to the scorecard." confirmLabel="Discard changes" cancelLabel="Keep editing"
      onCancel={()=>setDiscardPanel(false)} onConfirm={()=>{setDiscardPanel(false);requestAnimationFrame(()=>setPanelId(null));}} />
    <ConfirmDialog open={!!leaveAction} title="Discard unsaved changes?" description="These edits have not been saved." confirmLabel="Discard changes" cancelLabel="Keep editing"
      onCancel={()=>setLeaveAction(null)} onConfirm={()=>{const action=leaveAction;setLeaveAction(null);setDirty(false);action?.();}} />
    <ConfirmDialog open={confirm === 'archive'} title="Archive service call?" description="Linked calls, invoice allocations, payments and history will be preserved. The call moves to the Archived directory."
      confirmLabel="Archive" tone="danger" isSubmitting={busy} onCancel={() => setConfirm(null)}
      onConfirm={() => write('svc_archive_call',{p_job_id:call.id,p_reason:null,p_expected_updated_at:call.updated_at},'Service call archived.')} />
    <ConfirmDialog open={confirm === 'invoice'} title="Record the allocated invoice?" description="I confirm the invoice and each call’s allocated amount are correct. This records billing; it does not send an invoice."
      confirmLabel="Confirm & record" isSubmitting={busy} onCancel={() => setConfirm(null)}
      onConfirm={() => {if(!charges)return;const {requestId,...data}=invoice;write('svc_post_invoice',{p_request_id:requestId,p_data:{...data,sales_tax_percent:Number(data.sales_tax_percent),credit_card_percent:Number(data.credit_card_percent),sales_tax:charges.salesTax,credit_card_fee:charges.creditCardFee}},'Invoice recorded with reconciled call allocations.');}} >
      {charges && <p>Subtotal {money(charges.subtotal)} + sales tax {money(charges.salesTax)} + card fee {money(charges.creditCardFee)} = total {money(charges.total)}.</p>}
    </ConfirmDialog>
  </div>;
}
