import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Archive,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardList,
  FolderOpen,
  ListChecks,
  PackageCheck,
  Plus,
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
import { JOB_DOCUMENT_CATEGORIES, documentCategoryLabel } from '../documents/documentCategories.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_JOBS = Object.freeze([]);
const DOCUMENT_BUCKET = 'northgate-files';
const DEFAULT_DOCUMENT_CATEGORY = 'contracts';
const DEFAULT_UPLOAD_STATE = Object.freeze({
  category: DEFAULT_DOCUMENT_CATEGORY,
  description: '',
  file: null,
  isUploading: false,
  error: null,
  success: '',
});

const JOB_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'job_number',
  'name',
  'status',
  'description',
  'notes',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'job_type',
  'service_call_number',
  'created_by',
].join(', ');

const JOB_DOCUMENT_SELECT_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'owner_type',
  'owner_id',
  'storage_path',
  'document_type',
  'file_name',
  'description',
  'file_size_bytes',
  'mime_type',
  'created_by',
].join(', ');

const JOB_STATUS_OPTIONS = ['active', 'on_hold', 'complete', 'cancelled'];

const JOB_VIEWS = [
  { key: 'active', label: 'Active Jobs', icon: BriefcaseBusiness, description: 'Visible jobs currently marked active.' },
  { key: 'on_hold', label: 'On Hold', icon: ClipboardList, description: 'Visible jobs paused without being closed.' },
  { key: 'complete', label: 'Completed', icon: PackageCheck, description: 'Visible completed jobs.' },
  { key: 'cancelled', label: 'Cancelled', icon: Archive, description: 'Visible cancelled jobs.' },
  { key: 'all', label: 'All Visible', icon: ListChecks, description: 'Every visible non-archived job.' },
];

const RESERVED_TABS = Object.freeze({
  materials: {
    eyebrow: 'Material List',
    title: 'Job Material List is not ported in this v3 slice',
    description: 'The locked demand layer remains planning-only. This pass does not read or write job_materials, issue stock, reserve inventory, or update balances.',
  },
  buyout: {
    eyebrow: 'Buyout',
    title: 'Buyout planning remains deferred in v3',
    description: 'Buyout is a planning checklist only. This pass does not read or write job_buyout_lines, purchase orders, vendors, prices, or accounting records.',
  },
  transactions: {
    eyebrow: 'Transactions',
    title: 'Transaction log is reserved for a later port',
    description: 'The locked transaction tab is read-only material history through Inventory Checkout. This pass does not query job_transaction_log or add return/edit/export actions.',
  },
  financials: {
    eyebrow: 'Financials',
    title: 'Budget Foundation is reserved for a later port',
    description: 'Financials stay gated by can_view_financials. This pass does not read job_budget_lines or expose budget amounts, actuals, purchase orders, invoices, or accounting data.',
  },
  documents: {
    eyebrow: 'Documents',
    title: 'Job documents remain in the Documents module for now',
    description: 'This pass does not read or write job documents, storage paths, signed URLs, uploads, archives, or document exports.',
  },
  schedule: {
    eyebrow: 'Schedule',
    title: 'Schedule remains deferred in v3 Jobs',
    description: 'The locked schedule model is a flat milestone/task list only. This pass does not read or write job_schedule_items or calendar data.',
  },
});

function formatStatus(value) {
  switch (value) {
    case 'on_hold':
      return 'On Hold';
    case 'complete':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'active':
      return 'Active';
    default:
      return value || '-';
  }
}

