import { useAuth, useUser } from '@clerk/clerk-react';
import {
  ArrowLeft,
  Archive,
  Boxes,
  ClipboardList,
  Calculator,
  FileText,
  History,
  LockKeyhole,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Tags,
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
import { JOB_DOCUMENT_CATEGORIES, documentCategoryLabel } from '../documents/documentCategories.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_ESTIMATES = Object.freeze([]);
const EMPTY_ESTIMATE_HISTORY = Object.freeze([]);
const EMPTY_ESTIMATE_PRICING = Object.freeze([]);
const EMPTY_ESTIMATE_SNAPSHOTS = Object.freeze([]);
const EMPTY_ESTIMATE_DOCUMENTS = Object.freeze([]);
const EMPTY_ESTIMATE_TAKEOFFS = Object.freeze([]);
const EMPTY_ESTIMATE_TAKEOFF_LINES = Object.freeze([]);
const EMPTY_ASSEMBLIES = Object.freeze([]);
const EMPTY_CATALOG_ITEMS = Object.freeze([]);
const DOCUMENT_BUCKET = 'northgate-files';
const DEFAULT_DOCUMENT_CATEGORY = 'contracts';

const ESTIMATE_STATUS_OPTIONS = ['draft', 'pursuit', 'submitted', 'approved', 'rejected'];
const ESTIMATE_PRICING_CATEGORIES = ['labor', 'material', 'equipment', 'subcontract', 'other'];

const DEFAULT_UPLOAD_STATE = Object.freeze({
  category: DEFAULT_DOCUMENT_CATEGORY,
  description: '',
  file: null,
  isUploading: false,
  error: null,
  success: '',
});

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

const DEFAULT_PRICING_FORM = Object.freeze({
  id: '',
  category: 'material',
  description: '',
  quantity: '1',
  unit: '',
  unit_cost: '',
  markup_percent: '0',
  sort_order: '',
  note: '',
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

const ESTIMATE_PRICING_SELECT_FIELDS = [
  'id',
  'estimate_id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'category',
  'description',
  'quantity',
  'unit',
  'unit_cost',
  'markup_percent',
  'line_total',
  'sort_order',
  'note',
  'created_by',
].join(', ');

const ESTIMATE_SNAPSHOT_SELECT_FIELDS = [
  'id',
  'estimate_id',
  'division',
  'created_at',
  'approved_at',
  'approved_by',
  'approval_note',
  'estimate_number',
  'title',
  'customer_name',
  'pricing_total',
  'pricing_line_count',
  'locked',
].join(', ');

const ESTIMATE_DOCUMENT_SELECT_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'owner_type',
  'owner_id',
  'division',
  'storage_path',
  'document_type',
  'file_name',
  'description',
  'file_size_bytes',
  'mime_type',
  'created_by',
].join(', ');

const ESTIMATE_VIEWS = [
  { key: 'all', label: 'All Estimates', icon: FileText, description: 'Every visible estimate.' },
  { key: 'mine', label: 'My Estimates', icon: UserRound, description: 'Estimates assigned to the current user.' },
  { key: 'drafts', label: 'Drafts', icon: Pencil, description: 'Draft and pursuit estimates.' },
  { key: 'submitted', label: 'Submitted', icon: Send, description: 'Sent estimates awaiting an outcome.' },
  { key: 'approved', label: 'Approved', icon: ShieldCheck, description: 'Locked approval snapshots.' },
];

const ESTIMATOR_WORKSPACE_TABS = [
  { key: 'estimates', label: 'Estimates', meta: 'Live' },
  { key: 'takeoffs', label: 'Takeoffs', meta: 'New' },
  { key: 'proposals', label: 'Proposals', meta: 'Future' },
  { key: 'assemblies', label: 'Assembly Library', meta: 'New' },
  { key: 'price-list', label: 'Price List', meta: 'Catalog' },
  { key: 'settings', label: 'Settings', meta: 'Setup' },
];

const ESTIMATE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pricing', label: 'Pricing', meta: 'Live' },
  { key: 'documents', label: 'Documents', meta: 'Live' },
  { key: 'approval', label: 'Approval', meta: 'Live' },
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

const ESTIMATE_PRICING_COLUMNS = [
  { key: 'category', header: 'Category', render: (row) => formatPricingCategory(row.category) },
  { key: 'description', header: 'Description', render: (row) => <strong>{row.description}</strong> },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatNumber(row.quantity) },
  { key: 'unit', header: 'Unit', fallback: '-' },
  { key: 'unit_cost', header: 'Unit Cost', align: 'right', render: (row) => formatMoney(row.unit_cost) },
  { key: 'markup_percent', header: 'Markup', align: 'right', render: (row) => `${formatNumber(row.markup_percent)}%` },
  { key: 'line_total', header: 'Total', align: 'right', render: (row) => formatMoney(row.line_total) },
];

const ESTIMATE_SNAPSHOT_COLUMNS = [
  { key: 'approved_at', header: 'Approved', render: (row) => formatDateTime(row.approved_at) },
  { key: 'approved_by', header: 'Approved By', fallback: '-' },
  { key: 'pricing_total', header: 'Snapshot Total', align: 'right', render: (row) => formatMoney(row.pricing_total) },
  { key: 'pricing_line_count', header: 'Lines', align: 'right' },
  { key: 'approval_note', header: 'Note', fallback: '-' },
];

const ESTIMATE_DOCUMENT_COLUMNS = [
  { key: 'file_name', header: 'Document', render: (row) => <strong>{row.file_name || 'Untitled document'}</strong> },
  { key: 'document_type', header: 'Category', render: (row) => documentCategoryLabel(row.document_type) },
  { key: 'description', header: 'Description', fallback: 'No description' },
  { key: 'created_by', header: 'Uploaded by', fallback: 'Not recorded' },
  { key: 'created_at', header: 'Uploaded', render: (row) => formatDateTime(row.created_at) },
];

const ESTIMATE_TAKEOFF_SELECT_FIELDS = [
  'id',
  'estimate_id',
  'division',
  'created_at',
  'updated_at',
  'name',
  'area',
  'system',
  'description',
  'sort_order',
].join(', ');

const ESTIMATE_TAKEOFF_LINE_SELECT_FIELDS = [
  'id',
  'estimate_id',
  'takeoff_id',
  'division',
  'created_at',
  'line_type',
  'description',
  'quantity',
  'waste_percent',
  'unit',
  'unit_cost_snapshot',
  'labor_rate_hrs_snapshot',
  'labor_rate_per_hour_snapshot',
  'material_total',
  'labor_hours_total',
  'labor_total',
  'line_total',
  'one_time_use',
  'save_to_library',
  'sort_order',
].join(', ');

const ASSEMBLY_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'assembly_code',
  'name',
  'category',
  'unit',
  'description',
  'is_library_item',
  'source_estimate_id',
].join(', ');

