import { useAuth } from '@clerk/clerk-react';
import {
  Archive,
  BriefcaseBusiness,
  Download,
  FileText,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  Upload,
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
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { JOB_DOCUMENT_CATEGORIES, documentCategoryLabel } from './documentCategories.js';

const EMPTY_DOCUMENTS = Object.freeze([]);
const EMPTY_JOBS = Object.freeze([]);

const DOCUMENT_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'owner_type',
  'owner_id',
  'file_name',
  'document_type',
  'description',
  'file_size_bytes',
  'mime_type',
  'created_by',
].join(', ');

const JOB_SELECT_FIELDS = [
  'id',
  'job_number',
  'name',
  'division',
].join(', ');

const DOCUMENT_SECTIONS = [
  {
    key: 'index',
    label: 'Document Index',
    icon: FolderOpen,
    description: 'Live job-owned documents visible to the current user.',
  },
  {
    key: 'checklist',
    label: 'Job Checklist',
    icon: BriefcaseBusiness,
    description: 'Visual category coverage across visible job documents.',
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
    access: 'View follows job visibility; edits follow job management permission',
    storage: 'documents/job/{jobId}/{documentId}/{fileName}',
  },
  {
    id: 'estimate',
    owner: 'Estimate',
    status: 'reserved',
    access: 'Future estimate owner filters',
    storage: 'documents/estimate/{estimateId}/{documentId}/{fileName}',
  },
  {
    id: 'vehicle',
    owner: 'Vehicle',
    status: 'reserved',
    access: 'Future vehicle owner filters',
    storage: 'documents/vehicle/{vehicleId}/{documentId}/{fileName}',
  },
  {
    id: 'tool',
    owner: 'Tool',
    status: 'reserved',
    access: 'Future tool owner filters',
    storage: 'documents/tool/{toolId}/{documentId}/{fileName}',
  },
  {
    id: 'employee',
    owner: 'Employee',
    status: 'reserved',
    access: 'Future employee owner filters',
    storage: 'documents/employee/{employeeId}/{documentId}/{fileName}',
  },
  {
    id: 'snapshot',
    owner: 'Snapshot',
    status: 'reserved',
    access: 'Future immutable snapshot filters',
    storage: 'documents/snapshot/{snapshotId}/{documentId}/{fileName}',
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
    id: 'writes',
    label: 'Top-level writes',
    state: 'Owner workflow only',
    detail: 'Uploads and archive controls stay inside the selected owner workflow.',
  },
  {
    id: 'permissions',
    label: 'Permission model',
    state: 'Job-owned',
    detail: 'If a user can view the job, they can view the document. Editing follows job management permission.',
  },
];

const DOCUMENT_COLUMNS = [
  { key: 'file_name', header: 'File', render: (row) => <strong>{row.file_name}</strong> },
  { key: 'job_label', header: 'Job', fallback: '-' },
  { key: 'document_type', header: 'Type', render: (row) => documentCategoryLabel(row.document_type) },
  { key: 'division', header: 'Division' },
  { key: 'file_size_bytes', header: 'Size', align: 'right', render: (row) => formatBytes(row.file_size_bytes) },
  { key: 'updated_at', header: 'Updated', render: (row) => formatDate(row.updated_at || row.created_at) },
];

const CHECKLIST_COLUMNS = [
  { key: 'label', header: 'Required category' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge tone={row.count ? 'good' : 'warn'} incomplete={!row.count}>
        {row.count ? 'Uploaded' : 'Missing'}
      </StatusBadge>
    ),
  },
  { key: 'count', header: 'Files', align: 'right', numeric: true },
  { key: 'description', header: 'Used for' },
];

const OWNER_COLUMNS = [
  { key: 'owner', header: 'Owner type' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge tone={row.status === 'job-scoped live' ? 'good' : 'neutral'} incomplete={row.status !== 'job-scoped live'}>
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
    render: (row) => <StatusBadge tone="good">{row.state}</StatusBadge>,
  },
  { key: 'detail', header: 'Detail' },
];

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
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

