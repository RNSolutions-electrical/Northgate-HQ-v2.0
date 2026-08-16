import {
  BarChart3,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';

const REPORT_SECTIONS = [
  {
    key: 'library',
    label: 'Report Library',
    icon: BarChart3,
    description: 'Approved reports and reserved report surfaces.',
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
    description: 'Read-model readiness for future reports.',
  },
];

const REPORT_LIBRARY = [
  {
    id: 'effective-access',
    name: 'Effective Access Snapshot',
    area: 'Administration',
    status: 'available',
    sensitivity: 'Developer/report users',
    source: 'usePermissions effective permission result',
    note: 'Shows the current signed-in user context only.',
  },
  {
    id: 'inventory-activity',
    name: 'Inventory Activity',
    area: 'Inventory',
    status: 'reserved',
    sensitivity: 'Inventory/report users',
    source: 'inventory transaction history read path',
    note: 'Reserved until the v3 Inventory module is migrated and report filters are approved.',
  },
  {
    id: 'job-cost',
    name: 'Job Cost Summary',
    area: 'Jobs',
    status: 'reserved',
    sensitivity: 'Financial permission required',
    source: 'Jobs financial read model',
    note: 'Protected financial values stay omitted unless can_view_financials is granted.',
  },
  {
    id: 'open-jobs',
    name: 'Open Jobs',
    area: 'Jobs',
    status: 'reserved',
    sensitivity: 'Authenticated users',
    source: 'Jobs read model',
    note: 'Reserved until Jobs is migrated into the v3 module structure.',
  },
  {
    id: 'documents',
    name: 'Document Index',
    area: 'Documents',
    status: 'reserved',
    sensitivity: 'Owner-type RLS',
    source: 'Documents read model',
    note: 'Reserved until Documents is migrated and owner-type filters are wired.',
  },
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

const SOURCE_COLUMNS = [
  { key: 'area', header: 'Area' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge tone={row.ready ? 'good' : 'warn'} incomplete={!row.ready}>{row.ready ? 'Ready' : 'Pending'}</StatusBadge>,
  },
  { key: 'reason', header: 'Reason' },
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

const ACCESS_GROUPS = [
  ['Reports', ['canViewReports', 'canViewAllDivisions']],
  ['Financials', ['canViewFinancials', 'canApproveBudget']],
  ['Inventory', ['canManageInventory', 'canInventoryTransactions', 'canEditCatalog']],
  ['Jobs', ['canCreateJobs', 'canManageJobs', 'canManageChangeOrders']],
  ['Administration', ['canAccessDeveloper', 'canManageUsers', 'canArchiveRecords']],
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

function buildSourceRows(permissions) {
  return [
    {
      id: 'permissions',
      area: 'Permissions',
      ready: permissions.permissionSource === 'server',
      reason: 'Server-backed effective permissions are loaded for the current user.',
    },
    {
      id: 'reports',
      area: 'Reports',
      ready: permissions.canViewReports === true,
      reason: 'Reports route is gated by can_view_reports.',
    },
    {
      id: 'inventory',
      area: 'Inventory reports',
      ready: false,
      reason: 'Inventory is intentionally late in the v3 migration map; report queries wait for that port.',
    },
    {
      id: 'jobs',
      area: 'Jobs reports',
      ready: false,
      reason: 'Jobs reporting waits for the Jobs module migration and its approved read model.',
    },
    {
      id: 'financials',
      area: 'Financial reports',
      ready: permissions.canViewFinancials === true,
      reason: 'Financial fields remain permission-gated and omitted where can_view_financials is not granted.',
    },
  ];
}

export function ReportsWorkspace({ permissions }) {
  const [activeSection, setActiveSection] = useState('library');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const accessRows = useMemo(() => buildAccessRows(permissions), [permissions]);
  const sourceRows = useMemo(() => buildSourceRows(permissions), [permissions]);
  const availableReports = REPORT_LIBRARY.filter((report) => report.status === 'available').length;
  const grantedFlags = accessRows.filter((row) => row.value).length;

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Reports"
        description="Read-only reporting center for approved Northgate HQ views. Operational report rows stay deferred until their source modules are migrated and permission filters are explicit."
        status={<span className="status-pill status-pill--good">Read only</span>}
        actions={(
          <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
            Sections
          </button>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Available reports" value={availableReports} detail="Live in v3 today" />
        <SummaryCard label="Reserved reports" value={REPORT_LIBRARY.length - availableReports} detail="Awaiting source ports" />
        <SummaryCard label="Granted flags" value={grantedFlags} detail={`${accessRows.length} report-relevant flags`} />
        <SummaryCard label="Financial scope" value={permissions.canViewFinancials ? 'Granted' : 'Hidden'} detail="Protected fields omitted" tone={permissions.canViewFinancials ? 'good' : 'warn'} />
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
              <p>Reports never infer data from incomplete module ports.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activeSection === 'library' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Library"
                title="Report library"
                description="Available and reserved report surfaces. Reserved reports are visible as roadmap slots, not as data access."
              />
              <DataTable
                columns={REPORT_COLUMNS}
                rows={REPORT_LIBRARY}
                getRowKey={(row) => row.id}
                permissions={permissions}
                dense
                minWidth="820px"
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
                description="Status of the source layers that will feed future reports."
              />
              <DataTable
                columns={SOURCE_COLUMNS}
                rows={sourceRows}
                getRowKey={(row) => row.id}
                permissions={permissions}
                dense
                minWidth="680px"
              />
              <div className="reports-source-grid">
                <StatePanel
                  eyebrow="Inventory"
                  title="Inventory reports wait for the Inventory port"
                  description="The migration map keeps Inventory late because it carries cart, checkout, count, ledger, overdraw, and concurrency invariants."
                  compact
                />
                <StatePanel
                  eyebrow="Jobs"
                  title="Jobs reports wait for the Jobs port"
                  description="Jobs reporting needs the approved Jobs read model so financial and protected fields stay omitted for unauthorized users."
                  compact
                />
                <StatePanel
                  eyebrow="Documents"
                  title="Document reports wait for owner-type routing"
                  description="Document index reports need explicit owner filters and RLS behavior before rows are exposed in v3."
                  compact
                />
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </>
  );
}
