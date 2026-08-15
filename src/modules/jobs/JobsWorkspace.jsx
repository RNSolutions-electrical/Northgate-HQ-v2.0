import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
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
const EMPTY_BUYOUT_LINES = Object.freeze([]);
const BUYOUT_STATUS_OPTIONS = ['pending', 'ordered', 'received', 'cancelled'];
const DEFAULT_BUYOUT_FORM = Object.freeze({
  item_description: '',
  quantity_needed: '1',
  vendor_note: '',
  budget_amount: '',
  initial_value: '',
  actual_value: '',
  initial_lead_time_days: '',
  actual_lead_time_days: '',
  note: '',
  isSaving: false,
  error: null,
  success: '',
});
const EMPTY_BUDGET_LINES = Object.freeze([]);
const BUDGET_CATEGORY_OPTIONS = ['material', 'labor', 'subcontractor', 'equipment', 'permit', 'other'];
const DEFAULT_BUDGET_FORM = Object.freeze({
  category: 'material',
  cost_code: '',
  description: '',
  budget_amount: '',
  budget_change_amount: '',
  actual_cost_amount: '',
  committed_cost_amount: '',
  forecast_to_complete_amount: '',
  note: '',
  isSaving: false,
  error: null,
  success: '',
});
const EMPTY_SCHEDULE_ITEMS = Object.freeze([]);
const SCHEDULE_STATUS_OPTIONS = ['pending', 'in_progress', 'complete', 'delayed'];
const DEFAULT_SCHEDULE_FORM = Object.freeze({
  id: '',
  title: '',
  description: '',
  target_date: '',
  status: 'pending',
  sort_order: '',
  note: '',
  isSaving: false,
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

const JOB_BUYOUT_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'item_description',
  'quantity_needed',
  'quantity_ordered',
  'status',
  'vendor_note',
  'lead_time_note',
  'budget_amount',
  'initial_value',
  'actual_value',
  'initial_lead_time_days',
  'actual_lead_time_days',
  'note',
  'created_by',
].join(', ');

const JOB_BUDGET_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'category',
  'cost_code',
  'description',
  'budget_amount',
  'budget_change_amount',
  'actual_cost_amount',
  'committed_cost_amount',
  'forecast_to_complete_amount',
  'note',
  'created_by',
].join(', ');

