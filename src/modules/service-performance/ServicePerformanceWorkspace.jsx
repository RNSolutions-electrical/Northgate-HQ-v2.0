import { useAuth } from '@clerk/clerk-react';
import { BarChart3, BriefcaseBusiness, Download, Gauge, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { servicePerformanceTotals, weightedGrossMargin } from './servicePerformanceMath.js';

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const EMPTY_COST_FORM = { job_id: '', labor_hard_cost: '', material_hard_cost: '', other_hard_cost: '', cost_through: new Date().toISOString().slice(0, 10), reconciliation_status: 'preliminary', source_note: '', isSaving: false, error: null, success: '' };

function money(value) { return MONEY.format(Number(value) || 0); }
function margin(value) { return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`; }
function displayJob(row) { return row.service_call_number || row.job_number || 'Unnumbered'; }
function statusFor(row) {
  if (row.financially_closed_at) return 'Closed';
  if (Number(row.outstanding) > 0 && Number(row.collected) > 0) return 'Partially paid';
  if (Number(row.outstanding) > 0) return 'Invoiced';
  if (Number(row.invoiced_revenue) > 0) return 'Paid';
  if (row.completed_at || row.job_status === 'complete') return 'Ready to invoice';
  return row.job_status === 'active' ? 'Open' : row.job_status;
}
function statusTone(value) { return value === 'Paid' || value === 'Closed' ? 'good' : value === 'Invoiced' || value === 'Partially paid' || value === 'Ready to invoice' ? 'warn' : 'neutral'; }
function csvCell(value) { const text = String(value ?? ''); const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"`; }

const CALL_COLUMNS = [
  { key: 'job_number', header: 'Service Call', render: (row) => <strong>{displayJob(row)}</strong> },
  { key: 'customer_name', header: 'Customer / Scope', render: (row) => <div className="service-performance__call"><strong>{row.customer_name}</strong><span>{row.scope || 'No scope recorded'}</span></div> },
  { key: 'status', header: 'Status', render: (row) => { const value = statusFor(row); return <StatusBadge tone={statusTone(value)}>{value}</StatusBadge>; } },
  { key: 'invoiced_revenue', header: 'Revenue', align: 'right', render: (row) => money(row.invoiced_revenue) },
  { key: 'total_hard_cost', header: 'Hard Cost', align: 'right', render: (row) => money(row.total_hard_cost) },
  { key: 'gross_profit', header: 'Gross Profit', align: 'right', render: (row) => <span className={Number(row.gross_profit) < 0 ? 'service-performance__negative' : ''}>{money(row.gross_profit)}</span> },
  { key: 'gross_margin', header: 'Margin', align: 'right', render: (row) => <span className={Number(row.gross_margin) < 0 ? 'service-performance__negative' : ''}>{margin(row.gross_margin)}</span> },
  { key: 'outstanding', header: 'Outstanding', align: 'right', render: (row) => money(row.outstanding) },
];

const COST_COLUMNS = [
  { key: 'created_at', header: 'Recorded', render: (row) => new Date(row.created_at).toLocaleString() },
  { key: 'job_id', header: 'Service Call', render: (row) => row.job_label },
  { key: 'source_type', header: 'Source', render: (row) => <StatusBadge tone="neutral">{row.source_type}</StatusBadge> },
  { key: 'cost_through', header: 'Cost Through' },
  { key: 'labor_hard_cost', header: 'Labor', align: 'right', render: (row) => money(row.labor_hard_cost) },
  { key: 'material_hard_cost', header: 'Material', align: 'right', render: (row) => money(row.material_hard_cost) },
  { key: 'total_hard_cost', header: 'Total', align: 'right', render: (row) => money(row.total_hard_cost) },
  { key: 'is_active', header: 'Authority', render: (row) => <StatusBadge tone={row.is_active ? 'good' : 'neutral'}>{row.is_active ? 'Current' : 'Historical'}</StatusBadge> },
];

const REPORT_COLUMNS = [
  { key: 'performance_month', header: 'Month' },
  { key: 'call_count', header: 'Calls', align: 'right' },
  { key: 'invoiced_revenue', header: 'Revenue', align: 'right', render: (row) => money(row.invoiced_revenue) },
  { key: 'total_hard_cost', header: 'Hard Cost', align: 'right', render: (row) => money(row.total_hard_cost) },
  { key: 'gross_profit', header: 'Gross Profit', align: 'right', render: (row) => money(row.gross_profit) },
  { key: 'gross_margin', header: 'Weighted Margin', align: 'right', render: (row) => margin(row.gross_margin) },
  { key: 'collected', header: 'Collected', align: 'right', render: (row) => money(row.collected) },
];

export function ServicePerformanceWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const [page, setPage] = useState('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ isLoading: true, error: null, calls: [], costs: [], months: [] });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [costForm, setCostForm] = useState(EMPTY_COST_FORM);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setState((current) => ({ ...current, isLoading: true, error: null }));
      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const [calls, costs, months] = await Promise.all([
          client.from('svc_call_financials').select('*').order('created_at', { ascending: false }),
          client.from('svc_cost_snapshots').select('*').order('created_at', { ascending: false }),
          client.from('svc_monthly_performance').select('*').order('performance_month', { ascending: false }),
        ]);
        if (calls.error) throw calls.error;
        if (costs.error) throw costs.error;
        if (months.error) throw months.error;
        if (mounted) setState({ isLoading: false, error: null, calls: calls.data ?? [], costs: costs.data ?? [], months: months.data ?? [] });
      } catch (error) {
        console.error('Service Performance failed to load', error);
        if (mounted) setState({ isLoading: false, error, calls: [], costs: [], months: [] });
      }
    }
    load();
    return () => { mounted = false; };
  }, [getToken, refreshKey]);

  const filteredCalls = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return state.calls.filter((row) => (statusFilter === 'all' || statusFor(row) === statusFilter) && (!needle || [displayJob(row), row.customer_name, row.scope, row.location].join(' ').toLowerCase().includes(needle)));
  }, [search, state.calls, statusFilter]);
  const selected = state.calls.find((row) => row.job_id === selectedId) ?? null;
  const jobMap = useMemo(() => new Map(state.calls.map((row) => [row.job_id, displayJob(row)])), [state.calls]);
  const costRows = state.costs.map((row) => ({ ...row, job_label: jobMap.get(row.job_id) || row.job_id }));
  const totals = useMemo(() => servicePerformanceTotals(state.calls), [state.calls]);
  const weightedMargin = useMemo(() => weightedGrossMargin(state.calls), [state.calls]);

  function updateCost(key, value) { setCostForm((current) => ({ ...current, [key]: value, error: null, success: '' })); }

  async function saveCost(event) {
    event.preventDefault();
    if (costForm.isSaving || !costForm.job_id || costForm.source_note.trim().length < 3) return;
    setCostForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('svc_create_manual_cost_snapshot', { p_job_id: costForm.job_id, p_labor_hard_cost: Number(costForm.labor_hard_cost || 0), p_material_hard_cost: Number(costForm.material_hard_cost || 0), p_other_hard_cost: Number(costForm.other_hard_cost || 0), p_cost_through: costForm.cost_through, p_reconciliation_status: costForm.reconciliation_status, p_source_note: costForm.source_note.trim() });
      if (error) throw error;
      setCostForm({ ...EMPTY_COST_FORM, success: 'The cumulative cost snapshot is now authoritative.' });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Manual service cost save failed', error);
      setCostForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  function exportCsv() {
    const headers = ['Service Call','Customer','Location','Status','Revenue Excluding Tax','Collected','Labor Hard Cost','Material Hard Cost','Other Hard Cost','Total Hard Cost','Gross Profit','Gross Margin','Outstanding'];
    const rows = filteredCalls.map((row) => [displayJob(row),row.customer_name,row.location,statusFor(row),row.invoiced_revenue,row.collected,row.labor_hard_cost,row.material_hard_cost,row.other_hard_cost,row.total_hard_cost,row.gross_profit,row.gross_margin,row.outstanding]);
    const blob = new Blob([`\uFEFF${[headers,...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href=url; anchor.download=`northgate-service-performance-${new Date().toISOString().slice(0,10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <>
    <WorkspaceHeader eyebrow="Electrical Add-On" title="Service Performance" description="Service-call hard costs, revenue, margin, billing, and collections—using cumulative snapshots and revenue excluding sales tax." status={<span className="status-pill status-pill--good">Add-on enabled</span>} />
    <nav className="service-performance__nav" aria-label="Service Performance sections">
      {[["overview","Overview",Gauge],["calls","Service Calls",BriefcaseBusiness],["costs","Cost Snapshots",Upload],["reports","Reports",BarChart3]].map(([key,label,Icon]) => <button type="button" key={key} className={page===key?'is-active':''} onClick={() => setPage(key)} aria-current={page===key?'page':undefined}><Icon aria-hidden="true" />{label}</button>)}
      <button type="button" className="service-performance__refresh" onClick={() => setRefreshKey((current) => current + 1)} disabled={state.isLoading}><RefreshCw aria-hidden="true" /> Refresh</button>
    </nav>
    {state.error ? <div className="service-performance__page"><StatePanel tone="danger" title="Service Performance could not be loaded" description={state.error.message} /></div> : null}
    {!state.error && page==='overview' ? <main className="service-performance__page">
      <div className="service-performance__status"><div><span>Service Calls</span><strong>{state.calls.length}</strong></div><div><span>Revenue</span><strong>{money(totals.revenue)}</strong></div><div><span>Hard Cost</span><strong>{money(totals.cost)}</strong></div><div><span>Gross Profit</span><strong className={totals.profit<0?'service-performance__negative':''}>{money(totals.profit)}</strong></div><div><span>Weighted Margin</span><strong className={weightedMargin<0?'service-performance__negative':''}>{margin(weightedMargin)}</strong></div><div><span>Outstanding</span><strong>{money(totals.outstanding)}</strong></div></div>
      <Toolbar eyebrow="Attention" title="Operational exceptions" description="Direct links to service calls requiring billing, reconciliation, or collection follow-up." />
      <div className="service-performance__attention">{state.calls.filter((row) => ['Ready to invoice','Partially paid','Invoiced'].includes(statusFor(row)) || (row.gross_margin !== null && Number(row.gross_margin)<30)).slice(0,8).map((row) => <button type="button" key={row.job_id} onClick={() => setSelectedId(row.job_id)}><strong>{displayJob(row)} · {row.customer_name}</strong><span>{statusFor(row)} · {margin(row.gross_margin)} margin · {money(row.outstanding)} outstanding</span><b>Review</b></button>)}</div>
      <Toolbar eyebrow="Recent Activity" title="Service-call performance" description="Most recently created service calls visible within your authorized division scope." />
      <DataTable columns={CALL_COLUMNS} rows={state.calls.slice(0,6)} getRowKey={(row)=>row.job_id} permissions={permissions} isLoading={state.isLoading} dense minWidth="980px" onRowClick={(row)=>setSelectedId(row.job_id)} selectedRowKey={selectedId} emptyTitle="No service calls" emptyDescription="Create service-call Jobs in the Jobs workspace to begin tracking performance." />
    </main> : null}
    {!state.error && page==='calls' ? <main className="service-performance__page"><Toolbar eyebrow="Register" title="Service calls" description="Filtered service financial register. Select a row for cost, billing, and collection detail." actions={<button type="button" className="secondary-button" onClick={exportCsv}><Download aria-hidden="true" /> Export CSV</button>} /><div className="service-performance__filters"><label><span>Search</span><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Job, customer, scope, or location" /></label><label><span>Status</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['Open','Ready to invoice','Invoiced','Partially paid','Paid','Closed'].map((value)=><option key={value}>{value}</option>)}</select></label><p>{filteredCalls.length} of {state.calls.length} calls</p></div><DataTable columns={CALL_COLUMNS} rows={filteredCalls} getRowKey={(row)=>row.job_id} permissions={permissions} isLoading={state.isLoading} dense minWidth="1080px" onRowClick={(row)=>setSelectedId(row.job_id)} selectedRowKey={selectedId} emptyTitle="No service calls matched" emptyDescription="Adjust the search or status filter." /></main> : null}
    {!state.error && page==='costs' ? <main className="service-performance__page"><Toolbar eyebrow="Cumulative Costs" title="Authoritative cost snapshots" description="A newer active snapshot replaces the prior total. Snapshots are never added together, and history remains visible." /><form className="service-performance__cost-form" onSubmit={saveCost}><label><span>Service call</span><select value={costForm.job_id} onChange={(event)=>updateCost('job_id',event.target.value)} required><option value="">Choose service call</option>{state.calls.map((row)=><option key={row.job_id} value={row.job_id}>{displayJob(row)} — {row.customer_name}</option>)}</select></label><label><span>Cost through</span><input type="date" value={costForm.cost_through} onChange={(event)=>updateCost('cost_through',event.target.value)} required /></label><label><span>Labor hard cost</span><input type="number" min="0" step="0.01" value={costForm.labor_hard_cost} onChange={(event)=>updateCost('labor_hard_cost',event.target.value)} /></label><label><span>Material hard cost</span><input type="number" min="0" step="0.01" value={costForm.material_hard_cost} onChange={(event)=>updateCost('material_hard_cost',event.target.value)} /></label><label><span>Other hard cost</span><input type="number" min="0" step="0.01" value={costForm.other_hard_cost} onChange={(event)=>updateCost('other_hard_cost',event.target.value)} /></label><label><span>Reconciliation</span><select value={costForm.reconciliation_status} onChange={(event)=>updateCost('reconciliation_status',event.target.value)}><option value="preliminary">Preliminary</option><option value="final">Final</option></select></label><label className="service-performance__cost-note"><span>Source / explanation</span><textarea rows={2} maxLength={1000} value={costForm.source_note} onChange={(event)=>updateCost('source_note',event.target.value)} placeholder="Required source or adjustment note" /></label><button type="submit" className="primary-button" disabled={costForm.isSaving || !costForm.job_id || costForm.source_note.trim().length<3}>{costForm.isSaving?'Saving...':'Activate Snapshot'}</button></form>{costForm.error?<StatePanel tone="danger" title="Cost snapshot was not saved" description={costForm.error.message} compact />:null}{costForm.success?<StatePanel tone="success" title="Cost snapshot activated" description={costForm.success} compact />:null}<DataTable columns={COST_COLUMNS} rows={costRows} getRowKey={(row)=>row.id} permissions={permissions} isLoading={state.isLoading} dense minWidth="940px" emptyTitle="No cost snapshots" emptyDescription="Enter the first cumulative manual snapshot above. Import preview will arrive in a later milestone." /></main> : null}
    {!state.error && page==='reports' ? <main className="service-performance__page"><Toolbar eyebrow="Reporting" title="Monthly performance" description="Margin is weighted as total gross profit divided by total revenue. Job-level percentages are never averaged." /><DataTable columns={REPORT_COLUMNS} rows={state.months} getRowKey={(row)=>row.performance_month} permissions={permissions} isLoading={state.isLoading} dense minWidth="860px" emptyTitle="No report periods" emptyDescription="Monthly performance appears after service calls contain financial activity." /><StatePanel tone="neutral" eyebrow="Financial Boundary" title="Invoice and payment posting comes next" description="The foundation tables are ready, but this milestone does not invent invoice or payment data. Revenue and collections remain zero until those controlled workflows are implemented." compact /></main> : null}
    <Drawer open={Boolean(selected)} onClose={()=>setSelectedId(null)} eyebrow="Service Call" title={selected?`${displayJob(selected)} · ${selected.customer_name}`:''} description={selected?.scope || ''} width="min(680px, 100vw)">{selected?<div className="service-performance__detail"><div className="service-performance__detail-status"><StatusBadge tone={statusTone(statusFor(selected))}>{statusFor(selected)}</StatusBadge><span>{selected.location || 'Location not recorded'}</span></div><dl><div><dt>Revenue excluding tax</dt><dd>{money(selected.invoiced_revenue)}</dd></div><div><dt>Collected</dt><dd>{money(selected.collected)}</dd></div><div><dt>Outstanding</dt><dd>{money(selected.outstanding)}</dd></div><div><dt>Labor hard cost</dt><dd>{money(selected.labor_hard_cost)}</dd></div><div><dt>Material hard cost</dt><dd>{money(selected.material_hard_cost)}</dd></div><div><dt>Other hard cost</dt><dd>{money(selected.other_hard_cost)}</dd></div><div><dt>Gross profit</dt><dd className={Number(selected.gross_profit)<0?'service-performance__negative':''}>{money(selected.gross_profit)}</dd></div><div><dt>Gross margin</dt><dd className={Number(selected.gross_margin)<0?'service-performance__negative':''}>{margin(selected.gross_margin)}</dd></div></dl><p>Current cost source: {selected.reconciliation_status || 'No active cost snapshot'}{selected.cost_through?` through ${selected.cost_through}`:''}.</p></div>:null}</Drawer>
  </>;
}