const CATALOG_ITEM_SELECT_FIELDS = [
  'id',
  'name',
  'sku',
  'description',
  'category',
  'unit',
  'price_per_unit',
  'labor_rate_hrs',
  'inventory_tracking_status',
  'estimating_enabled',
  'neca_labor_unit',
  'is_active',
  'is_archived',
].join(', ');

const ESTIMATE_TAKEOFF_COLUMNS = [
  { key: 'name', header: 'Takeoff', render: (row) => <strong>{row.name}</strong> },
  { key: 'area', header: 'Area', fallback: '-' },
  { key: 'system', header: 'System', fallback: '-' },
  { key: 'description', header: 'Description', fallback: '-' },
  { key: 'sort_order', header: 'Sort', align: 'right' },
];

const ESTIMATE_TAKEOFF_LINE_COLUMNS = [
  { key: 'line_type', header: 'Type', render: (row) => formatLineType(row.line_type) },
  { key: 'description', header: 'Description', render: (row) => <strong>{row.description}</strong> },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatNumber(row.quantity) },
  { key: 'unit', header: 'Unit', fallback: '-' },
  { key: 'material_total', header: 'Material', align: 'right', render: (row) => formatMoney(row.material_total) },
  { key: 'labor_hours_total', header: 'Labor Hrs', align: 'right', render: (row) => formatNumber(row.labor_hours_total) },
  { key: 'line_total', header: 'Total', align: 'right', render: (row) => formatMoney(row.line_total) },
];

const ASSEMBLY_COLUMNS = [
  { key: 'assembly_code', header: 'Code', fallback: '-' },
  { key: 'name', header: 'Assembly', render: (row) => <strong>{row.name}</strong> },
  { key: 'category', header: 'Category', fallback: '-' },
  { key: 'unit', header: 'Unit', fallback: '-' },
  { key: 'division', header: 'Division' },
  { key: 'is_library_item', header: 'Library', render: (row) => (row.is_library_item ? 'Yes' : 'One-time') },
];

const CATALOG_ITEM_COLUMNS = [
  { key: 'name', header: 'Material', render: (row) => <strong>{row.name}</strong> },
  { key: 'sku', header: 'SKU', fallback: '-' },
  { key: 'category', header: 'Category', fallback: '-' },
  { key: 'unit', header: 'Unit', fallback: '-' },
  { key: 'price_per_unit', header: 'Unit Cost', align: 'right', render: (row) => formatMoney(row.price_per_unit) },
  { key: 'labor_rate_hrs', header: 'NECA Hrs', align: 'right', render: (row) => formatNumber(row.labor_rate_hrs) },
  { key: 'inventory_tracking_status', header: 'Inventory', render: (row) => formatInventoryTrackingStatus(row.inventory_tracking_status) },
];

const STATUS_RULES = [
  ['draft', 'In progress, not submitted.'],
  ['pursuit', 'Saved lead or opportunity, not an active job.'],
  ['submitted', 'Sent to the client.'],
  ['approved', 'Approved with an immutable estimate snapshot.'],
  ['rejected', 'Declined by the client.'],
  ['archived', 'Soft archived with a required reason and audit log.'],
];

function estimateLabel(estimate) {
  return estimate?.estimate_number || estimate?.title || estimate?.id || 'Estimate';
}

function formatEstimateStatus(status) {
  return (status || 'draft').replaceAll('_', ' ');
}

function formatPricingCategory(value) {
  return (value || 'other').replaceAll('_', ' ');
}

function formatLineType(value) {
  return (value || 'other').replaceAll('_', ' ');
}