const JOB_SCHEDULE_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'title',
  'description',
  'target_date',
  'status',
  'sort_order',
  'note',
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
    title: 'Financials are available when permitted',
    description: 'The live Financials tab reads job_budget_lines and stays gated by can_view_financials. Accounting exports, invoices, purchase orders, and external accounting sync remain separate.',
  },
  documents: {
    eyebrow: 'Documents',
    title: 'Job documents remain in the Documents module for now',
    description: 'This pass does not read or write job documents, storage paths, signed URLs, uploads, archives, or document exports.',
  },
  schedule: {
    eyebrow: 'Schedule',
    title: 'Schedule is available for key milestones',
    description: 'Schedule tracks key milestones and tasks for this job. It does not sync with a calendar or manage dependencies between items.',
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

function formatBuyoutStatus(value) {
  switch (value) {
    case 'ordered':
      return 'Ordered';
    case 'received':
      return 'Received';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
      return 'Pending';
    default:
      return value || '-';
  }
}

function formatBudgetCategory(value) {
  switch (value) {
    case 'material':
      return 'Material';
    case 'labor':
      return 'Labor';
    case 'subcontractor':
      return 'Subcontractor';
    case 'equipment':
      return 'Equipment';
    case 'permit':
      return 'Permit';
    case 'other':
      return 'Other';
    default:
      return value || '-';
  }
}

function formatScheduleStatus(value) {
  switch (value) {
    case 'in_progress':
      return 'In Progress';
    case 'complete':
      return 'Complete';
    case 'delayed':
      return 'Delayed';
    case 'pending':
      return 'Pending';
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

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
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

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatLeadTime(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return '-';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumField(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function revisedBudget(row) {
  return (Number(row.budget_amount) || 0) + (Number(row.budget_change_amount) || 0);
}

function forecastFinal(row) {
  return (
    (Number(row.actual_cost_amount) || 0)
    + (Number(row.committed_cost_amount) || 0)
    + (Number(row.forecast_to_complete_amount) || 0)
  );
}

function budgetRemaining(row) {
  return revisedBudget(row) - forecastFinal(row);
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
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

const JOB_BUYOUT_COLUMNS = [
  { key: 'item_description', header: 'Item', render: (row) => <strong>{row.item_description || 'Untitled buyout item'}</strong> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status}>{formatBuyoutStatus(row.status)}</StatusBadge> },
  { key: 'quantity_needed', header: 'Qty', render: (row) => row.quantity_needed ?? 1, align: 'right' },
  { key: 'vendor_note', header: 'Vendor / source', fallback: '-' },
  { key: 'budget_amount', header: 'Budget', render: (row) => formatMoney(row.budget_amount), align: 'right' },
  { key: 'initial_value', header: 'Initial value', render: (row) => formatMoney(row.initial_value), align: 'right' },
  { key: 'actual_value', header: 'Actual value', render: (row) => formatMoney(row.actual_value), align: 'right' },
  { key: 'initial_lead_time_days', header: 'Initial lead', render: (row) => formatLeadTime(row.initial_lead_time_days), align: 'right' },
  { key: 'actual_lead_time_days', header: 'Actual lead', render: (row) => formatLeadTime(row.actual_lead_time_days), align: 'right' },
];

const JOB_BUDGET_COLUMNS = [
  { key: 'category', header: 'Category', render: (row) => formatBudgetCategory(row.category) },
  { key: 'cost_code', header: 'Cost code', fallback: '-' },
  { key: 'description', header: 'Description', render: (row) => <strong>{row.description || 'Untitled budget line'}</strong> },
  { key: 'budget_amount', header: 'Original', render: (row) => formatMoney(row.budget_amount), align: 'right' },
  { key: 'budget_change_amount', header: 'Changes', render: (row) => formatMoney(row.budget_change_amount), align: 'right' },
  { key: 'revised_budget', header: 'Revised', render: (row) => formatMoney(revisedBudget(row)), align: 'right' },
  { key: 'actual_cost_amount', header: 'Actual', render: (row) => formatMoney(row.actual_cost_amount), align: 'right' },
  { key: 'committed_cost_amount', header: 'Committed', render: (row) => formatMoney(row.committed_cost_amount), align: 'right' },
  { key: 'forecast_to_complete_amount', header: 'Forecast', render: (row) => formatMoney(row.forecast_to_complete_amount), align: 'right' },
  { key: 'forecast_final', header: 'Forecast final', render: (row) => formatMoney(forecastFinal(row)), align: 'right' },
  { key: 'remaining', header: 'Remaining', render: (row) => formatMoney(budgetRemaining(row)), align: 'right' },
  { key: 'note', header: 'Notes', fallback: '-' },
];

const JOB_SCHEDULE_COLUMNS = [
  { key: 'sort_order', header: '#', render: (row) => Number(row.sort_order) || 0, align: 'right' },
  { key: 'title', header: 'Milestone / task', render: (row) => <strong>{row.title || 'Untitled schedule item'}</strong> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status}>{formatScheduleStatus(row.status)}</StatusBadge> },
  { key: 'target_date', header: 'Target', render: (row) => formatDate(row.target_date) },
  {
    key: 'timing',
    header: 'Timing',
    render: (row) => {
      const remaining = daysUntil(row.target_date);
      if (remaining === null) return 'No date';
      if (remaining < 0) return `${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} late`;
      if (remaining === 0) return 'Due today';
      return `${remaining} day${remaining === 1 ? '' : 's'} out`;
    },
  },
  { key: 'description', header: 'Description', fallback: '-' },
  { key: 'note', header: 'Notes', fallback: '-' },
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
          .is('archived_at', null)
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

function useJobBuyoutLines({ enabled, jobId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    lines: EMPTY_BUYOUT_LINES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !jobId) {
        setState({ isLoading: false, error: null, lines: EMPTY_BUYOUT_LINES });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('job_buyout_lines')
          .select(JOB_BUYOUT_SELECT_FIELDS)
          .eq('job_id', jobId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            lines: data ?? EMPTY_BUYOUT_LINES,
          });
        }
      } catch (error) {
        console.error('Job buyout failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            lines: EMPTY_BUYOUT_LINES,
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

function useJobBudgetLines({ enabled, jobId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    lines: EMPTY_BUDGET_LINES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !jobId) {
        setState({ isLoading: false, error: null, lines: EMPTY_BUDGET_LINES });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('job_budget_lines')
          .select(JOB_BUDGET_SELECT_FIELDS)
          .eq('job_id', jobId)
          .order('cost_code', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            lines: data ?? EMPTY_BUDGET_LINES,
          });
        }
      } catch (error) {
        console.error('Job financials failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            lines: EMPTY_BUDGET_LINES,
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

function useJobScheduleItems({ enabled, jobId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    items: EMPTY_SCHEDULE_ITEMS,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !jobId) {
        setState({ isLoading: false, error: null, items: EMPTY_SCHEDULE_ITEMS });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('job_schedule_items')
          .select(JOB_SCHEDULE_SELECT_FIELDS)
          .eq('job_id', jobId)
          .is('archived_at', null)
          .order('sort_order', { ascending: true })
          .order('target_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            items: data ?? EMPTY_SCHEDULE_ITEMS,
          });
        }
      } catch (error) {
        console.error('Job schedule failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            items: EMPTY_SCHEDULE_ITEMS,
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
  const [buyoutForm, setBuyoutForm] = useState(DEFAULT_BUYOUT_FORM);
  const [buyoutAction, setBuyoutAction] = useState({ id: '', action: '', error: null });
  const [budgetForm, setBudgetForm] = useState(DEFAULT_BUDGET_FORM);
  const [scheduleForm, setScheduleForm] = useState(DEFAULT_SCHEDULE_FORM);
  const [scheduleAction, setScheduleAction] = useState({ id: '', action: '', error: null });
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
  const canManageSelectedJob = canManageJobs
    && Boolean(selectedJob?.division)
    && permissions?.division === selectedJob.division;
  const canApproveSelectedBudget = permissions?.canApproveBudget === true
    && Boolean(selectedJob?.division)
    && permissions?.division === selectedJob.division;
  const jobDocuments = useJobDocuments({
    enabled: permissions.permissionSource === 'server' && activeTab === 'documents' && Boolean(selectedJob?.id),
    jobId: selectedJob?.id,
  });
  const jobBuyout = useJobBuyoutLines({
    enabled: permissions.permissionSource === 'server' && activeTab === 'buyout' && Boolean(selectedJob?.id),
    jobId: selectedJob?.id,
  });
  const jobBudget = useJobBudgetLines({
    enabled: permissions.permissionSource === 'server' && activeTab === 'financials' && Boolean(selectedJob?.id),
    jobId: selectedJob?.id,
  });
  const jobSchedule = useJobScheduleItems({
    enabled: permissions.permissionSource === 'server' && activeTab === 'schedule' && Boolean(selectedJob?.id),
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
    ...(canViewFinancials ? [{ key: 'financials', label: 'Financials', meta: 'Live' }] : []),
    { key: 'documents', label: 'Documents', meta: 'Deferred' },
    { key: 'schedule', label: 'Schedule', meta: 'Live' },
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
    setBuyoutForm(DEFAULT_BUYOUT_FORM);
    setBudgetForm(DEFAULT_BUDGET_FORM);
    setScheduleForm(DEFAULT_SCHEDULE_FORM);
  }

  async function handleDocumentUpload(event) {
    event.preventDefault();

    if (!selectedJob || !canManageSelectedJob || uploadState.isUploading) return;

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

  async function handleBuyoutAdd(event) {
    event.preventDefault();

    if (!selectedJob || !canManageSelectedJob || buyoutForm.isSaving) return;

    if (!buyoutForm.item_description.trim()) {
      setBuyoutForm((current) => ({ ...current, error: new Error('Enter a buyout item before saving.') }));
      return;
    }

    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    setBuyoutForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const quantityNeeded = parseOptionalNumber(buyoutForm.quantity_needed) || 1;
      const { error } = await client
        .from('job_buyout_lines')
        .insert({
          job_id: selectedJob.id,
          division: selectedJob.division,
          item_description: buyoutForm.item_description.trim(),
          quantity_needed: quantityNeeded,
          status: 'pending',
          vendor_note: buyoutForm.vendor_note.trim() || null,
          budget_amount: parseOptionalNumber(buyoutForm.budget_amount),
          initial_value: parseOptionalNumber(buyoutForm.initial_value),
          actual_value: parseOptionalNumber(buyoutForm.actual_value),
          initial_lead_time_days: parseOptionalNumber(buyoutForm.initial_lead_time_days),
          actual_lead_time_days: parseOptionalNumber(buyoutForm.actual_lead_time_days),
          note: buyoutForm.note.trim() || null,
          created_by: createdBy,
        });

      if (error) throw error;

      setBuyoutForm({
        ...DEFAULT_BUYOUT_FORM,
        success: `${buyoutForm.item_description.trim()} added to Buyout.`,
      });
      jobBuyout.reload();
    } catch (error) {
      console.error('Job buyout add failed', error);
      setBuyoutForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleBuyoutStatus(row, status) {
    if (!row?.id || !selectedJob?.id || !canManageSelectedJob || buyoutAction.id) return;

    setBuyoutAction({ id: row.id, action: status, error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_buyout_lines')
        .update({ status })
        .eq('id', row.id)
        .eq('job_id', selectedJob.id);

      if (error) throw error;

      setBuyoutAction({ id: '', action: '', error: null });
      jobBuyout.reload();
    } catch (error) {
      console.error('Job buyout status update failed', error);
      setBuyoutAction({ id: '', action: '', error });
    }
  }

  async function handleBudgetAdd(event) {
    event.preventDefault();

    if (!selectedJob || !canApproveSelectedBudget || budgetForm.isSaving) return;

    if (!budgetForm.description.trim()) {
      setBudgetForm((current) => ({ ...current, error: new Error('Enter a budget description before saving.') }));
      return;
    }

    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    setBudgetForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_budget_lines')
        .insert({
          job_id: selectedJob.id,
          division: selectedJob.division,
          category: BUDGET_CATEGORY_OPTIONS.includes(budgetForm.category) ? budgetForm.category : 'other',
          cost_code: budgetForm.cost_code.trim() || null,
          description: budgetForm.description.trim(),
          budget_amount: parseOptionalNumber(budgetForm.budget_amount) || 0,
          budget_change_amount: parseOptionalNumber(budgetForm.budget_change_amount) || 0,
          actual_cost_amount: parseOptionalNumber(budgetForm.actual_cost_amount) || 0,
          committed_cost_amount: parseOptionalNumber(budgetForm.committed_cost_amount) || 0,
          forecast_to_complete_amount: parseOptionalNumber(budgetForm.forecast_to_complete_amount) || 0,
          note: budgetForm.note.trim() || null,
          created_by: createdBy,
        });

      if (error) throw error;

      setBudgetForm({
        ...DEFAULT_BUDGET_FORM,
        success: `${budgetForm.description.trim()} added to Financials.`,
      });
      jobBudget.reload();
    } catch (error) {
      console.error('Job budget add failed', error);
      setBudgetForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  function nextScheduleSortOrder() {
    if (!jobSchedule.items.length) return 10;
    return Math.max(...jobSchedule.items.map((item) => Number(item.sort_order) || 0)) + 10;
  }

  function startScheduleEdit(row) {
    setScheduleForm({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      target_date: row.target_date || '',
      status: SCHEDULE_STATUS_OPTIONS.includes(row.status) ? row.status : 'pending',
      sort_order: String(Number(row.sort_order) || 0),
      note: row.note || '',
      isSaving: false,
      error: null,
      success: '',
    });
  }

  function resetScheduleForm() {
    setScheduleForm(DEFAULT_SCHEDULE_FORM);
  }

  async function handleScheduleSave(event) {
    event.preventDefault();

    if (!selectedJob || !canManageSelectedJob || scheduleForm.isSaving) return;

    if (!scheduleForm.title.trim()) {
      setScheduleForm((current) => ({ ...current, error: new Error('Enter a schedule title before saving.') }));
      return;
    }

    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    const payload = {
      job_id: selectedJob.id,
      division: selectedJob.division,
      title: scheduleForm.title.trim(),
      description: scheduleForm.description.trim() || null,
      target_date: scheduleForm.target_date || null,
      status: SCHEDULE_STATUS_OPTIONS.includes(scheduleForm.status) ? scheduleForm.status : 'pending',
      sort_order: parseOptionalNumber(scheduleForm.sort_order) ?? nextScheduleSortOrder(),
      note: scheduleForm.note.trim() || null,
    };

    setScheduleForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const query = scheduleForm.id
        ? client
          .from('job_schedule_items')
          .update(payload)
          .eq('id', scheduleForm.id)
          .eq('job_id', selectedJob.id)
        : client
          .from('job_schedule_items')
          .insert({ ...payload, created_by: createdBy });
      const { error } = await query;

      if (error) throw error;

      setScheduleForm({
        ...DEFAULT_SCHEDULE_FORM,
        success: `${payload.title} ${scheduleForm.id ? 'updated' : 'added'} in Schedule.`,
      });
      jobSchedule.reload();
    } catch (error) {
      console.error('Job schedule save failed', error);
      setScheduleForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleScheduleArchive(row) {
    if (!row?.id || !selectedJob?.id || !canManageSelectedJob || scheduleAction.id) return;

    const reason = window.prompt(`Archive "${row.title || 'this schedule item'}"? Enter a reason.`);
    if (!reason?.trim()) return;

    const archivedBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    setScheduleAction({ id: row.id, action: 'archive', error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_schedule_items')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: archivedBy,
          archive_reason: reason.trim(),
        })
        .eq('id', row.id)
        .eq('job_id', selectedJob.id);

      if (error) throw error;

      setScheduleAction({ id: '', action: '', error: null });
      if (scheduleForm.id === row.id) resetScheduleForm();
      jobSchedule.reload();
    } catch (error) {
      console.error('Job schedule archive failed', error);
      setScheduleAction({ id: '', action: '', error });
    }
  }

  async function handleScheduleMove(row, direction) {
    if (!row?.id || !selectedJob?.id || !canManageSelectedJob || scheduleAction.id) return;

    const currentIndex = jobSchedule.items.findIndex((item) => item.id === row.id);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const neighbor = jobSchedule.items[nextIndex];
    if (currentIndex < 0 || !neighbor) return;

    setScheduleAction({ id: row.id, action: direction, error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const reorderedItems = [...jobSchedule.items];
      [reorderedItems[currentIndex], reorderedItems[nextIndex]] = [reorderedItems[nextIndex], reorderedItems[currentIndex]];
      const results = await Promise.all(reorderedItems.map((item, index) => client
        .from('job_schedule_items')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', item.id)
        .eq('job_id', selectedJob.id)));
      const failedResult = results.find((result) => result.error);
      if (failedResult?.error) throw failedResult.error;

      setScheduleAction({ id: '', action: '', error: null });
      jobSchedule.reload();
    } catch (error) {
      console.error('Job schedule reorder failed', error);
      setScheduleAction({ id: '', action: '', error });
      jobSchedule.reload();
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
                {canManageSelectedJob ? (
                  <button type="button" className="secondary-button secondary-button--danger" disabled title="Archive will be enabled after the final RLS pass.">
                    Archive Pending
                  </button>
                ) : null}
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
            <SummaryCard label="Edit" value={canManageSelectedJob ? 'Granted' : 'Read only'} detail="Follows selected job division" tone={canManageSelectedJob ? 'good' : 'warn'} />
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
            emptyDescription="The checklist can still show required categories before files exist. Archive remains pending for the final RLS pass."
          />
          {documentAction.error ? (
            <StatePanel
              tone="danger"
              eyebrow="Document Action Failed"
              title="Could not complete this document action"
              description={documentAction.error.message || 'Unexpected document action error.'}
              compact
            />
          ) : null}

          {canManageSelectedJob ? (
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

    if (activeTab === 'buyout') {
      const receivedCount = jobBuyout.lines.filter((line) => line.status === 'received').length;
      const budgetTotal = sumField(jobBuyout.lines, 'budget_amount');
      const initialTotal = sumField(jobBuyout.lines, 'initial_value');
      const actualTotal = sumField(jobBuyout.lines, 'actual_value');
      const attentionCount = jobBuyout.lines.filter((line) => (
        line.status !== 'received'
        || (Number(line.actual_value) || 0) > (Number(line.budget_amount) || 0)
        || (Number(line.actual_lead_time_days) || 0) > (Number(line.initial_lead_time_days) || 0)
      )).length;
      const buyoutColumns = [
        ...JOB_BUYOUT_COLUMNS,
        {
          key: 'actions',
          header: 'Checklist',
          render: (row) => {
            if (!canManageSelectedJob) return 'Read only';
            const isBusy = buyoutAction.id === row.id;
            return (
              <div className="job-buyout-actions">
                {BUYOUT_STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={row.status === status ? 'primary-button' : 'secondary-button'}
                    onClick={() => handleBuyoutStatus(row, status)}
                    disabled={isBusy || row.status === status}
                  >
                    {isBusy && buyoutAction.action === status ? 'Saving...' : formatBuyoutStatus(status)}
                  </button>
                ))}
              </div>
            );
          },
        },
      ];

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Checklist" value={`${receivedCount}/${jobBuyout.lines.length}`} detail="Received buyout items" tone={receivedCount && receivedCount === jobBuyout.lines.length ? 'good' : 'default'} />
            <SummaryCard label="Budget" value={formatMoney(budgetTotal)} detail="Buyout budget target" />
            <SummaryCard label="Initial" value={formatMoney(initialTotal)} detail="Initial value total" />
            <SummaryCard label="Actual" value={formatMoney(actualTotal)} detail="Actual value total" tone={actualTotal > budgetTotal && budgetTotal > 0 ? 'warn' : 'default'} />
            <SummaryCard label="Attention" value={attentionCount} detail="Open, over budget, or over lead" tone={attentionCount ? 'warn' : 'good'} />
          </div>

          <DataTable
            columns={buyoutColumns}
            rows={jobBuyout.lines}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={jobBuyout.isLoading}
            error={jobBuyout.error}
            dense
            minWidth="1180px"
            emptyTitle="No buyout items for this job"
            emptyDescription="Add buyout items to track budget, value, lead time, and checklist status."
          />
          {buyoutAction.error ? (
            <StatePanel
              tone="danger"
              eyebrow="Buyout Update Failed"
              title="Could not update this buyout item"
              description={buyoutAction.error.message || 'Unexpected buyout update error.'}
              compact
            />
          ) : null}

          {canManageSelectedJob ? (
            <form className="job-buyout-form" onSubmit={handleBuyoutAdd}>
              <Toolbar
                eyebrow="Add"
                title="Add buyout item"
                description="Buyout remains a planning checklist. It does not create purchase orders, accounting entries, or inventory movements."
              />
              <div className="job-buyout-form__grid">
                <label className="job-buyout-form__wide">
                  <span>Item</span>
                  <input
                    type="text"
                    value={buyoutForm.item_description}
                    onChange={(event) => setBuyoutForm((current) => ({ ...current, item_description: event.target.value, error: null, success: '' }))}
                    placeholder="Switchgear, lighting package, specialty gear..."
                    disabled={buyoutForm.isSaving}
                  />
                </label>
                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={buyoutForm.quantity_needed}
                    onChange={(event) => setBuyoutForm((current) => ({ ...current, quantity_needed: event.target.value, error: null, success: '' }))}
                    disabled={buyoutForm.isSaving}
                  />
                </label>
                <label>
                  <span>Vendor / source</span>
                  <input
                    type="text"
                    value={buyoutForm.vendor_note}
                    onChange={(event) => setBuyoutForm((current) => ({ ...current, vendor_note: event.target.value, error: null, success: '' }))}
                    disabled={buyoutForm.isSaving}
                  />
                </label>
                <label>
                  <span>Budget</span>
                  <input type="number" min="0" step="0.01" value={buyoutForm.budget_amount} onChange={(event) => setBuyoutForm((current) => ({ ...current, budget_amount: event.target.value, error: null, success: '' }))} disabled={buyoutForm.isSaving} />
                </label>
                <label>
                  <span>Initial value</span>
                  <input type="number" min="0" step="0.01" value={buyoutForm.initial_value} onChange={(event) => setBuyoutForm((current) => ({ ...current, initial_value: event.target.value, error: null, success: '' }))} disabled={buyoutForm.isSaving} />
                </label>
                <label>
                  <span>Actual value</span>
                  <input type="number" min="0" step="0.01" value={buyoutForm.actual_value} onChange={(event) => setBuyoutForm((current) => ({ ...current, actual_value: event.target.value, error: null, success: '' }))} disabled={buyoutForm.isSaving} />
                </label>
                <label>
                  <span>Initial lead</span>
                  <input type="number" min="0" step="1" value={buyoutForm.initial_lead_time_days} onChange={(event) => setBuyoutForm((current) => ({ ...current, initial_lead_time_days: event.target.value, error: null, success: '' }))} disabled={buyoutForm.isSaving} />
                </label>
                <label>
                  <span>Actual lead</span>
                  <input type="number" min="0" step="1" value={buyoutForm.actual_lead_time_days} onChange={(event) => setBuyoutForm((current) => ({ ...current, actual_lead_time_days: event.target.value, error: null, success: '' }))} disabled={buyoutForm.isSaving} />
                </label>
                <label className="job-buyout-form__wide">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={buyoutForm.note}
                    onChange={(event) => setBuyoutForm((current) => ({ ...current, note: event.target.value, error: null, success: '' }))}
                    placeholder="Optional checklist note"
                    disabled={buyoutForm.isSaving}
                  />
                </label>
              </div>
              {buyoutForm.error ? (
                <StatePanel tone="danger" eyebrow="Buyout Save Failed" title="Item was not saved" description={buyoutForm.error.message || 'Unexpected buyout error.'} compact />
              ) : null}
              {buyoutForm.success ? (
                <StatePanel tone="success" eyebrow="Saved" title="Buyout item added" description={buyoutForm.success} compact />
              ) : null}
              <div className="job-buyout-form__actions">
                <button type="submit" className="primary-button" disabled={buyoutForm.isSaving || !buyoutForm.item_description.trim()}>
                  <Plus aria-hidden="true" /> {buyoutForm.isSaving ? 'Saving...' : 'Add Buyout Item'}
                </button>
              </div>
            </form>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Read Only"
              title="Buyout writes require selected-job management permission"
              description="You can view buyout rows for jobs you can see. Adding and updating buyout items follows the selected job division boundary."
              compact
            />
          )}
        </>
      );
    }

    if (activeTab === 'financials') {
      const originalTotal = sumField(jobBudget.lines, 'budget_amount');
      const changeTotal = sumField(jobBudget.lines, 'budget_change_amount');
      const revisedTotal = jobBudget.lines.reduce((total, line) => total + revisedBudget(line), 0);
      const actualTotal = sumField(jobBudget.lines, 'actual_cost_amount');
      const committedTotal = sumField(jobBudget.lines, 'committed_cost_amount');
      const forecastToCompleteTotal = sumField(jobBudget.lines, 'forecast_to_complete_amount');
      const forecastFinalTotal = jobBudget.lines.reduce((total, line) => total + forecastFinal(line), 0);
      const remainingTotal = revisedTotal - forecastFinalTotal;

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Original Budget" value={formatMoney(originalTotal)} detail="Approved budget lines" />
            <SummaryCard label="Revised Budget" value={formatMoney(revisedTotal)} detail={`${formatMoney(changeTotal)} in changes`} />
            <SummaryCard label="Actual Cost" value={formatMoney(actualTotal)} detail="Tracked cost only" />
            <SummaryCard label="Committed" value={formatMoney(committedTotal)} detail="Committed cost" />
            <SummaryCard label="Forecast Final" value={formatMoney(forecastFinalTotal)} detail={`${formatMoney(forecastToCompleteTotal)} to complete`} />
            <SummaryCard label="Remaining" value={formatMoney(remainingTotal)} detail="Revised minus forecast final" tone={remainingTotal < 0 ? 'warn' : 'good'} />
          </div>

          <DataTable
            columns={JOB_BUDGET_COLUMNS}
            rows={jobBudget.lines}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={jobBudget.isLoading}
            error={jobBudget.error}
            dense
            minWidth="1320px"
            emptyTitle="No financial lines for this job"
            emptyDescription="Add budget lines to track original budget, changes, actuals, commitments, forecast, and remaining value."
          />

          {canApproveSelectedBudget ? (
            <form className="job-financials-form" onSubmit={handleBudgetAdd}>
              <Toolbar
                eyebrow="Add"
                title="Add financial line"
                description="Financials are job planning and forecasting only. This does not post to accounting or create purchase orders."
              />
              <div className="job-financials-form__grid">
                <label>
                  <span>Category</span>
                  <select
                    value={budgetForm.category}
                    onChange={(event) => setBudgetForm((current) => ({ ...current, category: event.target.value, error: null, success: '' }))}
                    disabled={budgetForm.isSaving}
                  >
                    {BUDGET_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{formatBudgetCategory(category)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Cost code</span>
                  <input
                    type="text"
                    value={budgetForm.cost_code}
                    onChange={(event) => setBudgetForm((current) => ({ ...current, cost_code: event.target.value, error: null, success: '' }))}
                    disabled={budgetForm.isSaving}
                  />
                </label>
                <label className="job-financials-form__wide">
                  <span>Description</span>
                  <input
                    type="text"
                    value={budgetForm.description}
                    onChange={(event) => setBudgetForm((current) => ({ ...current, description: event.target.value, error: null, success: '' }))}
                    placeholder="Electrical labor, fixtures, OH&P..."
                    disabled={budgetForm.isSaving}
                  />
                </label>
                <label>
                  <span>Original</span>
                  <input type="number" min="0" step="0.01" value={budgetForm.budget_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, budget_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
                </label>
                <label>
                  <span>Changes</span>
                  <input type="number" min="0" step="0.01" value={budgetForm.budget_change_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, budget_change_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
                </label>
                <label>
                  <span>Actual</span>
                  <input type="number" min="0" step="0.01" value={budgetForm.actual_cost_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, actual_cost_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
                </label>
                <label>
                  <span>Committed</span>
                  <input type="number" min="0" step="0.01" value={budgetForm.committed_cost_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, committed_cost_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
                </label>
                <label>
                  <span>Forecast</span>
                  <input type="number" min="0" step="0.01" value={budgetForm.forecast_to_complete_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, forecast_to_complete_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
                </label>
                <label className="job-financials-form__wide">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={budgetForm.note}
                    onChange={(event) => setBudgetForm((current) => ({ ...current, note: event.target.value, error: null, success: '' }))}
                    placeholder="Optional note"
                    disabled={budgetForm.isSaving}
                  />
                </label>
              </div>
              {budgetForm.error ? (
                <StatePanel tone="danger" eyebrow="Financial Save Failed" title="Line was not saved" description={budgetForm.error.message || 'Unexpected financials error.'} compact />
              ) : null}
              {budgetForm.success ? (
                <StatePanel tone="success" eyebrow="Saved" title="Financial line added" description={budgetForm.success} compact />
              ) : null}
              <div className="job-financials-form__actions">
                <button type="submit" className="primary-button" disabled={budgetForm.isSaving || !budgetForm.description.trim()}>
                  <Plus aria-hidden="true" /> {budgetForm.isSaving ? 'Saving...' : 'Add Financial Line'}
                </button>
              </div>
            </form>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Read Only"
              title="Financial writes require selected-job budget approval permission"
              description="You can view financial lines when allowed by financial permissions. Adding budget lines follows the selected job division and budget approval boundary."
              compact
            />
          )}
        </>
      );
    }

    if (activeTab === 'schedule') {
      const completeCount = jobSchedule.items.filter((item) => item.status === 'complete').length;
      const delayedCount = jobSchedule.items.filter((item) => item.status === 'delayed').length;
      const datedItems = jobSchedule.items.filter((item) => item.target_date);
      const overdueCount = jobSchedule.items.filter((item) => {
        const remaining = daysUntil(item.target_date);
        return remaining !== null && remaining < 0 && item.status !== 'complete';
      }).length;
      const nextItem = datedItems
        .filter((item) => item.status !== 'complete')
        .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)))[0] ?? null;
      const scheduleColumns = [
        ...JOB_SCHEDULE_COLUMNS,
        {
          key: 'actions',
          header: 'Actions',
          render: (row) => {
            if (!canManageSelectedJob) return 'Read only';
            const isBusy = scheduleAction.id === row.id;
            const currentIndex = jobSchedule.items.findIndex((item) => item.id === row.id);
            return (
              <div className="job-schedule-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleScheduleMove(row, 'up')}
                  disabled={isBusy || currentIndex <= 0}
                  title="Move up"
                >
                  <ArrowUp aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleScheduleMove(row, 'down')}
                  disabled={isBusy || currentIndex === jobSchedule.items.length - 1}
                  title="Move down"
                >
                  <ArrowDown aria-hidden="true" />
                </button>
                <button type="button" className="secondary-button" onClick={() => startScheduleEdit(row)} disabled={isBusy}>
                  Edit
                </button>
                <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleScheduleArchive(row)} disabled={isBusy}>
                  {isBusy && scheduleAction.action === 'archive' ? 'Archiving...' : 'Archive'}
                </button>
              </div>
            );
          },
        },
      ];

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Items" value={jobSchedule.items.length} detail="Active schedule rows" />
            <SummaryCard label="Complete" value={`${completeCount}/${jobSchedule.items.length}`} detail="Finished milestones" tone={completeCount && completeCount === jobSchedule.items.length ? 'good' : 'default'} />
            <SummaryCard label="Delayed" value={delayedCount} detail="Marked delayed" tone={delayedCount ? 'warn' : 'good'} />
            <SummaryCard label="Overdue" value={overdueCount} detail="Past target and not complete" tone={overdueCount ? 'warn' : 'good'} />
            <SummaryCard label="Next" value={nextItem ? formatDate(nextItem.target_date) : '-'} detail={nextItem?.title || 'No dated open item'} />
          </div>

          <DataTable
            columns={scheduleColumns}
            rows={jobSchedule.items}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={jobSchedule.isLoading}
            error={jobSchedule.error}
            dense
            minWidth="1180px"
            emptyTitle="No schedule items for this job"
            emptyDescription="Add flat milestones or tasks to track key target dates. No calendar sync, dependencies, assignments, or reminders are created."
          />
          {scheduleAction.error ? (
            <StatePanel
              tone="danger"
              eyebrow="Schedule Action Failed"
              title="Could not update this schedule item"
              description={scheduleAction.error.message || 'Unexpected schedule action error.'}
              compact
            />
          ) : null}

          {canManageSelectedJob ? (
            <form className="job-schedule-form" onSubmit={handleScheduleSave}>
              <Toolbar
                eyebrow={scheduleForm.id ? 'Edit' : 'Add'}
                title={scheduleForm.id ? 'Edit schedule item' : 'Add schedule item'}
                description="Schedule tracks key milestones and tasks for this job. It does not sync with a calendar or manage dependencies between items."
                actions={scheduleForm.id ? (
                  <button type="button" className="secondary-button" onClick={resetScheduleForm} disabled={scheduleForm.isSaving}>
                    Cancel Edit
                  </button>
                ) : null}
              />
              <div className="job-schedule-form__grid">
                <label className="job-schedule-form__wide">
                  <span>Title</span>
                  <input
                    type="text"
                    value={scheduleForm.title}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, title: event.target.value, error: null, success: '' }))}
                    placeholder="Rough-in, inspection, trim-out..."
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={scheduleForm.status}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, status: event.target.value, error: null, success: '' }))}
                    disabled={scheduleForm.isSaving}
                  >
                    {SCHEDULE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{formatScheduleStatus(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Target date</span>
                  <input
                    type="date"
                    value={scheduleForm.target_date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, target_date: event.target.value, error: null, success: '' }))}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label>
                  <span>Sort order</span>
                  <input
                    type="number"
                    step="1"
                    value={scheduleForm.sort_order}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, sort_order: event.target.value, error: null, success: '' }))}
                    placeholder={String(nextScheduleSortOrder())}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Description</span>
                  <input
                    type="text"
                    value={scheduleForm.description}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, description: event.target.value, error: null, success: '' }))}
                    placeholder="Optional short description"
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={scheduleForm.note}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, note: event.target.value, error: null, success: '' }))}
                    placeholder="Optional schedule note"
                    disabled={scheduleForm.isSaving}
                  />
                </label>
              </div>
              {scheduleForm.error ? (
                <StatePanel tone="danger" eyebrow="Schedule Save Failed" title="Item was not saved" description={scheduleForm.error.message || 'Unexpected schedule error.'} compact />
              ) : null}
              {scheduleForm.success ? (
                <StatePanel tone="success" eyebrow="Saved" title="Schedule item saved" description={scheduleForm.success} compact />
              ) : null}
              <div className="job-schedule-form__actions">
                <button type="submit" className="primary-button" disabled={scheduleForm.isSaving || !scheduleForm.title.trim()}>
                  <Plus aria-hidden="true" /> {scheduleForm.isSaving ? 'Saving...' : scheduleForm.id ? 'Save Schedule Item' : 'Add Schedule Item'}
                </button>
              </div>
            </form>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Read Only"
              title="Schedule writes require selected-job management permission"
              description="You can view schedule items for jobs you can see. Adding, editing, archiving, and ordering follow the selected job division boundary."
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
          <SummaryCard label="Financials" value={canViewFinancials ? 'Available' : 'Hidden'} detail="Gated by financial permission" />
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
            title="Controlled Jobs workspace"
            description="Materials are hidden for now. Transactions, external accounting, calendar sync, dependency logic, and final RLS cleanup stay deferred."
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
        description="Live Jobs foundation with selected v3 modules restored against the existing Supabase tables and permission gates."
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
              <p>Jobs now carries Details, Buyout, Financials, and Documents slices while the remaining modules stay bounded.</p>
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
                    { label: 'Manage', value: canManageSelectedJob ? 'Granted' : 'Read only' },
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
              title="Financials are permission gated"
              description="Budget forecast fields are live for authorized users. Purchase orders, invoices, and accounting sync remain outside this slice."
              tone="neutral"
              compact
              actions={<CircleDollarSign aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Reserved Surfaces"
              title="Calendar and dependency engines stay separate"
              description="Schedule uses the locked flat task list only. Documents are job-owned, while external calendar sync and dependency management remain reserved."
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
