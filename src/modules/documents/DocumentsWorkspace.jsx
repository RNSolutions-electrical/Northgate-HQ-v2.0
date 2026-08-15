import {
  Archive,
  BriefcaseBusiness,
  Download,
  FileText,
  FolderOpen,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';

const DOCUMENT_SECTIONS = [
  {
    key: 'overview',
    label: 'Overview',
    icon: FolderOpen,
    description: 'Document system scope and current v3 status.',
  },
  {
    key: 'owners',
    label: 'Owner Scopes',
    icon: FileText,
    description: 'Approved and reserved document owner types.',
  },
  {
    key: 'controls',
    label: 'Controls',
    icon: ShieldCheck,
    description: 'Storage, archive, and access boundaries.',
  },
];

const OWNER_SCOPES = [
  {
    id: 'job',
    owner: 'Job',
    status: 'job-scoped live',
    access: 'Jobs read path; uploads gated by can_manage_jobs in current division',
    storage: 'documents/job/{jobId}/{documentId}/{fileName}',
    note: 'Existing implementation remains inside the Jobs detail Documents tab until Jobs is migrated.',
  },
  {
    id: 'estimate',
    owner: 'Estimate',
    status: 'reserved',
    access: 'Future estimate owner filters',
    storage: 'documents/estimate/{estimateId}/{documentId}/{fileName}',
    note: 'Owner type is declared in the architecture but not wired in v3.',
  },
  {
    id: 'vehicle',
    owner: 'Vehicle',
    status: 'reserved',
    access: 'Future vehicle owner filters',
    storage: 'documents/vehicle/{vehicleId}/{documentId}/{fileName}',
    note: 'Reserved until Vehicles is migrated and attachment rules are explicit.',
  },
  {
    id: 'tool',
    owner: 'Tool',
    status: 'reserved',
    access: 'Future tool owner filters',
    storage: 'documents/tool/{toolId}/{documentId}/{fileName}',
    note: 'Reserved until Tool Catalogue attachment rules are approved.',
  },
  {
    id: 'employee',
    owner: 'Employee',
    status: 'reserved',
    access: 'Future employee owner filters',
    storage: 'documents/employee/{employeeId}/{documentId}/{fileName}',
    note: 'Employee documents require a PII visibility audit before rows are exposed.',
  },
  {
    id: 'change-order',
    owner: 'Change order',
    status: 'reserved',
    access: 'Future financial record attachment filters',
    storage: 'documents/change_order/{changeOrderId}/{documentId}/{fileName}',
    note: 'Change orders remain financial records, not documents themselves.',
  },
  {
    id: 'report',
    owner: 'Report',
    status: 'reserved',
    access: 'Future report attachment filters',
    storage: 'documents/report/{reportId}/{documentId}/{fileName}',
    note: 'Reserved until report exports and indexes are explicitly approved.',
  },
  {
    id: 'snapshot',
    owner: 'Snapshot',
    status: 'reserved',
    access: 'Future immutable snapshot filters',
    storage: 'documents/snapshot/{snapshotId}/{documentId}/{fileName}',
    note: 'Reserved for immutable snapshot artifacts.',
  },
];

const CONTROL_ROWS = [
  {
    id: 'table',
    label: 'Canonical table',
    state: 'Locked',
    detail: 'Use public.documents, not owner-specific document tables.',
  },
  {
    id: 'storage',
    label: 'Storage bucket',
    state: 'Locked',
    detail: 'Files live in Supabase Storage under the northgate-files bucket.',
  },
  {
    id: 'archive',
    label: 'Deletion behavior',
    state: 'Soft archive only',
    detail: 'Deleting a document archives the row; no permanent delete path is exposed.',
  },
  {
    id: 'export',
    label: 'Job export behavior',
    state: 'Index only',
    detail: 'Documents are never bundled into full job PDFs; exports may list/index them only.',
  },
  {
    id: 'writes',
    label: 'v3 top-level writes',
    state: 'Not added',
    detail: 'This workspace does not upload, archive, download, or sign URLs yet.',
  },
];

const OWNER_COLUMNS = [
  { key: 'owner', header: 'Owner type' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge tone={row.status === 'job-scoped live' ? 'good' : 'neutral'}>
        {row.status === 'job-scoped live' ? 'Job-scoped live' : 'Reserved'}
      </StatusBadge>
    ),
  },
  { key: 'access', header: 'Access boundary' },
  { key: 'storage', header: 'Storage path' },
];

