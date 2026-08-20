import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardList,
  FolderOpen,
  History,
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
import { BUDGET_TEMPLATES } from './gablesServiceTemplate.js';
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
const DEFAULT_JOB_FORM = Object.freeze({
  job_number: '',
  name: '',
  status: 'active',
  job_type: 'job',
  service_call_number: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  description: '',
  notes: '',
  isSaving: false,
  error: null,
  success: '',
});
const EMPTY_BUYOUT_LINES = Object.freeze([]);
const BUYOUT_STATUS_OPTIONS = ['pending', 'ordered', 'received', 'cancelled'];
const DEFAULT_BUYOUT_FORM = Object.freeze({
  id: '',
  item_description: '',
  quantity_needed: '1',
  status: 'pending',
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
  id: '',
  category: 'material',
  cost_code: '',
  description: '',
  budget_amount: '',
  budget_change_amount: '',
  actual_cost_amount: '',
  committed_cost_amount: '',
  forecast_to_complete_amount: '',
  forecast_final_amount: '',
  note: '',
  change_reason: '',
  isSaving: false,
  error: null,
  success: '',
});
const DEFAULT_BUDGET_IMPORT = Object.freeze({
  file: null,
  isImporting: false,
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
  initial_start_date: '',
  actual_start_date: '',
  initial_completion_date: '',
  actual_completion_date: '',
  duration_days: '',
  dependencies: '',
  status: 'pending',
  sort_order: '',
  note: '',
  isSaving: false,
  error: null,
  success: '',
});
const EMPTY_JOB_TRANSACTIONS = Object.freeze([]);
const EMPTY_JOB_HISTORY = Object.freeze([]);

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

const JOB_BUYOUT_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
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
  'archived_at',
  'archived_by',
  'archive_reason',
  'category',
  'cost_code',
  'description',
  'budget_amount',
  'budget_change_amount',
  'actual_cost_amount',
  'committed_cost_amount',
  'forecast_to_complete_amount',
  'forecast_final_amount',
  'note',
  'created_by',
].join(', ');

const JOB_SCHEDULE_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'title',
  'description',
  'target_date',
  'initial_start_date',
  'actual_start_date',
  'initial_completion_date',
  'actual_completion_date',
  'duration_days',
  'dependencies',
  'status',
  'sort_order',
  'note',
  'created_by',
].join(', ');

const JOB_TRANSACTION_SELECT_FIELDS = [
  'transaction_item_id',
  'transaction_id',
  'occurred_at',
  'transaction_created_at',
  'division',
  'job_id',
  'item_id',
  'material_code',
  'item_name',
  'unit_of_measure',
  'quantity',
  'transaction_type',
  'source_bin_id',
  'source_bin_code',
  'source_bin_label',
  'source_location_label',
  'performed_by',
  'performed_by_user_id',
  'note',
  'ledger_sequence',
].join(', ');

const JOB_HISTORY_COLUMNS = [
  { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
  { key: 'table_name', header: 'Area', render: (row) => formatJobHistoryArea(row.table_name) },
  { key: 'action', header: 'Action', render: (row) => formatJobHistoryAction(row.action) },
  { key: 'user_name', header: 'User', fallback: '-' },
  { key: 'changed_fields', header: 'Changed fields', render: (row) => formatChangedFields(row.changed_fields) },
  { key: 'note', header: 'Note', fallback: '-' },
];

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
    title: 'Buyout planning checklist is live',
    description: 'Buyout rows track budget, value, lead-time, and checklist status. Purchase orders, vendors, and accounting automation remain separate.',
  },
  transactions: {
    eyebrow: 'Transactions',
    title: 'Transactions are available as read-only history',
    description: 'This is a read-only log of material coded to this job through Inventory Checkout.',
  },
  financials: {
    eyebrow: 'Financials',
    title: 'Financials are available when permitted',
    description: 'The live Financials tab reads job_budget_lines and stays gated by can_view_financials. Accounting exports, invoices, purchase orders, and external accounting sync remain separate.',
  },
  documents: {
    eyebrow: 'Documents',
    title: 'Job document checklist is live',
    description: 'Documents are attached to the job record and visible to users who can view the job. Archive RLS cleanup remains deferred.',
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

function formatTransactionType(value) {
  switch (value) {
    case 'assign_to_job':
      return 'Assign to Job';
    case 'remove_stock':
      return 'Remove Stock';
    case 'return_from_job':
      return 'Return from Job';
    case 'physical_count_correction':
      return 'Physical Count';
    case 'assign_to_vehicle':
      return 'Assign to Vehicle';
    case 'vendor_return':
      return 'Vendor Return';
    case 'scrap':
      return 'Scrap';
    default:
      return value ? value.replaceAll('_', ' ') : '-';
  }
}

function formatJobHistoryArea(value) {
  switch (value) {
    case 'jobs':
      return 'Job';
    case 'job_buyout_lines':
      return 'Buyout';
    case 'job_budget_lines':
      return 'Financials';
    case 'job_schedule_items':
      return 'Schedule';
    case 'documents':
      return 'Documents';
    default:
      return value ? value.replaceAll('_', ' ') : '-';
  }
}

function formatJobHistoryAction(value) {
  switch (value) {
    case 'create':
      return 'Created';
    case 'update':
      return 'Updated';
    case 'archive':
      return 'Archived';
    case 'delete':
      return 'Deleted';
    case 'restore':
      return 'Restored';
    case 'import':
      return 'Imported';
    default:
      return value ? value.replaceAll('_', ' ') : '-';
  }
}

function formatChangedField(value) {
  switch (value) {
    case 'job_id':
    case 'id':
      return '';
    case 'item_description':
      return 'item';
    case 'budget_amount':
      return 'original budget';
    case 'budget_change_amount':
      return 'change orders';
    case 'actual_cost_amount':
      return 'actual';
    case 'committed_cost_amount':
      return 'committed';
    case 'forecast_to_complete_amount':
      return 'forecast this month';
    case 'forecast_final_amount':
      return 'forecast final';
    case 'archive_reason':
      return 'archive reason';
    case 'archived_at':
      return 'archived date';
    case 'archived_by':
      return 'archived by';
    case 'target_date':
      return 'target date';
    case 'initial_start_date':
      return 'initial start';
    case 'actual_start_date':
      return 'actual start';
    case 'initial_completion_date':
      return 'initial finish';
    case 'actual_completion_date':
      return 'actual finish';
    case 'duration_days':
      return 'duration';
    case 'sort_order':
      return 'order';
    case 'owner_id':
    case 'owner_type':
      return '';
    case 'document_type':
      return 'category';
    case 'file_name':
      return 'file name';
    default:
      return value ? value.replaceAll('_', ' ') : '';
  }
}

function formatChangedFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return '-';
  const formatted = fields
    .map(formatChangedField)
    .filter(Boolean);
  return formatted.length ? formatted.join(', ') : '-';
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

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnlyString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
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

function canEditDivisionWithPermission(permissions, rowDivision, permissionKey) {
  if (permissions?.[permissionKey] !== true || !rowDivision) return false;
  if (['Developer', 'Manager'].includes(permissions?.role)) return true;
  return permissions?.division === rowDivision;
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

function formatQuantity(value, unit = '') {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return '-';
  const formatted = quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImportHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeCostCode(value) {
  const withoutCommas = String(value || '').trim().toUpperCase().replace(/,/g, '').replace(/\s+/g, '');
  const withoutDecimalZeros = withoutCommas.replace(/\.0+$/, '');
  return withoutDecimalZeros.replace(/[^A-Z0-9]/g, '');
}

function parseMoneyValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const isParenthesesNegative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[,$%\s()]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return isParenthesesNegative ? -parsed : parsed;
}

function detectDelimiter(line) {
  const candidates = [',', '\t', ';', '|'];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: parseDelimitedLine(line, delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ',';
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseDelimitedText(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeImportHeader);

  return lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? '';
      return row;
    }, {});
  });
}

function pdfTextItemsToLines(items) {
  const positioned = items
    .map((item) => ({
      text: String(item.str || '').trim(),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
    }))
    .filter((item) => item.text);
  const rows = [];

  positioned
    .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x))
    .forEach((item) => {
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
      if (row) {
        row.items.push(item);
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    });

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '))
    .join('\n');
}

async function extractImportTextFromFile(file) {
  if (!file) return '';

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return file.text();

  const [pdfjsLib, pdfjsWorker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pageTexts.push(pdfTextItemsToLines(textContent.items));
  }

  return pageTexts.join('\n');
}

function firstPresentValue(row, headerCandidates) {
  const key = headerCandidates.find((candidate) => row[candidate] !== undefined);
  return key ? row[key] : '';
}

function actualsByCostCodeFromDelimitedReport(text) {
  const rows = parseDelimitedText(text);
  if (!rows.length) return null;

  const costCodeHeaders = ['costcode', 'costcodes', 'code', 'costcodedescription', 'phasecode', 'phase', 'jobcostcode', 'costtypecode'];
  const actualHeaders = ['actual', 'actualcost', 'actualcosts', 'actualcostamount', 'actualamount', 'jobtodatecost', 'jtdcost', 'costtodate', 'cost', 'actcost'];
  const actualsByCode = new Map();
  let parsedRows = 0;

  rows.forEach((row) => {
    const costCode = normalizeCostCode(firstPresentValue(row, costCodeHeaders));
    const actual = parseMoneyValue(firstPresentValue(row, actualHeaders));
    if (!costCode || actual === null) return;
    parsedRows += 1;
    actualsByCode.set(costCode, (actualsByCode.get(costCode) || 0) + actual);
  });

  return parsedRows ? actualsByCode : null;
}

function actualsByCostCodeFromEstimateActualsText(text) {
  const actualsByCode = new Map();
  const rowPattern = /^(\d{1,3}(?:\.\d+)*)\s+.+?\s+(-?\(?\$?[\d,]+\.\d{2}\)?)\s+(-?\(?\$?[\d,]+\.\d{2}\)?)\s+(-?\(?\$?[\d,]+\.\d{2}\)?)\s+(-?\(?\$?[\d,]+\.\d{2}\)?)$/;

  String(text || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^total\b/i.test(trimmed)) return;

    const match = trimmed.match(rowPattern);
    if (!match) return;

    const costCode = normalizeCostCode(match[1]);
    const actual = parseMoneyValue(match[3]);
    if (!costCode || actual === null) return;

    actualsByCode.set(costCode, (actualsByCode.get(costCode) || 0) + actual);
  });

  return actualsByCode.size ? actualsByCode : null;
}