function formatJobType(value) {
  return value === 'service_call' ? 'Service Call' : 'Job';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function jobLabel(job) {
  return job?.job_number ? `${job.job_number} - ${job.name}` : job?.name || 'Unnamed job';
}

function buildAddress(job) {
  return [
    job?.address_line1,
    job?.address_line2,
    [job?.city, job?.state, job?.postal_code].filter(Boolean).join(', '),
  ].filter(Boolean).join(' | ') || 'No address recorded';
}

function jobSearchText(job) {
  return [
    job.job_number,
    job.name,
    job.status,
    job.division,
    job.description,
    job.notes,
    job.address_line1,
    job.address_line2,
    job.city,
    job.state,
    job.postal_code,
    job.service_call_number,
  ].filter(Boolean).join(' ').toLowerCase();
}

function sanitizeDocumentFileName(fileName) {
  const cleaned = String(fileName || 'document')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || 'document';
}

const JOB_COLUMNS = [
  { key: 'name', header: 'Job', render: (row) => <strong>{jobLabel(row)}</strong> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status}>{formatStatus(row.status)}</StatusBadge> },
  { key: 'job_type', header: 'Type', render: (row) => formatJobType(row.job_type) },
  { key: 'division', header: 'Division', fallback: 'Unassigned' },
  { key: 'updated_at', header: 'Updated', render: (row) => formatDateTime(row.updated_at) },
];

const JOB_DOCUMENT_COLUMNS = [
  { key: 'file_name', header: 'Document', render: (row) => <strong>{row.file_name || 'Untitled document'}</strong> },
  { key: 'document_type', header: 'Category', render: (row) => documentCategoryLabel(row.document_type) },
  { key: 'description', header: 'Description', fallback: 'No description' },
  { key: 'created_by', header: 'Uploaded by', fallback: 'Not recorded' },
  { key: 'created_at', header: 'Uploaded', render: (row) => formatDateTime(row.created_at) },
];