function documentSearchText(document) {
  return [
    document.file_name,
    document.job_label,
    document.document_type,
    document.description,
    document.division,
    document.mime_type,
    document.created_by,
  ].filter(Boolean).join(' ').toLowerCase();
}

function useDocumentIndex({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    documents: EMPTY_DOCUMENTS,
    jobs: EMPTY_JOBS,
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
        const [documentsResult, jobsResult] = await Promise.all([
          client
            .from('documents')
            .select(DOCUMENT_SELECT_FIELDS)
            .eq('owner_type', 'job')
            .is('archived_at', null)
            .order('updated_at', { ascending: false })
            .limit(1000),
          client
            .from('jobs')
            .select(JOB_SELECT_FIELDS)
            .is('archived_at', null)
            .limit(1000),
        ]);

        if (documentsResult.error) throw documentsResult.error;
        if (jobsResult.error) throw jobsResult.error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            documents: documentsResult.data ?? EMPTY_DOCUMENTS,
            jobs: jobsResult.data ?? EMPTY_JOBS,
          });
        }
      } catch (error) {
        console.error('Document index failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            documents: EMPTY_DOCUMENTS,
            jobs: EMPTY_JOBS,
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

export function DocumentsWorkspace({ permissions }) {
  const canReadDocuments = permissions.permissionSource === 'server';
  const documentIndex = useDocumentIndex({ enabled: canReadDocuments });
  const [activeSection, setActiveSection] = useState('index');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const jobMap = useMemo(() => {
    const next = new Map();
    documentIndex.jobs.forEach((job) => {
      next.set(job.id, [job.job_number, job.name].filter(Boolean).join(' - ') || shortId(job.id));
    });
    return next;
  }, [documentIndex.jobs]);

  const documents = useMemo(() =>
    documentIndex.documents.map((document) => ({
      ...document,
      job_label: jobMap.get(document.owner_id) || shortId(document.owner_id),
    })),
  [documentIndex.documents, jobMap]);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return documents;
    return documents.filter((document) => documentSearchText(document).includes(normalizedSearch));
  }, [documents, search]);

  const selectedDocument = filteredDocuments.find((document) => document.id === selectedDocumentId)
    ?? documents.find((document) => document.id === selectedDocumentId)
    ?? null;

  const checklistRows = useMemo(() => JOB_DOCUMENT_CATEGORIES.map((category) => {
    const count = documents.filter((document) => document.document_type === category.key).length;
    return { ...category, count };
  }), [documents]);

  const uploadedChecklistCount = checklistRows.filter((row) => row.count > 0).length;
  const liveScopes = OWNER_SCOPES.filter((scope) => scope.status === 'job-scoped live').length;
  const canManageJobDocuments = permissions.permissionSource === 'server' && permissions.canManageJobs;
  const statusRows = useMemo(() => CONTROL_ROWS, []);

  const sections = DOCUMENT_SECTIONS.map((section) => ({
    ...section,
    badge: {
      index: documents.length,
      checklist: `${uploadedChecklistCount}/${JOB_DOCUMENT_CATEGORIES.length}`,
      owners: liveScopes,
      controls: null,
    }[section.key],
  }));

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Documents"
        description="Read-only index for visible job-owned documents. Upload, download, archive, and storage mutations remain inside the selected Job workflow."
        status={<span className="status-pill status-pill--good">{documents.length} visible file{documents.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Sections
            </button>
            <button type="button" className="secondary-button" onClick={documentIndex.reload} disabled={documentIndex.isLoading}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Visible documents" value={documents.length} detail={documentIndex.isLoading ? 'Loading index' : 'Job-owned rows'} />
        <SummaryCard label="Visible jobs" value={documentIndex.jobs.length} detail="Jobs in current scope" />
        <SummaryCard label="Checklist" value={`${uploadedChecklistCount}/${JOB_DOCUMENT_CATEGORIES.length}`} detail="Categories with uploads" tone={uploadedChecklistCount === JOB_DOCUMENT_CATEGORIES.length ? 'good' : 'warn'} />
        <SummaryCard label="Manage job docs" value={canManageJobDocuments ? 'Granted' : 'Read only'} detail="Writes stay in Jobs" tone={canManageJobDocuments ? 'good' : 'warn'} />
      </div>

      <div className={`workspace-split documents-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Documents"
          title="Document Center"
          description="Live index and scope boundaries."
          items={sections}
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
          {activeSection === 'index' ? (
            <>
              <article className="card workspace-card">
                <Toolbar
                  eyebrow="Index"
                  title="Visible job documents"
                  description="Rows come from public.documents and follow the existing job document RLS policies."
                  search={(
                    <label>
                      <span className="sr-only">Search documents</span>
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search documents..."
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
                  columns={DOCUMENT_COLUMNS}
                  rows={filteredDocuments}
                  getRowKey={(row) => row.id}
                  permissions={permissions}
                  isLoading={documentIndex.isLoading}
                  error={documentIndex.error}
                  onRowClick={(row) => setSelectedDocumentId(row.id)}
                  selectedRowKey={selectedDocument?.id ?? null}
                  dense
                  minWidth="900px"
                  emptyTitle={search ? 'No documents matched this search' : 'No visible documents'}
                  emptyDescription={search
                    ? 'Try searching by file, job, category, description, division, or uploader.'
                    : 'Job-owned document rows will appear here when the current scope can view them.'}
                />
              </article>

              <article className="card workspace-card">
                {selectedDocument ? (
                  <>
                    <RecordHeader
                      eyebrow="Selected Document"
                      title={selectedDocument.file_name}
                      description={selectedDocument.description || 'Read-only document metadata. File actions remain in the owner workflow.'}
                      meta={[
                        { label: 'Job', value: selectedDocument.job_label },
                        { label: 'Category', value: documentCategoryLabel(selectedDocument.document_type) },
                        { label: 'Division', value: selectedDocument.division },
                      ]}
                    />
                    <div className="module-fact-grid documents-fact-grid">
                      <SummaryCard label="Size" value={formatBytes(selectedDocument.file_size_bytes)} detail="Stored metadata" />
                      <SummaryCard label="MIME" value={selectedDocument.mime_type || '-'} detail="Stored metadata" />
                      <SummaryCard label="Updated" value={formatDate(selectedDocument.updated_at || selectedDocument.created_at)} detail="Document row timestamp" />
                    </div>
                  </>
                ) : (
                  <StatePanel
                    eyebrow="No Selection"
                    title="Select a document to view metadata"
                    description="The detail panel shows job, category, size, MIME type, and notes without creating a new download or archive path."
                    tone="neutral"
                  />
                )}
              </article>
            </>
          ) : null}

          {activeSection === 'checklist' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Job Checklist"
                title="Required document categories"
                description="Visual coverage across visible documents. Missing items do not block the job workflow."
              />
              <DataTable
                columns={CHECKLIST_COLUMNS}
                rows={checklistRows}
                getRowKey={(row) => row.key}
                permissions={permissions}
                dense
                minWidth="760px"
              />
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
                minWidth="720px"
              />
              <div className="documents-action-map">
                <StatePanel
                  eyebrow="Upload"
                  title="Uploads remain owner-scoped"
                  description="Job document upload stays inside the Jobs detail workflow. This prevents a top-level screen from inventing owner selection or bypassing division scope."
                  compact
                  actions={<Upload aria-hidden="true" />}
                />
                <StatePanel
                  eyebrow="Open / Download"
                  title="Signed file access remains owner-scoped"
                  description="Open/download behavior stays with the selected owner workflow so signed URLs are generated with row context."
                  compact
                  actions={<Download aria-hidden="true" />}
                />
                <StatePanel
                  eyebrow="Archive"
                  title="Archive over delete"
                  description="Documents are soft-archived with a reason from the owner workflow. No permanent delete path is exposed here."
                  compact
                  actions={<Archive aria-hidden="true" />}
                />
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </>
  );
}