function actualsByCostCodeFromReport(text) {
  const actualsByCode = actualsByCostCodeFromDelimitedReport(text)
    || actualsByCostCodeFromEstimateActualsText(text);

  if (actualsByCode) return actualsByCode;

  throw new Error('The cost report needs cost-code rows and actual-cost values.');
}

function sumField(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function revisedBudget(row) {
  return (Number(row.budget_amount) || 0) + (Number(row.budget_change_amount) || 0);
}

function forecastFinal(row) {
  return Number(row.forecast_final_amount) || 0;
}

function forecastedRemainder(row) {
  return forecastFinal(row)
    - (Number(row.actual_cost_amount) || 0)
    - (Number(row.forecast_to_complete_amount) || 0);
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

function schedulePlannedStart(row) {
  return row.initial_start_date || row.target_date || row.initial_completion_date || '';
}

function schedulePlannedFinish(row) {
  if (row.initial_completion_date) return row.initial_completion_date;
  const start = parseDateOnly(schedulePlannedStart(row));
  const duration = Number(row.duration_days);
  if (start && Number.isFinite(duration) && duration > 0) {
    return toDateOnlyString(addDays(start, duration - 1));
  }
  return row.target_date || '';
}

function scheduleActualStart(row) {
  return row.actual_start_date || '';
}

function scheduleActualFinish(row) {
  if (row.actual_completion_date) return row.actual_completion_date;
  const start = parseDateOnly(scheduleActualStart(row));
  const duration = Number(row.duration_days);
  if (start && Number.isFinite(duration) && duration > 0) {
    return toDateOnlyString(addDays(start, duration - 1));
  }
  return '';
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

const JOB_SCHEDULE_COLUMNS = [
  { key: 'display_order', header: '#', render: (row) => Number(row.display_order) || 0, align: 'right' },
  { key: 'title', header: 'Milestone / task', render: (row) => <strong>{row.title || 'Untitled schedule item'}</strong> },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status}>{formatScheduleStatus(row.status)}</StatusBadge> },
  { key: 'initial_start_date', header: 'Initial start', render: (row) => formatDate(row.initial_start_date) },
  { key: 'actual_start_date', header: 'Actual start', render: (row) => formatDate(row.actual_start_date) },
  { key: 'initial_completion_date', header: 'Initial finish', render: (row) => formatDate(row.initial_completion_date || row.target_date) },
  { key: 'actual_completion_date', header: 'Actual finish', render: (row) => formatDate(row.actual_completion_date) },
  { key: 'duration_days', header: 'Duration', render: (row) => row.duration_days ?? '-', align: 'right' },
  {
    key: 'timing',
    header: 'Timing',
    render: (row) => {
      const remaining = daysUntil(row.actual_completion_date || row.initial_completion_date || row.target_date);
      if (remaining === null) return 'No date';
      if (remaining < 0) return `${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} late`;
      if (remaining === 0) return 'Due today';
      return `${remaining} day${remaining === 1 ? '' : 's'} out`;
    },
  },
  { key: 'dependencies', header: 'Dependencies', fallback: '-' },
  { key: 'description', header: 'Description', fallback: '-' },
  { key: 'note', header: 'Notes', fallback: '-' },
];

const JOB_TRANSACTION_COLUMNS = [
  { key: 'occurred_at', header: 'Date', render: (row) => formatDateTime(row.occurred_at || row.transaction_created_at) },
  { key: 'item_name', header: 'Item', render: (row) => <strong>{row.item_name || 'Unknown item'}</strong> },
  { key: 'material_code', header: 'Code', fallback: '-' },
  { key: 'quantity', header: 'Quantity', render: (row) => formatQuantity(row.quantity, row.unit_of_measure), align: 'right' },
  { key: 'source_location_label', header: 'Source location', render: (row) => row.source_location_label || row.source_bin_label || row.source_bin_code || '-' },
  { key: 'transaction_type', header: 'Type', render: (row) => <StatusBadge status={row.transaction_type}>{formatTransactionType(row.transaction_type)}</StatusBadge> },
  { key: 'performed_by', header: 'Performed by', fallback: '-' },
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
          .is('archived_at', null)
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
          .is('archived_at', null)
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

function useJobTransactions({ enabled, jobId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_JOB_TRANSACTIONS,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !jobId) {
        setState({ isLoading: false, error: null, rows: EMPTY_JOB_TRANSACTIONS });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('job_transaction_log')
          .select(JOB_TRANSACTION_SELECT_FIELDS)
          .eq('job_id', jobId)
          .order('occurred_at', { ascending: false })
          .order('ledger_sequence', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows: data ?? EMPTY_JOB_TRANSACTIONS,
          });
        }
      } catch (error) {
        console.error('Job transactions failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            rows: EMPTY_JOB_TRANSACTIONS,
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

function useJobChangeHistory({ enabled, jobId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_JOB_HISTORY,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !jobId) {
        setState({ isLoading: false, error: null, rows: EMPTY_JOB_HISTORY });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.rpc('read_job_change_history', {
          p_job_id: jobId,
          p_limit: 100,
        });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows: data ?? EMPTY_JOB_HISTORY,
          });
        }
      } catch (error) {
        console.error('Job history failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            rows: EMPTY_JOB_HISTORY,
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

function jobToForm(job) {
  if (!job) return DEFAULT_JOB_FORM;

  return {
    ...DEFAULT_JOB_FORM,
    job_number: job.job_number || '',
    name: job.name || '',
    status: JOB_STATUS_OPTIONS.includes(job.status) ? job.status : 'active',
    job_type: job.job_type === 'service_call' ? 'service_call' : 'job',
    service_call_number: job.service_call_number || '',
    address_line1: job.address_line1 || '',
    address_line2: job.address_line2 || '',
    city: job.city || '',
    state: job.state || '',
    postal_code: job.postal_code || '',
    description: job.description || '',
    notes: job.notes || '',
  };
}

function jobAuditSnapshot(job) {
  if (!job) return null;

  return {
    id: job.id,
    division: job.division,
    job_number: job.job_number,
    name: job.name,
    status: job.status,
    description: job.description,
    notes: job.notes,
    address_line1: job.address_line1,
    address_line2: job.address_line2,
    city: job.city,
    state: job.state,
    postal_code: job.postal_code,
    job_type: job.job_type,
    service_call_number: job.service_call_number,
    archived_at: job.archived_at,
    archived_by: job.archived_by,
    archive_reason: job.archive_reason,
  };
}

function buyoutToForm(row) {
  if (!row) return DEFAULT_BUYOUT_FORM;

  return {
    ...DEFAULT_BUYOUT_FORM,
    id: row.id || '',
    item_description: row.item_description || '',
    quantity_needed: String(row.quantity_needed ?? '1'),
    status: BUYOUT_STATUS_OPTIONS.includes(row.status) ? row.status : 'pending',
    vendor_note: row.vendor_note || '',
    budget_amount: row.budget_amount == null ? '' : String(row.budget_amount),
    initial_value: row.initial_value == null ? '' : String(row.initial_value),
    actual_value: row.actual_value == null ? '' : String(row.actual_value),
    initial_lead_time_days: row.initial_lead_time_days == null ? '' : String(row.initial_lead_time_days),
    actual_lead_time_days: row.actual_lead_time_days == null ? '' : String(row.actual_lead_time_days),
    note: row.note || '',
  };
}

function buyoutAuditSnapshot(row) {
  if (!row) return null;

  return {
    id: row.id,
    job_id: row.job_id,
    division: row.division,
    item_description: row.item_description,
    quantity_needed: row.quantity_needed,
    quantity_ordered: row.quantity_ordered,
    status: row.status,
    vendor_note: row.vendor_note,
    lead_time_note: row.lead_time_note,
    budget_amount: row.budget_amount,
    initial_value: row.initial_value,
    actual_value: row.actual_value,
    initial_lead_time_days: row.initial_lead_time_days,
    actual_lead_time_days: row.actual_lead_time_days,
    note: row.note,
    archived_at: row.archived_at,
    archived_by: row.archived_by,
    archive_reason: row.archive_reason,
  };
}

function budgetToForm(row) {
  if (!row) return DEFAULT_BUDGET_FORM;

  return {
    ...DEFAULT_BUDGET_FORM,
    id: row.id || '',
    category: BUDGET_CATEGORY_OPTIONS.includes(row.category) ? row.category : 'other',
    cost_code: row.cost_code || '',
    description: row.description || '',
    budget_amount: row.budget_amount == null ? '' : String(row.budget_amount),
    budget_change_amount: row.budget_change_amount == null ? '' : String(row.budget_change_amount),
    actual_cost_amount: row.actual_cost_amount == null ? '' : String(row.actual_cost_amount),
    committed_cost_amount: row.committed_cost_amount == null ? '' : String(row.committed_cost_amount),
    forecast_to_complete_amount: row.forecast_to_complete_amount == null ? '' : String(row.forecast_to_complete_amount),
    forecast_final_amount: row.forecast_final_amount == null ? '' : String(row.forecast_final_amount),
    note: row.note || '',
  };
}

function budgetAuditSnapshot(row) {
  if (!row) return null;

  return {
    id: row.id,
    job_id: row.job_id,
    division: row.division,
    category: row.category,
    cost_code: row.cost_code,
    description: row.description,
    budget_amount: row.budget_amount,
    budget_change_amount: row.budget_change_amount,
    actual_cost_amount: row.actual_cost_amount,
    committed_cost_amount: row.committed_cost_amount,
    forecast_to_complete_amount: row.forecast_to_complete_amount,
    forecast_final_amount: row.forecast_final_amount,
    note: row.note,
    archived_at: row.archived_at,
    archived_by: row.archived_by,
    archive_reason: row.archive_reason,
  };
}

function scheduleAuditSnapshot(row) {
  if (!row) return null;

  return {
    id: row.id,
    job_id: row.job_id,
    division: row.division,
    title: row.title,
    description: row.description,
    target_date: row.target_date,
    initial_start_date: row.initial_start_date,
    actual_start_date: row.actual_start_date,
    initial_completion_date: row.initial_completion_date,
    actual_completion_date: row.actual_completion_date,
    duration_days: row.duration_days,
    dependencies: row.dependencies,
    status: row.status,
    sort_order: row.sort_order,
    note: row.note,
    archived_at: row.archived_at,
    archived_by: row.archived_by,
    archive_reason: row.archive_reason,
  };
}

function normalizeBudgetProtectedValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function budgetProtectedFieldsChanged(beforeRow, payload) {
  if (!beforeRow) return false;

  return normalizeBudgetProtectedValue(beforeRow.category) !== normalizeBudgetProtectedValue(payload.category)
    || normalizeBudgetProtectedValue(beforeRow.cost_code) !== normalizeBudgetProtectedValue(payload.cost_code)
    || normalizeBudgetProtectedValue(beforeRow.description) !== normalizeBudgetProtectedValue(payload.description)
    || Number(beforeRow.budget_amount || 0) !== Number(payload.budget_amount || 0);
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
  const [jobForm, setJobForm] = useState(DEFAULT_JOB_FORM);
  const [jobAction, setJobAction] = useState({ action: '', error: null, success: '' });
  const [uploadState, setUploadState] = useState(DEFAULT_UPLOAD_STATE);
  const [documentAction, setDocumentAction] = useState({ id: '', action: '', error: null });
  const [buyoutForm, setBuyoutForm] = useState(DEFAULT_BUYOUT_FORM);
  const [buyoutAction, setBuyoutAction] = useState({ id: '', action: '', error: null });
  const [budgetForm, setBudgetForm] = useState(DEFAULT_BUDGET_FORM);
  const [budgetImport, setBudgetImport] = useState(DEFAULT_BUDGET_IMPORT);
  const [budgetTemplateAction, setBudgetTemplateAction] = useState({ key: '', error: null, success: '' });
  const [scheduleForm, setScheduleForm] = useState(DEFAULT_SCHEDULE_FORM);
  const [scheduleAction, setScheduleAction] = useState({ id: '', action: '', error: null });
  const [schedulePrintMode, setSchedulePrintMode] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const jobs = directory.jobs;
  const canCreateJobs = permissions?.canCreateJobs === true;
  const canManageJobs = permissions?.canManageJobs === true;
  const canViewFinancials = permissions?.canViewFinancials === true;
  const createJobDivision = permissions?.division || '';
  const availableBudgetTemplates = BUDGET_TEMPLATES.filter((template) => template.division === selectedJob?.division);

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
  const canManageSelectedJob = canEditDivisionWithPermission(permissions, selectedJob?.division, 'canManageJobs');
  const canApproveSelectedBudget = canEditDivisionWithPermission(permissions, selectedJob?.division, 'canApproveBudget');
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
  const jobTransactions = useJobTransactions({
    enabled: permissions.permissionSource === 'server' && activeTab === 'transactions' && Boolean(selectedJob?.id),
    jobId: selectedJob?.id,
  });
  const jobHistory = useJobChangeHistory({
    enabled: permissions.permissionSource === 'server' && activeTab === 'history' && Boolean(selectedJob?.id),
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
    { key: 'buyout', label: 'Buyout', meta: 'Live' },
    { key: 'transactions', label: 'Transactions', meta: 'Live' },
    ...(canViewFinancials ? [{ key: 'financials', label: 'Financials', meta: 'Live' }] : []),
    { key: 'documents', label: 'Documents', meta: 'Live' },
    { key: 'schedule', label: 'Schedule', meta: 'Live' },
    { key: 'history', label: 'History', meta: 'Live' },
  ];
  const visibleTabs = useMemo(() => tabs.filter((tab) => tab.visible !== false), [canViewFinancials]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!schedulePrintMode) return undefined;

    const printClass = `print-schedule-${schedulePrintMode}`;
    document.body.classList.add(printClass);
    const clearPrintMode = () => {
      document.body.classList.remove(printClass);
      setSchedulePrintMode('');
    };
    window.addEventListener('afterprint', clearPrintMode);
    window.setTimeout(() => window.print(), 50);

    return () => {
      window.removeEventListener('afterprint', clearPrintMode);
      document.body.classList.remove(printClass);
    };
  }, [schedulePrintMode]);

  function selectJob(job) {
    setSelectedJobId(job.id);
    setActiveTab('overview');
    setMode('browse');
    setJobForm(DEFAULT_JOB_FORM);
    setJobAction({ action: '', error: null, success: '' });
    setUploadState(DEFAULT_UPLOAD_STATE);
    setBuyoutForm(DEFAULT_BUYOUT_FORM);
    setBudgetForm(DEFAULT_BUDGET_FORM);
    setBudgetImport(DEFAULT_BUDGET_IMPORT);
    setBudgetTemplateAction({ key: '', error: null, success: '' });
    setScheduleForm(DEFAULT_SCHEDULE_FORM);
  }

  function startJobCreate() {
    setMode('create');
    setJobForm(DEFAULT_JOB_FORM);
    setJobAction({ action: '', error: null, success: '' });
  }

  function startJobEdit() {
    if (!selectedJob || !canManageSelectedJob) return;
    setMode('edit');
    setJobForm(jobToForm(selectedJob));
    setJobAction({ action: '', error: null, success: '' });
  }

  async function writeJobChangeLog(client, { action, recordId, beforeData, afterData, note }) {
    const userId = user?.id || null;
    const userName = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    const { error } = await client
      .from('change_logs')
      .insert({
        user_id: userId,
        user_name: userName,
        table_name: 'jobs',
        record_id: recordId,
        action,
        before_data: beforeData,
        after_data: afterData,
        note,
      });

    if (error) throw error;
  }

  function buildJobPayload() {
    const jobType = jobForm.job_type === 'service_call' ? 'service_call' : 'job';

    return {
      job_number: jobForm.job_number.trim() || null,
      name: jobForm.name.trim(),
      status: JOB_STATUS_OPTIONS.includes(jobForm.status) ? jobForm.status : 'active',
      description: jobForm.description.trim() || null,
      notes: jobForm.notes.trim() || null,
      address_line1: jobForm.address_line1.trim() || null,
      address_line2: jobForm.address_line2.trim() || null,
      city: jobForm.city.trim() || null,
      state: jobForm.state.trim() || null,
      postal_code: jobForm.postal_code.trim() || null,
      job_type: jobType,
      service_call_number: jobType === 'service_call' ? jobForm.service_call_number.trim() || null : null,
    };
  }

  async function handleJobCreate(event) {
    event.preventDefault();

    if (!canCreateJobs || jobForm.isSaving) return;

    const name = jobForm.name.trim();
    if (!name) {
      setJobForm((current) => ({ ...current, error: new Error('Enter a job name before saving.') }));
      return;
    }

    if (!createJobDivision) {
      setJobForm((current) => ({ ...current, error: new Error('Your session does not include a division, so job creation is blocked.') }));
      return;
    }

    setJobForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
      const payload = {
        ...buildJobPayload(),
        division: createJobDivision,
        created_by: createdBy,
      };

      const { data, error } = await client
        .from('jobs')
        .insert(payload)
        .select(JOB_SELECT_FIELDS)
        .single();

      if (error) throw error;

      await writeJobChangeLog(client, {
        action: 'create',
        recordId: data?.id || '',
        beforeData: null,
        afterData: jobAuditSnapshot(data),
        note: `Job ${data?.job_number || data?.name || name} created.`,
      });

      setJobForm({
        ...DEFAULT_JOB_FORM,
        success: `${data?.name || name} created.`,
      });
      setSelectedJobId(data?.id || '');
      setActiveView(data?.status || 'active');
      setActiveTab('overview');
      setMode('browse');
      setJobAction({ action: '', error: null, success: `${data?.name || name} created.` });
      directory.reload();
    } catch (error) {
      console.error('Job create failed', error);
      setJobForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleJobUpdate(event) {
    event.preventDefault();

    if (!selectedJob || !canManageSelectedJob || jobForm.isSaving) return;

    const name = jobForm.name.trim();
    if (!name) {
      setJobForm((current) => ({ ...current, error: new Error('Enter a job name before saving.') }));
      return;
    }

    const payload = buildJobPayload();
    setJobForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('jobs')
        .update(payload)
        .eq('id', selectedJob.id)
        .select(JOB_SELECT_FIELDS)
        .single();

      if (error) throw error;

      await writeJobChangeLog(client, {
        action: 'update',
        recordId: selectedJob.id,
        beforeData: jobAuditSnapshot(selectedJob),
        afterData: jobAuditSnapshot(data),
        note: `Job ${selectedJob.job_number || selectedJob.name || selectedJob.id} updated.`,
      });

      setJobForm(DEFAULT_JOB_FORM);
      setJobAction({ action: '', error: null, success: `${data?.name || name} updated.` });
      setSelectedJobId(data?.id || selectedJob.id);
      setActiveView(data?.status || 'active');
      setActiveTab('overview');
      setMode('browse');
      directory.reload();
    } catch (error) {
      console.error('Job update failed', error);
      setJobForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleJobArchive() {
    if (!selectedJob || !canManageSelectedJob || jobAction.action) return;

    const reason = window.prompt(`Archive "${jobLabel(selectedJob)}"? Enter a reason.`);
    if (!reason?.trim()) return;

    setJobAction({ action: 'archive', error: null, success: '' });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('archive_job', {
        p_job_id: selectedJob.id,
        p_reason: reason.trim(),
      });

      if (error) throw error;

      setSelectedJobId('');
      setMode('browse');
      setActiveTab('overview');
      setJobForm(DEFAULT_JOB_FORM);
      setJobAction({ action: '', error: null, success: `${jobLabel(selectedJob)} archived.` });
      directory.reload();
    } catch (error) {
      console.error('Job archive failed', error);
      setJobAction({ action: '', error, success: '' });
    }
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

  async function handleDocumentArchive(document) {
    if (!document?.id || !selectedJob?.id || !canManageSelectedJob || documentAction.id) return;

    const reason = window.prompt(`Archive "${document.file_name || 'this document'}"? Enter a reason.`);
    if (!reason?.trim()) return;

    setDocumentAction({ id: document.id, action: 'archive', error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('archive_job_document', {
        p_document_id: document.id,
        p_reason: reason.trim(),
      });

      if (error) throw error;

      setDocumentAction({ id: '', action: '', error: null });
      jobDocuments.reload();
    } catch (error) {
      console.error('Job document archive failed', error);
      setDocumentAction({ id: '', action: '', error });
    }
  }

  function buildBuyoutPayload() {
    return {
      item_description: buyoutForm.item_description.trim(),
      quantity_needed: parseOptionalNumber(buyoutForm.quantity_needed) || 1,
      status: BUYOUT_STATUS_OPTIONS.includes(buyoutForm.status) ? buyoutForm.status : 'pending',
      vendor_note: buyoutForm.vendor_note.trim() || null,
      budget_amount: parseOptionalNumber(buyoutForm.budget_amount),
      initial_value: parseOptionalNumber(buyoutForm.initial_value),
      actual_value: parseOptionalNumber(buyoutForm.actual_value),
      initial_lead_time_days: parseOptionalNumber(buyoutForm.initial_lead_time_days),
      actual_lead_time_days: parseOptionalNumber(buyoutForm.actual_lead_time_days),
      note: buyoutForm.note.trim() || null,
    };
  }

  function startBuyoutEdit(row) {
    if (!row?.id || !canManageSelectedJob) return;
    setBuyoutForm(buyoutToForm(row));
    setBuyoutAction({ id: '', action: '', error: null });
  }

  function resetBuyoutForm() {
    setBuyoutForm(DEFAULT_BUYOUT_FORM);
  }

  async function handleBuyoutSave(event) {
    event.preventDefault();

    if (!selectedJob || !canManageSelectedJob || buyoutForm.isSaving) return;

    if (!buyoutForm.item_description.trim()) {
      setBuyoutForm((current) => ({ ...current, error: new Error('Enter a buyout item before saving.') }));
      return;
    }

    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    const payload = buildBuyoutPayload();
    const existingRow = buyoutForm.id
      ? jobBuyout.lines.find((line) => line.id === buyoutForm.id)
      : null;
    setBuyoutForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const query = buyoutForm.id
        ? client
          .from('job_buyout_lines')
          .update(payload)
          .eq('id', buyoutForm.id)
          .eq('job_id', selectedJob.id)
          .select(JOB_BUYOUT_SELECT_FIELDS)
          .single()
        : client
          .from('job_buyout_lines')
          .insert({
            ...payload,
            job_id: selectedJob.id,
            division: selectedJob.division,
            created_by: createdBy,
          })
          .select(JOB_BUYOUT_SELECT_FIELDS)
          .single();
      const { data, error } = await query;

      if (error) throw error;

      await writeJobChangeLog(client, {
        action: buyoutForm.id ? 'update' : 'create',
        recordId: data?.id || buyoutForm.id,
        beforeData: buyoutAuditSnapshot(existingRow),
        afterData: buyoutAuditSnapshot(data),
        note: `Buyout item ${data?.item_description || payload.item_description} ${buyoutForm.id ? 'updated' : 'created'}.`,
      });

      setBuyoutForm({
        ...DEFAULT_BUYOUT_FORM,
        success: `${payload.item_description} ${buyoutForm.id ? 'updated' : 'added'} in Buyout.`,
      });
      jobBuyout.reload();
    } catch (error) {
      console.error('Job buyout save failed', error);
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

      await writeJobChangeLog(client, {
        action: 'update',
        recordId: row.id,
        beforeData: buyoutAuditSnapshot(row),
        afterData: buyoutAuditSnapshot({ ...row, status }),
        note: `Buyout item ${row.item_description || row.id} status changed to ${status}.`,
      });

      setBuyoutAction({ id: '', action: '', error: null });
      jobBuyout.reload();
    } catch (error) {
      console.error('Job buyout status update failed', error);
      setBuyoutAction({ id: '', action: '', error });
    }
  }

  async function handleBuyoutArchive(row) {
    if (!row?.id || !selectedJob?.id || !canManageSelectedJob || buyoutAction.id) return;

    const reason = window.prompt(`Archive "${row.item_description || 'this buyout item'}"? Enter a reason.`);
    if (!reason?.trim()) return;

    setBuyoutAction({ id: row.id, action: 'archive', error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('archive_job_buyout_line', {
        p_buyout_line_id: row.id,
        p_reason: reason.trim(),
      });

      if (error) throw error;

      setBuyoutAction({ id: '', action: '', error: null });
      if (buyoutForm.id === row.id) resetBuyoutForm();
      jobBuyout.reload();
    } catch (error) {
      console.error('Job buyout archive failed', error);
      setBuyoutAction({ id: '', action: '', error });
    }
  }

  function buildBudgetPayload() {
    return {
      category: BUDGET_CATEGORY_OPTIONS.includes(budgetForm.category) ? budgetForm.category : 'other',
      cost_code: budgetForm.cost_code.trim() || null,
      description: budgetForm.description.trim(),
      budget_amount: parseOptionalNumber(budgetForm.budget_amount) || 0,
      budget_change_amount: parseOptionalNumber(budgetForm.budget_change_amount) || 0,
      actual_cost_amount: parseOptionalNumber(budgetForm.actual_cost_amount) || 0,
      committed_cost_amount: parseOptionalNumber(budgetForm.committed_cost_amount) || 0,
      forecast_to_complete_amount: parseOptionalNumber(budgetForm.forecast_to_complete_amount) || 0,
      forecast_final_amount: parseOptionalNumber(budgetForm.forecast_final_amount) || 0,
      note: budgetForm.note.trim() || null,
    };
  }

  function startBudgetEdit(row) {
    if (!row?.id || !canApproveSelectedBudget) return;
    setBudgetForm(budgetToForm(row));
  }

  function resetBudgetForm() {
    setBudgetForm(DEFAULT_BUDGET_FORM);
  }

  async function handleBudgetSave(event) {
    event?.preventDefault?.();

    if (!selectedJob || !canApproveSelectedBudget || budgetForm.isSaving) return;

    if (!budgetForm.description.trim()) {
      setBudgetForm((current) => ({ ...current, error: new Error('Enter a budget description before saving.') }));
      return;
    }

    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    const payload = buildBudgetPayload();
    const existingRow = budgetForm.id
      ? jobBudget.lines.find((line) => line.id === budgetForm.id)
      : null;
    const needsReason = budgetProtectedFieldsChanged(existingRow, payload);
    if (needsReason && !budgetForm.change_reason.trim()) {
      setBudgetForm((current) => ({
        ...current,
        error: new Error('Enter a reason when changing original budget, cost code, description, or category.'),
      }));
      return;
    }

    setBudgetForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const query = budgetForm.id
        ? client
          .from('job_budget_lines')
          .update(payload)
          .eq('id', budgetForm.id)
          .eq('job_id', selectedJob.id)
          .select(JOB_BUDGET_SELECT_FIELDS)
          .single()
        : client
          .from('job_budget_lines')
          .insert({
            ...payload,
            job_id: selectedJob.id,
            division: selectedJob.division,
            created_by: createdBy,
          })
          .select(JOB_BUDGET_SELECT_FIELDS)
          .single();
      const { data, error } = await query;

      if (error) throw error;

      await writeJobChangeLog(client, {
        action: budgetForm.id ? 'update' : 'create',
        recordId: data?.id || budgetForm.id,
        beforeData: budgetAuditSnapshot(existingRow),
        afterData: budgetAuditSnapshot(data),
        note: budgetForm.change_reason.trim()
          || `Financial line ${data?.description || payload.description} ${budgetForm.id ? 'updated' : 'created'}.`,
      });

      setBudgetForm({
        ...DEFAULT_BUDGET_FORM,
        success: `${payload.description} ${budgetForm.id ? 'updated' : 'added'} in Financials.`,
      });
      jobBudget.reload();
    } catch (error) {
      console.error('Job budget save failed', error);
      setBudgetForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleBudgetArchive(row) {
    if (!row?.id || !selectedJob?.id || !canApproveSelectedBudget) return;

    const reason = window.prompt(`Archive "${row.description || 'this financial line'}"? Enter a reason.`);
    if (!reason?.trim()) return;

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('archive_job_budget_line', {
        p_budget_line_id: row.id,
        p_reason: reason.trim(),
      });

      if (error) throw error;

      if (budgetForm.id === row.id) resetBudgetForm();
      jobBudget.reload();
    } catch (error) {
      console.error('Job budget archive failed', error);
      setBudgetForm((current) => ({ ...current, error, success: '' }));
    }
  }

  async function handleBudgetTemplateUse(template) {
    if (!selectedJob || !canApproveSelectedBudget || budgetTemplateAction.key) return;

    const existingKeys = new Set(jobBudget.lines.map((line) => `${normalizeCostCode(line.cost_code)}|${line.description.trim().toLowerCase()}`));
    const lines = template.lines.filter((line) => !existingKeys.has(`${normalizeCostCode(line.cost_code)}|${line.description.toLowerCase()}`));
    const skipped = template.lines.length - lines.length;
    if (!lines.length) {
      setBudgetTemplateAction({ key: '', error: null, success: `${template.name} is already applied to this job.` });
      return;
    }

    if (!window.confirm(`Use ${template.name}? This adds ${lines.length} editable financial line${lines.length === 1 ? '' : 's'} with $0.00 amounts.${skipped ? ` ${skipped} existing line${skipped === 1 ? '' : 's'} will be skipped.` : ''}`)) return;

    setBudgetTemplateAction({ key: template.key, error: null, success: '' });
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
      const { data, error } = await client
        .from('job_budget_lines')
        .insert(lines.map((line) => ({
          job_id: selectedJob.id,
          division: selectedJob.division,
          category: line.category,
          cost_code: line.cost_code,
          description: line.description,
          budget_amount: 0,
          budget_change_amount: 0,
          actual_cost_amount: 0,
          committed_cost_amount: 0,
          forecast_to_complete_amount: 0,
          forecast_final_amount: 0,
          note: `Created from template: ${template.name}`,
          created_by: createdBy,
        })))
        .select(JOB_BUDGET_SELECT_FIELDS);
      if (error) throw error;

      for (const row of data ?? []) {
        await writeJobChangeLog(client, {
          action: 'create',
          recordId: row.id,
          beforeData: null,
          afterData: budgetAuditSnapshot(row),
          note: `Created from template: ${template.name}.`,
        });
      }

      setBudgetTemplateAction({
        key: '',
        error: null,
        success: `${data?.length ?? lines.length} financial line${lines.length === 1 ? '' : 's'} added from ${template.name}.${skipped ? ` ${skipped} duplicate line${skipped === 1 ? '' : 's'} skipped.` : ''}`,
      });
      jobBudget.reload();
    } catch (error) {
      console.error('Budget template apply failed', error);
      setBudgetTemplateAction({ key: '', error, success: '' });
    }
  }

  async function handleBudgetImport(event) {
    event.preventDefault();

    if (!selectedJob || !canApproveSelectedBudget || budgetImport.isImporting) return;

    if (!budgetImport.file) {
      setBudgetImport((current) => ({ ...current, error: new Error('Choose a cost report file before importing.'), success: '' }));
      return;
    }

    setBudgetImport((current) => ({ ...current, isImporting: true, error: null, success: '' }));

    try {
      const reportText = await extractImportTextFromFile(budgetImport.file);
      const actualsByCode = actualsByCostCodeFromReport(reportText);
      const linesByCostCode = jobBudget.lines.reduce((map, line) => {
        const code = normalizeCostCode(line.cost_code);
        if (!code) return map;
        const lines = map.get(code) || [];
        lines.push(line);
        map.set(code, lines);
        return map;
      }, new Map());
      const updates = [];
      let matchedCount = 0;

      actualsByCode.forEach((actualCostAmount, costCode) => {
        const matchingLines = linesByCostCode.get(costCode) || [];
        if (!matchingLines.length) return;
        matchedCount += matchingLines.length;
        matchingLines.forEach((line) => {
          if (Number(line.actual_cost_amount || 0).toFixed(2) !== Number(actualCostAmount || 0).toFixed(2)) {
            updates.push({ line, actualCostAmount });
          }
        });
      });

      if (!matchedCount) {
        throw new Error('No cost codes in the report matched this job financials table.');
      }

      if (!updates.length) {
        setBudgetImport({
          ...DEFAULT_BUDGET_IMPORT,
          success: `${matchedCount} financial line${matchedCount === 1 ? '' : 's'} matched; no Actual values changed.`,
        });
        return;
      }

      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      for (const update of updates) {
        const { line, actualCostAmount } = update;
        const { data, error } = await client
          .from('job_budget_lines')
          .update({ actual_cost_amount: actualCostAmount })
          .eq('id', line.id)
          .eq('job_id', selectedJob.id)
          .select(JOB_BUDGET_SELECT_FIELDS)
          .single();

        if (error) throw error;

        await writeJobChangeLog(client, {
          action: 'update',
          recordId: data?.id || line.id,
          beforeData: budgetAuditSnapshot(line),
          afterData: budgetAuditSnapshot(data),
          note: `Actual cost imported from ${budgetImport.file.name}.`,
        });
      }

      setBudgetImport({
        ...DEFAULT_BUDGET_IMPORT,
        success: `${updates.length} financial line${updates.length === 1 ? '' : 's'} updated from ${budgetImport.file.name}.`,
      });
      jobBudget.reload();
    } catch (error) {
      console.error('Job budget import failed', error);
      setBudgetImport((current) => ({ ...current, isImporting: false, error, success: '' }));
    }
  }

  function nextScheduleSortOrder() {
    if (!jobSchedule.items.length) return 10;
    return Math.max(...jobSchedule.items.map((item) => Number(item.sort_order) || 0)) + 10;
  }

  function nextScheduleDisplayOrder() {
    return jobSchedule.items.length + 1;
  }

  function scheduleDisplayOrder(row) {
    const index = jobSchedule.items.findIndex((item) => item.id === row?.id);
    if (index >= 0) return index + 1;
    const rawOrder = Number(row?.sort_order);
    if (!Number.isFinite(rawOrder) || rawOrder <= 0) return nextScheduleDisplayOrder();
    return Math.max(1, Math.round(rawOrder / 10));
  }

  function startScheduleEdit(row) {
    setScheduleForm({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      target_date: row.target_date || '',
      initial_start_date: row.initial_start_date || '',
      actual_start_date: row.actual_start_date || '',
      initial_completion_date: row.initial_completion_date || row.target_date || '',
      actual_completion_date: row.actual_completion_date || '',
      duration_days: row.duration_days === null || row.duration_days === undefined ? '' : String(row.duration_days),
      dependencies: row.dependencies || '',
      status: SCHEDULE_STATUS_OPTIONS.includes(row.status) ? row.status : 'pending',
      sort_order: String(scheduleDisplayOrder(row)),
      note: row.note || '',
      isSaving: false,
      error: null,
      success: '',
    });
  }

  function resetScheduleForm() {
    setScheduleForm(DEFAULT_SCHEDULE_FORM);
  }

  function handleSchedulePrint(mode) {
    setSchedulePrintMode(mode);
  }

  async function handleScheduleSave(event) {
    event.preventDefault();

    if (!selectedJob || !canManageSelectedJob || scheduleForm.isSaving) return;

    if (!scheduleForm.title.trim()) {
      setScheduleForm((current) => ({ ...current, error: new Error('Enter a schedule title before saving.') }));
      return;
    }

    const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';
    const displaySortOrder = parseOptionalNumber(scheduleForm.sort_order);
    const payload = {
      job_id: selectedJob.id,
      division: selectedJob.division,
      title: scheduleForm.title.trim(),
      description: scheduleForm.description.trim() || null,
      target_date: scheduleForm.target_date || scheduleForm.initial_completion_date || null,
      initial_start_date: scheduleForm.initial_start_date || null,
      actual_start_date: scheduleForm.actual_start_date || null,
      initial_completion_date: scheduleForm.initial_completion_date || scheduleForm.target_date || null,
      actual_completion_date: scheduleForm.actual_completion_date || null,
      duration_days: parseOptionalNumber(scheduleForm.duration_days),
      dependencies: scheduleForm.dependencies.trim() || null,
      status: SCHEDULE_STATUS_OPTIONS.includes(scheduleForm.status) ? scheduleForm.status : 'pending',
      sort_order: displaySortOrder == null ? nextScheduleSortOrder() : Math.max(1, Math.round(displaySortOrder)) * 10,
      note: scheduleForm.note.trim() || null,
    };

    setScheduleForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const existingRow = scheduleForm.id
        ? jobSchedule.items.find((item) => item.id === scheduleForm.id)
        : null;
      const query = scheduleForm.id
        ? client
          .from('job_schedule_items')
          .update(payload)
          .eq('id', scheduleForm.id)
          .eq('job_id', selectedJob.id)
          .select(JOB_SCHEDULE_SELECT_FIELDS)
          .single()
        : client
          .from('job_schedule_items')
          .insert({ ...payload, created_by: createdBy })
          .select(JOB_SCHEDULE_SELECT_FIELDS)
          .single();
      const { data, error } = await query;

      if (error) throw error;

      await writeJobChangeLog(client, {
        action: scheduleForm.id ? 'update' : 'create',
        recordId: data?.id || scheduleForm.id,
        beforeData: scheduleAuditSnapshot(existingRow),
        afterData: scheduleAuditSnapshot(data),
        note: `${payload.title} ${scheduleForm.id ? 'updated' : 'added'} in Schedule.`,
      });

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

    setScheduleAction({ id: row.id, action: 'archive', error: null });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('archive_job_schedule_item', {
        p_schedule_item_id: row.id,
        p_reason: reason.trim(),
      });

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

      const movedRow = reorderedItems.find((item) => item.id === row.id);
      await writeJobChangeLog(client, {
        action: 'update',
        recordId: row.id,
        beforeData: scheduleAuditSnapshot(row),
        afterData: scheduleAuditSnapshot({
          ...movedRow,
          sort_order: (nextIndex + 1) * 10,
        }),
        note: `${row.title || 'Schedule item'} moved ${direction}.`,
      });

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
                  <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleDocumentArchive(row)} disabled={isBusy}>
                    {isBusy && documentAction.action === 'archive' ? 'Archiving...' : 'Archive'}
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
            <SummaryCard label="Edit" value={canManageSelectedJob ? 'Granted' : 'Read only'} detail="Follows level and division scope" tone={canManageSelectedJob ? 'good' : 'warn'} />
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
          header: 'Actions',
          render: (row) => {
            if (!canManageSelectedJob) return 'Read only';
            const isBusy = buyoutAction.id === row.id;
            return (
              <div className="job-buyout-actions">
                <button type="button" className="secondary-button" onClick={() => startBuyoutEdit(row)} disabled={isBusy || buyoutForm.isSaving}>
                  Edit
                </button>
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
                <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleBuyoutArchive(row)} disabled={isBusy || buyoutForm.isSaving}>
                  {isBusy && buyoutAction.action === 'archive' ? 'Archiving...' : 'Archive'}
                </button>
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
            <form className="job-buyout-form" onSubmit={handleBuyoutSave}>
              <Toolbar
                eyebrow={buyoutForm.id ? 'Edit' : 'Add'}
                title={buyoutForm.id ? 'Edit buyout item' : 'Add buyout item'}
                description="Buyout remains a planning checklist. It does not create purchase orders, accounting entries, or inventory movements."
                actions={buyoutForm.id ? (
                  <button type="button" className="secondary-button" onClick={resetBuyoutForm} disabled={buyoutForm.isSaving}>
                    Cancel Edit
                  </button>
                ) : null}
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
                  <span>Status</span>
                  <select
                    value={buyoutForm.status}
                    onChange={(event) => setBuyoutForm((current) => ({ ...current, status: event.target.value, error: null, success: '' }))}
                    disabled={buyoutForm.isSaving}
                  >
                    {BUYOUT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{formatBuyoutStatus(status)}</option>
                    ))}
                  </select>
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
                <StatePanel tone="success" eyebrow="Saved" title="Buyout item saved" description={buyoutForm.success} compact />
              ) : null}
              <div className="job-buyout-form__actions">
                <button type="submit" className="primary-button" disabled={buyoutForm.isSaving || !buyoutForm.item_description.trim()}>
                  <Plus aria-hidden="true" /> {buyoutForm.isSaving ? 'Saving...' : buyoutForm.id ? 'Save Buyout Item' : 'Add Buyout Item'}
                </button>
              </div>
            </form>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Read Only"
              title="Buyout writes require selected-job management permission"
              description="You can view buyout rows for jobs you can see. Adding and updating buyout items follows level and division scope."
              compact
            />
          )}
        </>
      );
    }

    if (activeTab === 'transactions') {
      const totalQuantity = jobTransactions.rows.reduce((total, row) => total + (Number(row.quantity) || 0), 0);
      const distinctItems = new Set(jobTransactions.rows.map((row) => row.item_id).filter(Boolean)).size;
      const lastRow = jobTransactions.rows[0] ?? null;

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Rows" value={jobTransactions.rows.length} detail="Job-coded ledger rows" />
            <SummaryCard label="Quantity" value={formatQuantity(totalQuantity)} detail="Total material quantity" />
            <SummaryCard label="Items" value={distinctItems} detail="Distinct materials" />
            <SummaryCard label="Latest" value={lastRow ? formatDateTime(lastRow.occurred_at || lastRow.transaction_created_at) : '-'} detail={lastRow?.item_name || 'No job-coded transaction'} />
          </div>

          <DataTable
            columns={JOB_TRANSACTION_COLUMNS}
            rows={jobTransactions.rows}
            getRowKey={(row) => row.transaction_item_id}
            permissions={permissions}
            isLoading={jobTransactions.isLoading}
            error={jobTransactions.error}
            dense
            minWidth="1120px"
            emptyTitle="No material transactions for this job"
            emptyDescription="This read-only log shows material coded to this job through Inventory Checkout. It does not create returns, edits, costs, or accounting entries."
          />

          <StatePanel
            tone="neutral"
            eyebrow="Read Only"
            title="Inventory Checkout remains the source"
            description="Transactions are sourced from the existing job transaction log view. Return-to-Inventory, cost/value display, edit actions, and exports remain separate future work."
            compact
          />
        </>
      );
    }

    if (activeTab === 'financials') {
      const originalTotal = sumField(jobBudget.lines, 'budget_amount');
      const changeTotal = sumField(jobBudget.lines, 'budget_change_amount');
      const revisedTotal = jobBudget.lines.reduce((total, line) => total + revisedBudget(line), 0);
      const actualTotal = sumField(jobBudget.lines, 'actual_cost_amount');
      const committedTotal = sumField(jobBudget.lines, 'committed_cost_amount');
      const forecastThisMonthTotal = sumField(jobBudget.lines, 'forecast_to_complete_amount');
      const forecastFinalTotal = jobBudget.lines.reduce((total, line) => total + forecastFinal(line), 0);
      const forecastedRemainderTotal = jobBudget.lines.reduce((total, line) => total + forecastedRemainder(line), 0);
      const remainingTotal = revisedTotal - forecastFinalTotal;
      const updateInlineBudgetField = (field, value) => {
        setBudgetForm((current) => ({ ...current, [field]: value, error: null, success: '' }));
      };
      const inlineBudgetInput = (row, field, label) => (
        budgetForm.id === row.id ? (
          <input
            aria-label={`${label} for ${row.description || 'financial line'}`}
            className="job-financials-table-input"
            type="number"
            min="0"
            step="0.01"
            value={budgetForm[field]}
            onChange={(event) => updateInlineBudgetField(field, event.target.value)}
            disabled={budgetForm.isSaving}
          />
        ) : null
      );
      const budgetColumns = [
        {
          key: 'category',
          header: 'Category',
          render: (row) => budgetForm.id === row.id ? (
            <select aria-label={`Category for ${row.description || 'financial line'}`} className="job-financials-table-input" value={budgetForm.category} onChange={(event) => updateInlineBudgetField('category', event.target.value)} disabled={budgetForm.isSaving}>
              {BUDGET_CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{formatBudgetCategory(category)}</option>)}
            </select>
          ) : formatBudgetCategory(row.category),
        },
        {
          key: 'cost_code',
          header: 'Cost code',
          render: (row) => budgetForm.id === row.id ? <input aria-label={`Cost code for ${row.description || 'financial line'}`} className="job-financials-table-input" type="text" value={budgetForm.cost_code} onChange={(event) => updateInlineBudgetField('cost_code', event.target.value)} disabled={budgetForm.isSaving} /> : (row.cost_code || '-'),
        },
        {
          key: 'description',
          header: 'Description',
          render: (row) => budgetForm.id === row.id ? <input aria-label="Financial line description" className="job-financials-table-input job-financials-table-input--description" type="text" value={budgetForm.description} onChange={(event) => updateInlineBudgetField('description', event.target.value)} disabled={budgetForm.isSaving} /> : <strong>{row.description || 'Untitled budget line'}</strong>,
        },
        { key: 'budget_amount', header: 'Original', render: (row) => inlineBudgetInput(row, 'budget_amount', 'Original budget') || formatMoney(row.budget_amount), align: 'right' },
        { key: 'budget_change_amount', header: 'Changes', render: (row) => inlineBudgetInput(row, 'budget_change_amount', 'Budget changes') || formatMoney(row.budget_change_amount), align: 'right' },
        { key: 'revised_budget', header: 'Revised', render: (row) => formatMoney(revisedBudget(row)), align: 'right' },
        { key: 'actual_cost_amount', header: 'Actual', render: (row) => inlineBudgetInput(row, 'actual_cost_amount', 'Actual cost') || formatMoney(row.actual_cost_amount), align: 'right' },
        { key: 'committed_cost_amount', header: 'Committed', render: (row) => inlineBudgetInput(row, 'committed_cost_amount', 'Committed cost') || formatMoney(row.committed_cost_amount), align: 'right' },
        { key: 'forecast_to_complete_amount', header: 'Forecast this month', render: (row) => inlineBudgetInput(row, 'forecast_to_complete_amount', 'Forecast this month') || formatMoney(row.forecast_to_complete_amount), align: 'right' },
        { key: 'forecast_final', header: 'Forecast final', render: (row) => inlineBudgetInput(row, 'forecast_final_amount', 'Forecast final') || formatMoney(forecastFinal(row)), align: 'right' },
        { key: 'forecasted_remainder', header: 'Forecasted remainder', render: (row) => formatMoney(forecastedRemainder(row)), align: 'right' },
        {
          key: 'note',
          header: 'Notes',
          render: (row) => budgetForm.id === row.id ? <input aria-label={`Notes for ${row.description || 'financial line'}`} className="job-financials-table-input job-financials-table-input--description" type="text" value={budgetForm.note} onChange={(event) => updateInlineBudgetField('note', event.target.value)} disabled={budgetForm.isSaving} /> : (row.note || '-'),
        },
        {
          key: 'actions',
          header: 'Actions',
          render: (row) => {
            if (!canApproveSelectedBudget) return 'Read only';
            if (budgetForm.id === row.id) {
              return (
                <div className="job-buyout-actions job-financials-table-actions">
                  <input aria-label={`Change reason for ${row.description || 'financial line'}`} className="job-financials-table-input" type="text" value={budgetForm.change_reason} onChange={(event) => updateInlineBudgetField('change_reason', event.target.value)} placeholder="Reason if changing protected fields" disabled={budgetForm.isSaving} />
                  <button type="button" className="primary-button" onClick={() => handleBudgetSave()} disabled={budgetForm.isSaving || !budgetForm.description.trim()}>
                    {budgetForm.isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="secondary-button" onClick={resetBudgetForm} disabled={budgetForm.isSaving}>Cancel</button>
                </div>
              );
            }
            return (
              <div className="job-buyout-actions">
                <button type="button" className="secondary-button" onClick={() => startBudgetEdit(row)} disabled={budgetForm.isSaving}>
                  Edit
                </button>
                <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleBudgetArchive(row)} disabled={budgetForm.isSaving}>
                  Archive
                </button>
              </div>
            );
          },
        },
      ];

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Original Budget" value={formatMoney(originalTotal)} detail="Approved budget lines" />
            <SummaryCard label="Revised Budget" value={formatMoney(revisedTotal)} detail={`${formatMoney(changeTotal)} in changes`} />
            <SummaryCard label="Actual Cost" value={formatMoney(actualTotal)} detail="Tracked cost only" />
            <SummaryCard label="Committed" value={formatMoney(committedTotal)} detail="Committed cost" />
            <SummaryCard label="Forecast This Month" value={formatMoney(forecastThisMonthTotal)} detail="Expected payment by month-end" />
            <SummaryCard label="Forecast Final" value={formatMoney(forecastFinalTotal)} detail={`${formatMoney(forecastedRemainderTotal)} after this month`} />
            <SummaryCard label="Remaining" value={formatMoney(remainingTotal)} detail="Revised minus forecast final" tone={remainingTotal < 0 ? 'warn' : 'good'} />
          </div>

          <DataTable
            columns={budgetColumns}
            rows={jobBudget.lines}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={jobBudget.isLoading}
            error={jobBudget.error}
            dense
            minWidth="1800px"
            emptyTitle="No financial lines for this job"
            emptyDescription="Add budget lines to track budget, actuals, commitments, month-end forecast, final forecast, and remaining value."
          />

          {canApproveSelectedBudget ? (
            <>
              {availableBudgetTemplates.length ? (
                <section className="job-financials-form" aria-label="Financial templates">
                  <Toolbar
                    eyebrow="Templates"
                    title="Use a financial template"
                    description="Templates add editable financial lines by cost code. Existing matching lines are not duplicated, and all amounts start at $0.00."
                  />
                  {availableBudgetTemplates.map((template) => (
                    <div className="job-financials-form__actions" key={template.key}>
                      <span>{template.name} - {template.lines.length} service lines</span>
                      <button type="button" className="secondary-button" onClick={() => handleBudgetTemplateUse(template)} disabled={Boolean(budgetTemplateAction.key) || jobBudget.isLoading}>
                        {budgetTemplateAction.key === template.key ? 'Applying...' : 'Use Template'}
                      </button>
                    </div>
                  ))}
                  {budgetTemplateAction.error ? (
                    <StatePanel tone="danger" eyebrow="Template Failed" title="Financial template was not applied" description={budgetTemplateAction.error.message || 'Unexpected template error.'} compact />
                  ) : null}
                  {budgetTemplateAction.success ? (
                    <StatePanel tone="success" eyebrow="Template Applied" title="Financial lines added" description={budgetTemplateAction.success} compact />
                  ) : null}
                </section>
              ) : null}

              <form className="job-financials-form" onSubmit={handleBudgetImport}>
                <Toolbar
                  eyebrow="Import"
                  title="Import cost report"
                  description="Matches report cost codes to this job and updates Actual only."
                />
                <div className="job-financials-form__grid">
                  <label className="job-financials-form__wide">
                    <span>Cost report</span>
                    <input
                      key={budgetImport.success || 'ready'}
                      type="file"
                      accept=".csv,.tsv,.txt,.pdf,application/pdf"
                      onChange={(event) => setBudgetImport((current) => ({ ...current, file: event.target.files?.[0] ?? null, error: null, success: '' }))}
                      disabled={budgetImport.isImporting}
                    />
                  </label>
                </div>
                {budgetImport.error ? (
                  <StatePanel tone="danger" eyebrow="Import Failed" title="Cost report was not imported" description={budgetImport.error.message || 'Unexpected financial import error.'} compact />
                ) : null}
                {budgetImport.success ? (
                  <StatePanel tone="success" eyebrow="Imported" title="Actual costs updated" description={budgetImport.success} compact />
                ) : null}
                <div className="job-financials-form__actions">
                  <button type="submit" className="secondary-button" disabled={budgetImport.isImporting || !budgetImport.file || jobBudget.isLoading}>
                    {budgetImport.isImporting ? 'Importing...' : 'Import Cost Report'}
                  </button>
                </div>
              </form>

              <form className="job-financials-form" onSubmit={handleBudgetSave}>
                <Toolbar
                  eyebrow={budgetForm.id ? 'Edit' : 'Add'}
                  title={budgetForm.id ? 'Edit financial line' : 'Add financial line'}
                  description="Add a new financial line here. Existing lines are edited directly in the table. Financials are planning and forecasting only; they do not post to accounting or create purchase orders."
                  actions={budgetForm.id ? (
                    <button type="button" className="secondary-button" onClick={resetBudgetForm} disabled={budgetForm.isSaving}>
                      Cancel Edit
                    </button>
                  ) : null}
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
                    <span>Forecast this month</span>
                    <input type="number" min="0" step="0.01" value={budgetForm.forecast_to_complete_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, forecast_to_complete_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
                  </label>
                  <label>
                    <span>Forecast final</span>
                    <input type="number" min="0" step="0.01" value={budgetForm.forecast_final_amount} onChange={(event) => setBudgetForm((current) => ({ ...current, forecast_final_amount: event.target.value, error: null, success: '' }))} disabled={budgetForm.isSaving} />
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
                  <label className="job-financials-form__wide">
                    <span>Change reason</span>
                    <input
                      type="text"
                      value={budgetForm.change_reason}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, change_reason: event.target.value, error: null, success: '' }))}
                      placeholder="Required for original budget, cost code, description, or category edits"
                      disabled={budgetForm.isSaving}
                    />
                  </label>
                </div>
                {budgetForm.error ? (
                  <StatePanel tone="danger" eyebrow="Financial Save Failed" title="Line was not saved" description={budgetForm.error.message || 'Unexpected financials error.'} compact />
                ) : null}
                {budgetForm.success ? (
                  <StatePanel tone="success" eyebrow="Saved" title="Financial line saved" description={budgetForm.success} compact />
                ) : null}
                <div className="job-financials-form__actions">
                  <button type="submit" className="primary-button" disabled={budgetForm.isSaving || !budgetForm.description.trim()}>
                    <Plus aria-hidden="true" /> {budgetForm.isSaving ? 'Saving...' : budgetForm.id ? 'Save Financial Line' : 'Add Financial Line'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <StatePanel
              tone="neutral"
              eyebrow="Read Only"
              title="Financial writes require selected-job budget approval permission"
              description="You can view financial lines when allowed by financial permissions. Adding budget lines follows level, division, and budget approval scope."
              compact
            />
          )}
        </>
      );
    }

    if (activeTab === 'schedule') {
      const completeCount = jobSchedule.items.filter((item) => item.status === 'complete').length;
      const delayedCount = jobSchedule.items.filter((item) => item.status === 'delayed').length;
      const datedItems = jobSchedule.items.filter((item) => (
        item.initial_start_date
        || item.actual_start_date
        || item.initial_completion_date
        || item.actual_completion_date
        || item.target_date
      ));
      const overdueCount = jobSchedule.items.filter((item) => {
        const remaining = daysUntil(item.actual_completion_date || item.initial_completion_date || item.target_date);
        return remaining !== null && remaining < 0 && item.status !== 'complete';
      }).length;
      const nextItem = datedItems
        .filter((item) => item.status !== 'complete')
        .sort((a, b) => String(schedulePlannedFinish(a) || scheduleActualFinish(a)).localeCompare(String(schedulePlannedFinish(b) || scheduleActualFinish(b))))[0] ?? null;
      const ganttRows = jobSchedule.items.map((item) => {
        const plannedStart = parseDateOnly(schedulePlannedStart(item));
        const plannedFinish = parseDateOnly(schedulePlannedFinish(item));
        const actualStart = parseDateOnly(scheduleActualStart(item));
        const actualFinish = parseDateOnly(scheduleActualFinish(item));
        return {
          item,
          plannedStart,
          plannedFinish: plannedFinish || plannedStart,
          actualStart,
          actualFinish: actualFinish || actualStart,
        };
      });
      const scheduleRows = jobSchedule.items.map((item, index) => ({
        ...item,
        display_order: index + 1,
      }));
      const ganttDates = ganttRows.flatMap((row) => [
        row.plannedStart,
        row.plannedFinish,
        row.actualStart,
        row.actualFinish,
      ]).filter(Boolean);
      const ganttStart = ganttDates.length ? new Date(Math.min(...ganttDates.map((date) => date.getTime()))) : null;
      const ganttEnd = ganttDates.length ? new Date(Math.max(...ganttDates.map((date) => date.getTime()))) : null;
      const ganttTotalDays = ganttStart && ganttEnd ? Math.max(1, daysBetween(ganttStart, ganttEnd) + 1) : 1;
      const ganttTicks = ganttStart
        ? Array.from({ length: Math.min(ganttTotalDays, 16) }, (_, index) => {
          const offset = Math.round((index / Math.max(1, Math.min(ganttTotalDays, 16) - 1)) * (ganttTotalDays - 1));
          return addDays(ganttStart, offset);
        })
        : [];
      const barStyle = (start, end) => {
        if (!ganttStart || !start) return null;
        const safeEnd = end || start;
        const left = (daysBetween(ganttStart, start) / ganttTotalDays) * 100;
        const width = Math.max(2, ((daysBetween(start, safeEnd) + 1) / ganttTotalDays) * 100);
        return {
          left: `${Math.max(0, left)}%`,
          width: `${Math.min(100 - Math.max(0, left), width)}%`,
        };
      };
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
            <SummaryCard label="Next" value={nextItem ? formatDate(schedulePlannedFinish(nextItem) || scheduleActualFinish(nextItem)) : '-'} detail={nextItem?.title || 'No dated open item'} />
          </div>

          <div className="job-schedule-print-actions">
            <button type="button" className="secondary-button" onClick={() => handleSchedulePrint('list')}>Print List</button>
            <button type="button" className="secondary-button" onClick={() => handleSchedulePrint('graph')}>Print Graph</button>
            <button type="button" className="secondary-button" onClick={() => handleSchedulePrint('both')}>Print Both</button>
          </div>

          <div className="job-schedule-print-list">
            <DataTable
              columns={scheduleColumns}
              rows={scheduleRows}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={jobSchedule.isLoading}
              error={jobSchedule.error}
              dense
              minWidth="1480px"
              emptyTitle="No schedule items for this job"
              emptyDescription="Add milestones or tasks to track key dates, duration, and dependencies. No calendar sync, assignments, or reminders are created."
            />
          </div>
          <section className="job-schedule-gantt job-schedule-print-graph" aria-label="Schedule Gantt graph">
            <Toolbar
              eyebrow="Graph"
              title="Schedule Gantt"
              description="Planned bars use initial dates. Actual bars use actual dates when recorded."
            />
            {ganttRows.some((row) => row.plannedStart || row.actualStart) ? (
              <div className="job-schedule-gantt__surface">
                <div className="job-schedule-gantt__axis">
                  <span />
                  <div className="job-schedule-gantt__ticks">
                    {ganttTicks.map((tick) => (
                      <span key={tick.toISOString()}>{formatDate(toDateOnlyString(tick))}</span>
                    ))}
                  </div>
                </div>
                {ganttRows.map((row) => {
                  const plannedStyle = barStyle(row.plannedStart, row.plannedFinish);
                  const actualStyle = barStyle(row.actualStart, row.actualFinish);
                  return (
                    <div key={row.item.id} className="job-schedule-gantt__row">
                      <div className="job-schedule-gantt__label">
                        <strong>{row.item.title || 'Untitled schedule item'}</strong>
                        <span>{row.item.dependencies || 'No dependencies'}</span>
                      </div>
                      <div className="job-schedule-gantt__track">
                        {plannedStyle ? (
                          <span className="job-schedule-gantt__bar job-schedule-gantt__bar--planned" style={plannedStyle}>
                            Initial
                          </span>
                        ) : null}
                        {actualStyle ? (
                          <span className="job-schedule-gantt__bar job-schedule-gantt__bar--actual" style={actualStyle}>
                            Actual
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <StatePanel
                tone="neutral"
                eyebrow="No Dates"
                title="Add start or completion dates to render the Gantt graph"
                description="The graph appears once at least one schedule row has an initial or actual date."
                compact
              />
            )}
          </section>
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
                  <span>Duration days</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={scheduleForm.duration_days}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, duration_days: event.target.value, error: null, success: '' }))}
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
                    placeholder={String(nextScheduleDisplayOrder())}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Initial start</span>
                  <input
                    type="date"
                    value={scheduleForm.initial_start_date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, initial_start_date: event.target.value, error: null, success: '' }))}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Actual start</span>
                  <input
                    type="date"
                    value={scheduleForm.actual_start_date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, actual_start_date: event.target.value, error: null, success: '' }))}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Initial completion</span>
                  <input
                    type="date"
                    value={scheduleForm.initial_completion_date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, initial_completion_date: event.target.value, error: null, success: '' }))}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Actual completion</span>
                  <input
                    type="date"
                    value={scheduleForm.actual_completion_date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, actual_completion_date: event.target.value, error: null, success: '' }))}
                    disabled={scheduleForm.isSaving}
                  />
                </label>
                <label className="job-schedule-form__wide">
                  <span>Dependencies</span>
                  <input
                    type="text"
                    value={scheduleForm.dependencies}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, dependencies: event.target.value, error: null, success: '' }))}
                    placeholder="Predecessor IDs, notes, or external dependencies"
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
              description="You can view schedule items for jobs you can see. Adding, editing, archiving, and ordering follow level and division scope."
              compact
            />
          )}
        </>
      );
    }

    if (activeTab === 'history') {
      const updateCount = jobHistory.rows.filter((row) => row.action === 'update').length;
      const archiveCount = jobHistory.rows.filter((row) => row.action === 'archive').length;
      const latestRow = jobHistory.rows[0] ?? null;
      const areasTouched = new Set(jobHistory.rows.map((row) => row.table_name).filter(Boolean)).size;

      return (
        <>
          <div className="summary-grid summary-grid--compact">
            <SummaryCard label="Events" value={jobHistory.rows.length} detail="Recent job audit entries" />
            <SummaryCard label="Updates" value={updateCount} detail="Recorded edit events" />
            <SummaryCard label="Archives" value={archiveCount} detail="Archived job records" tone={archiveCount ? 'warn' : 'default'} />
            <SummaryCard label="Areas" value={areasTouched} detail="Job sections touched" />
            <SummaryCard label="Latest" value={latestRow ? formatDateTime(latestRow.created_at) : '-'} detail={latestRow ? formatJobHistoryArea(latestRow.table_name) : 'No audit entry'} />
          </div>

          <Toolbar
            eyebrow="Audit"
            title="Job History"
            description="Read-only audit entries for this job and its job-owned sections."
            actions={(
              <button type="button" className="secondary-button" onClick={jobHistory.reload} disabled={jobHistory.isLoading}>
                <History aria-hidden="true" /> Refresh History
              </button>
            )}
          />

          <DataTable
            columns={JOB_HISTORY_COLUMNS}
            rows={jobHistory.rows}
            getRowKey={(row) => row.id}
            permissions={permissions}
            isLoading={jobHistory.isLoading}
            error={jobHistory.error}
            dense
            minWidth="980px"
            emptyTitle="No job history yet"
            emptyDescription="Job, Buyout, Financials, Documents, and Schedule changes will appear here after they are recorded."
          />
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
            description="Materials are hidden for now. Transaction edits/returns, external accounting, calendar sync, dependency logic, and final RLS cleanup stay deferred."
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
            <button type="button" className="primary-button" onClick={startJobCreate} disabled={!canCreateJobs}>
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
            {mode === 'create' || mode === 'edit' ? (
              (mode === 'create' ? canCreateJobs : canManageSelectedJob) ? (
                <form className="job-create-form" onSubmit={mode === 'create' ? handleJobCreate : handleJobUpdate}>
                  <Toolbar
                    eyebrow={mode === 'create' ? 'Create Mode' : 'Edit Mode'}
                    title={mode === 'create' ? 'Create job' : 'Edit job'}
                    description={mode === 'create'
                      ? 'New jobs are created in your current division and inherit the existing jobs RLS.'
                      : 'Job edits update the existing foundation record and write a change log entry.'}
                    dense
                    actions={(
                      <button type="button" className="secondary-button" onClick={() => setMode('browse')} disabled={jobForm.isSaving}>
                        Back to All Jobs
                      </button>
                    )}
                  />
                  <div className="job-create-form__grid">
                    <label className="job-create-form__wide">
                      <span>Job name</span>
                      <input
                        type="text"
                        value={jobForm.name}
                        onChange={(event) => setJobForm((current) => ({ ...current, name: event.target.value, error: null, success: '' }))}
                        placeholder="Northgate HQ"
                        disabled={jobForm.isSaving}
                        required
                      />
                    </label>
                    <label>
                      <span>Job number</span>
                      <input
                        type="text"
                        value={jobForm.job_number}
                        onChange={(event) => setJobForm((current) => ({ ...current, job_number: event.target.value, error: null, success: '' }))}
                        placeholder="Optional"
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label>
                      <span>Division</span>
                      <input type="text" value={(mode === 'create' ? createJobDivision : selectedJob?.division) || 'No division'} disabled readOnly />
                    </label>
                    <label>
                      <span>Status</span>
                      <select
                        value={jobForm.status}
                        onChange={(event) => setJobForm((current) => ({ ...current, status: event.target.value, error: null, success: '' }))}
                        disabled={jobForm.isSaving}
                      >
                        {JOB_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{formatStatus(status)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Type</span>
                      <select
                        value={jobForm.job_type}
                        onChange={(event) => setJobForm((current) => ({ ...current, job_type: event.target.value, error: null, success: '' }))}
                        disabled={jobForm.isSaving}
                      >
                        <option value="job">Job</option>
                        <option value="service_call">Service Call</option>
                      </select>
                    </label>
                    <label>
                      <span>Service call #</span>
                      <input
                        type="text"
                        value={jobForm.service_call_number}
                        onChange={(event) => setJobForm((current) => ({ ...current, service_call_number: event.target.value, error: null, success: '' }))}
                        placeholder="Optional"
                        disabled={jobForm.isSaving || jobForm.job_type !== 'service_call'}
                      />
                    </label>
                    <label className="job-create-form__wide">
                      <span>Address line 1</span>
                      <input
                        type="text"
                        value={jobForm.address_line1}
                        onChange={(event) => setJobForm((current) => ({ ...current, address_line1: event.target.value, error: null, success: '' }))}
                        placeholder="Street address"
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label className="job-create-form__wide">
                      <span>Address line 2</span>
                      <input
                        type="text"
                        value={jobForm.address_line2}
                        onChange={(event) => setJobForm((current) => ({ ...current, address_line2: event.target.value, error: null, success: '' }))}
                        placeholder="Suite, floor, or unit"
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label>
                      <span>City</span>
                      <input
                        type="text"
                        value={jobForm.city}
                        onChange={(event) => setJobForm((current) => ({ ...current, city: event.target.value, error: null, success: '' }))}
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label>
                      <span>State</span>
                      <input
                        type="text"
                        value={jobForm.state}
                        onChange={(event) => setJobForm((current) => ({ ...current, state: event.target.value, error: null, success: '' }))}
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label>
                      <span>Postal code</span>
                      <input
                        type="text"
                        value={jobForm.postal_code}
                        onChange={(event) => setJobForm((current) => ({ ...current, postal_code: event.target.value, error: null, success: '' }))}
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label className="job-create-form__wide">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={jobForm.description}
                        onChange={(event) => setJobForm((current) => ({ ...current, description: event.target.value, error: null, success: '' }))}
                        placeholder="Scope summary"
                        disabled={jobForm.isSaving}
                      />
                    </label>
                    <label className="job-create-form__wide">
                      <span>Notes</span>
                      <textarea
                        rows={3}
                        value={jobForm.notes}
                        onChange={(event) => setJobForm((current) => ({ ...current, notes: event.target.value, error: null, success: '' }))}
                        placeholder="Internal notes"
                        disabled={jobForm.isSaving}
                      />
                    </label>
                  </div>
                  {jobForm.error ? (
                    <StatePanel tone="danger" eyebrow="Create Failed" title="Job was not created" description={jobForm.error.message || 'Unexpected job create error.'} compact />
                  ) : null}
                  {jobForm.success ? (
                    <StatePanel tone="success" eyebrow="Saved" title="Job created" description={jobForm.success} compact />
                  ) : null}
                  <div className="job-create-form__actions">
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={jobForm.isSaving || !jobForm.name.trim() || (mode === 'create' && !createJobDivision)}
                    >
                      <Plus aria-hidden="true" /> {jobForm.isSaving ? 'Saving...' : mode === 'create' ? 'Create Job' : 'Save Job'}
                    </button>
                  </div>
                </form>
              ) : (
                <StatePanel
                  eyebrow={mode === 'create' ? 'Create Locked' : 'Edit Locked'}
                  title={mode === 'create' ? 'Job creation requires can_create_jobs' : 'Job edits require selected-job management permission'}
                  description={mode === 'create'
                    ? 'This session can browse visible jobs but cannot submit a hidden insert path.'
                    : 'This session can browse the selected job but cannot submit a hidden update path.'}
                  tone="warning"
                  actions={(
                    <button type="button" className="secondary-button" onClick={() => setMode('browse')}>
                      Back to All Jobs
                    </button>
                  )}
                />
              )
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
                  actions={selectedJob && canManageSelectedJob ? (
                    <>
                      <button type="button" className="secondary-button" onClick={startJobEdit} disabled={Boolean(jobAction.action)}>
                        Edit
                      </button>
                      <button type="button" className="secondary-button secondary-button--danger" onClick={handleJobArchive} disabled={Boolean(jobAction.action)}>
                        {jobAction.action === 'archive' ? 'Archiving...' : 'Archive'}
                      </button>
                    </>
                  ) : null}
                />
                {jobAction.error ? (
                  <StatePanel tone="danger" eyebrow="Job Action Failed" title="Could not complete this job action" description={jobAction.error.message || 'Unexpected job action error.'} compact />
                ) : null}
                {jobAction.success ? (
                  <StatePanel tone="success" eyebrow="Saved" title="Job action complete" description={jobAction.success} compact />
                ) : null}
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
