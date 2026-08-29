import { useAuth } from '@clerk/clerk-react';
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_REPORT_DATA = Object.freeze({
  jobs: [],
  budgetLines: [],
  documents: [],
  estimates: [],
  inventoryActivity: [],
});

const REPORT_SECTIONS = [
  {
    key: 'library',
    label: 'Report Library',
    icon: BarChart3,
    description: 'Live read-only reports and reserved report surfaces.',
  },
  {
    key: 'access',
    label: 'Access Snapshot',
    icon: ShieldCheck,
    description: 'Current permission context in report form.',
  },
  {
    key: 'operations',
    label: 'Operational Sources',
    icon: ClipboardList,
    description: 'Read-model status for report sources.',
  },
];

const ACCESS_GROUPS = [
  ['Reports', ['canViewReports', 'canViewAllDivisions']],
  ['Financials', ['canViewFinancials', 'canApproveBudget']],
  ['Inventory', ['canManageInventory', 'canInventoryTransactions', 'canEditCatalog']],
  ['Jobs', ['canCreateJobs', 'canManageJobs', 'canManageChangeOrders']],
  ['Estimates', ['canEstimate', 'canApproveEstimates']],
  ['Administration', ['canAccessDeveloper', 'canManageUsers', 'canArchiveRecords']],
];

const REPORT_COLUMNS = [
  { key: 'name', header: 'Report' },
  { key: 'area', header: 'Area' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge tone={row.status === 'available' ? 'good' : 'neutral'} incomplete={row.status !== 'available'}>
        {row.status === 'available' ? 'Available' : 'Reserved'}
      </StatusBadge>
    ),
  },
  { key: 'sensitivity', header: 'Visibility' },
  { key: 'source', header: 'Source' },
];

const ACCESS_COLUMNS = [
  { key: 'label', header: 'Flag' },
  { key: 'area', header: 'Area' },
  {
    key: 'value',
    header: 'Current state',
    render: (row) => <StatusBadge tone={row.value ? 'good' : 'neutral'}>{row.value ? 'Granted' : 'Not granted'}</StatusBadge>,
  },
];

const SOURCE_COLUMNS = [
  { key: 'area', header: 'Area' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge tone={row.ready ? 'good' : 'warn'} incomplete={!row.ready}>{row.ready ? 'Ready' : 'Pending'}</StatusBadge>,
  },
  { key: 'reason', header: 'Reason' },
];

const OPEN_JOB_COLUMNS = [
  { key: 'job_number', header: 'Job #', render: (row) => <strong>{row.job_number || shortId(row.id)}</strong> },
  { key: 'name', header: 'Name' },
  { key: 'division', header: 'Division' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status}>{formatLabel(row.status)}</StatusBadge>,
  },
  { key: 'job_type', header: 'Type', render: (row) => formatLabel(row.job_type) },
  { key: 'updated_at', header: 'Updated', render: (row) => formatDate(row.updated_at) },
];

const JOB_COST_COLUMNS = [
  { key: 'category', header: 'Category', render: (row) => <strong>{formatLabel(row.category)}</strong> },
  { key: 'line_count', header: 'Lines', align: 'right', numeric: true },
  { key: 'total_budget', header: 'Budget', align: 'right', numeric: true, render: (row) => formatMoney(row.total_budget) },
];

const DOCUMENT_COLUMNS = [
  { key: 'file_name', header: 'File', render: (row) => <strong>{row.file_name}</strong> },
  { key: 'document_type', header: 'Type', fallback: '-' },
  { key: 'division', header: 'Division' },
  { key: 'owner_type', header: 'Owner', render: (row) => formatLabel(row.owner_type) },
  { key: 'file_size_bytes', header: 'Size', align: 'right', render: (row) => formatBytes(row.file_size_bytes) },
  { key: 'updated_at', header: 'Updated', render: (row) => formatDate(row.updated_at) },
];