function formatInventoryTrackingStatus(value) {
  switch (value) {
    case 'in_inventory':
      return 'In inventory';
    case 'retired':
      return 'Retired';
    case 'not_stocked':
    default:
      return 'Catalog only';
  }
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '$0.00';
  return numeric.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let amount = size / 1024;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[unitIndex]}`;
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
    case 'estimate_id':
      return 'estimate';
    case 'unit_cost':
      return 'unit cost';
    case 'markup_percent':
      return 'markup';
    case 'line_total':
      return 'line total';
    case 'sort_order':
      return 'sort order';
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

function sanitizeDocumentFileName(fileName) {
  const cleaned = String(fileName || 'document')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || 'document';
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

function pricingToForm(row) {
  return {
    ...DEFAULT_PRICING_FORM,
    id: row.id,
    category: ESTIMATE_PRICING_CATEGORIES.includes(row.category) ? row.category : 'other',
    description: row.description ?? '',
    quantity: row.quantity ?? '1',
    unit: row.unit ?? '',
    unit_cost: row.unit_cost ?? '',
    markup_percent: row.markup_percent ?? '0',
    sort_order: row.sort_order ?? '',
    note: row.note ?? '',
  };
}

function pricingPayloadFromForm(form) {
  return {
    category: ESTIMATE_PRICING_CATEGORIES.includes(form.category) ? form.category : 'other',
    description: form.description.trim(),
    quantity: form.quantity === '' ? 0 : Number(form.quantity),
    unit: form.unit.trim() || null,
    unit_cost: form.unit_cost === '' ? 0 : Number(form.unit_cost),
    markup_percent: form.markup_percent === '' ? 0 : Number(form.markup_percent),
    sort_order: form.sort_order === '' ? 0 : Number.parseInt(form.sort_order, 10),
    note: form.note.trim() || null,
  };
}

function canEditEstimateDivision(permissions, rowDivision) {
  if (permissions?.permissionSource !== 'server' || permissions?.canEstimate !== true || !rowDivision) return false;
  if (['Developer', 'Manager'].includes(permissions?.role)) return true;
  return permissions?.division === rowDivision;
}

function canApproveEstimateDivision(permissions, rowDivision) {
  if (permissions?.permissionSource !== 'server' || permissions?.canApproveEstimates !== true || !rowDivision) return false;
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

function useEstimatePricing({ enabled, estimateId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    lines: EMPTY_ESTIMATE_PRICING,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !estimateId) {
        setState({ isLoading: false, error: null, lines: EMPTY_ESTIMATE_PRICING });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('estimate_pricing_lines')
          .select(ESTIMATE_PRICING_SELECT_FIELDS)
          .eq('estimate_id', estimateId)
          .is('archived_at', null)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            lines: data ?? EMPTY_ESTIMATE_PRICING,
          });
        }
      } catch (error) {
        console.error('Estimate pricing failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            lines: EMPTY_ESTIMATE_PRICING,
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

function useEstimateSnapshots({ enabled, estimateId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    snapshots: EMPTY_ESTIMATE_SNAPSHOTS,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !estimateId) {
        setState({ isLoading: false, error: null, snapshots: EMPTY_ESTIMATE_SNAPSHOTS });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('estimate_snapshots')
          .select(ESTIMATE_SNAPSHOT_SELECT_FIELDS)
          .eq('estimate_id', estimateId)
          .order('approved_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            snapshots: data ?? EMPTY_ESTIMATE_SNAPSHOTS,
          });
        }
      } catch (error) {
        console.error('Estimate snapshots failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            snapshots: EMPTY_ESTIMATE_SNAPSHOTS,
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

function useEstimateDocuments({ enabled, estimateId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    documents: EMPTY_ESTIMATE_DOCUMENTS,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !estimateId) {
        setState({ isLoading: false, error: null, documents: EMPTY_ESTIMATE_DOCUMENTS });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('documents')
          .select(ESTIMATE_DOCUMENT_SELECT_FIELDS)
          .eq('owner_type', 'estimate')
          .eq('owner_id', estimateId)
          .is('archived_at', null)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            documents: data ?? EMPTY_ESTIMATE_DOCUMENTS,
          });
        }
      } catch (error) {
        console.error('Estimate documents failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            documents: EMPTY_ESTIMATE_DOCUMENTS,
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

function useEstimateTakeoffReadModel({ enabled, estimateId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    takeoffs: EMPTY_ESTIMATE_TAKEOFFS,
    lines: EMPTY_ESTIMATE_TAKEOFF_LINES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !estimateId) {
        setState({ isLoading: false, error: null, takeoffs: EMPTY_ESTIMATE_TAKEOFFS, lines: EMPTY_ESTIMATE_TAKEOFF_LINES });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const [takeoffsResult, linesResult] = await Promise.all([
          client
            .from('estimate_takeoffs')
            .select(ESTIMATE_TAKEOFF_SELECT_FIELDS)
            .eq('estimate_id', estimateId)
            .is('archived_at', null)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
          client
            .from('estimate_takeoff_lines')
            .select(ESTIMATE_TAKEOFF_LINE_SELECT_FIELDS)
            .eq('estimate_id', estimateId)
            .is('archived_at', null)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
        ]);

        if (takeoffsResult.error) throw takeoffsResult.error;
        if (linesResult.error) throw linesResult.error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            takeoffs: takeoffsResult.data ?? EMPTY_ESTIMATE_TAKEOFFS,
            lines: linesResult.data ?? EMPTY_ESTIMATE_TAKEOFF_LINES,
          });
        }
      } catch (error) {
        console.error('Estimate takeoffs failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            takeoffs: EMPTY_ESTIMATE_TAKEOFFS,
            lines: EMPTY_ESTIMATE_TAKEOFF_LINES,
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

function useAssemblyLibrary({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    assemblies: EMPTY_ASSEMBLIES,
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
          .from('assemblies')
          .select(ASSEMBLY_SELECT_FIELDS)
          .is('archived_at', null)
          .order('name', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            assemblies: data ?? EMPTY_ASSEMBLIES,
          });
        }
      } catch (error) {
        console.error('Assembly library failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            assemblies: EMPTY_ASSEMBLIES,
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

function useCatalogItems({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    items: EMPTY_CATALOG_ITEMS,
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
          .from('items')
          .select(CATALOG_ITEM_SELECT_FIELDS)
          .eq('estimating_enabled', true)
          .eq('is_active', true)
          .eq('is_archived', false)
          .order('name', { ascending: true })
          .limit(250);

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            items: data ?? EMPTY_CATALOG_ITEMS,
          });
        }
      } catch (error) {
        console.error('Catalog items failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            items: EMPTY_CATALOG_ITEMS,
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

export function EstimatesWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const canReadEstimates = permissions?.permissionSource === 'server'
    && (permissions?.canEstimate === true || permissions?.canApproveEstimates === true);
  const directory = useEstimateDirectory({ enabled: canReadEstimates });
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('estimates');
  const [activeView, setActiveView] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [mode, setMode] = useState('browse');
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [search, setSearch] = useState('');
  const [estimateForm, setEstimateForm] = useState(DEFAULT_ESTIMATE_FORM);
  const [pricingForm, setPricingForm] = useState(DEFAULT_PRICING_FORM);
  const [uploadState, setUploadState] = useState(DEFAULT_UPLOAD_STATE);
  const [documentAction, setDocumentAction] = useState({ id: '', action: '', error: null });
  const [estimateAction, setEstimateAction] = useState({ action: '', error: null, success: '' });
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const estimates = directory.estimates;
  const selectedView = ESTIMATE_VIEWS.find((item) => item.key === activeView) ?? ESTIMATE_VIEWS[0];
  const canEstimate = permissions?.canEstimate === true;
  const canCreateEstimate = canEstimate && Boolean(permissions?.division);
  const draftCount = estimates.filter((estimate) => ['draft', 'pursuit'].includes(estimate.status)).length;
  const submittedCount = estimates.filter((estimate) => estimate.status === 'submitted').length;
  const approvedCount = estimates.filter((estimate) => estimate.status === 'approved').length;
  const myEstimateCount = estimates.filter((estimate) => estimate.estimator_id === permissions.userId).length;

  const estimateViews = ESTIMATE_VIEWS.map((view) => {
    const badge = {
      all: estimates.length,
      mine: myEstimateCount,
      drafts: draftCount,
      submitted: submittedCount,
      approved: approvedCount,
    }[view.key];
    return { ...view, badge };
  });

  const filteredEstimates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return estimates.filter((estimate) => {
      if (activeView === 'mine' && estimate.estimator_id !== permissions.userId) return false;
      if (activeView === 'drafts' && !['draft', 'pursuit'].includes(estimate.status)) return false;
      if (activeView === 'submitted' && estimate.status !== 'submitted') return false;
      if (activeView === 'approved' && estimate.status !== 'approved') return false;
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
  const estimatePricing = useEstimatePricing({
    enabled: permissions.permissionSource === 'server' && activeTab === 'pricing',
    estimateId: selectedEstimate?.id ?? '',
  });
  const estimateSnapshots = useEstimateSnapshots({
    enabled: permissions.permissionSource === 'server' && activeTab === 'approval',
    estimateId: selectedEstimate?.id ?? '',
  });
  const estimateDocuments = useEstimateDocuments({
    enabled: permissions.permissionSource === 'server' && activeTab === 'documents',
    estimateId: selectedEstimate?.id ?? '',
  });
  const estimateTakeoffs = useEstimateTakeoffReadModel({
    enabled: permissions.permissionSource === 'server' && activeWorkspaceTab === 'takeoffs',
    estimateId: selectedEstimate?.id ?? '',
  });
  const assemblyLibrary = useAssemblyLibrary({
    enabled: permissions.permissionSource === 'server' && activeWorkspaceTab === 'assemblies',
  });
  const catalogItems = useCatalogItems({
    enabled: permissions.permissionSource === 'server' && activeWorkspaceTab === 'price-list',
  });
  const canEditSelectedEstimate = canEditEstimateDivision(permissions, selectedEstimate?.division);
  const canArchiveSelectedEstimate = canEditSelectedEstimate && permissions?.canArchiveRecords === true;
  const canApproveSelectedEstimate = canApproveEstimateDivision(permissions, selectedEstimate?.division)
    && selectedEstimate?.status !== 'approved';
  const pricingTotal = estimatePricing.lines.reduce((total, line) => total + (Number(line.line_total) || 0), 0);
  const takeoffLineTotal = estimateTakeoffs.lines.reduce((total, line) => total + (Number(line.line_total) || 0), 0);
  const takeoffLaborHours = estimateTakeoffs.lines.reduce((total, line) => total + (Number(line.labor_hours_total) || 0), 0);
  const stockedCatalogCount = catalogItems.items.filter((item) => item.inventory_tracking_status === 'in_inventory').length;
  const catalogOnlyCount = catalogItems.items.filter((item) => item.inventory_tracking_status !== 'in_inventory').length;
  const oneTimeAssemblyCount = assemblyLibrary.assemblies.filter((assembly) => !assembly.is_library_item).length;
  const latestSnapshot = estimateSnapshots.snapshots[0] ?? null;

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
    setPricingForm(DEFAULT_PRICING_FORM);
    setUploadState(DEFAULT_UPLOAD_STATE);
    setDocumentAction({ id: '', action: '', error: null });
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function resetEstimateForm() {
    setEstimateForm(DEFAULT_ESTIMATE_FORM);
    setPricingForm(DEFAULT_PRICING_FORM);
    setUploadState(DEFAULT_UPLOAD_STATE);
    setDocumentAction({ id: '', action: '', error: null });
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
    setPricingForm(DEFAULT_PRICING_FORM);
    setUploadState(DEFAULT_UPLOAD_STATE);
    setDocumentAction({ id: '', action: '', error: null });
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function startEstimateEdit(estimate) {
    setSelectedEstimateId(estimate.id);
    setEstimateForm(estimateToForm(estimate));
    setPricingForm(DEFAULT_PRICING_FORM);
    setUploadState(DEFAULT_UPLOAD_STATE);
    setDocumentAction({ id: '', action: '', error: null });
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

  function startPricingEdit(row) {
    if (!canEditSelectedEstimate) return;
    setPricingForm(pricingToForm(row));
    setEstimateAction({ action: '', error: null, success: '' });
  }

  function resetPricingForm() {
    setPricingForm(DEFAULT_PRICING_FORM);
  }

  async function writeEstimateChangeLog(client, { tableName = 'estimates', action, recordId, beforeData, afterData, note }) {
    const userId = user?.id || permissions.userId || null;
    const userName = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || permissions.userId || 'Unknown User';
    const { error } = await client
      .from('change_logs')
      .insert({
        user_id: userId,
        user_name: userName,
        table_name: tableName,
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
      if (payload.status === 'approved' && existingEstimate?.status !== 'approved') {
        throw new Error('Use the Approval tab to approve estimates so a locked snapshot is created.');
      }

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

  async function handleEstimateApproval() {
    if (!selectedEstimate || estimateAction.action) return;

    if (!canApproveSelectedEstimate) {
      setEstimateAction({
        action: '',
        error: new Error('Estimate approval requires can_approve_estimates permission for this division.'),
        success: '',
      });
      return;
    }

    const note = window.prompt(`Approve "${estimateLabel(selectedEstimate)}" and lock a snapshot? Add an approval note if needed.`);
    if (note === null) return;

    setEstimateAction({ action: 'approve', error: null, success: '' });

    try {
      const client = await getEstimateClient();
      const { error } = await client.rpc('approve_estimate', {
        p_estimate_id: selectedEstimate.id,
        p_note: note.trim() || null,
      });

      if (error) throw error;

      directory.reload();
      estimateSnapshots.reload();
      estimateHistory.reload();
      setActiveView('approved');
      setActiveTab('approval');
      setMode('browse');
      setEstimateAction({ action: '', error: null, success: `${estimateLabel(selectedEstimate)} approved and snapshot locked.` });
    } catch (error) {
      console.error('Estimate approval failed', error);
      setEstimateAction({ action: '', error, success: '' });
    }
  }

  async function handlePricingSave(event) {
    event.preventDefault();
    if (!selectedEstimate || !canEditSelectedEstimate || pricingForm.isSaving) return;

    if (!pricingForm.description.trim()) {
      setPricingForm((current) => ({ ...current, error: new Error('Enter a pricing description before saving.') }));
      return;
    }

    const payload = pricingPayloadFromForm(pricingForm);
    if (!Number.isFinite(payload.quantity) || payload.quantity < 0) {
      setPricingForm((current) => ({ ...current, error: new Error('Quantity must be zero or greater.') }));
      return;
    }
    if (!Number.isFinite(payload.unit_cost) || payload.unit_cost < 0) {
      setPricingForm((current) => ({ ...current, error: new Error('Unit cost must be zero or greater.') }));
      return;
    }
    if (!Number.isFinite(payload.markup_percent) || payload.markup_percent < 0) {
      setPricingForm((current) => ({ ...current, error: new Error('Markup must be zero or greater.') }));
      return;
    }

    const existingLine = pricingForm.id
      ? estimatePricing.lines.find((line) => line.id === pricingForm.id)
      : null;

    setPricingForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const client = await getEstimateClient();
      const query = pricingForm.id
        ? client
          .from('estimate_pricing_lines')
          .update(payload)
          .eq('id', pricingForm.id)
          .select(ESTIMATE_PRICING_SELECT_FIELDS)
          .single()
        : client
          .from('estimate_pricing_lines')
          .insert({
            ...payload,
            estimate_id: selectedEstimate.id,
            division: selectedEstimate.division,
            created_by: permissions.userId,
          })
          .select(ESTIMATE_PRICING_SELECT_FIELDS)
          .single();

      const { data, error } = await query;
      if (error) throw error;

      await writeEstimateChangeLog(client, {
        tableName: 'estimate_pricing_lines',
        action: pricingForm.id ? 'update' : 'create',
        recordId: data?.id || pricingForm.id,
        beforeData: existingLine,
        afterData: data,
        note: pricingForm.id ? `${data?.description || 'Pricing line'} updated.` : `${data?.description || 'Pricing line'} added.`,
      });

      estimatePricing.reload();
      estimateHistory.reload();
      setPricingForm({ ...DEFAULT_PRICING_FORM, success: `${data?.description || 'Pricing line'} saved.` });
    } catch (error) {
      console.error('Estimate pricing save failed', error);
      setPricingForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleDocumentUpload(event) {
    event.preventDefault();
    if (!selectedEstimate || !canEditSelectedEstimate || uploadState.isUploading) return;

    const file = uploadState.file;
    if (!file) {
      setUploadState((current) => ({ ...current, error: new Error('Choose a file before uploading.') }));
      return;
    }

    if (!selectedEstimate.division) {
      setUploadState((current) => ({ ...current, error: new Error('This estimate does not have a division, so document upload is blocked.') }));
      return;
    }

    const category = JOB_DOCUMENT_CATEGORIES.some((item) => item.key === uploadState.category)
      ? uploadState.category
      : DEFAULT_DOCUMENT_CATEGORY;
    const documentId = crypto.randomUUID();
    const storagePath = `documents/estimate/${selectedEstimate.id}/${documentId}/${sanitizeDocumentFileName(file.name)}`;
    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || permissions.userId || 'Unknown User';

    setUploadState((current) => ({ ...current, isUploading: true, error: null, success: '' }));

    try {
      const client = await getEstimateClient();
      const insertPayload = {
        id: documentId,
        division: selectedEstimate.division,
        owner_type: 'estimate',
        owner_id: selectedEstimate.id,
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

      await writeEstimateChangeLog(client, {
        tableName: 'documents',
        action: 'create',
        recordId: documentId,
        beforeData: null,
        afterData: insertPayload,
        note: `${file.name} uploaded to ${documentCategoryLabel(category)}.`,
      });

      setUploadState({
        ...DEFAULT_UPLOAD_STATE,
        success: `${file.name} uploaded to ${documentCategoryLabel(category)}.`,
      });
      estimateDocuments.reload();
      estimateHistory.reload();
    } catch (error) {
      console.error('Estimate document upload failed', error);
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
      const client = await getEstimateClient();
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
        anchor.download = document.file_name || 'northgate-estimate-document';
        anchor.rel = 'noopener noreferrer';
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }

      setDocumentAction({ id: '', action: '', error: null });
    } catch (error) {
      console.error('Estimate document link failed', error);
      if (targetWindow && !targetWindow.closed) targetWindow.close();
      setDocumentAction({ id: '', action: '', error });
    }
  }

  async function handleDocumentArchive(document) {
    if (!document?.id || !selectedEstimate?.id || !canEditSelectedEstimate || documentAction.id) return;

    const reason = window.prompt(`Archive "${document.file_name || 'this document'}"? Enter a reason.`);
    if (!reason?.trim()) return;

    setDocumentAction({ id: document.id, action: 'archive', error: null });

    try {
      const client = await getEstimateClient();
      const { error } = await client.rpc('archive_estimate_document', {
        p_document_id: document.id,
        p_reason: reason.trim(),
      });

      if (error) throw error;

      setDocumentAction({ id: '', action: '', error: null });
      estimateDocuments.reload();
      estimateHistory.reload();
    } catch (error) {
      console.error('Estimate document archive failed', error);
      setDocumentAction({ id: '', action: '', error });
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

  const pricingColumns = [
    ...ESTIMATE_PRICING_COLUMNS,
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        canEditSelectedEstimate ? (
          <button type="button" className="secondary-button" onClick={() => startPricingEdit(row)} disabled={pricingForm.isSaving}>
            Edit
          </button>
        ) : 'Read only'
      ),
    },
  ];

  const documentColumns = [
    ...ESTIMATE_DOCUMENT_COLUMNS,
    {
      key: 'file_size_bytes',
      header: 'Size',
      render: (row) => formatBytes(row.file_size_bytes),
    },
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
            {canEditSelectedEstimate ? (
              <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleDocumentArchive(row)} disabled={isBusy}>
                {isBusy && documentAction.action === 'archive' ? 'Archiving...' : 'Archive'}
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const uploadedDocumentCategoryKeys = new Set(estimateDocuments.documents.map((document) => document.document_type).filter(Boolean));
  const documentChecklistRows = JOB_DOCUMENT_CATEGORIES.map((category) => ({
    ...category,
    status: uploadedDocumentCategoryKeys.has(category.key) ? 'uploaded' : 'missing',
  }));
  const uploadedDocumentCategoryCount = documentChecklistRows.filter((row) => row.status === 'uploaded').length;

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Estimates"
        description="Live estimate directory with division-scoped create, edit, pricing, documents, approval snapshots, archive, and audit history."
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
        <SummaryCard label="Approved" value={approvedCount} detail="Locked snapshots" tone={approvedCount ? 'good' : 'default'} />
        <SummaryCard label="Document Access" value={canEstimate ? 'Granted' : 'Scoped'} detail="Estimate-owned files" tone={canEstimate ? 'good' : 'warn'} developmentOnly />
        <SummaryCard label="Archive access" value={permissions?.canArchiveRecords ? 'Granted' : 'Hidden'} detail="Reason required" tone={permissions?.canArchiveRecords ? 'good' : 'warn'} developmentOnly />
      </div>

      <article className="card workspace-card estimates-nav-card">
        <WorkspaceTabs
          tabs={ESTIMATOR_WORKSPACE_TABS}
          activeKey={activeWorkspaceTab}
          onChange={setActiveWorkspaceTab}
          ariaLabel="Estimator workspace sections"
        />
      </article>

      {estimateAction.error ? (
        <StatePanel tone="danger" eyebrow="Estimate Action Failed" title="Estimate action did not complete" description={estimateAction.error.message || 'Unexpected estimate error.'} compact />
      ) : null}
      {estimateAction.success ? (
        <StatePanel tone="success" eyebrow="Saved" title="Estimate action complete" description={estimateAction.success} compact />
      ) : null}

      {activeWorkspaceTab === 'estimates' ? (
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
              <strong>Estimate workflow</strong>
              <p>Pricing, documents, approval snapshots, archive, and history are live.</p>
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
              emptyTitle={search ? 'No estimates matched this search' : activeView === 'approved' ? 'No approved estimates yet' : 'No estimates are visible'}
              emptyDescription={search
                ? 'Try searching by estimate number, title, customer, status, division, or scope.'
                : activeView === 'approved'
                  ? 'Approve an estimate from the Approval tab to create a locked snapshot and move it into this view.'
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
                  description={selectedEstimate.scope_summary || 'Estimate detail foundation. Pricing, documents, approval snapshots, archive, and history are live.'}
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
                {activeTab === 'pricing' ? (
                  <>
                    <div className="summary-grid summary-grid--compact">
                      <SummaryCard label="Pricing Lines" value={estimatePricing.lines.length} detail="Active line items" />
                      <SummaryCard label="Total Price" value={formatMoney(pricingTotal)} detail="Generated line totals" tone={pricingTotal ? 'accent' : 'default'} />
                      <SummaryCard label="Editable" value={canEditSelectedEstimate ? 'Yes' : 'No'} detail="Estimate scope" tone={canEditSelectedEstimate ? 'good' : 'warn'} />
                    </div>
                    <DataTable
                      columns={pricingColumns}
                      rows={estimatePricing.lines}
                      getRowKey={(row) => row.id}
                      permissions={permissions}
                      isLoading={estimatePricing.isLoading}
                      error={estimatePricing.error}
                      dense
                      minWidth="980px"
                      emptyTitle="No pricing lines yet"
                      emptyDescription="Add pricing lines for labor, material, equipment, subcontract, or other estimate costs."
                    />
                    {canEditSelectedEstimate ? (
                      <form className="job-financials-form" onSubmit={handlePricingSave}>
                        <Toolbar
                          eyebrow={pricingForm.id ? 'Edit' : 'Add'}
                          title={pricingForm.id ? 'Edit pricing line' : 'Add pricing line'}
                          description="Pricing is estimate-only planning data. Approval snapshots remain separate."
                          actions={pricingForm.id ? (
                            <button type="button" className="secondary-button" onClick={resetPricingForm} disabled={pricingForm.isSaving}>
                              Cancel Edit
                            </button>
                          ) : null}
                          dense
                        />
                        <div className="job-financials-form__grid">
                          <label>
                            <span>Category</span>
                            <select value={pricingForm.category} onChange={(event) => setPricingForm((current) => ({ ...current, category: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving}>
                              {ESTIMATE_PRICING_CATEGORIES.map((category) => (
                                <option key={category} value={category}>{formatPricingCategory(category)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="job-financials-form__wide">
                            <span>Description</span>
                            <input type="text" value={pricingForm.description} onChange={(event) => setPricingForm((current) => ({ ...current, description: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} required />
                          </label>
                          <label>
                            <span>Quantity</span>
                            <input type="number" min="0" step="0.0001" value={pricingForm.quantity} onChange={(event) => setPricingForm((current) => ({ ...current, quantity: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} />
                          </label>
                          <label>
                            <span>Unit</span>
                            <input type="text" value={pricingForm.unit} onChange={(event) => setPricingForm((current) => ({ ...current, unit: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} placeholder="ea, hr, lot..." />
                          </label>
                          <label>
                            <span>Unit Cost</span>
                            <input type="number" min="0" step="0.01" value={pricingForm.unit_cost} onChange={(event) => setPricingForm((current) => ({ ...current, unit_cost: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} />
                          </label>
                          <label>
                            <span>Markup %</span>
                            <input type="number" min="0" step="0.0001" value={pricingForm.markup_percent} onChange={(event) => setPricingForm((current) => ({ ...current, markup_percent: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} />
                          </label>
                          <label>
                            <span>Sort</span>
                            <input type="number" step="1" value={pricingForm.sort_order} onChange={(event) => setPricingForm((current) => ({ ...current, sort_order: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} />
                          </label>
                          <label className="job-financials-form__wide">
                            <span>Note</span>
                            <input type="text" value={pricingForm.note} onChange={(event) => setPricingForm((current) => ({ ...current, note: event.target.value, error: null, success: '' }))} disabled={pricingForm.isSaving} />
                          </label>
                        </div>
                        {pricingForm.error ? (
                          <StatePanel tone="danger" eyebrow="Pricing Save Failed" title="Pricing line was not saved" description={pricingForm.error.message || 'Unexpected pricing error.'} compact />
                        ) : null}
                        {pricingForm.success ? (
                          <StatePanel tone="success" eyebrow="Saved" title="Pricing line saved" description={pricingForm.success} compact />
                        ) : null}
                        <div className="job-financials-form__actions">
                          <button type="submit" className="primary-button" disabled={pricingForm.isSaving || !pricingForm.description.trim()}>
                            <Plus aria-hidden="true" /> {pricingForm.isSaving ? 'Saving...' : pricingForm.id ? 'Save Pricing Line' : 'Add Pricing Line'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <StatePanel tone="neutral" eyebrow="Read Only" title="Pricing writes require estimate edit scope" description="Users with estimate or approval read permission can review pricing, but only estimate editors for this division can add or edit lines." compact />
                    )}
                  </>
                ) : activeTab === 'documents' ? (
                  <>
                    <div className="summary-grid summary-grid--compact">
                      <SummaryCard label="Checklist" value={`${uploadedDocumentCategoryCount}/${JOB_DOCUMENT_CATEGORIES.length}`} detail="Visual only; not blocking" tone={uploadedDocumentCategoryCount === JOB_DOCUMENT_CATEGORIES.length ? 'good' : 'default'} />
                      <SummaryCard label="Uploaded" value={estimateDocuments.documents.length} detail="Visible estimate-owned documents" />
                      <SummaryCard label="Owner" value="Estimate" detail="Follows estimate visibility" />
                      <SummaryCard label="Edit" value={canEditSelectedEstimate ? 'Granted' : 'Read only'} detail="Estimate scope" tone={canEditSelectedEstimate ? 'good' : 'warn'} />
                    </div>

                    <section className="job-document-checklist" aria-label="Estimate document checklist">
                      {documentChecklistRows.map((category) => (
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
                      rows={estimateDocuments.documents}
                      getRowKey={(row) => row.id}
                      permissions={permissions}
                      isLoading={estimateDocuments.isLoading}
                      error={estimateDocuments.error}
                      dense
                      minWidth="980px"
                      emptyTitle="No documents uploaded for this estimate"
                      emptyDescription="The checklist can still show required categories before files exist."
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

                    {canEditSelectedEstimate ? (
                      <form className="job-document-upload" onSubmit={handleDocumentUpload}>
                        <Toolbar
                          eyebrow="Upload"
                          title="Add estimate document"
                          description="Uploads are estimate-owned and use the selected category to update the visual checklist."
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
                              key={`${selectedEstimate.id}-${uploadState.success || 'ready'}`}
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
                        title="Document uploads require estimate edit permission"
                        description="You can view documents for estimates you can see. Uploading and archiving follows the estimate edit boundary."
                        compact
                      />
                    )}
                  </>
                ) : activeTab === 'approval' ? (
                  <>
                    <div className="summary-grid summary-grid--compact">
                      <SummaryCard label="Snapshots" value={estimateSnapshots.snapshots.length} detail="Immutable approval records" />
                      <SummaryCard label="Latest Total" value={formatMoney(latestSnapshot?.pricing_total)} detail={latestSnapshot ? `${latestSnapshot.pricing_line_count} pricing line${latestSnapshot.pricing_line_count === 1 ? '' : 's'}` : 'No snapshot'} tone={latestSnapshot ? 'good' : 'default'} />
                      <SummaryCard label="Approval Access" value={canApproveSelectedEstimate ? 'Granted' : 'Read Only'} detail={selectedEstimate.status === 'approved' ? 'Already approved' : 'Permission scoped'} tone={canApproveSelectedEstimate ? 'good' : 'warn'} />
                    </div>
                    <Toolbar
                      eyebrow="Approval"
                      title="Locked approval snapshots"
                      description="Approving captures the estimate and active pricing lines in an immutable database snapshot."
                      actions={(
                        <button type="button" className="primary-button" onClick={handleEstimateApproval} disabled={!canApproveSelectedEstimate || estimateAction.action === 'approve'}>
                          <ShieldCheck aria-hidden="true" /> {estimateAction.action === 'approve' ? 'Approving...' : 'Approve Estimate'}
                        </button>
                      )}
                      dense
                    />
                    <DataTable
                      columns={ESTIMATE_SNAPSHOT_COLUMNS}
                      rows={estimateSnapshots.snapshots}
                      getRowKey={(row) => row.id}
                      permissions={permissions}
                      isLoading={estimateSnapshots.isLoading}
                      error={estimateSnapshots.error}
                      dense
                      minWidth="900px"
                      emptyTitle="No approval snapshots yet"
                      emptyDescription="Use the approval action when the estimate is ready to lock a snapshot."
                    />
                    {selectedEstimate.status === 'approved' ? (
                      <StatePanel tone="success" eyebrow="Approved" title="This estimate has been approved" description="The approval snapshot is locked at the database layer and can be reviewed here." compact actions={<LockKeyhole aria-hidden="true" />} />
                    ) : canApproveSelectedEstimate ? (
                      <StatePanel tone="neutral" eyebrow="Ready" title="Approval will lock the current pricing" description="Review the Pricing tab before approving. The snapshot will capture active pricing lines at approval time." compact />
                    ) : (
                      <StatePanel tone="neutral" eyebrow="Read Only" title="Approval requires scoped approval permission" description="You can review approval snapshots, but only scoped approvers can approve this estimate." compact />
                    )}
                  </>
                ) : activeTab === 'history' ? (
                  <>
                    <div className="summary-grid summary-grid--compact">
                      <SummaryCard label="Audit Entries" value={estimateHistory.rows.length} detail="Recent estimate changes" />
                      <SummaryCard label="Updates" value={estimateHistory.rows.filter((row) => row.action === 'update').length} detail="Recorded edits" />
                      <SummaryCard label="Pricing" value={estimateHistory.rows.filter((row) => row.table_name === 'estimate_pricing_lines').length} detail="Line item changes" />
                      <SummaryCard label="Approvals" value={estimateHistory.rows.filter((row) => row.table_name === 'estimate_snapshots').length} detail="Snapshot changes" />
                    </div>
                    <Toolbar
                      eyebrow="Audit"
                      title="Estimate History"
                      description="Read-only audit entries for this estimate and its pricing lines."
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
                      emptyDescription="Future estimate and pricing create/edit actions will appear here."
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
              description="Approvals create locked snapshot rows and use a database trigger to block edits or deletes."
              tone="good"
              compact
              actions={<LockKeyhole aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Status Model"
              title="Directory statuses are active"
              description="Draft, pursuit, submitted, approved, rejected, and archived are active directory states."
              tone="neutral"
              compact
              actions={<History aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Approval Flow"
              title="Approval is snapshot-based"
              description="The Approval tab runs a scoped RPC that locks estimate and pricing data before changing status to approved."
              tone="good"
              compact
              actions={<Calculator aria-hidden="true" />}
            />
          </section>

          <article className="card workspace-card">
            <Toolbar
              eyebrow="Locked Vocabulary"
              title="Estimate statuses"
              description="These labels preserve the planned estimate lifecycle while live directory and pricing fields come online."
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
      ) : activeWorkspaceTab === 'takeoffs' ? (
        <article className="card workspace-card estimates-workspace">
          <Toolbar
            eyebrow="Takeoffs"
            title={selectedEstimate ? `${estimateLabel(selectedEstimate)} takeoff` : 'Select an estimate'}
            description={selectedEstimate
              ? 'Live takeoff sections and generated material/labor lines for the selected estimate.'
              : 'Choose an estimate from the Estimates tab before building a takeoff.'}
            actions={(
              <button type="button" className="secondary-button" onClick={estimateTakeoffs.reload} disabled={!selectedEstimate || estimateTakeoffs.isLoading}>
                Refresh
              </button>
            )}
          />
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Takeoff Sections" value={estimateTakeoffs.takeoffs.length} detail="Estimate takeoff groups" />
            <SummaryCard label="Takeoff Lines" value={estimateTakeoffs.lines.length} detail="Material/labor rows" />
            <SummaryCard label="Labor Hours" value={formatNumber(takeoffLaborHours)} detail="Generated from catalog rates" />
            <SummaryCard label="Takeoff Total" value={formatMoney(takeoffLineTotal)} detail="Material and labor total" tone={takeoffLineTotal ? 'accent' : 'default'} />
          </div>
          {selectedEstimate ? (
            <>
              <DataTable
                columns={ESTIMATE_TAKEOFF_COLUMNS}
                rows={estimateTakeoffs.takeoffs}
                getRowKey={(row) => row.id}
                permissions={permissions}
                isLoading={estimateTakeoffs.isLoading}
                error={estimateTakeoffs.error}
                dense
                minWidth="760px"
                emptyTitle="No takeoff sections yet"
                emptyDescription="The next build step will add section and assembly input controls here."
              />
              <DataTable
                columns={ESTIMATE_TAKEOFF_LINE_COLUMNS}
                rows={estimateTakeoffs.lines}
                getRowKey={(row) => row.id}
                permissions={permissions}
                isLoading={estimateTakeoffs.isLoading}
                error={estimateTakeoffs.error}
                dense
                minWidth="980px"
                emptyTitle="No takeoff lines yet"
                emptyDescription="Takeoff lines will summarize assemblies, catalog materials, one-time items, and labor."
              />
            </>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Estimate Required"
              title="Open an estimate first"
              description="Takeoffs belong to an estimate, so the takeoff workspace becomes active after a row is selected on the Estimates tab."
            />
          )}
        </article>
      ) : activeWorkspaceTab === 'assemblies' ? (
        <article className="card workspace-card estimates-workspace">
          <Toolbar
            eyebrow="Assembly Library"
            title="Reusable assemblies"
            description="Assemblies are task templates made from catalog materials, labor, equipment, subcontract, or other rows."
            actions={(
              <button type="button" className="secondary-button" onClick={assemblyLibrary.reload} disabled={assemblyLibrary.isLoading}>
                Refresh
              </button>
            )}
          />
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Visible Assemblies" value={assemblyLibrary.assemblies.length} detail="Division-scoped library" />
            <SummaryCard label="Library Items" value={assemblyLibrary.assemblies.length - oneTimeAssemblyCount} detail="Reusable templates" />
            <SummaryCard label="One-time" value={oneTimeAssemblyCount} detail="Estimate-specific assemblies" />
            <SummaryCard label="Write Access" value={canEstimate ? 'Granted' : 'Read only'} detail="Estimate permission" tone={canEstimate ? 'good' : 'warn'} />
          </div>
          <DataTable
            columns={ASSEMBLY_COLUMNS}
            rows={assemblyLibrary.assemblies}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={assemblyLibrary.isLoading}
            error={assemblyLibrary.error}
            dense
            minWidth="860px"
            emptyTitle="No assemblies in the library yet"
            emptyDescription="The next pass will add create/edit controls and the assembly item builder."
          />
        </article>
      ) : activeWorkspaceTab === 'price-list' ? (
        <article className="card workspace-card estimates-workspace">
          <Toolbar
            eyebrow="Price List"
            title="Master material catalog"
            description="Estimate materials and NECA labor rates come from the shared items catalog. Inventory only marks whether the item is stocked."
            actions={(
              <button type="button" className="secondary-button" onClick={catalogItems.reload} disabled={catalogItems.isLoading}>
                Refresh
              </button>
            )}
          />
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Catalog Items" value={catalogItems.items.length} detail="Estimating-enabled rows" />
            <SummaryCard label="In Inventory" value={stockedCatalogCount} detail="Stocked material" tone={stockedCatalogCount ? 'good' : 'default'} />
            <SummaryCard label="Catalog Only" value={catalogOnlyCount} detail="Estimating/search only" />
            <SummaryCard label="NECA Rates" value={catalogItems.items.filter((item) => Number(item.labor_rate_hrs) > 0).length} detail="Rows with labor hours" tone="accent" />
          </div>
          <DataTable
            columns={CATALOG_ITEM_COLUMNS}
            rows={catalogItems.items}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={catalogItems.isLoading}
            error={catalogItems.error}
            dense
            minWidth="980px"
            emptyTitle="No estimating catalog items are visible"
            emptyDescription="Catalog rows need estimating enabled, active status, and estimate read permission."
          />
        </article>
      ) : activeWorkspaceTab === 'proposals' ? (
        <article className="card workspace-card estimates-workspace">
          <StatePanel
            tone="neutral"
            eyebrow="Proposal Builder"
            title="Proposal builder is staged for a later pass"
            description="This tab is reserved so the estimating workflow has the right shape now. We will wire proposal templates after estimates, takeoffs, assemblies, and catalog pricing are stable."
            compact
            actions={<FileText aria-hidden="true" />}
          />
        </article>
      ) : (
        <article className="card workspace-card estimates-workspace">
          <Toolbar
            eyebrow="Settings"
            title="Estimator setup"
            description="Current estimating configuration and the remaining controls needed before rollout."
          />
          <section className="estimates-boundary-grid">
            <StatePanel
              tone="good"
              eyebrow="Catalog Strategy"
              title="One master material catalog"
              description="The items table now supports estimating materials, NECA labor rates, and inventory visibility without splitting into a second material database."
              compact
              actions={<Tags aria-hidden="true" />}
            />
            <StatePanel
              tone="neutral"
              eyebrow="Conversion Flow"
              title="Estimate converts to job header first"
              description="The job conversion step still needs UI and RPC work. Budget import should remain a separate option after the job is created or linked."
              compact
              actions={<ClipboardList aria-hidden="true" />}
            />
            <StatePanel
              tone="neutral"
              eyebrow="Next Controls"
              title="Assembly and takeoff builders come next"
              description="The tables are live; the next implementation pass should add create/edit controls for assembly items and takeoff lines."
              compact
              actions={<Boxes aria-hidden="true" />}
            />
          </section>
        </article>
      )}
    </>
  );
}