const CONTROL_COLUMNS = [
  { key: 'label', header: 'Control' },
  {
    key: 'state',
    header: 'State',
    render: (row) => <StatusBadge tone={row.state === 'Not added' ? 'neutral' : 'good'}>{row.state}</StatusBadge>,
  },
  { key: 'detail', header: 'Detail' },
];

export function DocumentsWorkspace({ permissions }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const liveScopes = OWNER_SCOPES.filter((scope) => scope.status === 'job-scoped live').length;
  const canManageJobDocuments = permissions.permissionSource === 'server' && permissions.canManageJobs;
  const statusRows = useMemo(() => CONTROL_ROWS, []);

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Documents"
        description="Central document system map for Northgate HQ. Job Documents v1 remains attached to Jobs until that source module is migrated into v3."
        status={<span className="status-pill status-pill--good">Read oriented</span>}
        actions={(
          <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
            Sections
          </button>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Live owner scopes" value={liveScopes} detail="Job documents in v2 Jobs" />
        <SummaryCard label="Reserved scopes" value={OWNER_SCOPES.length - liveScopes} detail="Awaiting source modules" />
        <SummaryCard label="Manage job docs" value={canManageJobDocuments ? 'Granted' : 'Read only'} detail="Existing can_manage_jobs flag" tone={canManageJobDocuments ? 'good' : 'warn'} />
        <SummaryCard label="Storage path" value="Locked" detail="northgate-files bucket" />
      </div>

      <div className={`workspace-split documents-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Documents"
          title="Document Center"
          description="Scope map and safety boundaries."
          items={DOCUMENT_SECTIONS}
          activeKey={activeSection}
          onSelect={setActiveSection}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>No parallel write path</strong>
              <p>Document writes stay in the approved owner workflow.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activeSection === 'overview' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Overview"
                title="Document system"
                description="The architecture uses one generic documents table and Supabase Storage. This top-level v3 workspace maps the system without relocating job-scoped actions yet."
              />

              <div className="documents-action-map">
                <StatePanel
                  eyebrow="Upload"
                  title="Uploads remain owner-scoped"
                  description="Job document upload stays inside the Jobs detail workflow until Jobs is migrated. This prevents a top-level screen from inventing owner selection or bypassing division scope."
                  compact
                  actions={<Upload aria-hidden="true" />}
                />
                <StatePanel
                  eyebrow="Open / Download"
                  title="Signed file access remains controlled"
                  description="Existing document open/download behavior creates scoped links from the owner workflow. This pass adds no new signed URL surface."
                  compact
                  actions={<Download aria-hidden="true" />}
                />
                <StatePanel
                  eyebrow="Archive"
                  title="Archive over delete"
                  description="Documents are soft-archived. The top-level v3 workspace does not expose archive controls until owner filters and row context are present."
                  compact
                  actions={<Archive aria-hidden="true" />}
                />
                <StatePanel
                  eyebrow="Jobs"
                  title="Job Documents v1 is the active source"
                  description="Documents currently attach to selected jobs. They are stored securely, individually downloadable, and never bundled into a job export."
                  compact
                  actions={<BriefcaseBusiness aria-hidden="true" />}
                />
              </div>
            </article>
          ) : null}

          {activeSection === 'owners' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Owner Scopes"
                title="Document owner types"
                description="Approved owner vocabulary and the storage path convention each owner will use when migrated."
              />
              <DataTable
                columns={OWNER_COLUMNS}
                rows={OWNER_SCOPES}
                getRowKey={(row) => row.id}
                permissions={permissions}
                dense
                minWidth="860px"
              />
              <StatePanel
                tone="neutral"
                eyebrow="Boundary"
                title="Only job owner policies are live today"
                description="Other owner types remain reserved until their source module and RLS/read behavior are explicitly implemented."
                compact
              />
            </article>
          ) : null}

          {activeSection === 'controls' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Controls"
                title="Document safety controls"
                description="Permanent rules for document storage, archival, and future exports."
              />
              <DataTable
                columns={CONTROL_COLUMNS}
                rows={statusRows}
                getRowKey={(row) => row.id}
                permissions={permissions}
                dense
                minWidth="680px"
              />
              <StatePanel
                tone="warning"
                eyebrow="Not in this pass"
                title="No top-level document mutations"
                description="This v3 migration does not add uploads, archive buttons, permanent deletes, storage policy changes, or document exports."
                compact
              />
            </article>
          ) : null}
        </div>
      </div>
    </>
  );
}
