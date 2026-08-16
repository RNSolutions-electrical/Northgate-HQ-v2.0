import { useAuth, useUser } from '@clerk/clerk-react';
import {
  ArrowLeft,
  Archive,
  Calculator,
  FileText,
  History,
  LockKeyhole,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { RecordHeader } from '../../components/ui/RecordHeader.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { WorkspaceTabs } from '../../components/ui/WorkspaceTabs.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_ESTIMATES = Object.freeze([]);
const EMPTY_ESTIMATE_HISTORY = Object.freeze([]);

const ESTIMATE_STATUS_OPTIONS = ['draft', 'pursuit', 'submitted', 'rejected'];

const DEFAULT_ESTIMATE_FORM = Object.freeze({
  id: '',
  estimate_number: '',
  title: '',
  customer_name: '',
  status: 'draft',
  bid_due_at: '',
  submitted_at: '',
  estimator_id: '',
  scope_summary: '',
  notes: '',
  archive_reason: '',
  isSaving: false,
  error: null,
  success: '',
});

const ESTIMATE_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'estimate_number',
  'title',
  'customer_name',
  'status',
  'bid_due_at',
  'submitted_at',
  'estimator_id',
  'scope_summary',
  'notes',
  'created_by',
].join(', ');

const ESTIMATE_VIEWS = [
  { key: 'all', label: 'All Estimates', icon: FileText, description: 'Every visible estimate.' },
  { key: 'mine', label: 'My Estimates', icon: UserRound, description: 'Estimates assigned to the current user.' },
  { key: 'drafts', label: 'Drafts', icon: Pencil, description: 'Draft and pursuit estimates.' },
  { key: 'submitted', label: 'Submitted', icon: Send, description: 'Sent estimates awaiting an outcome.' },
  { key: 'approved', label: 'Approved', icon: ShieldCheck, description: 'Reserved for locked approval snapshots.' },
];

const ESTIMATE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pricing', label: 'Pricing', disabled: true, meta: 'Deferred' },
  { key: 'documents', label: 'Documents', disabled: true, meta: 'Reserved' },
  { key: 'approval', label: 'Approval', disabled: true, meta: 'Reserved' },
  { key: 'history', label: 'History', meta: 'Live' },
];

const ESTIMATE_COLUMNS = [
  { key: 'estimate_number', header: 'Estimate #', render: (row) => <strong>{estimateLabel(row)}</strong> },
  { key: 'title', header: 'Title' },
  { key: 'customer_name', header: 'Customer', fallback: '-' },
  { key: 'division', header: 'Division' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status}>{formatEstimateStatus(row.status)}</StatusBadge>,
  },
  { key: 'bid_due_at', header: 'Bid Due', render: (row) => formatDate(row.bid_due_at) },
];