const ESTIMATE_COLUMNS = [
  { key: 'estimate_number', header: 'Estimate #', render: (row) => <strong>{row.estimate_number || shortId(row.id)}</strong> },
  { key: 'title', header: 'Title' },
  { key: 'customer_name', header: 'Customer', fallback: '-' },
  { key: 'division', header: 'Division' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status}>{formatLabel(row.status)}</StatusBadge>,
  },
  { key: 'bid_due_at', header: 'Bid Due', render: (row) => formatDate(row.bid_due_at) },
];

const INVENTORY_COLUMNS = [
  { key: 'item_name', header: 'Item', render: (row) => <strong>{row.item_name || row.material_code || '-'}</strong> },
  { key: 'material_code', header: 'Code', fallback: '-' },
  { key: 'transaction_type', header: 'Type', render: (row) => formatLabel(row.transaction_type) },
  { key: 'quantity', header: 'Qty', align: 'right', numeric: true },
  { key: 'destination_label', header: 'Destination', fallback: '-' },
  { key: 'occurred_at', header: 'Occurred', render: (row) => formatDate(row.occurred_at || row.transaction_created_at) },
];

function labelForFlag(flag) {
  return flag
    .replace(/^can/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

function buildAccessRows(permissions) {
  return ACCESS_GROUPS.flatMap(([area, flags]) =>
    flags.map((flag) => ({
      id: flag,
      area,
      label: labelForFlag(flag),
      value: permissions?.[flag] === true,
    })),
  );
}

function formatLabel(value) {
  return String(value || '-').replaceAll('_', ' ');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '$0.00';
  return numeric.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatBytes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
}

function shortId(value) {
  if (!value) return '-';
  return String(value).slice(0, 8);
}

function summarizeBudgetByCategory(rows) {
  const categories = new Map();
  rows.forEach((row) => {
    const key = row.category || 'other';
    const current = categories.get(key) ?? { id: key, category: key, line_count: 0, total_budget: 0 };
    current.line_count += 1;
    current.total_budget += Number(row.budget_amount) || 0;
    categories.set(key, current);
  });
  return Array.from(categories.values()).sort((a, b) => b.total_budget - a.total_budget);
}

function buildReportLibrary(permissions, data) {
  const canInventory = permissions.canManageInventory || permissions.canInventoryTransactions;
  const canEstimate = permissions.canEstimate || permissions.canApproveEstimates;

  return [
    {
      id: 'open-jobs',
      name: 'Open Jobs',
      area: 'Jobs',
      status: 'available',
      sensitivity: 'Job visibility scope',
      source: 'public.jobs',
      note: `${data.jobs.length} visible active job${data.jobs.length === 1 ? '' : 's'}.`,
      icon: BriefcaseBusiness,
    },
    {
      id: 'job-cost',
      name: 'Job Cost Summary',
      area: 'Jobs',
      status: permissions.canViewFinancials ? 'available' : 'reserved',
      sensitivity: 'Financial permission required',
      source: 'public.job_budget_lines',
      note: permissions.canViewFinancials
        ? `${data.budgetLines.length} authorized budget line${data.budgetLines.length === 1 ? '' : 's'}.`
        : 'Hidden until can_view_financials is granted.',
      icon: BarChart3,
    },
    {
      id: 'documents',
      name: 'Document Index',
      area: 'Documents',
      status: 'available',
      sensitivity: 'Job document visibility scope',
      source: 'public.documents',
      note: `${data.documents.length} visible job document${data.documents.length === 1 ? '' : 's'}.`,
      icon: FolderOpen,
    },
    {
      id: 'estimate-pipeline',
      name: 'Estimate Pipeline',
      area: 'Estimates',
      status: canEstimate ? 'available' : 'reserved',
      sensitivity: 'Estimate permission scope',
      source: 'public.estimates',
      note: canEstimate
        ? `${data.estimates.length} visible estimate${data.estimates.length === 1 ? '' : 's'}.`
        : 'Hidden until estimate or approval permission is granted.',
      icon: FileText,
    },
    {
      id: 'inventory-activity',
      name: 'Inventory Activity',
      area: 'Inventory',
      status: canInventory ? 'available' : 'reserved',
      sensitivity: 'Inventory transaction scope',
      source: 'read_inventory_transaction_history RPC',
      note: canInventory
        ? `${data.inventoryActivity.length} recent authorized transaction item${data.inventoryActivity.length === 1 ? '' : 's'}.`
        : 'Hidden until inventory management or transaction permission is granted.',
      icon: ClipboardList,
    },
    {
      id: 'effective-access',
      name: 'Effective Access Snapshot',
      area: 'Administration',
      status: 'available',
      sensitivity: 'Current user only',
      source: 'usePermissions effective permission result',
      note: 'Shows the current signed-in user context only.',
      icon: ShieldCheck,
    },
  ];
}

function buildSourceRows(permissions, errors) {
  return [
    {
      id: 'permissions',
      area: 'Permissions',
      ready: permissions.permissionSource === 'server',
      reason: 'Server-backed effective permissions are loaded for the current user.',
    },
    {
      id: 'jobs',
      area: 'Jobs reports',
      ready: !errors.jobs,
      reason: errors.jobs ? errors.jobs.message || 'Jobs source failed.' : 'Jobs read model is available.',
    },
    {
      id: 'documents',
      area: 'Document reports',
      ready: !errors.documents,
      reason: errors.documents ? errors.documents.message || 'Documents source failed.' : 'Job document index is available.',
    },
    {
      id: 'estimates',
      area: 'Estimate reports',
      ready: permissions.canEstimate || permissions.canApproveEstimates ? !errors.estimates : false,
      reason: permissions.canEstimate || permissions.canApproveEstimates
        ? errors.estimates?.message || 'Estimate directory source is available.'
        : 'Requires estimate or estimate approval permission.',
    },
    {
      id: 'financials',
      area: 'Financial reports',
      ready: permissions.canViewFinancials ? !errors.budgetLines : false,
      reason: permissions.canViewFinancials
        ? errors.budgetLines?.message || 'Financial fields are available through budget RLS.'
        : 'Financial fields are omitted without can_view_financials.',
    },
    {
      id: 'inventory',
      area: 'Inventory reports',
      ready: permissions.canManageInventory || permissions.canInventoryTransactions ? !errors.inventoryActivity : false,
      reason: permissions.canManageInventory || permissions.canInventoryTransactions
        ? errors.inventoryActivity?.message || 'Inventory transaction history RPC is available.'
        : 'Requires inventory management or transaction permission.',
    },
  ];
}

function useReportData({ permissions }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    data: EMPTY_REPORT_DATA,
    errors: {},
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (permissions.permissionSource !== 'server') {
        setState({ isLoading: false, data: EMPTY_REPORT_DATA, errors: {} });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, errors: {} }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const canInventory = permissions.canManageInventory || permissions.canInventoryTransactions;
        const canEstimate = permissions.canEstimate || permissions.canApproveEstimates;

        const jobsPromise = client
          .from('jobs')
          .select('id, division, job_number, name, status, job_type, updated_at')
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(500);

        const budgetPromise = permissions.canViewFinancials
          ? client
            .from('job_budget_lines')
            .select('id, job_id, division, category, cost_code, description, budget_amount')
            .is('archived_at', null)
            .limit(1000)
          : Promise.resolve({ data: [], error: null });

        const documentsPromise = client
          .from('documents')
          .select('id, owner_type, owner_id, division, file_name, document_type, file_size_bytes, updated_at')
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(500);

        const estimatesPromise = canEstimate
          ? client
            .from('estimates')
            .select('id, division, estimate_number, title, customer_name, status, bid_due_at, updated_at')
            .is('archived_at', null)
            .order('updated_at', { ascending: false })
            .limit(500)
          : Promise.resolve({ data: [], error: null });

        const inventoryPromise = canInventory
          ? client.rpc('read_inventory_transaction_history', {
            p_limit: 50,
            p_transaction_type: null,
            p_search: null,
          })
          : Promise.resolve({ data: [], error: null });

        const [jobs, budgetLines, documents, estimates, inventoryActivity] = await Promise.all([
          jobsPromise,
          budgetPromise,
          documentsPromise,
          estimatesPromise,
          inventoryPromise,
        ]);

        const nextErrors = {};
        if (jobs.error) nextErrors.jobs = jobs.error;
        if (budgetLines.error) nextErrors.budgetLines = budgetLines.error;
        if (documents.error) nextErrors.documents = documents.error;
        if (estimates.error) nextErrors.estimates = estimates.error;
        if (inventoryActivity.error) nextErrors.inventoryActivity = inventoryActivity.error;

        if (isMounted) {
          setState({
            isLoading: false,
            errors: nextErrors,
            data: {
              jobs: jobs.error ? [] : jobs.data ?? [],
              budgetLines: budgetLines.error ? [] : budgetLines.data ?? [],
              documents: documents.error ? [] : documents.data ?? [],
              estimates: estimates.error ? [] : estimates.data ?? [],
              inventoryActivity: inventoryActivity.error ? [] : inventoryActivity.data ?? [],
            },
          });
        }
      } catch (error) {
        console.error('Reports failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            data: EMPTY_REPORT_DATA,
            errors: { reports: error },
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [
    getToken,
    permissions.canApproveEstimates,
    permissions.canEstimate,
    permissions.canInventoryTransactions,
    permissions.canManageInventory,
    permissions.canViewFinancials,
    permissions.permissionSource,
    refreshKey,
  ]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

export function ReportsWorkspace({ permissions }) {
  const [activeSection, setActiveSection] = useState('library');
  const [activeReportId, setActiveReportId] = useState('open-jobs');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const reports = useReportData({ permissions });

  const accessRows = useMemo(() => buildAccessRows(permissions), [permissions]);
  const reportLibrary = useMemo(
    () => buildReportLibrary(permissions, reports.data),
    [permissions, reports.data],
  );
  const sourceRows = useMemo(
    () => buildSourceRows(permissions, reports.errors),
    [permissions, reports.errors],
  );
  const availableReports = reportLibrary.filter((report) => report.status === 'available').length;
  const grantedFlags = accessRows.filter((row) => row.value).length;
  const budgetCategoryRows = useMemo(
    () => summarizeBudgetByCategory(reports.data.budgetLines),
    [reports.data.budgetLines],
  );
  const selectedReport = reportLibrary.find((report) => report.id === activeReportId) ?? reportLibrary[0];

  function renderSelectedReport() {
    if (reports.isLoading) {
      return <StatePanel tone="neutral" eyebrow="Loading" title="Loading report data..." compact />;
    }

    if (!selectedReport || selectedReport.status !== 'available') {
      return (
        <StatePanel
          eyebrow="Reserved"
          title={`${selectedReport?.name ?? 'This report'} is not available yet`}
          description={selectedReport?.note ?? 'This report waits for its approved source and permission model.'}
          tone="neutral"
        />
      );
    }

    if (selectedReport.id === 'open-jobs') {
      return (
        <DataTable
          columns={OPEN_JOB_COLUMNS}
          rows={reports.data.jobs}
          getRowKey={(row) => row.id}
          permissions={permissions}
          dense
          minWidth="820px"
          emptyTitle="No visible open jobs"
          emptyDescription="The Jobs read path returned no active jobs for the current scope."
        />
      );
    }

    if (selectedReport.id === 'job-cost') {
      return (
        <DataTable
          columns={JOB_COST_COLUMNS}
          rows={budgetCategoryRows}
          getRowKey={(row) => row.id}
          permissions={permissions}
          dense
          minWidth="560px"
          emptyTitle="No visible budget lines"
          emptyDescription="Financial access is granted, but no active budget rows are visible in this scope."
        />
      );
    }

    if (selectedReport.id === 'documents') {
      return (
        <DataTable
          columns={DOCUMENT_COLUMNS}
          rows={reports.data.documents}
          getRowKey={(row) => row.id}
          permissions={permissions}
          dense
          minWidth="860px"
          emptyTitle="No visible documents"
          emptyDescription="Job document rows will appear here when the current scope can view them."
        />
      );
    }

    if (selectedReport.id === 'estimate-pipeline') {
      return (
        <DataTable
          columns={ESTIMATE_COLUMNS}
          rows={reports.data.estimates}
          getRowKey={(row) => row.id}
          permissions={permissions}
          dense
          minWidth="820px"
          emptyTitle="No visible estimates"
          emptyDescription="Estimate rows will appear here when they exist in the current scope."
        />
      );
    }

    if (selectedReport.id === 'inventory-activity') {
      return (
        <DataTable
          columns={INVENTORY_COLUMNS}
          rows={reports.data.inventoryActivity}
          getRowKey={(row, index) => row.transaction_item_id || `${row.transaction_id}:${index}`}
          permissions={permissions}
          dense
          minWidth="920px"
          emptyTitle="No recent inventory activity"
          emptyDescription="The transaction history RPC returned no rows for the current scope."
        />
      );
    }

    return (
      <DataTable
        columns={ACCESS_COLUMNS}
        rows={accessRows}
        getRowKey={(row) => row.id}
        permissions={permissions}
        dense
        minWidth="580px"
      />
    );
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Reports"
        description="Read-only reporting center over live authorized Northgate HQ rows. Reports never request protected data unless the current permission scope allows it."
        status={<span className="status-pill status-pill--good">Read only</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Page Menu
            </button>
            <button type="button" className="secondary-button" onClick={reports.reload} disabled={reports.isLoading}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Available reports" value={availableReports} detail="Live read-only views" />
        <SummaryCard label="Open jobs" value={reports.data.jobs.length} detail="Visible active jobs" />
        <SummaryCard label="Documents" value={reports.data.documents.length} detail="Visible job files" />
        <SummaryCard label="Granted flags" value={grantedFlags} detail={`${accessRows.length} report-relevant flags`} developmentOnly />
      </div>

      <div className={`workspace-split reports-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Reports"
          title="Report Center"
          description="Read-only report categories."
          items={REPORT_SECTIONS}
          activeKey={activeSection}
          onSelect={setActiveSection}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Source honest</strong>
              <p>Reports only show rows returned by existing Supabase read paths.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activeSection === 'library' ? (
            <>
              <article className="card workspace-card">
                <Toolbar
                  eyebrow="Library"
                  title="Report library"
                  description="Choose a live report. Reserved reports are shown as roadmap slots, not as data access."
                />
                <DataTable
                  columns={REPORT_COLUMNS}
                  rows={reportLibrary}
                  getRowKey={(row) => row.id}
                  permissions={permissions}
                  onRowClick={(row) => setActiveReportId(row.id)}
                  selectedRowKey={selectedReport?.id ?? null}
                  dense
                  minWidth="820px"
                />
              </article>

              <article className="card workspace-card">
                <Toolbar
                  eyebrow={selectedReport?.area ?? 'Report'}
                  title={selectedReport?.name ?? 'Report'}
                  description={selectedReport?.note ?? 'Select a report from the library.'}
                  dense
                />
                {renderSelectedReport()}
              </article>
            </>
          ) : null}

          {activeSection === 'access' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Access"
                title="Effective access snapshot"
                description="Current report-relevant flags for the signed-in user. Unknown flags fail closed."
              />
              <DataTable
                columns={ACCESS_COLUMNS}
                rows={accessRows}
                getRowKey={(row) => row.id}
                permissions={permissions}
                dense
                minWidth="580px"
              />
            </article>
          ) : null}

          {activeSection === 'operations' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Readiness"
                title="Operational source readiness"
                description="Status of the source layers feeding live reports."
              />
              <DataTable
                columns={SOURCE_COLUMNS}
                rows={sourceRows}
                getRowKey={(row) => row.id}
                permissions={permissions}
                dense
                minWidth="720px"
              />
              <StatePanel
                eyebrow="Boundary"
                title="Reports are read-only"
                description="This workspace does not export protected data, run accounting posts, mutate records, or bypass module-level server authorization."
                compact
                tone="neutral"
              />
            </article>
          ) : null}
        </div>
      </div>
    </>
  );
}