function useJobsDirectory({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
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
        const { data, error } = await client
          .from('jobs')
          .select(JOB_SELECT_FIELDS)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            jobs: data ?? EMPTY_JOBS,
          });
        }
      } catch (error) {
        console.error('Jobs failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
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

function useJobDocuments({ enabled, jobId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    documents: [],
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !jobId) {
        setState({ isLoading: false, error: null, documents: [] });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('documents')
          .select(JOB_DOCUMENT_SELECT_FIELDS)
          .eq('owner_type', 'job')
          .eq('owner_id', jobId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            documents: data ?? [],
          });
        }
      } catch (error) {
        console.error('Job documents failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            documents: [],
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, jobId, refreshKey]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

function renderFact(label, value) {
  return (
    <div className="profile-field">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

export function JobsWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const directory = useJobsDirectory({ enabled: permissions.permissionSource === 'server' });
  const [activeView, setActiveView] = useState('active');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('browse');
  const [uploadState, setUploadState] = useState(DEFAULT_UPLOAD_STATE);
  const [documentAction, setDocumentAction] = useState({ id: '', action: '', error: null });
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const jobs = directory.jobs;
  const canCreateJobs = permissions?.canCreateJobs === true;
  const canManageJobs = permissions?.canManageJobs === true;
  const canViewFinancials = permissions?.canViewFinancials === true;

  const countsByStatus = JOB_STATUS_OPTIONS.reduce((accumulator, status) => {
    accumulator[status] = jobs.filter((job) => job.status === status).length;
    return accumulator;
  }, {});
  const divisions = [...new Set(jobs.map((job) => job.division).filter(Boolean))];

  const views = JOB_VIEWS.map((view) => ({
    ...view,
    badge: view.key === 'all' ? jobs.length : countsByStatus[view.key] ?? 0,
  }));

  const filteredJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return jobs.filter((job) => {
      if (activeView !== 'all' && job.status !== activeView) return false;
      if (!normalizedSearch) return true;
      return jobSearchText(job).includes(normalizedSearch);
    });
  }, [activeView, jobs, search]);

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId)
    ?? jobs.find((job) => job.id === selectedJobId)
    ?? null;
  const jobDocuments = useJobDocuments({
    enabled: permissions.permissionSource === 'server' && activeTab === 'documents' && Boolean(selectedJob?.id),
    jobId: selectedJob?.id,
  });

  useEffect(() => {
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId('');
    }
  }, [jobs, selectedJobId]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'details', label: 'Details' },
    { key: 'materials', label: 'Materials', meta: 'Deferred', visible: false },
    { key: 'buyout', label: 'Buyout', meta: 'Deferred' },
    { key: 'transactions', label: 'Transactions', meta: 'Deferred' },
    ...(canViewFinancials ? [{ key: 'financials', label: 'Financials', meta: 'Deferred' }] : []),
    { key: 'documents', label: 'Documents', meta: 'Deferred' },
    { key: 'schedule', label: 'Schedule', meta: 'Deferred' },
  ];
  const visibleTabs = useMemo(() => tabs.filter((tab) => tab.visible !== false), [canViewFinancials]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, visibleTabs]);

  function selectJob(job) {
    setSelectedJobId(job.id);
    setActiveTab('overview');
    setMode('browse');
    setUploadState(DEFAULT_UPLOAD_STATE);
  }

  async function handleDocumentUpload(event) {
    event.preventDefault();

    if (!selectedJob || !canManageJobs || uploadState.isUploading) return;

    const file = uploadState.file;
    if (!file) {
      setUploadState((current) => ({ ...current, error: new Error('Choose a file before uploading.') }));
      return;
    }

    if (!selectedJob.division) {
      setUploadState((current) => ({ ...current, error: new Error('This job does not have a division, so document upload is blocked.') }));
      return;
    }

    const category = JOB_DOCUMENT_CATEGORIES.some((item) => item.key === uploadState.category)
      ? uploadState.category
      : DEFAULT_DOCUMENT_CATEGORY;
    const documentId = crypto.randomUUID();
    const storagePath = `documents/job/${selectedJob.id}/${documentId}/${sanitizeDocumentFileName(file.name)}`;
    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';

    setUploadState((current) => ({ ...current, isUploading: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const insertPayload = {
        id: documentId,
        division: selectedJob.division,
        owner_type: 'job',
        owner_id: selectedJob.id,
        storage_path: storagePath,
        file_name: file.name,
        document_type: category,
        description: uploadState.description.trim() || null,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        created_by: createdBy,
      };

      const { error: insertError } = await client
        .from('documents')
        .insert(insertPayload);

      if (insertError) throw insertError;

      const { error: uploadError } = await client.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        await client
          .from('documents')
          .update({
            archived_at: new Date().toISOString(),
            archived_by: createdBy,
            archive_reason: `Upload failed: ${uploadError.message}`,
          })
          .eq('id', documentId);
        throw uploadError;
      }

      setUploadState({
        ...DEFAULT_UPLOAD_STATE,
        success: `${file.name} uploaded to ${documentCategoryLabel(category)}.`,
      });
      jobDocuments.reload();
    } catch (error) {
      console.error('Job document upload failed', error);
      setUploadState((current) => ({ ...current, isUploading: false, error, success: '' }));
    }
  }

  async function handleDocumentLink(document, action) {
    if (!document?.storage_path || documentAction.id) return;

    const targetWindow = action === 'open' ? window.open('', '_blank') : null;
    if (targetWindow) {
      targetWindow.opener = null;
      targetWindow.document.title = 'Opening document...';
      targetWindow.document.body.textContent = 'Opening document...';
    }

    setDocumentAction({ id: document.id, action, error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(document.storage_path, 300, action === 'download' ? { download: document.file_name || true } : undefined);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Supabase did not return a signed document URL.');

      if (action === 'open') {
        if (targetWindow) {
          targetWindow.location.href = data.signedUrl;
        } else {
          window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        const anchor = window.document.createElement('a');
        anchor.href = data.signedUrl;
        anchor.download = document.file_name || 'northgate-document';
        anchor.rel = 'noopener noreferrer';
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }

      setDocumentAction({ id: '', action: '', error: null });
    } catch (error) {
      console.error('Job document link failed', error);
      if (targetWindow && !targetWindow.closed) targetWindow.close();
      setDocumentAction({ id: '', action: '', error });
    }
  }

  function renderActiveTab() {
    if (!selectedJob) {
      return (
        <StatePanel
          eyebrow="No Selection"
          title="Select a job when a real row is available"
          description="This panel is reserved for the persistent job header, detail tabs, and approved actions once a job is selected."
          tone="neutral"
        />
      );
    }

    if (activeTab === 'details') {
      return (
        <div className="profile-field-grid">
          {renderFact('Job number', selectedJob.job_number || 'Not assigned')}
          {renderFact('Name', selectedJob.name)}
          {renderFact('Type', formatJobType(selectedJob.job_type))}
          {renderFact('Status', formatStatus(selectedJob.status))}
          {renderFact('Division', selectedJob.division)}
          {renderFact('Service call #', selectedJob.service_call_number || 'Not applicable')}
          {renderFact('Created', formatDateTime(selectedJob.created_at))}
          {renderFact('Updated', formatDateTime(selectedJob.updated_at))}
          {renderFact('Created by', selectedJob.created_by || 'Not recorded')}
          {renderFact('Address', buildAddress(selectedJob))}
          {renderFact('Description', selectedJob.description || 'No description recorded')}
          {renderFact('Notes', selectedJob.notes || 'No notes recorded')}
        </div>
      );
    }

    if (activeTab === 'documents') {
      const uploadedCategoryKeys = new Set(jobDocuments.documents.map((document) => document.document_type).filter(Boolean));
      const checklistRows = JOB_DOCUMENT_CATEGORIES.map((category) => ({
        ...category,
        status: uploadedCategoryKeys.has(category.key) ? 'uploaded' : 'missing',
      }));
      const uploadedCount = checklistRows.filter((row) => row.status === 'uploaded').length;
      const documentColumns = [
        ...JOB_DOCUMENT_COLUMNS,
        {
          key: 'actions',
          header: 'Actions',
          render: (row) => {
            const isBusy = documentAction.id === row.id;
            return (
              <div className="job-document-actions">
                <button type="button" className="secondary-button" onClick={() => handleDocumentLink(row, 'open')} disabled={isBusy}>
                  {isBusy && documentAction.action === 'open' ? 'Opening...' : 'Open'}
                </button>
                <button type="button" className="secondary-button" onClick={() => handleDocumentLink(row, 'download')} disabled={isBusy}>
                  {isBusy && documentAction.action === 'download' ? 'Downloading...' : 'Download'}
                </button>
              </div>
            );
          },
        },
      ];

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Checklist" value={`${uploadedCount}/${JOB_DOCUMENT_CATEGORIES.length}`} detail="Visual only; not blocking" tone={uploadedCount === JOB_DOCUMENT_CATEGORIES.length ? 'good' : 'default'} />
            <SummaryCard label="Uploaded" value={jobDocuments.documents.length} detail="Visible job-owned documents" />
            <SummaryCard label="Owner" value="Job" detail="Documents follow job visibility" />
            <SummaryCard label="Edit" value={canManageJobs ? 'Granted' : 'Read only'} detail="Follows job management permission" tone={canManageJobs ? 'good' : 'warn'} />
          </div>

          <section className="job-document-checklist" aria-label="Job document checklist">
            {checklistRows.map((category) => (
              <div key={category.key} className={`job-document-checklist__item ${category.status === 'uploaded' ? 'is-uploaded' : 'is-missing'}`}>
                <div>
                  <strong>{category.label}</strong>
                  <p>{category.description}</p>
                </div>
                <StatusBadge tone={category.status === 'uploaded' ? 'good' : 'neutral'}>
                  {category.status === 'uploaded' ? 'Uploaded' : 'Missing'}
                </StatusBadge>
              </div>
            ))}
          </section>

          <DataTable
            columns={documentColumns}
            rows={jobDocuments.documents}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={jobDocuments.isLoading}
            error={jobDocuments.error}
            dense
            minWidth="860px"
            emptyTitle="No documents uploaded for this job"
            emptyDescription="The checklist can still show required categories before files exist. Upload/archive actions are the next Documents slice."
          />
          {documentAction.error ? (
            <StatePanel
              tone="danger"
              eyebrow="Document Link Failed"
              title="Could not open this document"
              description={documentAction.error.message || 'Unexpected signed URL error.'}
              compact
            />
          ) : null}

          {canManageJobs ? (
            <form className="job-document-upload" onSubmit={handleDocumentUpload}>
              <Toolbar
                eyebrow="Upload"
                title="Add job document"
                description="Uploads are job-owned and use the selected category to update the visual checklist."
              />
              <div className="job-document-upload__grid">
                <label>
                  <span>Category</span>
                  <select
                    value={uploadState.category}
                    onChange={(event) => setUploadState((current) => ({ ...current, category: event.target.value, error: null, success: '' }))}
                    disabled={uploadState.isUploading}
                  >
                    {JOB_DOCUMENT_CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>{category.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>File</span>
                  <input
                    key={`${selectedJob.id}-${uploadState.success || 'ready'}`}
                    type="file"
                    onChange={(event) => setUploadState((current) => ({ ...current, file: event.target.files?.[0] ?? null, error: null, success: '' }))}
                    disabled={uploadState.isUploading}
                  />
                </label>
                <label className="job-document-upload__description">
                  <span>Description</span>
                  <input
                    type="text"
                    value={uploadState.description}
                    onChange={(event) => setUploadState((current) => ({ ...current, description: event.target.value, error: null, success: '' }))}
                    placeholder="Optional note"
                    disabled={uploadState.isUploading}
                  />
                </label>
              </div>
              {uploadState.error ? (
                <StatePanel
                  tone="danger"
                  eyebrow="Upload Failed"
                  title="Document was not uploaded"
                  description={uploadState.error.message || 'Unexpected upload error.'}
                  compact
                />
              ) : null}
              {uploadState.success ? (
                <StatePanel
                  tone="success"
                  eyebrow="Uploaded"
                  title="Document saved"
                  description={uploadState.success}
                  compact
                />
              ) : null}
              <div className="job-document-upload__actions">
                <button type="submit" className="primary-button" disabled={uploadState.isUploading || !uploadState.file}>
                  <Plus aria-hidden="true" /> {uploadState.isUploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Read Only"
              title="Document uploads require job management permission"
              description="You can view documents for jobs you can see. Uploading and editing follows the job management permission boundary."
              compact
            />
          )}
        </>
      );
    }

    if (activeTab !== 'overview') {
      const reserved = RESERVED_TABS[activeTab] ?? RESERVED_TABS.materials;
      return (
        <StatePanel
          eyebrow={reserved.eyebrow}
          title={reserved.title}
          description={reserved.description}
          tone={activeTab === 'financials' ? 'warning' : 'neutral'}
        />
      );
    }

    return (
      <>
        <div className="summary-grid summary-grid--compact">
          <SummaryCard label="Status" value={formatStatus(selectedJob.status)} detail="Foundation job state" />
          <SummaryCard label="Type" value={formatJobType(selectedJob.job_type)} detail={selectedJob.service_call_number || 'No service call number'} />
          <SummaryCard label="Division" value={selectedJob.division || 'Unassigned'} detail="Read scope is enforced by RLS" />
          <SummaryCard label="Financials" value={canViewFinancials ? 'Gated' : 'Hidden'} detail="Budget data is not loaded in this pass" />
        </div>
        <section className="jobs-overview-grid">
          <StatePanel
            eyebrow="Operational Summary"
            title={selectedJob.description || 'No description recorded'}
            description={selectedJob.notes || 'No notes are recorded for this job.'}
            tone="neutral"
            compact
          />
          <StatePanel
            eyebrow="Address"
            title={buildAddress(selectedJob)}
            description="Address fields are read directly from the Jobs foundation record."
            tone="neutral"
            compact
          />
          <StatePanel
            eyebrow="Boundaries"
            title="Read-only v3 slice"
            description="Create, edit, archive, materials, buyout, checkout handoffs, financials, documents, and schedule writes stay deferred in this pass."
            tone="warning"
            compact
          />
        </section>
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Jobs"
        description="Live read-only Jobs foundation using the existing jobs table. Heavier job submodules remain reserved until their v3 ports are handled deliberately."
        status={<span className="status-pill">{jobs.length} visible job{jobs.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={directory.reload} disabled={directory.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button" onClick={() => setMode('create')}>
              <Plus aria-hidden="true" /> Create Job
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Active" value={countsByStatus.active ?? 0} detail="Visible active jobs" />
        <SummaryCard label="On hold" value={countsByStatus.on_hold ?? 0} detail="Visible paused jobs" tone={(countsByStatus.on_hold ?? 0) ? 'warn' : 'default'} />
        <SummaryCard label="Completed" value={countsByStatus.complete ?? 0} detail="Visible completed jobs" />
        <SummaryCard label="Divisions" value={divisions.length} detail="Distinct visible divisions" />
      </div>

      <div className={`workspace-split jobs-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Job Views"
          title="Jobs"
          description="Browse visible Jobs foundation records."
          items={views}
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
              <strong>Foundation first</strong>
              <p>This v3 pass reads jobs only. Materials, buyout, transactions, financials, documents, and schedule stay bounded.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Directory"
              title={views.find((item) => item.key === activeView)?.label ?? 'Jobs'}
              description="Rows come from the existing authenticated jobs table and inherit its RLS."
              search={(
                <label>
                  <span className="sr-only">Search jobs</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search jobs..."
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
              columns={JOB_COLUMNS}
              rows={filteredJobs}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={directory.isLoading}
              error={directory.error}
              onRowClick={selectJob}
              selectedRowKey={selectedJob?.id ?? null}
              dense
              minWidth="840px"
              emptyTitle={search ? 'No jobs matched this search' : 'No jobs are visible'}
              emptyDescription={search
                ? 'Try searching by job number, name, address, status, division, or service call number.'
                : 'The Jobs workspace stays honest when RLS or the existing read path returns no visible job rows.'}
            />
          </article>

          <article className="card workspace-card">
            {mode === 'create' ? (
              <StatePanel
                eyebrow="Create Mode"
                title="Create Job remains deferred in this v3 pass"
                description={canCreateJobs
                  ? 'Your permission can create jobs, but this migration slice intentionally does not add insert behavior. The next Jobs pass can port the controlled create form.'
                  : 'This session does not have can_create_jobs. No create form or hidden insert path is exposed.'}
                tone="info"
                actions={(
                  <button type="button" className="secondary-button" onClick={() => setMode('browse')}>
                    Back to All Jobs
                  </button>
                )}
              />
            ) : (
              <>
                <RecordHeader
                  eyebrow="Selected Job"
                  title={selectedJob ? jobLabel(selectedJob) : 'No job selected'}
                  description={selectedJob
                    ? 'Selected-record shell using the locked Section 42 detail pattern.'
                    : 'Select a job from the directory to inspect the read-only v3 foundation record.'}
                  meta={selectedJob ? [
                    { label: 'Status', value: formatStatus(selectedJob.status) },
                    { label: 'Division', value: selectedJob.division || 'Unassigned' },
                    { label: 'Manage', value: canManageJobs ? 'Granted' : 'Read only' },
                  ] : []}
                />
                <WorkspaceTabs
                  tabs={visibleTabs}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Job detail sections"
                />
                {renderActiveTab()}
              </>
            )}
          </article>

          <section className="jobs-boundary-grid">
            <StatePanel
              eyebrow="Inventory Boundary"
              title="No Issue to Job handoff yet"
              description="This pass does not alter cart, checkout, destination selection, transaction_items, or inventory balances."
              tone="warning"
              compact
              actions={<PackageCheck aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Financial Boundary"
              title="Budget data is not loaded"
              description="Financials stay fully gated and deferred. No budget, actual, PO, invoice, or accounting values are selected."
              tone="neutral"
              compact
              actions={<CircleDollarSign aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Reserved Surfaces"
              title="Documents and schedule stay separate"
              description="Job documents and schedule tables are not queried or mutated by this first v3 Jobs slice."
              tone="neutral"
              compact
              actions={<FolderOpen aria-hidden="true" />}
            />
          </section>
        </div>
      </div>
    </>
  );
}