const ESTIMATE_HISTORY_COLUMNS = [
  { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
  { key: 'action', header: 'Action', render: (row) => formatEstimateHistoryAction(row.action) },
  { key: 'user_name', header: 'User', fallback: '-' },
  { key: 'changed_fields', header: 'Changed fields', render: (row) => formatChangedFields(row.changed_fields) },
  { key: 'note', header: 'Note', fallback: '-' },
];

const STATUS_RULES = [
  ['draft', 'In progress, not submitted.'],
  ['pursuit', 'Saved lead or opportunity, not an active job.'],
  ['submitted', 'Sent to the client.'],
  ['approved', 'Reserved for a future immutable approval snapshot workflow.'],
  ['rejected', 'Declined by the client.'],
  ['archived', 'Soft archived with a required reason and audit log.'],
];

function estimateLabel(estimate) {
  return estimate?.estimate_number || estimate?.title || estimate?.id || 'Estimate';
}

function formatEstimateStatus(status) {
  return (status || 'draft').replaceAll('_', ' ');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatEstimateHistoryAction(value) {
  switch (value) {
    case 'create':
      return 'Created';
    case 'update':
      return 'Updated';
    case 'archive':
      return 'Archived';
    case 'restore':
      return 'Restored';
    default:
      return value ? value.replaceAll('_', ' ') : '-';
  }
}

function formatChangedField(value) {
  switch (value) {
    case 'id':
    case 'division':
    case 'created_at':
    case 'updated_at':
      return '';
    case 'estimate_number':
      return 'estimate number';
    case 'customer_name':
      return 'customer';
    case 'bid_due_at':
      return 'bid due';
    case 'submitted_at':
      return 'submitted';
    case 'estimator_id':
      return 'estimator';
    case 'scope_summary':
      return 'scope summary';
    case 'created_by':
      return 'created by';
    case 'archived_at':
      return 'archived date';
    case 'archived_by':
      return 'archived by';
    case 'archive_reason':
      return 'archive reason';
    default:
      return value ? value.replaceAll('_', ' ') : '';
  }
}

function formatChangedFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return '-';
  const formatted = fields.map(formatChangedField).filter(Boolean);
  return formatted.length ? formatted.join(', ') : '-';
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function estimateSearchText(estimate) {
  return [
    estimate.estimate_number,
    estimate.title,
    estimate.customer_name,
    estimate.status,
    estimate.division,
    estimate.scope_summary,
    estimate.notes,
  ].filter(Boolean).join(' ').toLowerCase();
}

function estimateToForm(estimate) {
  return {
    ...DEFAULT_ESTIMATE_FORM,
    id: estimate.id,
    estimate_number: estimate.estimate_number ?? '',
    title: estimate.title ?? '',
    customer_name: estimate.customer_name ?? '',
    status: ESTIMATE_STATUS_OPTIONS.includes(estimate.status) ? estimate.status : 'draft',
    bid_due_at: formatDateInput(estimate.bid_due_at),
    submitted_at: formatDateInput(estimate.submitted_at),
    estimator_id: estimate.estimator_id ?? '',
    scope_summary: estimate.scope_summary ?? '',
    notes: estimate.notes ?? '',
  };
}

function estimatePayloadFromForm(form, permissions) {
  const status = ESTIMATE_STATUS_OPTIONS.includes(form.status) ? form.status : 'draft';

  return {
    estimate_number: form.estimate_number.trim() || null,
    title: form.title.trim(),
    customer_name: form.customer_name.trim() || null,
    status,
    bid_due_at: form.bid_due_at || null,
    submitted_at: status === 'submitted' ? (form.submitted_at || new Date().toISOString()) : form.submitted_at || null,
    estimator_id: form.estimator_id.trim() || permissions.userId || null,
    scope_summary: form.scope_summary.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function canEditEstimateDivision(permissions, rowDivision) {
  if (permissions?.permissionSource !== 'server' || permissions?.canEstimate !== true || !rowDivision) return false;
  if (['Developer', 'Manager'].includes(permissions?.role)) return true;
  return permissions?.division === rowDivision;
}

function useEstimateDirectory({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    estimates: EMPTY_ESTIMATES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled) {
        setState((current) => ({ ...current, isLoading: false }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('estimates')
          .select(ESTIMATE_SELECT_FIELDS)
          .order('updated_at', { ascending: false })
          .order('title', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            estimates: data ?? EMPTY_ESTIMATES,
          });
        }
      } catch (error) {
        console.error('Estimate directory failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            estimates: EMPTY_ESTIMATES,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

function useEstimateHistory({ enabled, estimateId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_ESTIMATE_HISTORY,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !estimateId) {
        setState({ isLoading: false, error: null, rows: EMPTY_ESTIMATE_HISTORY });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.rpc('read_estimate_change_history', {
          p_estimate_id: estimateId,
          p_limit: 100,
        });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows: data ?? EMPTY_ESTIMATE_HISTORY,
          });
        }
      } catch (error) {
        console.error('Estimate history failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            rows: EMPTY_ESTIMATE_HISTORY,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, estimateId, getToken, refreshKey]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

export function EstimatesWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const canReadEstimates = permissions?.permissionSource === 'server'
    && (permissions?.canEstimate === true || permissions?.canApproveEstimates === true);
  const directory = useEstimateDirectory({ enabled: canReadEstimates });
  const [activeView, setActiveView] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [mode, setMode] = useState('browse');
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [search, setSearch] = useState('');
  const [estimateForm, setEstimateForm] = useState(DEFAULT_ESTIMATE_FORM);
  const [estimateAction, setEstimateAction] = useState({ action: '', error: null, success: '' });
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const estimates = directory.estimates;
  const selectedView = ESTIMATE_VIEWS.find((item) => item.key === activeView) ?? ESTIMATE_VIEWS[0];
  const canEstimate = permissions?.canEstimate === true;
  const canCreateEstimate = canEstimate && Boolean(permissions?.division);
  const draftCount = estimates.filter((estimate) => ['draft', 'pursuit'].includes(estimate.status)).length;
  const submittedCount = estimates.filter((estimate) => estimate.status === 'submitted').length;
  const myEstimateCount = estimates.filter((estimate) => estimate.estimator_id === permissions.userId).length;

  const estimateViews = ESTIMATE_VIEWS.map((view) => {
    const badge = {
      all: estimates.length,
      mine: myEstimateCount,
      drafts: draftCount,
      submitted: submittedCount,
      approved: 0,
    }[view.key];
    return { ...view, badge };
  });

  const filteredEstimates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return estimates.filter((estimate) => {
      if (activeView === 'mine' && estimate.estimator_id !== permissions.userId) return false;
      if (activeView === 'drafts' && !['draft', 'pursuit'].includes(estimate.status)) return false;
      if (activeView === 'submitted' && estimate.status !== 'submitted') return false;
      if (activeView === 'approved') return false;
      if (!normalizedSearch) return true;
      return estimateSearchText(estimate).includes(normalizedSearch);
    });
  }, [activeView, estimates, permissions.userId, search]);

  const selectedEstimate = filteredEstimates.find((estimate) => estimate.id === selectedEstimateId)
    ?? estimates.find((estimate) => estimate.id === selectedEstimateId)
    ?? null;
  const estimateHistory = useEstimateHistory({
    enabled: permissions.permissionSource === 'server' && activeTab === 'history',
    estimateId: selectedEstimate?.id ?? '',
  });
  const canEditSelectedEstimate = canEditEstimateDivision(permissions, selectedEstimate?.division);
  const canArchiveSelectedEstimate = canEditSelectedEstimate && permissions?.canArchiveRecords === true;

  useEffect(() => {
    if (selectedEstimateId && !estimates.some((estimate) => estimate.id === selectedEstimateId)) {
      setSelectedEstimateId('');
      setActiveTab('overview');
    }
  }, [estimates, selectedEstimateId]);

  function selectEstimate(estimate) {
    setSelectedEstimateId(estimate.id);
    setActiveTab('overview');
    setMode('browse');
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function resetEstimateForm() {
    setEstimateForm(DEFAULT_ESTIMATE_FORM);
    setMode('browse');
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function startEstimateCreate() {
    setEstimateForm({
      ...DEFAULT_ESTIMATE_FORM,
      estimator_id: permissions.userId ?? '',
    });
    setSelectedEstimateId('');
    setMode('create');
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function startEstimateEdit(estimate) {
    setSelectedEstimateId(estimate.id);
    setEstimateForm(estimateToForm(estimate));
    setMode('edit');
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function setEstimateFormValue(key, value) {
    setEstimateForm((current) => ({ ...current, [key]: value, error: null, success: '' }));
  }

  async function getEstimateClient() {
    const token = await getToken({ template: 'supabase' });
    return createSupabaseClient(token);
  }

  async function writeEstimateChangeLog(client, { action, recordId, beforeData, afterData, note }) {
    const userId = user?.id || permissions.userId || null;
    const userName = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || permissions.userId || 'Unknown User';
    const { error } = await client
      .from('change_logs')
      .insert({
        user_id: userId,
        user_name: userName,
        table_name: 'estimates',
        record_id: recordId,
        action,
        before_data: beforeData,
        after_data: afterData,
        note,
      });

    if (error) throw error;
  }

  async function handleEstimateSave(event) {
    event.preventDefault();
    if (!canCreateEstimate || estimateForm.isSaving) return;

    if (!estimateForm.title.trim()) {
      setEstimateForm((current) => ({ ...current, error: new Error('Enter an estimate title before saving.') }));
      return;
    }

    const existingEstimate = estimateForm.id ? estimates.find((estimate) => estimate.id === estimateForm.id) : null;
    if (existingEstimate && !canEditEstimateDivision(permissions, existingEstimate.division)) {
      setEstimateForm((current) => ({ ...current, error: new Error('This estimate belongs to another division, so your current session cannot edit it.') }));
      return;
    }

    setEstimateForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const client = await getEstimateClient();
      const payload = estimatePayloadFromForm(estimateForm, permissions);
      const query = estimateForm.id
        ? client
          .from('estimates')
          .update(payload)
          .eq('id', estimateForm.id)
          .select(ESTIMATE_SELECT_FIELDS)
          .single()
        : client
          .from('estimates')
          .insert({ ...payload, division: permissions.division, created_by: permissions.userId })
          .select(ESTIMATE_SELECT_FIELDS)
          .single();

      const { data, error } = await query;
      if (error) throw error;

      await writeEstimateChangeLog(client, {
        action: estimateForm.id ? 'update' : 'create',
        recordId: data?.id || estimateForm.id,
        beforeData: existingEstimate,
        afterData: data,
        note: estimateForm.id ? `${estimateLabel(data)} updated.` : `${estimateLabel(data)} created.`,
      });

      directory.reload();
      estimateHistory.reload();
      setSelectedEstimateId(data?.id ?? estimateForm.id);
      setMode('browse');
      setEstimateForm(DEFAULT_ESTIMATE_FORM);
      setEstimateAction({ action: '', error: null, success: `${estimateLabel(data)} saved.` });
    } catch (error) {
      console.error('Estimate save failed', error);
      setEstimateForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleEstimateArchive() {
    if (!selectedEstimate || estimateAction.action) return;

    if (!canArchiveSelectedEstimate) {
      setEstimateAction({
        action: '',
        error: new Error('Estimate archive requires estimate edit scope and can_archive_records permission.'),
        success: '',
      });
      return;
    }

    const reason = window.prompt(`Archive "${estimateLabel(selectedEstimate)}"? Enter a reason.`);
    if (!reason?.trim()) return;

    setEstimateAction({ action: 'archive', error: null, success: '' });

    try {
      const client = await getEstimateClient();
      const { error } = await client.rpc('archive_estimate', {
        p_estimate_id: selectedEstimate.id,
        p_reason: reason.trim(),
      });

      if (error) throw error;

      const archivedLabel = estimateLabel(selectedEstimate);
      setSelectedEstimateId('');
      setActiveTab('overview');
      setMode('browse');
      setEstimateForm(DEFAULT_ESTIMATE_FORM);
      setEstimateAction({ action: '', error: null, success: `${archivedLabel} archived.` });
      directory.reload();
      estimateHistory.reload();
    } catch (error) {
      console.error('Estimate archive failed', error);
      setEstimateAction({ action: '', error, success: '' });
    }
  }

  const estimateColumns = [
    ...ESTIMATE_COLUMNS,
    {
      key: 'actions',
      header: 'Actions',
      width: '110px',
      render: (row) => (
        <button
          type="button"
          className="secondary-button"
          onClick={(event) => {
            event.stopPropagation();
            startEstimateEdit(row);
          }}
          disabled={!canEditEstimateDivision(permissions, row.division)}
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Estimates"
        description="Live estimate directory foundation with division-scoped create, edit, archive, and audit history. Pricing, approval snapshots, and documents remain reserved."
        status={<span className="status-pill">{mode === 'create' ? 'Create mode' : `${estimates.length} visible estimate${estimates.length === 1 ? '' : 's'}`}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={directory.reload} disabled={directory.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button" onClick={startEstimateCreate} disabled={!canCreateEstimate || estimateForm.isSaving}>
              <Plus aria-hidden="true" /> Create Estimate
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Visible estimates" value={estimates.length} detail={directory.isLoading ? 'Loading directory' : 'Division-scoped rows'} />
        <SummaryCard label="Draft/Pursuit" value={draftCount} detail="Editable pipeline" />
        <SummaryCard label="Submitted" value={submittedCount} detail="Awaiting outcome" tone={submittedCount ? 'accent' : 'default'} />
        <SummaryCard label="Archive access" value={permissions?.canArchiveRecords ? 'Granted' : 'Hidden'} detail="Reason required" tone={permissions?.canArchiveRecords ? 'good' : 'warn'} developmentOnly />
      </div>

      {estimateAction.error ? (
        <StatePanel tone="danger" eyebrow="Estimate Action Failed" title="Estimate action did not complete" description={estimateAction.error.message || 'Unexpected estimate error.'} compact />
      ) : null}
      {estimateAction.success ? (
        <StatePanel tone="success" eyebrow="Saved" title="Estimate action complete" description={estimateAction.success} compact />
      ) : null}

      <div className={`workspace-split estimates-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Estimate Views"
          title="Estimates"
          description="Browse live estimate directory rows."
          items={estimateViews}
          activeKey={activeView}
          onSelect={(key) => {
            setActiveView(key);
            setMode('browse');
          }}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Directory foundation</strong>
              <p>Archive and history are live. Pricing, approval snapshots, and documents stay reserved.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Directory"
              title={selectedView.label}
              description="Rows come from the live estimates table and follow estimate permission plus level/division scope."
              search={(
                <label>
                  <span className="sr-only">Search estimates</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search estimates..."
                  />
                </label>
              )}
              actions={(
                <button type="button" className="secondary-button" onClick={() => setSearch('')} disabled={!search}>
                  Clear
                </button>
              )}
            />

            <DataTable
              columns={estimateColumns}
              rows={filteredEstimates}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={directory.isLoading}
              error={directory.error}
              onRowClick={selectEstimate}
              selectedRowKey={selectedEstimate?.id ?? null}
              dense
              minWidth="820px"
              emptyTitle={search ? 'No estimates matched this search' : activeView === 'approved' ? 'Approval snapshots are not wired yet' : 'No estimates are visible'}
              emptyDescription={search
                ? 'Try searching by estimate number, title, customer, status, division, or scope.'
                : activeView === 'approved'
                  ? 'Approved estimates require the future locked snapshot workflow before rows appear here.'
                  : 'Create the first estimate when you have estimate permission and a current division.'}
            />
          </article>

          <article className="card workspace-card">
            {mode === 'create' || mode === 'edit' ? (
              <form className="tool-catalogue-form" onSubmit={handleEstimateSave}>
                <Toolbar
                  eyebrow={mode === 'edit' ? 'Edit' : 'Create'}
                  title={mode === 'edit' ? 'Edit estimate' : 'Create estimate'}
                  description={canCreateEstimate
                    ? `Estimate writes will save to ${mode === 'edit' && selectedEstimate ? selectedEstimate.division : permissions.division}.`
                    : 'Estimate writes require estimate permission and a current division.'}
                  actions={(
                    <button type="button" className="secondary-button" onClick={resetEstimateForm} disabled={estimateForm.isSaving}>
                      <ArrowLeft aria-hidden="true" /> Back
                    </button>
                  )}
                  dense
                />

                <div className="tool-catalogue-form__grid">
                  <label>
                    <span>Title</span>
                    <input type="text" value={estimateForm.title} onChange={(event) => setEstimateFormValue('title', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} required />
                  </label>
                  <label>
                    <span>Estimate #</span>
                    <input type="text" value={estimateForm.estimate_number} onChange={(event) => setEstimateFormValue('estimate_number', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} />
                  </label>
                  <label>
                    <span>Customer</span>
                    <input type="text" value={estimateForm.customer_name} onChange={(event) => setEstimateFormValue('customer_name', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} />
                  </label>
                  <label>
                    <span>Status</span>
                    <select value={estimateForm.status} onChange={(event) => setEstimateFormValue('status', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving}>
                      {ESTIMATE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatEstimateStatus(status)}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Bid Due</span>
                    <input type="date" value={estimateForm.bid_due_at} onChange={(event) => setEstimateFormValue('bid_due_at', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} />
                  </label>
                  <label>
                    <span>Submitted</span>
                    <input type="date" value={estimateForm.submitted_at} onChange={(event) => setEstimateFormValue('submitted_at', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} />
                  </label>
                  <label className="tool-catalogue-form__wide">
                    <span>Scope Summary</span>
                    <textarea rows={3} value={estimateForm.scope_summary} onChange={(event) => setEstimateFormValue('scope_summary', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} />
                  </label>
                  <label className="tool-catalogue-form__wide">
                    <span>Notes</span>
                    <textarea rows={3} value={estimateForm.notes} onChange={(event) => setEstimateFormValue('notes', event.target.value)} disabled={!canCreateEstimate || estimateForm.isSaving} />
                  </label>
                </div>

                {estimateForm.error ? (
                  <StatePanel tone="danger" eyebrow="Estimate Save Failed" title="Estimate action did not complete" description={estimateForm.error.message || 'Unexpected estimate error.'} compact />
                ) : null}
                {estimateForm.success ? (
                  <StatePanel tone="success" eyebrow="Saved" title="Estimate updated" description={estimateForm.success} compact />
                ) : null}
                <div className="tool-catalogue-form__actions">
                  <button type="submit" className="primary-button" disabled={!canCreateEstimate || estimateForm.isSaving || !estimateForm.title.trim()}>
                    <Plus aria-hidden="true" /> {estimateForm.isSaving ? 'Saving...' : mode === 'edit' ? 'Save Estimate' : 'Create Estimate'}
                  </button>
                </div>
              </form>
            ) : selectedEstimate ? (
              <>
                <RecordHeader
                  eyebrow="Selected Estimate"
                  title={estimateLabel(selectedEstimate)}
                  description={selectedEstimate.scope_summary || 'Estimate detail foundation. Pricing, approval, and documents are reserved.'}
                  meta={[
                    { label: 'Customer', value: selectedEstimate.customer_name || '-' },
                    { label: 'Division', value: selectedEstimate.division },
                    { label: 'Status', value: formatEstimateStatus(selectedEstimate.status) },
                  ]}
                />
                <WorkspaceTabs
                  tabs={ESTIMATE_TABS}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Estimate detail sections"
                />
                {activeTab === 'history' ? (
                  <>
                    <div className="summary-grid summary-grid--compact">
                      <SummaryCard label="Audit Entries" value={estimateHistory.rows.length} detail="Recent estimate changes" />
                      <SummaryCard label="Updates" value={estimateHistory.rows.filter((row) => row.action === 'update').length} detail="Recorded edits" />
                      <SummaryCard label="Created" value={estimateHistory.rows.filter((row) => row.action === 'create').length} detail="Creation entries" />
                    </div>
                    <Toolbar
                      eyebrow="Audit"
                      title="Estimate History"
                      description="Read-only audit entries for this estimate directory row."
                      actions={(
                        <button type="button" className="secondary-button" onClick={estimateHistory.reload} disabled={estimateHistory.isLoading}>
                          <History aria-hidden="true" /> Refresh History
                        </button>
                      )}
                      dense
                    />
                    <DataTable
                      columns={ESTIMATE_HISTORY_COLUMNS}
                      rows={estimateHistory.rows}
                      getRowKey={(row) => row.id}
                      permissions={permissions}
                      isLoading={estimateHistory.isLoading}
                      error={estimateHistory.error}
                      dense
                      minWidth="940px"
                      emptyTitle="No estimate history yet"
                      emptyDescription="Future create and edit actions for this estimate will appear here."
                    />
                  </>
                ) : (
                  <>
                    <div className="module-fact-grid estimates-fact-grid">
                      <SummaryCard label="Bid due" value={formatDate(selectedEstimate.bid_due_at)} detail="Directory field" />
                      <SummaryCard label="Submitted" value={formatDate(selectedEstimate.submitted_at)} detail="Directory field" />
                      <SummaryCard label="Editable" value={canEditSelectedEstimate ? 'Yes' : 'No'} detail="Level/division scope" tone={canEditSelectedEstimate ? 'good' : 'warn'} />
                    </div>
                    <div className="tool-catalogue-form__actions">
                      <button type="button" className="primary-button" onClick={() => startEstimateEdit(selectedEstimate)} disabled={!canEditSelectedEstimate}>
                        <Pencil aria-hidden="true" /> Edit Estimate
                      </button>
                      <button type="button" className="secondary-button secondary-button--danger" onClick={handleEstimateArchive} disabled={!canArchiveSelectedEstimate || estimateAction.action === 'archive'}>
                        <Archive aria-hidden="true" /> {estimateAction.action === 'archive' ? 'Archiving...' : 'Archive'}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <StatePanel
                eyebrow="No Selection"
                title="Select an estimate to open the detail workspace"
                description="The selected-estimate header and detail tabs appear here when you choose a row from the live directory."
                tone="neutral"
              />
            )}
          </article>

          <section className="estimates-boundary-grid">
            <StatePanel
              eyebrow="Snapshot Boundary"
              title="Approved snapshots stay immutable"
              description="Approval remains deferred until it can create a locked snapshot and enforce database-level immutability."
              tone="good"
              compact
              actions={<LockKeyhole aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Status Model"
              title="Directory statuses are active"
              description="Draft, pursuit, submitted, rejected, and archived are active directory states. Approved remains reserved for locked snapshots."
              tone="neutral"
              compact
              actions={<History aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Approval Flow"
              title="Approval remains deferred"
              description="Approving an estimate must create a locked snapshot. This pass adds no approval button, shortcut, or hidden write fallback."
              tone="warning"
              compact
              actions={<Calculator aria-hidden="true" />}
            />
          </section>

          <article className="card workspace-card">
            <Toolbar
              eyebrow="Locked Vocabulary"
              title="Estimate statuses"
              description="These labels preserve the planned estimate lifecycle while the first live directory fields come online."
              dense
            />
            <div className="estimates-status-list">
              {STATUS_RULES.map(([status, description]) => (
                <div className="profile-field" key={status}>
                  <span>{status}</span>
                  <strong>{description}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
