import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import jsQR from 'jsqr';
import { AlertCircle, Archive, ArrowLeft, Briefcase, Camera, CameraOff, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCheck, Copy, Database, Download, FileText, HardHat, LayoutDashboard, MapPin, MessageSquare, Pencil, Plus, Printer, QrCode, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, ShoppingCart, SlidersHorizontal, Truck, Users, Wrench } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/layout/AppShell.jsx';
import { PrimarySidebar } from './components/layout/PrimarySidebar.jsx';
import { SecondarySidebar } from './components/layout/SecondarySidebar.jsx';
import { createSupabaseClient, supabase } from './services/supabaseClient.js';
import { SilasBubble, SilasWorkspacePanel } from './components/SilasPanels.jsx';
import { RecordHeader } from './components/ui/RecordHeader.jsx';
import { StatePanel } from './components/ui/StatePanel.jsx';
import { SummaryCard } from './components/ui/SummaryCard.jsx';
import { WorkspaceHeader } from './components/ui/WorkspaceHeader.jsx';
import { WorkspaceTabs } from './components/ui/WorkspaceTabs.jsx';
import { useBinItemRetirement } from './hooks/useBinItemRetirement.js';
import { useInventoryCountIntake } from './hooks/useInventoryCountIntake.js';
import { useInventoryCountSheet } from './hooks/useInventoryCountSheet.js';
import { useInventoryReadModel } from './hooks/useInventoryReadModel.js';
import { useInventoryCart } from './hooks/useInventoryCart.js';
import { useInventoryTransactionHistory } from './hooks/useInventoryTransactionHistory.js';
import { usePermissions } from './hooks/usePermissions.js';
import { useSilas } from './hooks/useSilas.js';
import { buildLocationQrSvg, buildLocationQrUrl, buildLocationScanPath, parseLocationScanPayload, getAppOrigin } from './lib/locationQr.js';

const APP_BUILD_SHA = __APP_BUILD_SHA__;
const DESTINATION_OPTIONS = [
  { value: 'job', label: 'Job' },
  { value: 'service_call', label: 'Service Call' },
  { value: 'vehicle', label: 'Vehicle Stock' },
  { value: 'user', label: 'User Possession' },
  { value: 'vendor_return', label: 'Vendor Return' },
  { value: 'scrap', label: 'Scrap' },
  { value: 'unknown', label: 'Unknown / Missing' },
];

const DESTINATIONS_REQUIRING_ID = new Set(['job', 'service_call', 'vehicle', 'user']);
const VALID_DESTINATION_TYPES = new Set(DESTINATION_OPTIONS.map((option) => option.value));
const CART_DESTINATION_DRAFT_PREFIX = 'northgate.inventoryCart.destinationDrafts.';
const DEFAULT_CANDIDATE_QUANTITY = 0;
const TRANSACTION_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All movement' },
  { value: 'checkout', label: 'Checkout / Remove Stock' },
  { value: 'physical_count_correction', label: 'Physical Count Correction' },
  { value: 'add_stock', label: 'Add Stock' },
];
const ISSUE_TO_JOB_HANDOFF_KEY = 'northgate.inventoryCart.issueToJobHandoff';
const INVENTORY_TABS = new Set([
  'grand-master',
  'accounting-export',
  'catalog',
  'storage',
  'locations',
  'scan',
  'labels',
  'tools',
  'cart',
  'count',
  'transactions',
]);
const WORKSPACES = new Set([
  'dashboard',
  'inventory',
  'jobs',
  'estimating',
  'tools',
  'employees',
  'vehicles',
  'silas',
  'developer',
]);
const INVENTORY_TAB_ITEMS = [
  {
    key: 'grand-master',
    label: 'Inventory Overview',
    shortLabel: 'Overview',
    icon: LayoutDashboard,
    description: 'Live stock summary and comparison view.',
  },
  {
    key: 'accounting-export',
    label: 'Accounting Export',
    shortLabel: 'Accounting Export',
    icon: Download,
    description: 'Read-only accounting preview and print surface.',
  },
  {
    key: 'catalog',
    label: 'Catalog Preview',
    shortLabel: 'Catalog',
    icon: Database,
    description: 'Material list and pricing preview.',
  },
  {
    key: 'storage',
    label: 'Storage Browser',
    shortLabel: 'Storage',
    icon: MapPin,
    description: 'Physical units, shelves, bays, and bins.',
  },
  {
    key: 'locations',
    label: 'Locations & QR',
    shortLabel: 'Locations',
    icon: QrCode,
    description: 'Stable location records and QR outputs.',
  },
  {
    key: 'scan',
    label: 'Scan QR',
    shortLabel: 'Scan',
    icon: Camera,
    description: 'Scan and dispatch into existing inventory flows.',
  },
  {
    key: 'labels',
    label: 'Label Designer',
    shortLabel: 'Labels',
    icon: Printer,
    description: 'Template-driven unit, shelf, bay, and bin labels.',
  },
  {
    key: 'tools',
    label: 'Tool Catalogue',
    shortLabel: 'Tool Catalogue',
    icon: Wrench,
    description: 'Inventory-adjacent catalogue foundation for tools.',
  },
  {
    key: 'cart',
    label: 'Cart Checkout',
    shortLabel: 'Cart',
    icon: ShoppingCart,
    description: 'Controlled cart open, add, remove, and checkout flow.',
  },
  {
    key: 'count',
    label: 'Inventory Count & Correction',
    shortLabel: 'Count',
    icon: ClipboardCheck,
    description: 'Count intake, correction, and retirement workflow.',
  },
  {
    key: 'transactions',
    label: 'Transactions',
    shortLabel: 'Transactions',
    icon: RefreshCw,
    description: 'Read-only inventory movement history.',
  },
];
const INVENTORY_TAB_META = new Map(INVENTORY_TAB_ITEMS.map((item) => [item.key, item]));
const COUNT_REASON_OPTIONS = [
  { value: 'initial shelf count', label: 'Initial shelf count' },
  { value: 'cycle count', label: 'Cycle count' },
  { value: 'correction', label: 'Correction' },
  { value: 'custom', label: 'Custom note' },
];
const REPEAT_REVIEW_FIELDS = [
  { key: 'material_code', label: 'Material code', getValue: (row) => row.material_code },
  { key: 'item_name', label: 'Material name', getValue: (row) => row.item_name },
  { key: 'bin_code', label: 'Bin', getValue: (row) => row.bin_code },
  { key: 'storage_unit_code', label: 'Unit', getValue: (row) => row.storage_unit_code },
  { key: 'shelf_code', label: 'Shelf', getValue: (row) => row.shelf_code },
  { key: 'bay_code', label: 'Bay', getValue: (row) => row.bay_code },
  { key: 'storage_path', label: 'Storage path', getValue: (row) => buildStoragePath(row) },
  { key: 'manufacturer_part_number', label: 'Manufacturer part', getValue: (row) => row.manufacturer_part_number },
  { key: 'vendor_part_number', label: 'Vendor part', getValue: (row) => row.vendor_part_number },
  { key: 'manufacturer', label: 'Manufacturer', getValue: (row) => row.manufacturer },
  { key: 'manufacturer_sub', label: 'Manufacturer detail', getValue: (row) => row.manufacturer_sub },
  { key: 'description', label: 'Description', getValue: (row) => row.description },
];
const DEVELOPMENT_STATUS = {
  mostRecentChange: 'Northgate UI shell',
  relatedHandoff: 'Entry 140',
  architectureVersion: 'v2.30',
  currentStep: 'Jobs completion — Schedule',
  buildMarker: APP_BUILD_SHA,
  deploymentNote: 'Build marker reflects the exact bundle while the v2.30 shell and Inventory conversion stay inside locked presentation boundaries.',
};

DEVELOPMENT_STATUS.currentStep = 'Phase 1 visual system - Inventory';

const DEV_DASHBOARD_STORAGE_KEY = 'northgate.showDevDashboard';
const LEGACY_LAYOUT_TUNER_STORAGE_KEY = 'northgate.layoutTuner.v1';
const FORMATTING_TUNER_STORAGE_KEY = 'northgate.formattingTuner.v1';
const FORMATTING_TUNER_FIELDS = [
  { key: 'appContentMax', cssName: '--app-content-max', label: 'Content width', min: 1200, max: 2400, step: 20, unit: 'px', defaultValue: 1720 },
  { key: 'appPageGutter', cssName: '--app-page-gutter', label: 'Page gutter', min: 8, max: 40, step: 1, unit: 'px', defaultValue: 20 },
  { key: 'cardPadding', cssName: '--card-padding', label: 'Card padding', min: 12, max: 32, step: 1, unit: 'px', defaultValue: 18 },
  { key: 'cardGap', cssName: '--card-gap', label: 'Card gap', min: 8, max: 32, step: 1, unit: 'px', defaultValue: 14 },
  { key: 'baseFontSize', cssName: '--base-font-size', label: 'Base font size', min: 14, max: 18, step: 1, unit: 'px', defaultValue: 16 },
  { key: 'tableFontSize', cssName: '--table-font-size', label: 'Table font size', min: 12, max: 16, step: 1, unit: 'px', defaultValue: 14 },
  { key: 'tableCellPaddingY', cssName: '--table-cell-padding-y', label: 'Table cell padding Y', min: 4, max: 14, step: 1, unit: 'px', defaultValue: 10 },
  { key: 'tableCellPaddingX', cssName: '--table-cell-padding-x', label: 'Table cell padding X', min: 6, max: 20, step: 1, unit: 'px', defaultValue: 11 },
  { key: 'uiRadius', cssName: '--ui-radius', label: 'Border radius', min: 4, max: 20, step: 1, unit: 'px', defaultValue: 8 },
];
const FORMATTING_TUNER_PRESETS = {
  comfortable: {
    appContentMax: 1840,
    appPageGutter: 24,
    cardPadding: 22,
    cardGap: 18,
    baseFontSize: 17,
    tableFontSize: 15,
    tableCellPaddingY: 12,
    tableCellPaddingX: 14,
    uiRadius: 10,
  },
  standard: {
    appContentMax: 1720,
    appPageGutter: 20,
    cardPadding: 18,
    cardGap: 14,
    baseFontSize: 16,
    tableFontSize: 14,
    tableCellPaddingY: 10,
    tableCellPaddingX: 11,
    uiRadius: 8,
  },
  compact: {
    appContentMax: 1640,
    appPageGutter: 14,
    cardPadding: 14,
    cardGap: 10,
    baseFontSize: 15,
    tableFontSize: 13,
    tableCellPaddingY: 7,
    tableCellPaddingX: 9,
    uiRadius: 7,
  },
};

const TOOL_CATALOGUE_HELPER_COPY = 'Catalogue-only foundation. Tool checkout, assignments, QR labels, vehicle storage, and tracking history are reserved for future milestones.';
const TOOL_CATALOGUE_EMPTY_NOTE = 'Add tools here as a catalogue only. Checkout, assignments, QR labels, and tracking history are reserved for future milestones.';
const TOOL_STATUS_OPTIONS = ['active', 'inactive', 'retired', 'missing'];
const TOOL_CONDITION_OPTIONS = ['', 'good', 'fair', 'poor', 'damaged', 'unknown'];
const TOOL_CATALOGUE_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'tool_number',
  'name',
  'category',
  'brand',
  'model',
  'serial_number',
  'description',
  'condition',
  'status',
  'home_location',
  'current_location',
  'assigned_to',
  'purchase_date',
  'notes',
].join(',');
const TOOL_SEARCH_FIELDS = [
  'tool_number',
  'name',
  'category',
  'brand',
  'model',
  'serial_number',
  'description',
  'home_location',
  'current_location',
  'assigned_to',
  'notes',
];
const TOOL_TEXT_FORM_FIELDS = [
  { key: 'tool_number', label: 'Tool #' },
  { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'serial_number', label: 'Serial #' },
  { key: 'home_location', label: 'Home Location' },
  { key: 'current_location', label: 'Current Location' },
  { key: 'assigned_to', label: 'Assigned To' },
];
const TOOL_TEXTAREA_FORM_FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
];
const EMPTY_TOOL_DRAFT = Object.freeze({
  name: '',
  tool_number: '',
  category: '',
  brand: '',
  model: '',
  serial_number: '',
  description: '',
  condition: '',
  status: 'active',
  home_location: '',
  current_location: '',
  assigned_to: '',
  purchase_date: '',
  notes: '',
});

const DOCUMENTS_STORAGE_BUCKET = 'northgate-files';
const JOBS_HELPER_COPY = 'Jobs foundation. Job Material List, Buyout List, Transactions, Financials v1, Documents, and Schedule are live. Issue to Job routes through cart/checkout, and Return-to-Inventory plus broader project-management features remain reserved.';
const JOB_DOCUMENTS_HELPER_COPY = 'Documents attach to this job. They are stored securely and can be downloaded individually. Deleting a document only archives it — it is not permanently removed.';
const ISSUE_TO_JOB_HELPER_COPY = 'Issue to Job moves stock out of inventory through checkout. This is not a reservation.';
const JOB_FINANCIALS_HELPER_COPY = 'Financials v1 is a budget planning tool. It tracks budgeted cost lines for this job only. It does not calculate actual cost, profit, revenue, inventory value, purchase orders, invoices, change orders, payroll, or accounting entries.';
const JOB_SCHEDULE_HELPER_COPY = 'Schedule tracks key milestones and tasks for this job. It does not sync with a calendar or manage dependencies between items.';
function buildWorkspaceNavItems({ silasEnabled, canAccessDeveloper }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'inventory', label: 'Inventory', icon: Briefcase },
    { key: 'jobs', label: 'Jobs', icon: Briefcase },
    { key: 'estimating', label: 'Estimates', icon: Database },
    { key: 'tools', label: 'Tools', icon: Wrench },
    { key: 'employees', label: 'Employees', icon: ClipboardCheck },
    { key: 'vehicles', label: 'Vehicles', icon: MapPin },
  ];

  if (silasEnabled) {
    items.push({ key: 'silas', label: 'Silas', icon: ShieldCheck });
  }

  if (canAccessDeveloper) {
    items.push({ key: 'developer', label: 'Developer', icon: SlidersHorizontal });
  }

  return items;
}

function buildInventorySidebarItems(counts) {
  const badgeMap = {
    'grand-master': counts.grandMasterRows,
    catalog: counts.activeItems,
    storage: counts.bins,
    locations: counts.bins,
    cart: counts.inventoryBalances,
    count: counts.binItems,
    transactions: counts.inventoryBalances,
  };

  return INVENTORY_TAB_ITEMS.map((item) => ({
    ...item,
    badge: badgeMap[item.key] ?? null,
  }));
}

function getInventoryContext(activeTab, counts) {
  switch (activeTab) {
    case 'grand-master':
      return {
        eyebrow: 'Inventory Context',
        title: 'Overview snapshot',
        description: 'Use the overview to compare stock, value, and location coverage before drilling deeper into a workflow.',
        stats: [
          { label: 'Visible rows', value: counts.grandMasterRows },
          { label: 'Active items', value: counts.activeItems },
          { label: 'Balance rows', value: counts.inventoryBalances },
        ],
        bullets: [
          'Filters stay inside the main table for fast operator comparison.',
          'Selected rows use a soft red tint rather than a heavy dashboard-card treatment.',
        ],
      };
    case 'storage':
    case 'locations':
    case 'scan':
      return {
        eyebrow: 'Storage Context',
        title: 'Physical hierarchy',
        description: 'These views stay anchored to the existing Storage Unit -> Shelf -> Bay -> Bin model and QR resolution rules.',
        stats: [
          { label: 'Units', value: counts.storageUnits },
          { label: 'Shelves', value: counts.shelves },
          { label: 'Bays', value: counts.bays },
          { label: 'Bins', value: counts.bins },
        ],
        bullets: [
          'Hierarchy navigation remains module-level; no new routes were introduced.',
          'Scan pages still dispatch only into existing cart or count-correction flows.',
        ],
      };
    case 'cart':
      return {
        eyebrow: 'Workflow Context',
        title: 'Controlled cart flow',
        description: 'Cart actions still route through the existing server RPCs and keep destination drafts local until checkout.',
        stats: [
          { label: 'Candidate rows', value: counts.inventoryBalances },
          { label: 'Active items', value: counts.activeItems },
          { label: 'Bins', value: counts.bins },
        ],
        bullets: [
          'No direct balance writes were introduced.',
          'Apply Destination to All and per-line checkout stay on their original handlers.',
        ],
      };
    case 'count':
      return {
        eyebrow: 'Workflow Context',
        title: 'Count and correction',
        description: 'Count intake, quantity correction, and retirement remain fail-closed and permission-aware.',
        stats: [
          { label: 'Countable rows', value: counts.binItems },
          { label: 'Balance rows', value: counts.inventoryBalances },
          { label: 'Bins', value: counts.bins },
        ],
        bullets: [
          'Physical count correction remains the only approved balance-setting mechanic.',
          'Retirement still requires a zero ledger-derived balance first.',
        ],
      };
    case 'transactions':
      return {
        eyebrow: 'Read Context',
        title: 'Movement history',
        description: 'Transactions remain read-only and continue using the existing filter and permission boundaries.',
        stats: [
          { label: 'Balance rows', value: counts.inventoryBalances },
          { label: 'Active items', value: counts.activeItems },
          { label: 'Bins', value: counts.bins },
        ],
        bullets: [
          'Protected operational data stays omitted entirely where permissions do not allow it.',
          'No ledger, audit, or destination semantics changed in this pass.',
        ],
      };
    default:
      return {
        eyebrow: 'Section Context',
        title: INVENTORY_TAB_META.get(activeTab)?.label ?? 'Inventory section',
        description: INVENTORY_TAB_META.get(activeTab)?.description ?? 'This section remains on the existing live data path.',
        stats: [
          { label: 'Active items', value: counts.activeItems },
          { label: 'Bins', value: counts.bins },
          { label: 'Balance rows', value: counts.inventoryBalances },
        ],
        bullets: [
          'The shell changed, but the data source and action wiring did not.',
        ],
      };
  }
}
// Job-detail Issue to Job shortcut is intentionally hidden for now. Material movement should originate from Inventory / future Vehicle Inventory, with Job selected as the checkout destination. Keep the shortcut code available behind this toggle for possible future reactivation.
const ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION = false;
const JOB_BUDGET_CATEGORY_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'labor', label: 'Labor' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'permit', label: 'Permit' },
  { value: 'other', label: 'Other' },
];
const JOB_DOCUMENTS_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'owner_type',
  'owner_id',
  'storage_path',
  'file_name',
  'document_type',
  'description',
  'file_size_bytes',
  'mime_type',
  'created_by',
].join(',');
const JOB_SCHEDULE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'delayed', label: 'Delayed' },
];
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
  'status',
  'sort_order',
  'note',
  'created_by',
].join(',');
const BASE_JOB_DETAIL_TABS = [
  { key: 'overview', label: 'Overview', isDisabled: false, isComingSoon: false },
  { key: 'details', label: 'Details', isDisabled: false, isComingSoon: false },
  { key: 'materials', label: 'Materials', isDisabled: false, isComingSoon: false },
  { key: 'buyout', label: 'Buyout', isDisabled: false, isComingSoon: false },
  { key: 'transactions', label: 'Transactions', isDisabled: false, isComingSoon: false },
  { key: 'financials', label: 'Financials', isDisabled: false, isComingSoon: false },
  { key: 'documents', label: 'Documents', isDisabled: false, isComingSoon: false },
  { key: 'schedule', label: 'Schedule', isDisabled: false, isComingSoon: false },
];

function getJobDetailTabs(canViewFinancials) {
  return BASE_JOB_DETAIL_TABS.filter((tab) => tab.key !== 'financials' || canViewFinancials);
}

function getJobDetailTab(tabKey, tabs = BASE_JOB_DETAIL_TABS) {
  return tabs.find((tab) => tab.key === tabKey) ?? null;
}

function normalizeJobDetailTab(tabKey, tabs = BASE_JOB_DETAIL_TABS) {
  const tab = getJobDetailTab(tabKey, tabs);
  return tab && !tab.isDisabled ? tab.key : 'overview';
}
const BUYOUT_LIST_HELPER_COPY = 'Buyout List is a planning tool for the PM. Add items that need to be quoted or ordered. The In Stock column shows current inventory levels — it does not reserve material. To pull stock for this job, use the Inventory module.';
const JOB_STATUS_OPTIONS = ['active', 'on_hold', 'complete', 'cancelled'];
const JOB_TYPE_OPTIONS = ['job', 'service_call'];
const JOBS_SELECT_FIELDS = [
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
].join(',');
const JOB_SEARCH_FIELDS = [
  'job_number',
  'name',
  'description',
  'notes',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'job_type',
  'service_call_number',
  'division',
];
const JOB_TEXT_FORM_FIELDS = [
  { key: 'job_number', label: 'Job #' },
  { key: 'service_call_number', label: 'Service Call #' },
  { key: 'address_line1', label: 'Address Line 1' },
  { key: 'address_line2', label: 'Address Line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal Code' },
];
const JOB_TEXTAREA_FORM_FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
];
const JOB_MATERIAL_HELPER_COPY = 'Job Material List is planning only. It records what the job needs; it does not reserve stock, issue inventory, create transactions, or update balances. Buyout List is a separate planning surface, and Return-to-Inventory is reserved for future milestones.';
const BUYOUT_STATUS_OPTIONS = ['pending', 'ordered', 'received', 'cancelled'];
const JOB_MATERIALS_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'item_id',
  'requested_quantity',
  'note',
  'material_name_snapshot',
  'material_code_snapshot',
  'created_by',
].join(',');
const JOB_BUYOUT_LINES_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'item_id',
  'item_description',
  'quantity_needed',
  'quantity_ordered',
  'status',
  'vendor_note',
  'lead_time_note',
  'note',
  'created_by',
].join(',');
const JOB_BUDGET_LINES_SELECT_FIELDS = [
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
  'sort_order',
  'note',
  'created_by',
].join(',');
const EMPTY_JOB_BUDGET_DRAFT = Object.freeze({
  id: '',
  category: 'material',
  cost_code: '',
  description: '',
  budget_amount: '',
  note: '',
});
const EMPTY_JOB_SCHEDULE_DRAFT = Object.freeze({
  id: '',
  title: '',
  description: '',
  target_date: '',
  status: 'pending',
  note: '',
});
const JOB_MATERIAL_CATALOG_SELECT_FIELDS = 'id,material_code,name,description,unit_of_measure,division,is_active,is_archived';
const EMPTY_JOB_DRAFT = Object.freeze({
  job_number: '',
  name: '',
  status: 'active',
  description: '',
  notes: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  job_type: 'job',
  service_call_number: '',
});
const EMPTY_JOB_MATERIAL_DRAFT = Object.freeze({
  id: '',
  item_id: '',
  requested_quantity: '',
  note: '',
});
const EMPTY_JOB_BUYOUT_DRAFT = Object.freeze({
  id: '',
  item_id: '',
  item_description: '',
  quantity_needed: '',
  quantity_ordered: '',
  status: 'pending',
  vendor_note: '',
  lead_time_note: '',
  note: '',
});

const COUNT_INTAKE_HELP_ITEMS = [
  'Choose Unit, Shelf, Bay, and Bin to narrow the physical area before recording counts.',
  'Search accepts location shortcuts: C, C1, C11, and C111 map to Unit, Shelf, Bay, and Bin.',
  'A recorded counted quantity becomes an official physical count correction. Zero is valid.',
  'Use Reason or Custom note to describe why the count is being recorded.',
  'Mistaken bin/material rows must be counted to zero first, then retired. Retire archives only and does not change quantity or write a ledger transaction.',
];
const AVERY_LABEL_TEMPLATES = {
  '5164': {
    key: '5164',
    displayName: 'Avery 5164 Placard',
    scopeHint: 'Unit, Shelf, Bay',
    sheet: { width: 8.5, height: 11, unit: 'in' },
    label: { width: 4, height: 3.33 },
    margins: { top: 0.5, left: 0.15625 },
    pitch: { horizontal: 4.1875, vertical: 3.33 },
    gutters: { row: 0, column: 0.1875 },
    rows: 3,
    columns: 2,
  },
  '8160': {
    key: '8160',
    displayName: 'Avery 8160 Bin Label',
    scopeHint: 'Bin',
    sheet: { width: 8.5, height: 11, unit: 'in' },
    label: { width: 2.625, height: 1 },
    margins: { top: 0.5, left: 0.1875 },
    pitch: { horizontal: 2.75, vertical: 1 },
    gutters: { row: 0, column: 0.125 },
    rows: 10,
    columns: 3,
  },
};
const LABEL_SCOPE_OPTIONS = [
  { value: '', label: 'Any location level' },
  { value: 'unit', label: 'Unit' },
  { value: 'shelf', label: 'Shelf' },
  { value: 'bay', label: 'Bay' },
  { value: 'bin', label: 'Bin' },
];
const LABEL_FIELD_OPTIONS = [
  { key: 'qr', label: 'QR code' },
  { key: 'code', label: 'Location code' },
  { key: 'path', label: 'Location path' },
  { key: 'label', label: 'Display label' },
  { key: 'summary', label: 'Contents summary' },
];
const DEFAULT_LABEL_FIELDS = {
  qr: {
    enabled: true,
    x: 6,
    y: 8,
    width: 28,
    height: 28,
    color: '#111827',
    align: 'center',
    bold: false,
    underline: false,
    opacity: 1,
  },
  code: {
    enabled: true,
    x: 38,
    y: 12,
    width: 56,
    height: 16,
    color: '#111827',
    align: 'left',
    bold: true,
    underline: false,
    opacity: 1,
  },
  path: {
    enabled: true,
    x: 38,
    y: 34,
    width: 56,
    height: 13,
    color: '#334155',
    align: 'left',
    bold: false,
    underline: false,
    opacity: 0.9,
  },
  label: {
    enabled: true,
    x: 38,
    y: 52,
    width: 56,
    height: 12,
    color: '#475569',
    align: 'left',
    bold: false,
    underline: false,
    opacity: 0.85,
  },
  summary: {
    enabled: true,
    x: 6,
    y: 74,
    width: 88,
    height: 14,
    color: '#0f766e',
    align: 'left',
    bold: true,
    underline: false,
    opacity: 1,
  },
};

function createDefaultLabelLayout(averyTemplate = '5164') {
  const geometry = AVERY_LABEL_TEMPLATES[averyTemplate] ?? AVERY_LABEL_TEMPLATES['5164'];
  return {
    version: 1,
    geometry,
    fields: JSON.parse(JSON.stringify(DEFAULT_LABEL_FIELDS)),
  };
}

function formatLabelMeasurement(value, unit = 'in') {
  const numericValue = Number(value ?? 0);
  const text = Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(/\.?0+$/, '');
  return `${text} ${unit}`;
}

function formatLabelSize(size, unit = 'in') {
  return `${formatLabelMeasurement(size?.width, unit)} x ${formatLabelMeasurement(size?.height, unit)}`;
}

function formatAveryTemplateLabel(template) {
  if (!template) return 'Unknown Avery template';
  return `${template.displayName} / ${formatLabelSize(template.label, template.sheet?.unit ?? 'in')}`;
}

function formatAveryGeometryDetails(template) {
  if (!template) return '';
  const unit = template.sheet?.unit ?? 'in';
  return `Sheet ${formatLabelSize(template.sheet, unit)} / Label ${formatLabelSize(template.label, unit)} / Pitch ${formatLabelSize({ width: template.pitch?.horizontal, height: template.pitch?.vertical }, unit)} / ${template.columns} x ${template.rows}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLabelValues(locationRecord, summary) {
  return {
    code: locationRecord?.code || 'C211',
    path: locationRecord?.path || 'Unit C / Shelf 2 / Bay 1 / Bin 1',
    label: locationRecord?.label || `${locationRecord?.typeLabel ?? 'Bin'} label preview`,
    summary: summary || '3 stocked items / 27 total pieces',
  };
}

function getLabelPrintFontSize(geometry, fieldKey) {
  if (geometry.key === '8160') {
    if (fieldKey === 'code') return '8pt';
    if (fieldKey === 'summary') return '6.5pt';
    return '6pt';
  }

  if (fieldKey === 'code') return '18pt';
  if (fieldKey === 'summary') return '11pt';
  return '10pt';
}

function getLabelFieldCss(field, geometry, fieldKey) {
  const justifyContent = field.align === 'right' ? 'flex-end' : field.align === 'center' ? 'center' : 'flex-start';
  return [
    'position:absolute',
    `left:${field.x ?? 0}%`,
    `top:${field.y ?? 0}%`,
    `width:${field.width ?? 20}%`,
    `height:${field.height ?? 12}%`,
    'display:flex',
    'align-items:center',
    `justify-content:${justifyContent}`,
    'overflow:hidden',
    'padding:0.03in',
    'line-height:1.12',
    'white-space:normal',
    'word-break:break-word',
    `color:${field.color ?? '#111827'}`,
    `text-align:${field.align ?? 'left'}`,
    `font-weight:${field.bold ? 800 : 500}`,
    `text-decoration:${field.underline ? 'underline' : 'none'}`,
    `opacity:${field.opacity ?? 1}`,
    `font-size:${getLabelPrintFontSize(geometry, fieldKey)}`,
  ].join(';');
}

function getLabelMarkup(draft, locationRecord, summary) {
  const geometry = AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'];
  const fields = draft.layout?.fields ?? DEFAULT_LABEL_FIELDS;
  const values = getLabelValues(locationRecord, summary);
  const qrSvg = locationRecord && draft.include_qr && fields.qr?.enabled
    ? buildLocationQrSvg(locationRecord.id)
    : '';
  const textMarkup = LABEL_FIELD_OPTIONS.filter((field) => field.key !== 'qr').map((fieldOption) => {
    const field = fields[fieldOption.key];
    if (!field?.enabled) return '';
    return `<div style="${getLabelFieldCss(field, geometry, fieldOption.key)}">${escapeHtml(values[fieldOption.key])}</div>`;
  }).join('');
  const qrMarkup = qrSvg
    ? `<div style="${getLabelFieldCss(fields.qr, geometry, 'qr')}">${qrSvg}</div>`
    : '';

  return `${qrMarkup}${textMarkup}`;
}

function getLabelPrintDocument({ draft, locations, locationSheet, title }) {
  const geometry = AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'];
  const perPage = geometry.rows * geometry.columns;
  const pages = [];
  for (let index = 0; index < locations.length; index += perPage) {
    pages.push(locations.slice(index, index + perPage));
  }

  const pageMarkup = pages.map((pageLocations) => {
    const labels = pageLocations.map((locationRecord, pageIndex) => {
      const row = Math.floor(pageIndex / geometry.columns);
      const column = pageIndex % geometry.columns;
      const horizontalPitch = geometry.pitch?.horizontal ?? geometry.label.width + (geometry.gutters?.column ?? 0);
      const verticalPitch = geometry.pitch?.vertical ?? geometry.label.height + (geometry.gutters?.row ?? 0);
      const left = geometry.margins.left + column * horizontalPitch;
      const top = geometry.margins.top + row * verticalPitch;
      const summary = locationRecord ? getHierarchySummary(locationRecord, locationSheet) : '';
      return `
        <div class="label-print-cell" style="left:${left}in;top:${top}in;width:${geometry.label.width}in;height:${geometry.label.height}in;">
          ${getLabelMarkup(draft, locationRecord, summary)}
        </div>
      `;
    }).join('');

    return `<section class="label-print-page">${labels}</section>`;
  }).join('');

  return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${geometry.sheet.width}in ${geometry.sheet.height}in; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      .label-print-page { position: relative; width: ${geometry.sheet.width}in; height: ${geometry.sheet.height}in; page-break-after: always; overflow: hidden; }
      .label-print-page:last-child { page-break-after: auto; }
      .label-print-cell { position: absolute; overflow: hidden; background: #fff; border: 0.01in solid rgba(148, 163, 184, 0.35); }
      .label-print-cell svg { width: 100%; height: 100%; display: block; }
      @media print {
        .label-print-cell { border-color: transparent; }
      }
    </style>
  </head>
  <body>
    ${pageMarkup || '<section class="label-print-page"></section>'}
    <script>
      window.addEventListener('load', () => {
        window.focus();
        window.print();
      });
    </script>
  </body>
</html>`;
}

function openLabelPrintWindow({ draft, locations, locationSheet, title }) {
  if (!locations.length) return false;
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return false;
  printWindow.document.write(getLabelPrintDocument({ draft, locations, locationSheet, title }));
  printWindow.document.close();
  return true;
}

function getScopeWarning(draft) {
  if (draft.avery_template === '8160' && draft.scope_level && draft.scope_level !== 'bin') {
    return 'Avery 8160 is intended for Bin labels.';
  }
  if (draft.avery_template === '5164' && draft.scope_level === 'bin') {
    return 'Avery 5164 is intended for Unit, Shelf, and Bay placards.';
  }
  return '';
}

function getBrowserPath() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function useBrowserPath() {
  const [path, setPath] = useState(getBrowserPath);

  useEffect(() => {
    function syncPath() {
      setPath(getBrowserPath());
    }

    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  function navigateTo(nextPath) {
    if (typeof window === 'undefined' || !nextPath) return;
    window.history.pushState({}, '', nextPath);
    setPath(getBrowserPath());
  }

  return [path, navigateTo];
}

function getDashboardInventoryRouteContext(path) {
  try {
    const url = new URL(path || '/', 'https://northgate.local');
    const requestedWorkspace = url.searchParams.get('workspace') ?? '';
    const requestedTab = url.searchParams.get('inventoryTab') ?? '';
    const binId = url.searchParams.get('scanBinId') ?? '';
    const binCode = url.searchParams.get('scanBinCode') ?? '';
    const scanBinContext = binId
      ? {
        binId,
        binCode,
      }
      : null;

    return {
      activeWorkspace: WORKSPACES.has(requestedWorkspace)
        ? requestedWorkspace
        : requestedTab
          ? 'inventory'
          : 'inventory',
      requestedInventoryTab: INVENTORY_TABS.has(requestedTab) ? requestedTab : '',
      scanCartContext: requestedTab === 'cart' ? scanBinContext : null,
      scanCountContext: requestedTab === 'count' ? scanBinContext : null,
    };
  } catch {
    return {
      activeWorkspace: 'inventory',
      requestedInventoryTab: '',
      scanCartContext: null,
      scanCountContext: null,
    };
  }
}

function hasDesignPreviewFlag(path) {
  try {
    const url = new URL(path || '/', 'https://northgate.local');
    return url.searchParams.get('designPreview') === '1';
  } catch {
    return false;
  }
}

function readDevDashboardVisibility() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEV_DASHBOARD_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDevDashboardVisibility(isVisible) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEV_DASHBOARD_STORAGE_KEY, isVisible ? 'true' : 'false');
  } catch (error) {
    console.warn('Dev dashboard visibility storage unavailable', error);
  }
}

function getFormattingTunerDefaults() {
  return Object.fromEntries(FORMATTING_TUNER_FIELDS.map((field) => [field.key, field.defaultValue]));
}

function normalizeFormattingTunerValues(values) {
  const defaults = getFormattingTunerDefaults();
  return FORMATTING_TUNER_FIELDS.reduce((next, field) => {
    const numericValue = Number(values?.[field.key]);
    const fallback = defaults[field.key];
    const boundedValue = Number.isFinite(numericValue)
      ? Math.min(field.max, Math.max(field.min, numericValue))
      : fallback;
    next[field.key] = boundedValue;
    return next;
  }, {});
}

function readLegacyFormattingTunerValues() {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(LEGACY_LAYOUT_TUNER_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return normalizeFormattingTunerValues({
      appContentMax: parsed?.appContentMax ?? parsed?.contentWidth ?? parsed?.contentMax,
      appPageGutter: parsed?.appPageGutter ?? parsed?.pageGutter,
      cardPadding: parsed?.cardPadding ?? parsed?.dashboardCardPadding,
      cardGap: parsed?.cardGap ?? parsed?.dashboardCardGap,
      baseFontSize: parsed?.baseFontSize,
      tableFontSize: parsed?.tableFontSize ?? parsed?.denseTableFontSize,
      tableCellPaddingY: parsed?.tableCellPaddingY ?? parsed?.denseTableCellPaddingY,
      tableCellPaddingX: parsed?.tableCellPaddingX ?? parsed?.denseTableCellPaddingX,
      uiRadius: parsed?.uiRadius ?? parsed?.radius,
    });
  } catch {
    return null;
  }
}

function readFormattingTunerValues() {
  if (typeof window === 'undefined') return getFormattingTunerDefaults();

  try {
    const stored = window.localStorage.getItem(FORMATTING_TUNER_STORAGE_KEY);
    if (stored) {
      return normalizeFormattingTunerValues(JSON.parse(stored));
    }
    return readLegacyFormattingTunerValues() ?? getFormattingTunerDefaults();
  } catch {
    return getFormattingTunerDefaults();
  }
}

function applyFormattingTunerValues(values) {
  if (typeof document === 'undefined') return;
  FORMATTING_TUNER_FIELDS.forEach((field) => {
    document.documentElement.style.setProperty(field.cssName, `${values[field.key]}${field.unit}`);
  });
}

function clearFormattingTunerInlineValues() {
  if (typeof document === 'undefined') return;
  FORMATTING_TUNER_FIELDS.forEach((field) => {
    document.documentElement.style.removeProperty(field.cssName);
  });
}

function buildFormattingTunerCss(values) {
  const lines = FORMATTING_TUNER_FIELDS.map((field) => `  ${field.cssName}: ${values[field.key]}${field.unit};`);
  return [':root {', ...lines, '}'].join('\n');
}

function getActiveFormattingPreset(values) {
  return Object.entries(FORMATTING_TUNER_PRESETS).find(([, presetValues]) => (
    FORMATTING_TUNER_FIELDS.every((field) => Number(values?.[field.key]) === Number(presetValues[field.key]))
  ))?.[0] ?? '';
}

function getCartDestinationDraftKey(cartId) {
  return cartId ? `${CART_DESTINATION_DRAFT_PREFIX}${cartId}` : null;
}

function setIssueToJobHandoff(payload) {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(ISSUE_TO_JOB_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Issue to Job handoff storage unavailable', error);
    return false;
  }
}

function consumeIssueToJobHandoff() {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(ISSUE_TO_JOB_HANDOFF_KEY);
    if (!stored) return null;
    window.localStorage.removeItem(ISSUE_TO_JOB_HANDOFF_KEY);
    return JSON.parse(stored);
  } catch (error) {
    console.warn('Issue to Job handoff read failed', error);
    return null;
  }
}

function normalizeDestinationType(destinationType) {
  return VALID_DESTINATION_TYPES.has(destinationType) ? destinationType : 'unknown';
}

function isDeveloperOrAdminRole(role) {
  return ['Developer', 'Administrator', 'Admin'].includes(role);
}

function buildStoragePath(row) {
  return [row.storage_unit_code, row.shelf_code, row.bay_code, row.bin_code].filter(Boolean).join(' / ');
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/["'`´′″]/g, '')
    .replace(/[‐‑‒–—_]+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[^a-z0-9/.\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLocationSegment(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(storageunit|unit|shelf|bay|bin)/, '');
}

function getLocationSegment(value, prefix = '') {
  const normalized = normalizeLocationSegment(value);
  if (!normalized) return '';
  return prefix && normalized.startsWith(prefix) && normalized.length > prefix.length
    ? normalized.slice(prefix.length)
    : normalized;
}

function buildCompactLocationCode(row) {
  const unit = getLocationSegment(row.storage_unit_code);
  const shelf = getLocationSegment(row.shelf_code, unit);
  const bay = getLocationSegment(row.bay_code, `${unit}${shelf}`);
  const bin = getLocationSegment(row.bin_code, `${unit}${shelf}${bay}`);
  return `${unit}${shelf}${bay}${bin}`;
}

function getSimpleSingularSearchToken(token) {
  if (token.length > 4 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && /(ches|shes|xes|zes|ses)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenizeSearchText(value) {
  const normalizedText = normalizeSearchText(value);
  if (!normalizedText) return [];

  return normalizedText
    .split(/\s+/)
    .flatMap((token) => {
      if (token.includes('/') && !/^\d+\/\d+$/.test(token)) {
        return [token, ...token.split('/').filter(Boolean)];
      }
      return [token];
    })
    .map((token) => token.trim())
    .filter(Boolean);
}

function getSearchTokenVariants(token) {
  const singularToken = getSimpleSingularSearchToken(token);
  return Array.from(new Set([token, singularToken].filter(Boolean)));
}

function buildSearchableTokenSet(values) {
  const tokens = tokenizeSearchText(values.filter(Boolean).join(' '));
  const tokenSet = new Set();
  tokens.forEach((token) => {
    getSearchTokenVariants(token).forEach((variant) => tokenSet.add(variant));
  });
  return tokenSet;
}

function matchesTokenizedSearch(values, searchText) {
  const queryTokens = tokenizeSearchText(searchText);
  if (!queryTokens.length) return true;

  const rowTokenSet = buildSearchableTokenSet(values);
  return queryTokens.every((token) =>
    getSearchTokenVariants(token).some((variant) => rowTokenSet.has(variant)),
  );
}

function getLocationSearchValues(row) {
  return [
    row.bin_code,
    row.bin_label,
    row.bay_code,
    row.bay_label,
    row.shelf_code,
    row.shelf_label,
    row.storage_unit_code,
    row.storage_unit_name,
    buildStoragePath(row),
  ];
}

function getCountRowSearchValues(row) {
  return [
    row.material_code,
    row.item_name,
    row.unit_of_measure,
    getCategoryLabel(row),
    row.broad_category,
    row.sub_category,
    row.sub_category_2,
    row.sub_category_3,
    row.sub_category_4,
    row.manufacturer,
    row.manufacturer_sub,
    row.manufacturer_part_number,
    row.vendor_part_number,
    row.description,
    row.division,
    row.storage_unit_division,
    ...getLocationSearchValues(row),
  ];
}

function buildLocationRecords(storageUnits, shelves, bays, bins) {
  const unitById = new Map(storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(bays.map((bay) => [bay.id, bay]));

  const unitRecords = storageUnits.map((unit) => ({
    id: unit.id,
    type: 'unit',
    typeLabel: 'Unit',
    code: unit.unit_code,
    label: unit.name,
    division: unit.division,
    path: unit.unit_code,
    parentLabel: 'Top level',
    depth: 1,
  }));

  const shelfRecords = shelves.map((shelf) => {
    const unit = unitById.get(shelf.unit_id) ?? {};
    return {
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
      division: unit.division,
      path: [unit.unit_code, shelf.shelf_code].filter(Boolean).join(' / '),
      parentLabel: unit.unit_code || shelf.unit_id,
      depth: 2,
    };
  });

  const bayRecords = bays.map((bay) => {
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};
    return {
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
      division: unit.division,
      path: [unit.unit_code, shelf.shelf_code, bay.bay_code].filter(Boolean).join(' / '),
      parentLabel: [unit.unit_code, shelf.shelf_code].filter(Boolean).join(' / ') || bay.shelf_id,
      depth: 3,
    };
  });

  const binRecords = bins.map((bin) => {
    const bay = bayById.get(bin.bay_id) ?? {};
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};
    return {
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
      division: unit.division,
      path: [unit.unit_code, shelf.shelf_code, bay.bay_code, bin.bin_code].filter(Boolean).join(' / '),
      parentLabel: [unit.unit_code, shelf.shelf_code, bay.bay_code].filter(Boolean).join(' / ') || bin.bay_id,
      depth: 4,
    };
  });

  return [...unitRecords, ...shelfRecords, ...bayRecords, ...binRecords]
    .filter((record) => record.id)
    .sort((first, second) => first.path.localeCompare(second.path) || first.typeLabel.localeCompare(second.typeLabel));
}

function matchesLocationSearch(record, searchText) {
  const normalizedSearch = normalizeSearchText(searchText);
  if (!normalizedSearch) return true;

  return matchesTokenizedSearch([
    record.typeLabel,
    record.code,
    record.label,
    record.path,
    record.parentLabel,
    record.division,
    record.id,
  ], searchText);
}

function getRowsForLocation(record, rows) {
  if (!record) return [];

  const keyByType = {
    unit: 'storage_unit_id',
    shelf: 'shelf_id',
    bay: 'bay_id',
    bin: 'bin_id',
  };
  const rowKey = keyByType[record.type];

  if (!rowKey) return [];
  return rows.filter((row) => row[rowKey] === record.id);
}

function getLocationDisplayCode(record) {
  if (!record) return '';
  return record.code || record.label || record.id;
}

function getLocationRecordTitle(record) {
  if (!record) return 'Unknown location';
  const displayCode = getLocationDisplayCode(record);
  return `${record.typeLabel}: ${displayCode}`;
}

function buildScanCartPath(record) {
  const params = new URLSearchParams({ inventoryTab: 'cart' });
  if (record?.id) params.set('scanBinId', record.id);
  const displayCode = getLocationDisplayCode(record);
  if (displayCode) params.set('scanBinCode', displayCode);
  return `/?${params.toString()}`;
}

function buildScanCountPath(record) {
  const params = new URLSearchParams({ inventoryTab: 'count' });
  if (record?.id) params.set('scanBinId', record.id);
  const displayCode = getLocationDisplayCode(record);
  if (displayCode) params.set('scanBinCode', displayCode);
  return `/?${params.toString()}`;
}

function sortByPositionThenCode(first, second, codeKey) {
  return Number(first.position ?? 0) - Number(second.position ?? 0)
    || String(first[codeKey] ?? '').localeCompare(String(second[codeKey] ?? ''));
}

function buildScanDestinationModel(locationId, locationSheet) {
  const unitById = new Map(locationSheet.storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(locationSheet.shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(locationSheet.bays.map((bay) => [bay.id, bay]));
  const binById = new Map(locationSheet.bins.map((bin) => [bin.id, bin]));

  const shelvesByUnitId = new Map();
  locationSheet.shelves.forEach((shelf) => {
    const shelves = shelvesByUnitId.get(shelf.unit_id) ?? [];
    shelves.push(shelf);
    shelvesByUnitId.set(shelf.unit_id, shelves);
  });

  const baysByShelfId = new Map();
  locationSheet.bays.forEach((bay) => {
    const bays = baysByShelfId.get(bay.shelf_id) ?? [];
    bays.push(bay);
    baysByShelfId.set(bay.shelf_id, bays);
  });

  const binsByBayId = new Map();
  locationSheet.bins.forEach((bin) => {
    const bins = binsByBayId.get(bin.bay_id) ?? [];
    bins.push(bin);
    binsByBayId.set(bin.bay_id, bins);
  });

  const getSortedShelves = (unitId) =>
    [...(shelvesByUnitId.get(unitId) ?? [])].sort((first, second) => sortByPositionThenCode(first, second, 'shelf_code'));
  const getSortedBays = (shelfId) =>
    [...(baysByShelfId.get(shelfId) ?? [])].sort((first, second) => sortByPositionThenCode(first, second, 'bay_code'));
  const getSortedBins = (bayId) =>
    [...(binsByBayId.get(bayId) ?? [])].sort((first, second) => sortByPositionThenCode(first, second, 'bin_code'));

  let scopeType = '';
  let unit = null;
  let shelf = null;
  let bay = null;
  let bin = null;

  if (unitById.has(locationId)) {
    scopeType = 'unit';
    unit = unitById.get(locationId);
  } else if (shelfById.has(locationId)) {
    scopeType = 'shelf';
    shelf = shelfById.get(locationId);
    unit = unitById.get(shelf.unit_id) ?? null;
  } else if (bayById.has(locationId)) {
    scopeType = 'bay';
    bay = bayById.get(locationId);
    shelf = shelfById.get(bay.shelf_id) ?? null;
    unit = shelf ? unitById.get(shelf.unit_id) ?? null : null;
  } else if (binById.has(locationId)) {
    scopeType = 'bin';
    bin = binById.get(locationId);
    bay = bayById.get(bin.bay_id) ?? null;
    shelf = bay ? shelfById.get(bay.shelf_id) ?? null : null;
    unit = shelf ? unitById.get(shelf.unit_id) ?? null : null;
  }

  if (!scopeType) return null;

  const locationRecord = buildLocationRecords(
    unit ? [unit] : [],
    shelf ? [shelf] : [],
    bay ? [bay] : [],
    bin ? [bin] : [],
  ).find((record) => record.id === locationId) ?? null;

  const shelves = scopeType === 'unit'
    ? getSortedShelves(unit.id)
    : shelf
      ? [shelf]
      : [];

  const bays = scopeType === 'unit' || scopeType === 'shelf'
    ? shelves.flatMap((shelfRecord) => getSortedBays(shelfRecord.id))
    : bay
      ? [bay]
      : [];

  const bins = scopeType === 'unit' || scopeType === 'shelf' || scopeType === 'bay'
    ? bays.flatMap((bayRecord) => getSortedBins(bayRecord.id))
    : bin
      ? [bin]
      : [];

  const ancestors = [
    unit ? {
      id: unit.id,
      type: 'unit',
      typeLabel: 'Unit',
      code: unit.unit_code,
      label: unit.name,
      path: unit.unit_code,
    } : null,
    shelf ? {
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
      path: [unit?.unit_code, shelf.shelf_code].filter(Boolean).join(' / '),
    } : null,
    bay ? {
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
      path: [unit?.unit_code, shelf?.shelf_code, bay.bay_code].filter(Boolean).join(' / '),
    } : null,
    bin ? {
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
      path: [unit?.unit_code, shelf?.shelf_code, bay?.bay_code, bin.bin_code].filter(Boolean).join(' / '),
    } : null,
  ].filter(Boolean);

  return {
    scopeType,
    locationRecord,
    unit,
    shelf,
    bay,
    bin,
    shelves,
    bays,
    bins,
    ancestors,
  };
}

function getScanRowsForBin(bin, rows) {
  if (!bin) return [];
  return rows.filter((row) => row.bin_id === bin.id);
}

function getRowsForScanScope(model, rows) {
  if (!model?.locationRecord) return [];
  return getRowsForLocation(model.locationRecord, rows);
}

function getCountPathFiltersForBin(binId, countSheet) {
  const bin = countSheet.bins.find((record) => record.id === binId);
  if (!bin) return null;

  const bay = countSheet.bays.find((record) => record.id === bin.bay_id) ?? null;
  const shelf = bay ? countSheet.shelves.find((record) => record.id === bay.shelf_id) ?? null : null;
  const storageUnit = shelf ? countSheet.storageUnits.find((record) => record.id === shelf.unit_id) ?? null : null;

  return {
    storage_unit_id: storageUnit?.id ?? '',
    shelf_id: shelf?.id ?? '',
    bay_id: bay?.id ?? '',
    bin_id: bin.id,
  };
}

function formatQuantitySummary(value) {
  const numericValue = Number(value ?? 0);
  if (Number.isInteger(numericValue)) return String(numericValue);
  return numericValue.toFixed(2).replace(/\.?0+$/, '');
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getMaterialDisplayName(row) {
  return String(row?.item_name || row?.material_name || row?.description || row?.material_code || '').trim().replace(/\s+/g, ' ');
}

function joinMaterialNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function getMaterialContentsSummary(rows, recordType) {
  const namesByKey = new Map();

  rows.forEach((row) => {
    const name = getMaterialDisplayName(row);
    if (!name) return;
    const key = normalizeSearchText(name);
    const existing = namesByKey.get(key) ?? {
      name,
      quantity: 0,
      rows: 0,
    };
    existing.quantity += Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
    existing.rows += 1;
    namesByKey.set(key, existing);
  });

  const materials = Array.from(namesByKey.values())
    .sort((first, second) => second.quantity - first.quantity || first.name.localeCompare(second.name));

  if (!materials.length) return '';

  if (recordType === 'bin') {
    if (materials.length === 1) return materials[0].name;
    if (materials.length <= 3) return joinMaterialNames(materials.map((material) => material.name));
    return `${materials.slice(0, 2).map((material) => material.name).join(', ')} + ${materials.length - 2} more`;
  }

  if (materials.length <= 2) return joinMaterialNames(materials.map((material) => material.name));
  return `${materials.slice(0, 2).map((material) => material.name).join(', ')} + ${materials.length - 2} more`;
}

function getHierarchySummary(record, locationSheet) {
  if (!record) return '';

  const rows = getRowsForLocation(record, locationSheet.rows);
  const rowCount = rows.length;
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? row.system_quantity ?? 0), 0);
  const stockedItemCount = new Set(rows.map((row) => row.item_id ?? row.material_code ?? row.bin_item_id)).size;
  const piecesText = `${formatQuantitySummary(totalQuantity)} total pieces`;
  const materialSummary = getMaterialContentsSummary(rows, record.type);

  const parts = [];

  if (record.type === 'unit') {
    const shelves = locationSheet.shelves.filter((shelf) => shelf.unit_id === record.id);
    const shelfIds = new Set(shelves.map((shelf) => shelf.id));
    const bays = locationSheet.bays.filter((bay) => shelfIds.has(bay.shelf_id));
    const bayIds = new Set(bays.map((bay) => bay.id));
    const bins = locationSheet.bins.filter((bin) => bayIds.has(bin.bay_id));
    parts.push(pluralize(shelves.length, 'shelf', 'shelves'));
    parts.push(pluralize(bins.length, 'bin'));
  } else if (record.type === 'shelf') {
    const bays = locationSheet.bays.filter((bay) => bay.shelf_id === record.id);
    const bayIds = new Set(bays.map((bay) => bay.id));
    const bins = locationSheet.bins.filter((bin) => bayIds.has(bin.bay_id));
    parts.push(pluralize(bays.length, 'bay', 'bays'));
    parts.push(pluralize(bins.length, 'bin'));
  } else if (record.type === 'bay') {
    const bins = locationSheet.bins.filter((bin) => bin.bay_id === record.id);
    parts.push(pluralize(bins.length, 'bin'));
  }

  if (rowCount) {
    if (materialSummary) parts.push(materialSummary);
    parts.push(pluralize(stockedItemCount || rowCount, 'stocked item'));
    parts.push(piecesText);
  } else {
    parts.push(record.type === 'bin' ? 'Empty' : 'No stocked material');
  }

  return parts.join(' / ');
}

function buildManualLocationLookupRecords(storageUnits, shelves, bays, bins) {
  const unitById = new Map(storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(bays.map((bay) => [bay.id, bay]));

  const unitRecords = storageUnits.map((unit) => {
    const compactCode = getLocationSegment(unit.unit_code);
    return {
      id: unit.id,
      type: 'unit',
      typeLabel: 'Unit',
      code: unit.unit_code,
      label: unit.name,
      path: unit.unit_code,
      lookupCodes: [unit.unit_code, compactCode],
    };
  });

  const shelfRecords = shelves.map((shelf) => {
    const unit = unitById.get(shelf.unit_id) ?? {};
    const unitCode = getLocationSegment(unit.unit_code);
    const shelfCode = getLocationSegment(shelf.shelf_code, unitCode);
    const compactCode = `${unitCode}${shelfCode}`;
    return {
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
      path: [unit.unit_code, shelf.shelf_code].filter(Boolean).join(' / '),
      lookupCodes: [shelf.shelf_code, compactCode],
    };
  });

  const bayRecords = bays.map((bay) => {
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};
    const unitCode = getLocationSegment(unit.unit_code);
    const shelfCode = getLocationSegment(shelf.shelf_code, unitCode);
    const bayCode = getLocationSegment(bay.bay_code, `${unitCode}${shelfCode}`);
    const compactCode = `${unitCode}${shelfCode}${bayCode}`;
    return {
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
      path: [unit.unit_code, shelf.shelf_code, bay.bay_code].filter(Boolean).join(' / '),
      lookupCodes: [bay.bay_code, compactCode],
    };
  });

  const binRecords = bins.map((bin) => {
    const bay = bayById.get(bin.bay_id) ?? {};
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};
    const unitCode = getLocationSegment(unit.unit_code);
    const shelfCode = getLocationSegment(shelf.shelf_code, unitCode);
    const bayCode = getLocationSegment(bay.bay_code, `${unitCode}${shelfCode}`);
    const binCode = getLocationSegment(bin.bin_code, `${unitCode}${shelfCode}${bayCode}`);
    const compactCode = `${unitCode}${shelfCode}${bayCode}${binCode}`;
    return {
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
      path: [unit.unit_code, shelf.shelf_code, bay.bay_code, bin.bin_code].filter(Boolean).join(' / '),
      lookupCodes: [bin.bin_code, compactCode],
    };
  });

  return [...unitRecords, ...shelfRecords, ...bayRecords, ...binRecords];
}

function isManualLocationCodeInput(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue || /[/:?#]/.test(rawValue) || /\s/.test(rawValue)) return false;
  return /^[a-z0-9-]+$/i.test(rawValue);
}

function getManualLocationCodeMatches(value, locationSheet) {
  if (!isManualLocationCodeInput(value)) return [];

  const normalizedValue = normalizeLocationSegment(value);
  if (!normalizedValue) return [];

  const records = buildManualLocationLookupRecords(
    locationSheet.storageUnits,
    locationSheet.shelves,
    locationSheet.bays,
    locationSheet.bins,
  );
  const matches = records.filter((record) =>
    record.lookupCodes.some((code) => normalizeLocationSegment(code) === normalizedValue),
  );
  const uniqueMatches = new Map();
  matches.forEach((match) => uniqueMatches.set(match.id, match));

  const typeOrder = { unit: 1, shelf: 2, bay: 3, bin: 4 };
  return Array.from(uniqueMatches.values())
    .sort((first, second) =>
      (typeOrder[first.type] ?? 99) - (typeOrder[second.type] ?? 99)
      || String(first.path ?? '').localeCompare(String(second.path ?? '')),
    );
}

function matchesCountRowSearch(row, searchText) {
  const queryTokens = tokenizeSearchText(searchText);
  if (!queryTokens.length) return true;

  const compactSearch = normalizeLocationSegment(searchText);
  const compactLocationCode = buildCompactLocationCode(row);
  const tokenMatch = matchesTokenizedSearch([...getCountRowSearchValues(row), compactLocationCode], searchText);
  const compactLocationMatch = compactSearch ? compactLocationCode.startsWith(compactSearch) : false;

  return tokenMatch || compactLocationMatch;
}

function normalizeRepeatValue(value) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized || normalized === '-' || normalized === 'n/a' || normalized === 'none') {
    return '';
  }
  return normalized;
}

function buildRepeatReview(rows) {
  const groupsByKey = new Map();

  rows.forEach((row) => {
    REPEAT_REVIEW_FIELDS.forEach((field) => {
      const displayValue = String(field.getValue(row) ?? '').trim().replace(/\s+/g, ' ');
      const normalizedValue = normalizeRepeatValue(displayValue);
      if (!normalizedValue) return;

      const key = `${field.key}:${normalizedValue}`;
      const group = groupsByKey.get(key) ?? {
        key,
        fieldKey: field.key,
        fieldLabel: field.label,
        value: displayValue,
        rows: [],
      };

      group.rows.push(row);
      groupsByKey.set(key, group);
    });
  });

  const groups = Array.from(groupsByKey.values())
    .filter((group) => new Set(group.rows.map((row) => row.bin_item_id)).size > 1)
    .map((group) => ({
      ...group,
      rowIds: new Set(group.rows.map((row) => row.bin_item_id)),
    }))
    .sort((first, second) => second.rowIds.size - first.rowIds.size || first.fieldLabel.localeCompare(second.fieldLabel));

  const rowMatchesById = new Map();
  groups.forEach((group) => {
    group.rowIds.forEach((rowId) => {
      const matches = rowMatchesById.get(rowId) ?? [];
      matches.push(group);
      rowMatchesById.set(rowId, matches);
    });
  });

  return {
    groups,
    rowMatchesById,
    repeatedRowCount: rowMatchesById.size,
  };
}

function RepeatMatchChips({ matches }) {
  if (!matches?.length) {
    return null;
  }

  const visibleMatches = matches.slice(0, 4);
  const hiddenCount = matches.length - visibleMatches.length;

  return (
    <div className="repeat-chip-list" title={matches.map((match) => `${match.fieldLabel}: ${match.value}`).join('\n')}>
      {visibleMatches.map((match) => (
        <span className="repeat-chip" key={match.key}>
          {match.fieldLabel}: {match.value}
        </span>
      ))}
      {hiddenCount > 0 ? <span className="repeat-chip">+{hiddenCount} more</span> : null}
    </div>
  );
}

function CountCard({ label, value }) {
  return <SummaryCard label={label} value={value} tone="accent" />;
}

function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function JobDestinationControl({ line, cartItemId, jobs, isLoadingJobs, onChange }) {
  const [jobSearch, setJobSearch] = useState('');
  const normalizedSearch = normalizeSearchText(jobSearch);
  const activeJobs = useMemo(
    () => jobs.filter((job) => !job.archived_at),
    [jobs],
  );
  const selectedJob = activeJobs.find((job) => job.id === line.destination_id) ?? jobs.find((job) => job.id === line.destination_id) ?? null;
  const filteredJobs = useMemo(() => {
    const baseJobs = activeJobs;
    if (!normalizedSearch) return baseJobs;

    return baseJobs.filter((job) => [
      job.job_number,
      job.name,
      job.service_call_number,
      job.division,
    ].some((value) => normalizeSearchText(value).includes(normalizedSearch)));
  }, [activeJobs, normalizedSearch]);
  const visibleJobs = useMemo(() => {
    const rows = [...filteredJobs];
    if (selectedJob && !rows.some((job) => job.id === selectedJob.id)) {
      rows.unshift(selectedJob);
    }
    return rows.slice(0, 100);
  }, [filteredJobs, selectedJob]);

  if (!jobs.length) {
    return (
      <div className="job-destination-control">
        <label>
          Job ID / number
          <input
            type="text"
            placeholder="Select a job destination for this checkout."
            value={line.destination_id}
            onChange={(event) => onChange(cartItemId, { destination_id: event.target.value })}
          />
        </label>
        <p className="muted">{ISSUE_TO_JOB_HELPER_COPY}</p>
        <p className="muted">{isLoadingJobs ? 'Loading accessible jobs...' : 'No accessible jobs were loaded for job selection.'}</p>
      </div>
    );
  }

  return (
    <div className="job-destination-control">
      <label>
        Job search
        <input
          type="search"
          placeholder="Job number, name, or service call"
          value={jobSearch}
          onChange={(event) => setJobSearch(event.target.value)}
        />
      </label>
      <label>
        Job
        <select value={line.destination_id} onChange={(event) => onChange(cartItemId, { destination_id: event.target.value })}>
          <option value="">Select job</option>
          {visibleJobs.map((job) => (
            <option key={job.id} value={job.id}>
              {buildJobDisplayLabel(job)}
              {job.division ? ` / ${job.division}` : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">Select a job destination for this checkout.</p>
      <p className="muted">{ISSUE_TO_JOB_HELPER_COPY}</p>
      {selectedJob ? (
        <div className="job-destination-summary">
          <strong>{selectedJob.job_number ? `Job #${selectedJob.job_number}` : 'Job destination selected'}</strong>
          <span>{selectedJob.name || 'No job name recorded.'}</span>
          <span>{selectedJob.service_call_number ? `Service Call #${selectedJob.service_call_number}` : 'No service call number recorded.'}</span>
        </div>
      ) : line.destination_id ? (
        <div className="job-destination-summary">
          <strong>Selected job destination</strong>
          <span>{line.destination_id}</span>
        </div>
      ) : null}
    </div>
  );
}

function DestinationIdControl({ line, cartItemId, destinationReferences, jobs, isLoadingJobs, onChange }) {
  const users = destinationReferences?.users ?? [];
  const vehicles = destinationReferences?.vehicles ?? [];

  if (line.destination_type === 'job') {
    return (
      <JobDestinationControl
        line={line}
        cartItemId={cartItemId}
        jobs={jobs}
        isLoadingJobs={isLoadingJobs}
        onChange={onChange}
      />
    );
  }

  if (line.destination_type === 'user' && users.length) {
    return (
      <label>
        User
        <select value={line.destination_id} onChange={(event) => onChange(cartItemId, { destination_id: event.target.value })}>
          <option value="">Select user</option>
          {users.map((user) => (
            <option key={user.clerk_user_id} value={user.clerk_user_id}>
              {user.display_name || user.email || user.clerk_user_id} — {user.role ?? 'User'}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (line.destination_type === 'vehicle' && vehicles.length) {
    return (
      <label>
        Vehicle
        <select value={line.destination_id} onChange={(event) => onChange(cartItemId, { destination_id: event.target.value })}>
          <option value="">Select vehicle</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.vehicle_number || vehicle.id} — {vehicle.classification ?? 'Vehicle'}{vehicle.holds_stock ? ' / holds stock' : ''}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const requiresId = DESTINATIONS_REQUIRING_ID.has(line.destination_type);
  const placeholderByType = {
    job: 'Job ID / number required',
    service_call: 'Service call ID / number required',
    vehicle: 'Vehicle ID required until vehicles are imported',
    user: 'User ID required until users load',
  };

  return (
    <label>
      Destination ID
      <input
        type="text"
        placeholder={requiresId ? placeholderByType[line.destination_type] ?? 'Required' : 'Optional'}
        value={line.destination_id}
        onChange={(event) => onChange(cartItemId, { destination_id: event.target.value })}
      />
    </label>
  );
}

function CatalogPreview({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState title="No catalog rows yet">
        Live v2 Supabase is connected, but the items table is empty. Import or seed catalog data before building workflows that depend on selectable materials.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>UOM</th>
              <th>Division</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.material_code}</td>
                <td>{item.name}</td>
                <td>{[item.broad_category, item.sub_category].filter(Boolean).join(' / ') || '—'}</td>
                <td>{item.unit_of_measure ?? '—'}</td>
                <td>{item.division ?? '—'}</td>
                <td>{Number(item.price_per_unit ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-list">
        {rows.map((item) => (
          <article className="mobile-item" key={item.id}>
            <strong>{item.name}</strong>
            <div className="meta-grid">
              <span>Code: {item.material_code}</span>
              <span>UOM: {item.unit_of_measure ?? '—'}</span>
              <span>Division: {item.division ?? '—'}</span>
              <span>Price: {Number(item.price_per_unit ?? 0).toFixed(2)}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function StoragePreview({ storageUnits, bins }) {
  if (!storageUnits.length && !bins.length) {
    return (
      <EmptyState title="No storage hierarchy yet">
        Storage units, shelves, bays, and bins are empty in v2 Supabase. This browser is read-only and ready to display the unit → shelf → bay → bin structure once data is imported.
      </EmptyState>
    );
  }

  return (
    <div className="inventory-layout">
      <section>
        <h3>Storage Units</h3>
        {storageUnits.length ? (
          <div className="mobile-list mobile-list--always">
            {storageUnits.map((unit) => (
              <article className="mobile-item" key={unit.id}>
                <strong>{unit.unit_code}</strong>
                <div className="meta-grid">
                  <span>Name: {unit.name ?? '—'}</span>
                  <span>Division: {unit.division ?? '—'}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No units">No storage units have been created yet.</EmptyState>
        )}
      </section>

      <section>
        <h3>Bins</h3>
        {bins.length ? (
          <div className="mobile-list mobile-list--always">
            {bins.map((bin) => (
              <article className="mobile-item" key={bin.id}>
                <strong>{bin.bin_code}</strong>
                <div className="meta-grid">
                  <span>Label: {bin.label ?? '—'}</span>
                  <span>QR: {bin.qr_code ?? '—'}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No bins">No bins have been created yet.</EmptyState>
        )}
      </section>
    </div>
  );
}

function GrandMasterOverviewPanel({ permissions }) {
  const canReadOverview = permissions.permissionSource === 'server';
  const countSheet = useInventoryCountSheet({ enabled: canReadOverview });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    storage_unit_id: '',
    shelf_id: '',
    bay_id: '',
    bin_id: '',
    category: '',
    division: '',
    stockStatus: '',
  });
  const grandMaster = useMemo(() => buildGrandMasterRows(countSheet), [countSheet]);
  const rows = grandMaster.rows;
  const categoryOptions = rows
    .reduce((options, row) => {
      if (!row.categoryLabel || options.some((option) => option.value === row.categoryLabel)) return options;
      return [...options, { value: row.categoryLabel, label: row.categoryLabel }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const divisionOptions = rows
    .reduce((options, row) => {
      const value = row.division || 'Unassigned';
      if (options.some((option) => option.value === value)) return options;
      return [...options, { value, label: value }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const storageUnitOptions = countSheet.storageUnits
    .map((unit) => ({
      value: unit.id,
      label: `${unit.unit_code}${unit.name ? ` / ${unit.name}` : ''}`,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const shelfOptions = countSheet.shelves
    .map((shelf) => ({ value: shelf.id, label: shelf.shelf_code || shelf.label || shelf.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const bayOptions = countSheet.bays
    .map((bay) => ({ value: bay.id, label: bay.bay_code || bay.label || bay.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const binOptions = countSheet.bins
    .map((bin) => ({ value: bin.id, label: bin.bin_code || bin.label || bin.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const filteredRows = rows.filter((row) => {
    if (filters.storage_unit_id && row.storage_unit_id !== filters.storage_unit_id) return false;
    if (filters.shelf_id && row.shelf_id !== filters.shelf_id) return false;
    if (filters.bay_id && row.bay_id !== filters.bay_id) return false;
    if (filters.bin_id && row.bin_id !== filters.bin_id) return false;
    if (filters.category && row.categoryLabel !== filters.category) return false;
    if (filters.division && (row.division || 'Unassigned') !== filters.division) return false;
    if (filters.stockStatus && row.stockStatus !== filters.stockStatus) return false;
    return matchesGrandMasterSearch(row, search);
  });
  const totalQuantity = rows
    .filter((row) => row.rowType === 'item' && row.quantity > 0)
    .reduce((sum, row) => sum + row.quantity, 0);
  const knownStoredValue = rows
    .filter((row) => row.rowType === 'item' && row.extendedValue !== null && row.quantity > 0)
    .reduce((sum, row) => sum + row.extendedValue, 0);
  const knownValueRows = rows.filter((row) => row.rowType === 'item' && row.extendedValue !== null).length;
  const stockedRows = rows.filter((row) => row.rowType === 'item' && row.quantity > 0).length;
  const emptyLocations = Math.max(countSheet.bins.length - grandMaster.positiveBinIds.size, 0);

  function clearFilters() {
    setSearch('');
    setFilters({
      storage_unit_id: '',
      shelf_id: '',
      bay_id: '',
      bin_id: '',
      category: '',
      division: '',
      stockStatus: '',
    });
  }

  if (!canReadOverview) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Inventory Overview</p>
            <h3>Inventory Overview</h3>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
        <p>Inventory Overview uses the existing server-authorized inventory read path.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel grand-master-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Inventory Overview</p>
          <h3>Inventory Overview</h3>
          <p>
            Read-only operational view from the existing inventory count/read path. Search and filters only change this display.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
          {countSheet.isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {countSheet.error ? (
        <div className="alert">Inventory Overview failed to load through the existing authorized read path.</div>
      ) : null}
      {countSheet.isLoading ? <p className="muted">Loading Inventory Overview...</p> : null}

      <div className="count-grid grand-master-summary">
        <CountCard label="Stocked locations" value={grandMaster.positiveBinIds.size} />
        <CountCard label="Empty locations" value={emptyLocations} />
        <CountCard label="Total stocked rows" value={stockedRows} />
        <CountCard label="Total quantity" value={formatQuantitySummary(totalQuantity)} />
        <CountCard label="Known stored value" value={formatMoney(knownValueRows ? knownStoredValue : null)} />
        <CountCard label="Visible rows" value={filteredRows.length} />
      </div>

      <div className="count-toolbar grand-master-toolbar">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, code, C111, bin, path, part number, or description"
          />
        </label>
        <label>
          Unit
          <select value={filters.storage_unit_id} onChange={(event) => setFilters((current) => ({ ...current, storage_unit_id: event.target.value }))}>
            <option value="">All units</option>
            {storageUnitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Shelf
          <select value={filters.shelf_id} onChange={(event) => setFilters((current) => ({ ...current, shelf_id: event.target.value }))}>
            <option value="">All shelves</option>
            {shelfOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Bay
          <select value={filters.bay_id} onChange={(event) => setFilters((current) => ({ ...current, bay_id: event.target.value }))}>
            <option value="">All bays</option>
            {bayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Bin
          <select value={filters.bin_id} onChange={(event) => setFilters((current) => ({ ...current, bin_id: event.target.value }))}>
            <option value="">All bins</option>
            {binOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">All categories</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Division
          <select value={filters.division} onChange={(event) => setFilters((current) => ({ ...current, division: event.target.value }))}>
            <option value="">All visible divisions</option>
            {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Stock status
          <select value={filters.stockStatus} onChange={(event) => setFilters((current) => ({ ...current, stockStatus: event.target.value }))}>
            <option value="">Stocked and empty</option>
            <option value="stocked">Stocked only</option>
            <option value="empty">Empty / zero only</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="cart-facts count-summary">
        <span>Loaded bin/material rows: {countSheet.rows.length}</span>
        <span>Loaded bins: {countSheet.bins.length}</span>
        <span>Last updated: {countSheet.lastLoadedAt ? new Date(countSheet.lastLoadedAt).toLocaleString() : 'not loaded yet'}</span>
        <span>Sync health: client last-loaded only</span>
        <span>Cost visibility: authorized inventory row scope</span>
        <span>Writes from this view: none</span>
      </div>

      {filteredRows.length ? (
        <>
          <div className="table-wrap grand-master-table-wrap">
            <table className="data-table grand-master-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Location</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Ext. Value</th>
                  <th>Division</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.item_name}</strong>
                      <span>{row.material_code || 'No material code'}</span>
                      {row.description ? <span>{row.description}</span> : null}
                    </td>
                    <td>
                      <strong>{row.bin_code || 'No bin code'}</strong>
                      <span>{row.locationPath || buildStoragePath(row) || 'No location path'}</span>
                      <span>{[row.storage_unit_name, row.shelf_label, row.bay_label, row.bin_label].filter(Boolean).join(' / ') || 'No location label'}</span>
                    </td>
                    <td>{row.categoryLabel || '-'}</td>
                    <td>{row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '-'}</td>
                    <td>{formatMoney(row.unitCost)}</td>
                    <td>{formatMoney(row.extendedValue)}</td>
                    <td>{row.division || 'Unassigned'}</td>
                    <td>
                      <span className={row.stockStatus === 'stocked' ? 'status-pill status-pill--good' : 'status-pill'}>
                        {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-list grand-master-mobile-list">
            {filteredRows.map((row) => (
              <article className="mobile-item" key={row.id}>
                <strong>{row.item_name}</strong>
                <span>{row.material_code || 'No material code'} / {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}</span>
                <div className="meta-grid">
                  <span>Path: {row.locationPath || buildStoragePath(row) || 'No location path'}</span>
                  <span>Qty: {row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '-'}</span>
                  <span>Unit cost: {formatMoney(row.unitCost)}</span>
                  <span>Value: {formatMoney(row.extendedValue)}</span>
                  <span>Category: {row.categoryLabel || '-'}</span>
                  <span>Division: {row.division || 'Unassigned'}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title="No Inventory Overview rows match">
          No authorized inventory rows or empty bins match the current overview filters.
        </EmptyState>
      )}
    </section>
  );
}

function LocationManagementPanel({ permissions }) {
  const canReadLocations = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const locationSheet = useInventoryCountSheet({ enabled: canReadLocations });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const appOrigin = getAppOrigin();
  const locationRecords = useMemo(
    () => buildLocationRecords(
      locationSheet.storageUnits,
      locationSheet.shelves,
      locationSheet.bays,
      locationSheet.bins,
    ),
    [locationSheet.storageUnits, locationSheet.shelves, locationSheet.bays, locationSheet.bins],
  );
  const filteredLocations = locationRecords.filter((record) => {
    if (typeFilter && record.type !== typeFilter) return false;
    return matchesLocationSearch(record, search);
  });
  const selectedLocation =
    filteredLocations.find((record) => record.id === selectedLocationId) ??
    filteredLocations[0] ??
    null;
  const qrUrl = selectedLocation ? buildLocationQrUrl(selectedLocation.id, appOrigin) : '';
  const qrSvg = selectedLocation ? buildLocationQrSvg(selectedLocation.id, appOrigin) : '';

  useEffect(() => {
    if (!locationRecords.length) {
      if (selectedLocationId) setSelectedLocationId('');
      return;
    }

    if (!selectedLocationId || !locationRecords.some((record) => record.id === selectedLocationId)) {
      setSelectedLocationId(locationRecords[0].id);
    }
  }, [locationRecords, selectedLocationId]);

  function selectLocation(record) {
    setSelectedLocationId(record.id);
  }

  function downloadSelectedQr() {
    if (!selectedLocation || !qrSvg) return;

    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileCode = String(selectedLocation.code || selectedLocation.id).replace(/[^a-z0-9_-]+/gi, '-');
    link.href = url;
    link.download = `northgate-location-${selectedLocation.type}-${fileCode}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function printSelectedQr() {
    if (!selectedLocation || !qrSvg) return;

    const printWindow = window.open('', '_blank', 'width=420,height=560');
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Northgate Location QR</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
            .sheet { display: grid; gap: 16px; max-width: 360px; }
            .qr { width: 260px; height: 260px; }
            h1 { margin: 0; font-size: 28px; }
            p { margin: 0; line-height: 1.45; overflow-wrap: anywhere; }
            .meta { color: #4b5563; }
          </style>
        </head>
        <body>
          <main class="sheet">
            <div class="qr">${qrSvg}</div>
            <h1>${escapeHtml(selectedLocation.code || selectedLocation.typeLabel)}</h1>
            <p>${escapeHtml(selectedLocation.typeLabel)} - ${escapeHtml(selectedLocation.path)}</p>
            <p class="meta">${escapeHtml(selectedLocation.label || 'No label')}</p>
            <p class="meta">${escapeHtml(qrUrl)}</p>
          </main>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  if (!canReadLocations) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Location Management</p>
            <h3>Storage Location QR Generator</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>Location management and QR generation use the existing inventory management permission gate.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel location-manager">
      <div className="card__header">
        <div>
          <p className="eyebrow">Location Management</p>
          <h3>Storage Location QR Generator</h3>
          <p>
            Read-only foundation for Unit, Shelf, Bay, and Bin records. QR codes point to stable location UUIDs, so renaming display codes later should not invalidate printed labels.
          </p>
        </div>
        <span className="status-pill status-pill--good">Locations only</span>
      </div>

      <div className="location-note">
        <MapPin aria-hidden="true" />
        <span>
          QR payloads use <strong>/scan/location/&lt;location_uuid&gt;</strong>. Human-readable codes stay visible for operators but are not encoded as identity.
        </span>
      </div>

      <div className="count-toolbar location-toolbar">
        <label>
          Search locations
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Unit, shelf, bay, bin, path, label, or UUID"
          />
        </label>
        <label>
          Type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All location types</option>
            <option value="unit">Units</option>
            <option value="shelf">Shelves</option>
            <option value="bay">Bays</option>
            <option value="bin">Bins</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={locationSheet.reload} disabled={locationSheet.isLoading}>
          {locationSheet.isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {locationSheet.error ? (
        <div className="alert">Location hierarchy failed to load. Confirm server permissions and existing storage-location table access.</div>
      ) : null}
      {locationSheet.isLoading ? <p className="muted">Loading storage location hierarchy...</p> : null}

      <div className="cart-facts count-summary">
        <span>Units: {locationSheet.storageUnits.length}</span>
        <span>Shelves: {locationSheet.shelves.length}</span>
        <span>Bays: {locationSheet.bays.length}</span>
        <span>Bins: {locationSheet.bins.length}</span>
        <span>Visible locations: {filteredLocations.length}</span>
        <span>App origin: {appOrigin}</span>
      </div>

      <div className="location-layout">
        <section className="location-list-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Hierarchy</p>
              <h3>Existing location records</h3>
            </div>
            <span>{filteredLocations.length} visible</span>
          </div>

          {filteredLocations.length ? (
            <div className="location-record-list">
              {filteredLocations.map((record) => (
                <button
                  type="button"
                  className="location-record"
                  aria-pressed={selectedLocation?.id === record.id}
                  key={`${record.type}:${record.id}`}
                  onClick={() => selectLocation(record)}
                >
                  <span className="location-record__type">{record.typeLabel}</span>
                  <strong>{record.code || record.id}</strong>
                  <span>{record.path || record.parentLabel}</span>
                  <small>{record.label || record.division || 'No display label'} / {getHierarchySummary(record, locationSheet)}</small>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No locations match">
              No Unit, Shelf, Bay, or Bin records match the current location filters.
            </EmptyState>
          )}
        </section>

        <section className="location-qr-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">QR payload</p>
              <h3>{selectedLocation ? selectedLocation.code || selectedLocation.typeLabel : 'Select a location'}</h3>
            </div>
            <QrCode aria-hidden="true" />
          </div>

          {selectedLocation ? (
            <>
              <div className="location-qr-card">
                <div className="location-qr-preview" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <div className="location-qr-meta">
                  <strong>{selectedLocation.typeLabel}: {selectedLocation.code || selectedLocation.id}</strong>
                  <span>{selectedLocation.path}</span>
                  <span>{selectedLocation.label || 'No display label'}</span>
                  <code>{qrUrl}</code>
                </div>
              </div>
              <div className="cart-actions">
                <button type="button" className="secondary-button" onClick={downloadSelectedQr}>
                  <Download aria-hidden="true" /> Download SVG
                </button>
                <button type="button" className="secondary-button" onClick={printSelectedQr}>
                  <Printer aria-hidden="true" /> Print QR
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="No QR available">
              Load or select a storage location before generating a location QR.
            </EmptyState>
          )}

          <div className="location-note location-note--muted">
            <span>
              Create, rename, and archive controls are intentionally deferred here. This milestone did not add client-side location writes or new server APIs.
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}

function getLabelDraftFromTemplate(template) {
  const averyTemplate = template?.avery_template || '5164';
  return {
    id: template?.id ?? '',
    name: template?.name ?? 'New Location Label Template',
    avery_template: averyTemplate,
    scope_level: template?.scope_level ?? '',
    include_qr: template?.include_qr ?? true,
    layout: {
      ...createDefaultLabelLayout(averyTemplate),
      ...(template?.layout ?? {}),
      geometry: AVERY_LABEL_TEMPLATES[averyTemplate] ?? AVERY_LABEL_TEMPLATES['5164'],
      fields: {
        ...createDefaultLabelLayout(averyTemplate).fields,
        ...(template?.layout?.fields ?? {}),
      },
    },
  };
}

function LabelPreview({ draft, locationRecord, summary }) {
  const geometry = AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'];
  const fields = draft.layout?.fields ?? DEFAULT_LABEL_FIELDS;
  const qrSvg = locationRecord && draft.include_qr && fields.qr?.enabled
    ? buildLocationQrSvg(locationRecord.id)
    : '';
  const values = getLabelValues(locationRecord, summary);

  function fieldStyle(field) {
    return {
      left: `${field.x ?? 0}%`,
      top: `${field.y ?? 0}%`,
      width: `${field.width ?? 20}%`,
      height: `${field.height ?? 12}%`,
      color: field.color ?? '#111827',
      textAlign: field.align ?? 'left',
      fontWeight: field.bold ? 800 : 500,
      textDecoration: field.underline ? 'underline' : 'none',
      opacity: field.opacity ?? 1,
    };
  }

  return (
    <div className="label-preview-shell">
      <div
        className="label-preview-surface"
        style={{ aspectRatio: `${geometry.label.width} / ${geometry.label.height}` }}
      >
        {qrSvg ? (
          <div
            className="label-preview-qr"
            style={fieldStyle(fields.qr)}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : null}
        {LABEL_FIELD_OPTIONS.filter((field) => field.key !== 'qr').map((fieldOption) => {
          const field = fields[fieldOption.key];
          if (!field?.enabled) return null;
          return (
            <div className="label-preview-field" key={fieldOption.key} style={fieldStyle(field)}>
              {values[fieldOption.key]}
            </div>
          );
        })}
      </div>
      <div className="label-preview-meta">
        <span>{geometry.label.width}in x {geometry.label.height}in / {geometry.rows} rows / {geometry.columns} columns</span>
        <span>{formatAveryGeometryDetails(geometry)}</span>
        <span>QR payload: {locationRecord ? buildLocationQrUrl(locationRecord.id) : '/scan/location/<uuid>'}</span>
      </div>
    </div>
  );
}

function createToolDraft(row = null) {
  if (!row) return { ...EMPTY_TOOL_DRAFT };
  return {
    name: row.name ?? '',
    tool_number: row.tool_number ?? '',
    category: row.category ?? '',
    brand: row.brand ?? '',
    model: row.model ?? '',
    serial_number: row.serial_number ?? '',
    description: row.description ?? '',
    condition: row.condition ?? '',
    status: row.status ?? 'active',
    home_location: row.home_location ?? '',
    current_location: row.current_location ?? '',
    assigned_to: row.assigned_to ?? '',
    purchase_date: row.purchase_date ?? '',
    notes: row.notes ?? '',
  };
}

function cleanToolText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function buildToolMutationPayload(draft) {
  return {
    name: String(draft.name ?? '').trim(),
    tool_number: cleanToolText(draft.tool_number),
    category: cleanToolText(draft.category),
    brand: cleanToolText(draft.brand),
    model: cleanToolText(draft.model),
    serial_number: cleanToolText(draft.serial_number),
    description: cleanToolText(draft.description),
    condition: draft.condition || null,
    status: TOOL_STATUS_OPTIONS.includes(draft.status) ? draft.status : 'active',
    home_location: cleanToolText(draft.home_location),
    current_location: cleanToolText(draft.current_location),
    assigned_to: cleanToolText(draft.assigned_to),
    purchase_date: draft.purchase_date || null,
    notes: cleanToolText(draft.notes),
  };
}

function formatToolValue(value) {
  return value || '-';
}

function formatToolDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function createJobDraft(row = null) {
  if (!row) return { ...EMPTY_JOB_DRAFT };
  return {
    job_number: row.job_number ?? '',
    name: row.name ?? '',
    status: row.status ?? 'active',
    description: row.description ?? '',
    notes: row.notes ?? '',
    address_line1: row.address_line1 ?? '',
    address_line2: row.address_line2 ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    postal_code: row.postal_code ?? '',
    job_type: row.job_type ?? 'job',
    service_call_number: row.service_call_number ?? '',
  };
}

function buildJobMutationPayload(draft) {
  return {
    job_number: cleanToolText(draft.job_number),
    name: String(draft.name ?? '').trim(),
    status: JOB_STATUS_OPTIONS.includes(draft.status) ? draft.status : 'active',
    description: cleanToolText(draft.description),
    notes: cleanToolText(draft.notes),
    address_line1: cleanToolText(draft.address_line1),
    address_line2: cleanToolText(draft.address_line2),
    city: cleanToolText(draft.city),
    state: cleanToolText(draft.state),
    postal_code: cleanToolText(draft.postal_code),
    job_type: JOB_TYPE_OPTIONS.includes(draft.job_type) ? draft.job_type : 'job',
    service_call_number: cleanToolText(draft.service_call_number),
  };
}

function formatJobDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatJobDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatJobType(value) {
  if (value === 'service_call') return 'Service Call';
  return 'Job';
}

function formatJobStatusLabel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'on_hold':
      return 'On Hold';
    case 'complete':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'active':
      return 'Active';
    default:
      return normalized ? normalized.replace(/_/g, ' ') : 'Unknown';
  }
}

function getJobStatusBadgeClass(value) {
  const toneByValue = {
    active: 'ok',
    on_hold: 'warn',
    complete: 'info',
    cancelled: 'err',
  };
  const tone = toneByValue[String(value ?? '').toLowerCase()] ?? 'info';
  return `status-pill tool-catalogue__badge tool-catalogue__badge--${tone}`;
}

function buildJobAddressSummary(row) {
  const lineOne = [row.address_line1, row.address_line2].filter(Boolean).join(', ');
  const cityState = [row.city, row.state].filter(Boolean).join(', ');
  return [lineOne, cityState, row.postal_code].filter(Boolean).join(' ');
}

function buildJobDisplayLabel(row) {
  const labelParts = [];
  if (row.job_number) labelParts.push(`Job #${row.job_number}`);
  else labelParts.push('Job');
  if (row.name) labelParts.push(row.name);
  if (row.service_call_number) labelParts.push(`Service Call #${row.service_call_number}`);
  return labelParts.join(' / ');
}

function formatFileSizeBytes(value) {
  if (value === null || value === undefined || value === '') return '-';
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function cleanDocumentText(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text || null;
}

function sanitizeDocumentFileNamePart(value, fallback = '') {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  const safe = text.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return safe || fallback;
}

function getDocumentFileExtension(fileName) {
  const match = String(fileName ?? '').trim().match(/(\.[^.\\/:*?"<>|]+)$/);
  return match ? match[1] : '';
}

function formatDocumentDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDocumentTimeStamp(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

function buildJobDocumentSuggestedName(job, documentType, description, originalFileName) {
  const jobName = sanitizeDocumentFileNamePart(job?.name || job?.job_number || 'Job', 'Job');
  const typePart = sanitizeDocumentFileNamePart(documentType, 'Document');
  const descriptionPart = sanitizeDocumentFileNamePart(description, '');
  const dateStamp = formatDocumentDateStamp();
  const timeStamp = formatDocumentTimeStamp();
  const baseParts = [jobName, dateStamp, timeStamp, typePart];
  if (descriptionPart) baseParts.push(descriptionPart);
  const baseName = baseParts.filter(Boolean).join(' ').trim();
  return `${baseName}${getDocumentFileExtension(originalFileName)}`.trim();
}

function buildJobDocumentStoragePath(jobId, documentId, fileName) {
  const safeFileName = sanitizeDocumentFileNamePart(fileName, 'document');
  return `documents/job/${jobId}/${documentId}/${safeFileName}`;
}

function createJobDocumentDraft() {
  return {
    file: null,
    document_type: '',
    description: '',
  };
}

function getJobDocumentSummary(rows) {
  const totalBytes = rows.reduce((sum, row) => {
    const bytes = Number(row.file_size_bytes ?? 0);
    return Number.isFinite(bytes) ? sum + bytes : sum;
  }, 0);
  return {
    count: rows.length,
    totalBytes,
    latestUploadedAt: rows[0]?.created_at ?? null,
  };
}

function getJobScheduleStatusLabel(value) {
  return JOB_SCHEDULE_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? 'Pending';
}

function getJobScheduleStatusBadgeClass(value) {
  const toneByValue = {
    pending: 'warn',
    in_progress: 'info',
    complete: 'good',
    delayed: 'err',
  };
  const tone = toneByValue[String(value ?? '').toLowerCase()] ?? 'info';
  return `status-pill tool-catalogue__badge tool-catalogue__badge--${tone}`;
}

function createJobScheduleDraft(row = null) {
  if (!row) return { ...EMPTY_JOB_SCHEDULE_DRAFT };
  return {
    id: row.id ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    target_date: row.target_date ?? '',
    status: JOB_SCHEDULE_STATUS_OPTIONS.some((option) => option.value === row.status) ? row.status : 'pending',
    note: row.note ?? '',
  };
}

function sortJobScheduleRows(rows) {
  return rows.slice().sort((left, right) => {
    const leftSort = Number(left.sort_order ?? 0);
    const rightSort = Number(right.sort_order ?? 0);
    if (leftSort !== rightSort) return leftSort - rightSort;

    const leftTarget = left.target_date ? String(left.target_date) : '9999-12-31';
    const rightTarget = right.target_date ? String(right.target_date) : '9999-12-31';
    if (leftTarget !== rightTarget) return leftTarget.localeCompare(rightTarget);

    const leftCreated = String(left.created_at ?? '');
    const rightCreated = String(right.created_at ?? '');
    if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

function getNextScheduleSortOrder(rows) {
  return rows.reduce((maxSort, row) => {
    const sortValue = Number(row.sort_order ?? 0);
    return Number.isFinite(sortValue) ? Math.max(maxSort, sortValue) : maxSort;
  }, 0) + 1;
}

function buildJobScheduleMutationPayload(draft) {
  return {
    title: String(draft.title ?? '').trim(),
    description: cleanToolText(draft.description),
    target_date: String(draft.target_date ?? '').trim() || null,
    status: JOB_SCHEDULE_STATUS_OPTIONS.some((option) => option.value === draft.status) ? draft.status : '',
    note: cleanToolText(draft.note),
  };
}

function filterJobScheduleRows(rows, searchText) {
  const search = searchText.trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((row) => [
    row.title,
    row.description,
    row.note,
    row.status,
    getJobScheduleStatusLabel(row.status),
    row.created_by,
  ].some((value) => String(value ?? '').toLowerCase().includes(search)));
}

function getJobScheduleSummary(rows) {
  return rows.reduce((summary, row) => {
    summary.count += 1;
    if (row.status === 'complete') summary.completeCount += 1;
    if (row.status === 'delayed') summary.delayedCount += 1;
    if (row.target_date) summary.withDateCount += 1;
    return summary;
  }, {
    count: 0,
    completeCount: 0,
    delayedCount: 0,
    withDateCount: 0,
  });
}

function filterJobRows(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status && (row.status || '') !== filters.status) return false;
    if (filters.division && (row.division || 'Unassigned') !== filters.division) return false;
    if (!search) return true;
    return JOB_SEARCH_FIELDS.some((field) => String(row[field] ?? '').toLowerCase().includes(search));
  });
}

function createJobMaterialDraft(row = null) {
  if (!row) return { ...EMPTY_JOB_MATERIAL_DRAFT };
  return {
    id: row.id ?? '',
    item_id: row.item_id ?? '',
    requested_quantity: row.requested_quantity ?? '',
    note: row.note ?? '',
  };
}

function getJobMaterialLabel(row) {
  return [row.material_code_snapshot, row.material_name_snapshot].filter(Boolean).join(' / ')
    || row.item_id
    || 'Material line';
}

function formatRequestedQuantity(value) {
  const quantity = Number(value ?? 0);
  if (!Number.isFinite(quantity)) return '0';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '');
}

function filterJobMaterialRows(rows, searchText) {
  const search = searchText.trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((row) => [
    row.material_code_snapshot,
    row.material_name_snapshot,
    row.note,
  ].some((value) => String(value ?? '').toLowerCase().includes(search)));
}

function getJobMaterialSummary(rows) {
  const total = rows.reduce((sum, row) => {
    const quantity = Number(row.requested_quantity ?? 0);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);
  return {
    count: rows.length,
    total,
  };
}

function filterJobMaterialCatalogItems(items, searchText) {
  const search = searchText.trim().toLowerCase();
  if (!search) return items.slice(0, 80);
  return items
    .filter((item) => [
      item.material_code,
      item.name,
      item.description,
      item.unit_of_measure,
    ].some((value) => String(value ?? '').toLowerCase().includes(search)))
    .slice(0, 80);
}

function buildJobMaterialMutationPayload(draft) {
  const requestedQuantity = Number(draft.requested_quantity);
  return {
    requested_quantity: Number.isFinite(requestedQuantity) ? requestedQuantity : 0,
    note: cleanToolText(draft.note),
  };
}

function formatOptionalQuantity(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(2).replace(/\.?0+$/, '');
}

function formatBudgetCurrency(value) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return '$0.00';
  return numericValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTransactionLogQuantity(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(2).replace(/\.?0+$/, '');
}

function getBudgetCategoryLabel(value) {
  return JOB_BUDGET_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Other';
}

function sortJobBudgetRows(rows) {
  return rows.slice().sort((left, right) => {
    const leftSort = Number(left.sort_order ?? 0);
    const rightSort = Number(right.sort_order ?? 0);
    if (leftSort !== rightSort) return leftSort - rightSort;

    const leftCreated = String(left.created_at ?? '');
    const rightCreated = String(right.created_at ?? '');
    if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

function getNextBudgetSortOrder(rows) {
  return rows.reduce((maxSort, row) => {
    const sortValue = Number(row.sort_order ?? 0);
    return Number.isFinite(sortValue) ? Math.max(maxSort, sortValue) : maxSort;
  }, 0) + 1;
}

function createJobBudgetDraft(row = null) {
  if (!row) return { ...EMPTY_JOB_BUDGET_DRAFT };
  return {
    id: row.id ?? '',
    category: row.category ?? 'material',
    cost_code: row.cost_code ?? '',
    description: row.description ?? '',
    budget_amount: row.budget_amount === null || row.budget_amount === undefined ? '' : String(row.budget_amount),
    note: row.note ?? '',
  };
}

function filterJobBudgetRows(rows, searchText) {
  const search = searchText.trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((row) => [
    row.category,
    row.cost_code,
    row.description,
    row.note,
    getBudgetCategoryLabel(row.category),
  ].some((value) => String(value ?? '').toLowerCase().includes(search)));
}

function getJobBudgetSummary(rows) {
  const categoryTotals = JOB_BUDGET_CATEGORY_OPTIONS.reduce((totals, option) => ({
    ...totals,
    [option.value]: 0,
  }), {});

  let totalBudget = 0;
  rows.forEach((row) => {
    const amount = Number(row.budget_amount ?? 0);
    if (!Number.isFinite(amount)) return;
    totalBudget += amount;
    if (Object.prototype.hasOwnProperty.call(categoryTotals, row.category)) {
      categoryTotals[row.category] += amount;
    }
  });

  return {
    count: rows.length,
    totalBudget,
    categoryTotals,
  };
}

function buildJobBudgetMutationPayload(draft) {
  const budgetAmountText = String(draft.budget_amount ?? '').trim();
  const budgetAmount = budgetAmountText === '' ? NaN : Number(budgetAmountText);

  return {
    category: JOB_BUDGET_CATEGORY_OPTIONS.some((option) => option.value === draft.category) ? draft.category : '',
    cost_code: cleanToolText(draft.cost_code),
    description: String(draft.description ?? '').trim(),
    budget_amount: Number.isFinite(budgetAmount) ? budgetAmount : NaN,
    note: cleanToolText(draft.note),
  };
}

function createJobBuyoutDraft(row = null) {
  if (!row) return { ...EMPTY_JOB_BUYOUT_DRAFT };
  return {
    id: row.id ?? '',
    item_id: row.item_id ?? '',
    item_description: row.item_description ?? '',
    quantity_needed: row.quantity_needed ?? '',
    quantity_ordered: row.quantity_ordered ?? '',
    status: BUYOUT_STATUS_OPTIONS.includes(String(row.status ?? '').toLowerCase()) ? String(row.status).toLowerCase() : 'pending',
    vendor_note: row.vendor_note ?? '',
    lead_time_note: row.lead_time_note ?? '',
    note: row.note ?? '',
  };
}

function getBuyoutItemLabel(row, catalogItem = null) {
  const catalogLabel = catalogItem
    ? [catalogItem.material_code, catalogItem.name].filter(Boolean).join(' / ')
    : '';
  return [catalogLabel, row.item_description].filter(Boolean).join(' / ') || row.item_id || 'Buyout line';
}

function getBuyoutStatusBadgeClass(value) {
  const toneByValue = {
    pending: 'warn',
    ordered: 'info',
    received: 'good',
    cancelled: 'err',
  };
  const tone = toneByValue[String(value ?? '').toLowerCase()] ?? 'info';
  return `status-pill tool-catalogue__badge tool-catalogue__badge--${tone}`;
}

function filterJobBuyoutRows(rows, searchText) {
  const search = searchText.trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((row) => [
    row.item_description,
    row.vendor_note,
    row.lead_time_note,
    row.note,
    row.status,
    row.item_id,
  ].some((value) => String(value ?? '').toLowerCase().includes(search)));
}

function getJobBuyoutSummary(rows) {
  const pendingCount = rows.reduce((count, row) => {
    const status = String(row.status ?? '').toLowerCase();
    return status === 'pending' ? count + 1 : count;
  }, 0);
  const orderedCount = rows.reduce((count, row) => {
    const status = String(row.status ?? '').toLowerCase();
    return status === 'ordered' ? count + 1 : count;
  }, 0);
  const receivedCount = rows.reduce((count, row) => {
    const status = String(row.status ?? '').toLowerCase();
    return status === 'received' ? count + 1 : count;
  }, 0);

  return {
    count: rows.length,
    pendingCount,
    orderedCount,
    receivedCount,
    committedCount: orderedCount + receivedCount,
  };
}

function buildJobBuyoutMutationPayload(draft) {
  const itemId = cleanToolText(draft.item_id);
  const itemDescription = cleanToolText(draft.item_description);
  const quantityNeeded = Number(draft.quantity_needed);
  const quantityOrderedText = String(draft.quantity_ordered ?? '').trim();
  const quantityOrdered = quantityOrderedText === '' ? null : Number(quantityOrderedText);
  const status = BUYOUT_STATUS_OPTIONS.includes(String(draft.status ?? '').toLowerCase())
    ? String(draft.status).toLowerCase().toLowerCase()
    : 'pending';

  return {
    item_id: itemId || null,
    item_description: itemDescription,
    quantity_needed: Number.isFinite(quantityNeeded) ? quantityNeeded : NaN,
    quantity_ordered: quantityOrderedText === ''
      ? null
      : Number.isFinite(quantityOrdered)
        ? quantityOrdered
        : NaN,
    status,
    vendor_note: cleanToolText(draft.vendor_note),
    lead_time_note: cleanToolText(draft.lead_time_note),
    note: cleanToolText(draft.note),
  };
}

function buildJobBuyoutExportRows(rows, catalogItems, inStockByItemId) {
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  return rows.map((row) => {
    const catalogItem = row.item_id ? catalogById.get(row.item_id) ?? null : null;
    const inStock = row.item_id ? inStockByItemId.get(row.item_id) ?? null : null;
    return {
      ...row,
      itemLabel: getBuyoutItemLabel(row, catalogItem),
      qtyNeededLabel: formatQuantitySummary(row.quantity_needed),
      qtyOrderedLabel: formatOptionalQuantity(row.quantity_ordered),
      statusLabel: String(row.status ?? 'pending'),
      inStockLabel: row.item_id ? formatOptionalQuantity(inStock) : '',
      leadTimeLabel: row.lead_time_note ?? '',
      vendorLabel: row.vendor_note ?? '',
      noteLabel: row.note ?? '',
    };
  });
}

function downloadBuyoutCsvFile({ jobLabel, rows, catalogItems, inStockByItemId }) {
  const columns = [
    { label: 'Item / Description', getValue: (row) => row.itemLabel },
    { label: 'Qty Needed', getValue: (row) => row.qtyNeededLabel },
    { label: 'Qty Ordered', getValue: (row) => row.qtyOrderedLabel },
    { label: 'Status', getValue: (row) => row.statusLabel },
    { label: 'In Stock', getValue: (row) => row.inStockLabel },
    { label: 'Lead Time', getValue: (row) => row.leadTimeLabel },
    { label: 'Vendor', getValue: (row) => row.vendorLabel },
    { label: 'Note', getValue: (row) => row.noteLabel },
  ];
  const safeFilename = `${String(jobLabel || 'job').replace(/[\\/:*?"<>|]+/g, '-')} - buyout-list.csv`;

  return downloadCsvFile(
    safeFilename,
    columns,
    buildJobBuyoutExportRows(rows, catalogItems, inStockByItemId),
  );
}

function getBuyoutPrintDocument({ title, jobLabel, rows, catalogItems, inStockByItemId }) {
  const exportRows = buildJobBuyoutExportRows(rows, catalogItems, inStockByItemId);
  const rowMarkup = exportRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.itemLabel)}</td>
      <td>${escapeHtml(row.qtyNeededLabel)}</td>
      <td>${escapeHtml(row.qtyOrderedLabel)}</td>
      <td>${escapeHtml(row.statusLabel)}</td>
      <td>${escapeHtml(row.inStockLabel || '-')}</td>
      <td>${escapeHtml(row.leadTimeLabel || '-')}</td>
      <td>${escapeHtml(row.vendorLabel || '-')}</td>
      <td>${escapeHtml(row.noteLabel || '-')}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <style>
      @page { margin: .4in; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      .print-sheet { padding: 0; }
      .print-header { display: grid; gap: .2rem; margin-bottom: 1rem; }
      .print-header h1 { margin: 0; font-size: 1.2rem; }
      .print-header p { margin: 0; color: #4b5563; font-size: .9rem; }
      .print-copy { margin: 0 0 1rem; color: #374151; font-size: .88rem; line-height: 1.45; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #d1d5db; padding: .45rem .5rem; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; }
      td { font-size: .85rem; }
      tbody tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <section class="print-sheet">
      <header class="print-header">
        <h1>${escapeHtml(jobLabel || 'Buyout List')}</h1>
        <p>${escapeHtml(title)}</p>
      </header>
      <p class="print-copy">${escapeHtml(BUYOUT_LIST_HELPER_COPY)}</p>
      <table>
        <thead>
          <tr>
            <th>Item / Description</th>
            <th>Qty Needed</th>
            <th>Qty Ordered</th>
            <th>Status</th>
            <th>In Stock</th>
            <th>Lead Time</th>
            <th>Vendor</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${rowMarkup || '<tr><td colspan="8">No buyout lines.</td></tr>'}
        </tbody>
      </table>
    </section>
    <script>
      window.addEventListener('load', () => {
        window.focus();
        window.print();
      });
    </script>
  </body>
</html>`;
}

function openBuyoutPrintWindow({ title, jobLabel, rows, catalogItems, inStockByItemId }) {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank', 'width=980,height=1100');
  if (!printWindow) return false;
  printWindow.document.write(getBuyoutPrintDocument({ title, jobLabel, rows, catalogItems, inStockByItemId }));
  printWindow.document.close();
  return true;
}

function getToolBadgeClass(value) {
  const toneByValue = {
    active: 'ok',
    good: 'ok',
    inactive: 'info',
    unknown: 'info',
    fair: 'warn',
    poor: 'warn',
    retired: 'warn',
    damaged: 'err',
    missing: 'err',
  };
  const tone = toneByValue[String(value ?? '').toLowerCase()] ?? 'info';
  return `status-pill tool-catalogue__badge tool-catalogue__badge--${tone}`;
}

function filterToolRows(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.category && (row.category || '') !== filters.category) return false;
    if (filters.status && (row.status || '') !== filters.status) return false;
    if (filters.condition && (row.condition || '') !== filters.condition) return false;
    if (!search) return true;
    return TOOL_SEARCH_FIELDS.some((field) => String(row[field] ?? '').toLowerCase().includes(search));
  });
}

function getToolFilterOptions(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))]
    .sort((first, second) => String(first).localeCompare(String(second)));
}

function ToolCataloguePanel({ permissions, designPreviewEnabled = false }) {
  const { getToken } = useAuth();
  const canReadTools = permissions.permissionSource === 'server';
  const canWriteTools = canReadTools && permissions.canManageInventory;
  const hasWritableDivision = Boolean(permissions.division);
  const [tools, setTools] = useState([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [isSavingTool, setIsSavingTool] = useState(false);
  const [toolsError, setToolsError] = useState(null);
  const [toolMessage, setToolMessage] = useState('');
  const [showArchivedTools, setShowArchivedTools] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState('');
  const [draft, setDraft] = useState(() => createToolDraft());
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    status: '',
    condition: '',
  });
  const selectedTool = tools.find((row) => row.id === selectedToolId) ?? null;
  const categoryOptions = useMemo(() => getToolFilterOptions(tools, 'category'), [tools]);
  const filteredTools = useMemo(() => filterToolRows(tools, filters), [tools, filters]);
  const toolCatalogueClassName = designPreviewEnabled
    ? 'cart-panel tool-catalogue tool-catalogue-skin'
    : 'cart-panel tool-catalogue';

  async function loadTools({ preserveMessage = false } = {}) {
    if (!canReadTools) return;

    setIsLoadingTools(true);
    setToolsError(null);
    if (!preserveMessage) setToolMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      let query = client
        .from('tools')
        .select(TOOL_CATALOGUE_SELECT_FIELDS)
        .order('name', { ascending: true });
      if (!showArchivedTools) query = query.is('archived_at', null);
      const { data, error } = await query;
      if (error) throw error;
      setTools(data ?? []);
    } catch (error) {
      console.error('Tool Catalogue load failed', error);
      setTools([]);
      setToolsError(error);
    } finally {
      setIsLoadingTools(false);
    }
  }

  useEffect(() => {
    loadTools();
  }, [canReadTools, getToken, showArchivedTools]);

  useEffect(() => {
    if (selectedToolId && !tools.some((row) => row.id === selectedToolId)) {
      setSelectedToolId('');
      setDraft(createToolDraft());
    }
  }, [selectedToolId, tools]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function startNewTool() {
    setSelectedToolId('');
    setDraft(createToolDraft());
    setToolMessage('');
  }

  function startEditTool(row) {
    if (!canWriteTools || row.division !== permissions.division) {
      setToolMessage('Tool edit is limited to the current user division.');
      return;
    }
    setSelectedToolId(row.id);
    setDraft(createToolDraft(row));
    setToolMessage('');
  }

  async function saveTool(event) {
    event.preventDefault();
    if (!canWriteTools || isSavingTool) return;
    if (!hasWritableDivision) {
      setToolMessage('Tool save blocked because the current user division could not be determined from server permissions.');
      return;
    }
    if (selectedTool && selectedTool.division !== permissions.division) {
      setToolMessage('Tool save blocked because this row is outside the current user division.');
      return;
    }

    const payload = buildToolMutationPayload(draft);
    if (!payload.name) {
      setToolMessage('Tool name is required.');
      return;
    }

    setIsSavingTool(true);
    setToolMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (selectedToolId) {
        const { error } = await client
          .from('tools')
          .update(payload)
          .eq('id', selectedToolId);
        if (error) throw error;
        await loadTools({ preserveMessage: true });
        setToolMessage('Tool saved.');
      } else {
        const { data, error } = await client
          .from('tools')
          .insert({ division: permissions.division, ...payload })
          .select('id')
          .single();
        if (error) throw error;
        setSelectedToolId(data?.id ?? '');
        setDraft(createToolDraft());
        await loadTools({ preserveMessage: true });
        setToolMessage('Tool added.');
      }
    } catch (error) {
      console.error('Tool Catalogue save failed', error);
      setToolMessage('Tool save failed. Confirm permissions, division scope, and the Tool Catalogue migration.');
    } finally {
      setIsSavingTool(false);
    }
  }

  async function archiveTool(row) {
    if (!canWriteTools || isSavingTool || !row?.id || row.archived_at) return;
    if (row.division !== permissions.division) {
      setToolMessage('Tool archive is limited to the current user division.');
      return;
    }
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingTool(true);
    setToolMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('tools')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
          status: 'retired',
        })
        .eq('id', row.id);
      if (error) throw error;

      if (selectedToolId === row.id) startNewTool();
      await loadTools({ preserveMessage: true });
      setToolMessage('Tool archived.');
    } catch (error) {
      console.error('Tool Catalogue archive failed', error);
      setToolMessage('Tool archive failed. Confirm permissions and division scope.');
    } finally {
      setIsSavingTool(false);
    }
  }

  if (!canReadTools) {
    return (
      <section className={`${toolCatalogueClassName} cart-panel--locked`}>
        <div className="card__header">
          <div>
            <p className="eyebrow">Tool Catalogue</p>
            <h3>Tool Catalogue</h3>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
        <p>{TOOL_CATALOGUE_HELPER_COPY}</p>
      </section>
    );
  }

  return (
    <section className={toolCatalogueClassName}>
      <div className="card__header">
        <div>
          <p className="eyebrow">Tool Catalogue</p>
          <h3>Tool Catalogue</h3>
          <p>{TOOL_CATALOGUE_HELPER_COPY}</p>
        </div>
        <Wrench className="card__icon" aria-hidden="true" />
      </div>

      <div className="location-note tool-catalogue__note">
        <Wrench aria-hidden="true" />
        <span>{TOOL_CATALOGUE_HELPER_COPY}</span>
      </div>

      {toolsError ? <div className="alert">Tool Catalogue failed to load. Confirm server permissions and the `public.tools` migration.</div> : null}
      {!hasWritableDivision ? <div className="alert">Tool create/edit is blocked because the current user division could not be determined from server permissions.</div> : null}
      {toolMessage ? <div className="alert">{toolMessage}</div> : null}

      <div className="tool-catalogue__layout">
        <section className="tool-catalogue__list-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Catalogue</p>
              <h3>{showArchivedTools ? 'Visible tools' : 'Active tools'}</h3>
            </div>
            <span>{filteredTools.length} row{filteredTools.length === 1 ? '' : 's'}</span>
          </div>

          <div className="tool-toolbar">
            <label>
              Search
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </label>
            <label>
              Category
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                <option value="">All categories</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">All statuses</option>
                {TOOL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Condition
              <select value={filters.condition} onChange={(event) => setFilters((current) => ({ ...current, condition: event.target.value }))}>
                <option value="">All conditions</option>
                {TOOL_CONDITION_OPTIONS.filter(Boolean).map((condition) => <option key={condition} value={condition}>{condition}</option>)}
              </select>
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={showArchivedTools} onChange={(event) => setShowArchivedTools(event.target.checked)} />
              Show archived
            </label>
            <button type="button" className="secondary-button" onClick={() => loadTools()} disabled={isLoadingTools}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </div>

          {isLoadingTools ? <p className="muted">Loading Tool Catalogue...</p> : null}
          {!isLoadingTools && !filteredTools.length ? (
            <div className="empty-state">
              <strong>No tools have been added yet.</strong>
              <p>{TOOL_CATALOGUE_EMPTY_NOTE}</p>
            </div>
          ) : null}

          {filteredTools.length ? (
            <>
              <div className="table-wrap">
                <table className="data-table tool-table">
                  <thead>
                    <tr>
                      <th>Tool #</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Brand</th>
                      <th>Model</th>
                      <th>Serial #</th>
                      <th>Condition</th>
                      <th>Status</th>
                      <th>Home Location</th>
                      <th>Current Location</th>
                      <th>Assigned To</th>
                      <th>Purchase Date</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTools.map((row) => (
                      <tr key={row.id} className={row.archived_at ? 'tool-row--archived' : ''}>
                        <td>{formatToolValue(row.tool_number)}</td>
                        <td>
                          <strong>{row.name}</strong>
                          {row.description ? <span>{row.description}</span> : null}
                        </td>
                        <td>{formatToolValue(row.category)}</td>
                        <td>{formatToolValue(row.brand)}</td>
                        <td>{formatToolValue(row.model)}</td>
                        <td>{formatToolValue(row.serial_number)}</td>
                        <td>{designPreviewEnabled && row.condition ? <span className={getToolBadgeClass(row.condition)}>{row.condition}</span> : formatToolValue(row.condition)}</td>
                        <td><span className={designPreviewEnabled ? getToolBadgeClass(row.status) : 'status-pill'}>{row.status}</span></td>
                        <td>{formatToolValue(row.home_location)}</td>
                        <td>{formatToolValue(row.current_location)}</td>
                        <td>{formatToolValue(row.assigned_to)}</td>
                        <td>{formatToolDate(row.purchase_date)}</td>
                        <td>{formatToolValue(row.notes)}</td>
                        <td>
                          <div className="count-action-stack">
                            <button type="button" className="secondary-button" onClick={() => startEditTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division}>
                              <Pencil aria-hidden="true" /> Edit
                            </button>
                            <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division || Boolean(row.archived_at)}>
                              <Archive aria-hidden="true" /> Archive
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-list tool-mobile-list">
                {filteredTools.map((row) => (
                  <article className="mobile-item" key={row.id}>
                    <strong>{row.name}</strong>
                    <div className="meta-grid">
                      <span>Tool #: {formatToolValue(row.tool_number)}</span>
                      <span>Category: {formatToolValue(row.category)}</span>
                      <span>Brand: {formatToolValue(row.brand)}</span>
                      <span>Model: {formatToolValue(row.model)}</span>
                      <span>Serial #: {formatToolValue(row.serial_number)}</span>
                      <span>Condition: {designPreviewEnabled && row.condition ? <span className={getToolBadgeClass(row.condition)}>{row.condition}</span> : formatToolValue(row.condition)}</span>
                      <span>Status: {designPreviewEnabled ? <span className={getToolBadgeClass(row.status)}>{formatToolValue(row.status)}</span> : formatToolValue(row.status)}</span>
                      <span>Home: {formatToolValue(row.home_location)}</span>
                      <span>Current: {formatToolValue(row.current_location)}</span>
                      <span>Assigned: {formatToolValue(row.assigned_to)}</span>
                      <span>Purchase: {formatToolDate(row.purchase_date)}</span>
                      <span>Notes: {formatToolValue(row.notes)}</span>
                    </div>
                    <div className="cart-actions">
                      <button type="button" className="secondary-button" onClick={() => startEditTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division}>
                        <Pencil aria-hidden="true" /> Edit
                      </button>
                      <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division || Boolean(row.archived_at)}>
                        <Archive aria-hidden="true" /> Archive
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="tool-catalogue__form-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">{selectedTool ? 'Edit Tool' : 'Add Tool'}</p>
              <h3>{selectedTool ? selectedTool.name : 'Add tool'}</h3>
            </div>
            <span>{canWriteTools ? `Division: ${permissions.division ?? 'Unassigned'}` : 'can_manage_inventory required'}</span>
          </div>

          <form className="tool-form" onSubmit={saveTool}>
            <label className="tool-form__wide">
              Name
              <input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} disabled={!canWriteTools || isSavingTool} />
            </label>
            {TOOL_TEXT_FORM_FIELDS.map((field) => (
              <label key={field.key}>
                {field.label}
                <input value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!canWriteTools || isSavingTool} />
              </label>
            ))}
            <label>
              Condition
              <select value={draft.condition} onChange={(event) => updateDraft('condition', event.target.value)} disabled={!canWriteTools || isSavingTool}>
                {TOOL_CONDITION_OPTIONS.map((condition) => (
                  <option key={condition || 'blank'} value={condition}>{condition || 'blank'}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)} disabled={!canWriteTools || isSavingTool}>
                {TOOL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Purchase Date
              <input type="date" value={draft.purchase_date} onChange={(event) => updateDraft('purchase_date', event.target.value)} disabled={!canWriteTools || isSavingTool} />
            </label>
            {TOOL_TEXTAREA_FORM_FIELDS.map((field) => (
              <label className="tool-form__wide" key={field.key}>
                {field.label}
                <textarea value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!canWriteTools || isSavingTool} />
              </label>
            ))}
            <div className="cart-actions tool-form__wide">
              <button type="submit" className="secondary-button" disabled={!canWriteTools || !hasWritableDivision || isSavingTool}>
                <Plus aria-hidden="true" /> {isSavingTool ? 'Saving...' : selectedTool ? 'Save Tool' : 'Add Tool'}
              </button>
              <button type="button" className="secondary-button" onClick={startNewTool} disabled={isSavingTool}>
                New Tool
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}

function LabelTemplateDesignerPanel({ permissions }) {
  const canReadLabels = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const canManageTemplates = canReadLabels && isDeveloperOrAdminRole(permissions.role);
  const { getToken } = useAuth();
  const locationSheet = useInventoryCountSheet({ enabled: canReadLabels });
  const [templates, setTemplates] = useState([]);
  const [templatesError, setTemplatesError] = useState(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedFieldKey, setSelectedFieldKey] = useState('code');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [draft, setDraft] = useState(() => getLabelDraftFromTemplate(null));
  const locationRecords = useMemo(
    () => buildLocationRecords(
      locationSheet.storageUnits,
      locationSheet.shelves,
      locationSheet.bays,
      locationSheet.bins,
    ),
    [locationSheet.storageUnits, locationSheet.shelves, locationSheet.bays, locationSheet.bins],
  );
  const scopedLocationRecords = locationRecords.filter((record) => !draft.scope_level || record.type === draft.scope_level);
  const selectedLocation =
    scopedLocationRecords.find((record) => record.id === selectedLocationId) ??
    scopedLocationRecords[0] ??
    null;
  const selectedTemplate = templates.find((row) => row.id === selectedTemplateId) ?? null;
  const selectedTemplateIsArchived = Boolean(selectedTemplate?.archived_at);
  const selectedField = draft.layout.fields[selectedFieldKey] ?? draft.layout.fields.code;
  const selectedSummary = selectedLocation ? getHierarchySummary(selectedLocation, locationSheet) : '';
  const scopeWarning = getScopeWarning(draft);

  async function loadTemplates({ preserveMessage = false, archived = showArchivedTemplates } = {}) {
    if (!canReadLabels) return;

    setIsLoadingTemplates(true);
    setTemplatesError(null);
    if (!preserveMessage) setTemplateMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      let query = client
        .from('label_templates')
        .select('id,name,avery_template,scope_level,include_qr,layout,created_by,created_at,archived_at')
        .order('name', { ascending: true });
      query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data ?? []);
    } catch (error) {
      console.warn('Label templates unavailable', error);
      setTemplates([]);
      setTemplatesError(error);
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, [canReadLabels, getToken, showArchivedTemplates]);

  useEffect(() => {
    if (!scopedLocationRecords.length) {
      if (selectedLocationId) setSelectedLocationId('');
      return;
    }

    if (!selectedLocationId || !scopedLocationRecords.some((record) => record.id === selectedLocationId)) {
      setSelectedLocationId(scopedLocationRecords[0].id);
    }
  }, [scopedLocationRecords, selectedLocationId]);

  function updateDraft(updates) {
    setDraft((current) => ({
      ...current,
      ...updates,
      layout: updates.avery_template
        ? {
            ...current.layout,
            geometry: AVERY_LABEL_TEMPLATES[updates.avery_template] ?? current.layout.geometry,
          }
        : current.layout,
    }));
  }

  function updateField(fieldKey, updates) {
    setDraft((current) => ({
      ...current,
      layout: {
        ...current.layout,
        fields: {
          ...current.layout.fields,
          [fieldKey]: {
            ...current.layout.fields[fieldKey],
            ...updates,
          },
        },
      },
    }));
  }

  function selectTemplate(templateId) {
    setSelectedTemplateId(templateId);
    const template = templates.find((row) => row.id === templateId);
    setDraft(getLabelDraftFromTemplate(template));
    setTemplateMessage('');
  }

  function startNewTemplate() {
    setShowArchivedTemplates(false);
    setSelectedTemplateId('');
    setDraft(getLabelDraftFromTemplate(null));
    setTemplateMessage('');
  }

  function updateAveryTemplate(averyTemplate) {
    setDraft((current) => {
      const nextScope =
        averyTemplate === '8160'
          ? 'bin'
          : current.scope_level === 'bin'
            ? ''
            : current.scope_level;
      return {
        ...current,
        avery_template: averyTemplate,
        scope_level: nextScope,
        layout: {
          ...current.layout,
          geometry: AVERY_LABEL_TEMPLATES[averyTemplate] ?? current.layout.geometry,
        },
      };
    });
  }

  async function saveTemplate() {
    if (!canManageTemplates) return;
    const name = draft.name.trim();
    if (!name) {
      setTemplateMessage('Template name is required.');
      return;
    }

    setIsSavingTemplate(true);
    setTemplateMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const payload = {
        name,
        avery_template: draft.avery_template,
        scope_level: draft.scope_level || null,
        include_qr: draft.include_qr,
        layout: {
          ...draft.layout,
          geometry: AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'],
        },
      };

      if (selectedTemplateId) {
        const { error } = await client
          .from('label_templates')
          .update(payload)
          .eq('id', selectedTemplateId);
        if (error) throw error;
        await loadTemplates({ preserveMessage: true, archived: showArchivedTemplates });
        setTemplateMessage('Template saved.');
      } else {
        const { data, error } = await client
          .from('label_templates')
          .insert({ ...payload, created_by: permissions.userId })
          .select('id')
          .single();
        if (error) throw error;
        setSelectedTemplateId(data?.id ?? '');
        setShowArchivedTemplates(false);
        await loadTemplates({ preserveMessage: true, archived: false });
        setTemplateMessage('Template created.');
      }
    } catch (error) {
      console.error('Failed to save label template', error);
      setTemplateMessage('Template save failed. Confirm the label_templates migration is applied and permissions allow template management.');
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function archiveTemplate() {
    if (!canManageTemplates || !selectedTemplateId) return;

    setIsSavingTemplate(true);
    setTemplateMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('label_templates')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', selectedTemplateId);
      if (error) throw error;

      startNewTemplate();
      await loadTemplates({ preserveMessage: true, archived: false });
      setTemplateMessage('Template archived.');
    } catch (error) {
      console.error('Failed to archive label template', error);
      setTemplateMessage('Template archive failed. Confirm permissions and migration status.');
    } finally {
      setIsSavingTemplate(false);
    }
  }

  function printSelectedLabel() {
    if (!selectedLocation) return;
    const ok = openLabelPrintWindow({
      draft,
      locations: [selectedLocation],
      locationSheet,
      title: `${draft.name || 'Location Label'} - ${selectedLocation.code}`,
    });
    setTemplateMessage(ok ? 'Print window opened for the selected label.' : 'Print window was blocked by the browser.');
  }

  function printScopedLabels() {
    const records = scopedLocationRecords;
    if (!records.length) return;
    const ok = openLabelPrintWindow({
      draft,
      locations: records,
      locationSheet,
      title: `${draft.name || 'Location Labels'} - ${draft.scope_level || 'all locations'}`,
    });
    setTemplateMessage(ok ? `Print window opened for ${records.length} label${records.length === 1 ? '' : 's'}.` : 'Print window was blocked by the browser.');
  }

  if (!canReadLabels) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Label Templates</p>
            <h3>Label Template Designer</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>Label preview and template controls use the existing inventory read permission gate.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel label-designer">
      <div className="card__header">
        <div>
          <p className="eyebrow">Label Templates</p>
          <h3>Label Template Designer</h3>
          <p>
            Foundation for reusable Unit, Shelf, Bay, and Bin label templates. QR content stays on the Section 10 `/scan/location/&lt;uuid&gt;` payload.
          </p>
        </div>
        <span className="status-pill status-pill--good">Preview + save foundation</span>
      </div>

      <div className="location-note">
        <QrCode aria-hidden="true" />
        <span>
          Avery 5164 supports Unit/Shelf/Bay placards. Avery 8160 supports Bin labels. Browser print uses the saved, data-driven template geometry; exact react-pdf output remains deferred.
        </span>
      </div>

      {templatesError ? (
        <div className="alert">Saved templates are unavailable until the `label_templates` migration is applied. Preview controls still work.</div>
      ) : null}
      {locationSheet.error ? <div className="alert">Location data failed to load. Label preview cannot resolve live QR payloads.</div> : null}

      <div className="label-designer-layout">
        <section className="label-control-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Template</p>
              <h3>Reusable layout</h3>
            </div>
            <span>{showArchivedTemplates ? 'Archived view' : canManageTemplates ? 'Developer/Admin' : 'Preview only'}</span>
          </div>

          <div className="label-form-grid">
            <label>
              {showArchivedTemplates ? 'Archived templates' : 'Active templates'}
              <select value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)} disabled={isLoadingTemplates || !templates.length}>
                <option value="">New unsaved template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}{template.archived_at ? ' (archived)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="count-toggle">
              <input
                type="checkbox"
                checked={showArchivedTemplates}
                onChange={(event) => {
                  setShowArchivedTemplates(event.target.checked);
                  setSelectedTemplateId('');
                  setDraft(getLabelDraftFromTemplate(null));
                  setTemplateMessage('');
                }}
              />
              Show archived
            </label>
            <label>
              Template name
              <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
            </label>
            <label>
              Avery sheet
              <select value={draft.avery_template} onChange={(event) => updateAveryTemplate(event.target.value)}>
                {Object.values(AVERY_LABEL_TEMPLATES).map((template) => (
                  <option key={template.key} value={template.key}>{formatAveryTemplateLabel(template)}</option>
                ))}
              </select>
            </label>
            <label>
              Scope level
              <select value={draft.scope_level} onChange={(event) => updateDraft({ scope_level: event.target.value })}>
                {LABEL_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Preview location
              <select value={selectedLocation?.id ?? ''} onChange={(event) => setSelectedLocationId(event.target.value)} disabled={!scopedLocationRecords.length}>
                {scopedLocationRecords.map((record) => (
                  <option key={record.id} value={record.id}>{record.typeLabel}: {record.path || record.code}</option>
                ))}
              </select>
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={draft.include_qr} onChange={(event) => updateDraft({ include_qr: event.target.checked })} />
              QR enabled
            </label>
          </div>
          <div className="label-template-status">
            <span>{templates.length} {showArchivedTemplates ? 'archived' : 'active'} template{templates.length === 1 ? '' : 's'}</span>
            <span>{AVERY_LABEL_TEMPLATES[draft.avery_template]?.scopeHint}</span>
            {scopeWarning ? <span className="status-pill status-pill--warn">{scopeWarning}</span> : null}
            {selectedTemplateIsArchived ? <span className="status-pill status-pill--warn">Archived templates are preview-only.</span> : null}
          </div>

          <div className="label-fields-panel">
            <strong>Fields</strong>
            <div className="label-field-toggles">
              {LABEL_FIELD_OPTIONS.map((field) => (
                <label className="count-toggle" key={field.key}>
                  <input
                    type="checkbox"
                    checked={draft.layout.fields[field.key]?.enabled ?? false}
                    onChange={(event) => updateField(field.key, { enabled: event.target.checked })}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>

          <div className="label-style-panel">
            <label>
              Style field
              <select value={selectedFieldKey} onChange={(event) => setSelectedFieldKey(event.target.value)}>
                {LABEL_FIELD_OPTIONS.map((field) => (
                  <option key={field.key} value={field.key}>{field.label}</option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input type="color" value={selectedField.color ?? '#111827'} onChange={(event) => updateField(selectedFieldKey, { color: event.target.value })} />
            </label>
            <label>
              Alignment
              <select value={selectedField.align ?? 'left'} onChange={(event) => updateField(selectedFieldKey, { align: event.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              Opacity
              <input type="range" min="0.2" max="1" step="0.05" value={selectedField.opacity ?? 1} onChange={(event) => updateField(selectedFieldKey, { opacity: Number(event.target.value) })} />
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={Boolean(selectedField.bold)} onChange={(event) => updateField(selectedFieldKey, { bold: event.target.checked })} />
              Bold
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={Boolean(selectedField.underline)} onChange={(event) => updateField(selectedFieldKey, { underline: event.target.checked })} />
              Underline
            </label>
          </div>

          <div className="label-layout-panel">
            <div>
              <strong>QR layout</strong>
              <p className="muted">Position and size are saved in the template layout. Values are percentages of the label.</p>
            </div>
            <label>
              X
              <input type="number" min="0" max="100" step="1" value={draft.layout.fields.qr?.x ?? 6} onChange={(event) => updateField('qr', { x: Number(event.target.value) })} />
            </label>
            <label>
              Y
              <input type="number" min="0" max="100" step="1" value={draft.layout.fields.qr?.y ?? 8} onChange={(event) => updateField('qr', { y: Number(event.target.value) })} />
            </label>
            <label>
              Width
              <input type="number" min="8" max="90" step="1" value={draft.layout.fields.qr?.width ?? 28} onChange={(event) => updateField('qr', { width: Number(event.target.value) })} />
            </label>
            <label>
              Height
              <input type="number" min="8" max="90" step="1" value={draft.layout.fields.qr?.height ?? 28} onChange={(event) => updateField('qr', { height: Number(event.target.value) })} />
            </label>
          </div>

          {canManageTemplates ? (
            <div className="cart-actions">
              <button type="button" className="secondary-button" onClick={startNewTemplate} disabled={isSavingTemplate}>New Template</button>
              <button type="button" className="secondary-button" onClick={saveTemplate} disabled={isSavingTemplate || Boolean(templatesError) || selectedTemplateIsArchived}>
                {isSavingTemplate ? 'Saving...' : 'Save Template'}
              </button>
              <button type="button" className="secondary-button secondary-button--danger" onClick={archiveTemplate} disabled={isSavingTemplate || !selectedTemplateId || selectedTemplateIsArchived}>
                Archive Template
              </button>
            </div>
          ) : (
            <p className="muted">Template create/update/archive controls require Developer/Admin role with can_manage_inventory.</p>
          )}
          {templateMessage ? <div className="alert">{templateMessage}</div> : null}
        </section>

        <section className="label-preview-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Live Preview</p>
              <h3>{selectedLocation ? `${selectedLocation.typeLabel}: ${selectedLocation.code}` : 'Preview location'}</h3>
            </div>
            <span>{AVERY_LABEL_TEMPLATES[draft.avery_template]?.scopeHint}</span>
          </div>
          <LabelPreview draft={draft} locationRecord={selectedLocation} summary={selectedSummary} />
          <div className="cart-facts">
            <span>Sheet: {formatAveryTemplateLabel(AVERY_LABEL_TEMPLATES[draft.avery_template])}</span>
            <span>Scope: {draft.scope_level || 'Any level'}</span>
            <span>Printable labels: {scopedLocationRecords.length}</span>
            <span>Fields: {LABEL_FIELD_OPTIONS.filter((field) => draft.layout.fields[field.key]?.enabled).length}</span>
            <span>QR identity: location UUID</span>
          </div>
          <div className="cart-actions label-print-actions">
            <button type="button" className="secondary-button" onClick={printSelectedLabel} disabled={!selectedLocation}>
              <Printer aria-hidden="true" /> Print Selected Label
            </button>
            <button type="button" className="secondary-button" onClick={printScopedLabels} disabled={!scopedLocationRecords.length}>
              <Printer aria-hidden="true" /> Print Scoped Sheet
            </button>
          </div>
          <p className="muted">Browser print output uses Avery sheet, margin, label, and pitch geometry from the template data. Use 100% scale, no fit-to-page, and the printer margin setting that preserves actual Avery stock alignment.</p>
        </section>
      </div>
    </section>
  );
}

function ScanNavigationButton({ record, navigateTo, children }) {
  if (!record?.id) return null;

  return (
    <button type="button" className="scan-nav-button" onClick={() => navigateTo(buildLocationScanPath(record.id))}>
      <span>{record.typeLabel}</span>
      <strong>{getLocationDisplayCode(record)}</strong>
      {children ? <small>{children}</small> : null}
    </button>
  );
}

function ScanMaterialRows({ rows, emptyTitle, emptyText }) {
  if (!rows.length) {
    return (
      <EmptyState title={emptyTitle}>
        {emptyText}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table scan-contents-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Location</th>
              <th>Quantity</th>
              <th>Division</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bin_item_id}>
                <td>
                  <strong>{row.item_name}</strong>
                  <span>{row.material_code}</span>
                </td>
                <td>
                  <strong>{row.bin_code}</strong>
                  <span>{buildStoragePath(row)}</span>
                </td>
                <td>{Number(row.quantity_on_hand ?? row.system_quantity ?? 0).toFixed(2)} {row.unit_of_measure ?? ''}</td>
                <td>{row.division ?? row.storage_unit_division ?? 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-list scan-mobile-list">
        {rows.map((row) => (
          <article className="mobile-item" key={row.bin_item_id}>
            <strong>{row.item_name}</strong>
            <div className="meta-grid">
              <span>Code: {row.material_code}</span>
              <span>Bin: {row.bin_code}</span>
              <span>Path: {buildStoragePath(row)}</span>
              <span>Qty: {Number(row.quantity_on_hand ?? row.system_quantity ?? 0).toFixed(2)} {row.unit_of_measure ?? ''}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ScanBinCartEntry({ model, rows, permissions, navigateTo }) {
  if (model?.scopeType !== 'bin') return null;

  const binRows = getScanRowsForBin(model.bin, rows)
    .filter((row) => Number(row.quantity_on_hand ?? row.system_quantity ?? 0) > DEFAULT_CANDIDATE_QUANTITY);
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const scannedBinLabel = model.locationRecord?.path || getLocationDisplayCode(model.locationRecord);

  return (
    <section className="cart-panel scan-cart-entry-panel">
      <div className="scan-cart-entry-copy">
        <p className="eyebrow">Bin action</p>
        <h3>{scannedBinLabel || 'Scanned bin'}</h3>
        <p>Uses the existing cart checkout flow. Inventory is not changed until checkout is completed.</p>
      </div>

      {binRows.length ? (
        <div className="scan-cart-entry-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canUseCart}
            onClick={() => navigateTo(buildScanCartPath(model.locationRecord))}
          >
            <ShoppingCart aria-hidden="true" />
            Add material from this bin to cart
          </button>
          {!canUseCart ? <span className="muted">can_inventory_transactions is required for cart staging.</span> : null}
        </div>
      ) : (
        <EmptyState title="No stocked material">
          No authorized stocked material was found for this scanned bin.
        </EmptyState>
      )}
    </section>
  );
}

function ScanBinCountEntry({ model, rows, permissions, navigateTo }) {
  if (model?.scopeType !== 'bin') return null;

  const binRows = getScanRowsForBin(model.bin, rows);
  const canUseCountCorrection = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const scannedBinLabel = model.locationRecord?.path || getLocationDisplayCode(model.locationRecord);

  return (
    <section className="cart-panel scan-count-entry-panel">
      <div className="scan-cart-entry-copy">
        <p className="eyebrow">Count action</p>
        <h3>{scannedBinLabel || 'Scanned bin'}</h3>
        <p>Uses the existing Inventory Count & Correction flow. Inventory is not changed until the count correction is submitted through the approved path.</p>
      </div>

      {binRows.length ? (
        <div className="scan-cart-entry-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canUseCountCorrection}
            onClick={() => navigateTo(buildScanCountPath(model.locationRecord))}
          >
            <ClipboardCheck aria-hidden="true" />
            Correct count for this bin
          </button>
          {!canUseCountCorrection ? <span className="muted">can_manage_inventory is required for count correction.</span> : null}
        </div>
      ) : (
        <EmptyState title="No material rows">
          No authorized material rows were found for this scanned bin.
        </EmptyState>
      )}
    </section>
  );
}

function ScanBinGroup({ bin, rows, navigateTo }) {
  const binRecord = {
    id: bin.id,
    type: 'bin',
    typeLabel: 'Bin',
    code: bin.bin_code,
    label: bin.label,
  };

  return (
    <section className="scan-hierarchy-group">
      <div className="scan-group-header">
        <div>
          <p className="eyebrow">Bin</p>
          <h4>{bin.bin_code || bin.id}</h4>
          <span>{bin.label || 'No bin label'}</span>
        </div>
        <ScanNavigationButton record={binRecord} navigateTo={navigateTo}>
          Open bin
        </ScanNavigationButton>
      </div>
      <ScanMaterialRows
        rows={rows}
        emptyTitle="No contents in this bin"
        emptyText="This bin is available in the scanned scope, but the existing read path returned no active material rows for it."
      />
    </section>
  );
}

function ScanBayGroup({ bay, bins, rows, navigateTo }) {
  const bayRecord = {
    id: bay.id,
    type: 'bay',
    typeLabel: 'Bay',
    code: bay.bay_code,
    label: bay.label,
  };

  return (
    <section className="scan-hierarchy-group scan-hierarchy-group--bay">
      <div className="scan-group-header">
        <div>
          <p className="eyebrow">Bay</p>
          <h4>{bay.bay_code || bay.id}</h4>
          <span>{bay.label || 'No bay label'}</span>
        </div>
        <ScanNavigationButton record={bayRecord} navigateTo={navigateTo}>
          Open bay
        </ScanNavigationButton>
      </div>

      {bins.length ? (
        <div className="scan-bin-groups">
          {bins.map((bin) => (
            <ScanBinGroup
              key={bin.id}
              bin={bin}
              rows={rows.filter((row) => row.bin_id === bin.id)}
              navigateTo={navigateTo}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No bins under this bay">
          The scanned bay resolved, but the existing hierarchy read returned no bins under it.
        </EmptyState>
      )}
    </section>
  );
}

function ScanShelfGroup({ shelf, bays, bins, rows, navigateTo }) {
  const shelfRecord = {
    id: shelf.id,
    type: 'shelf',
    typeLabel: 'Shelf',
    code: shelf.shelf_code,
    label: shelf.label,
  };

  return (
    <section className="scan-hierarchy-group scan-hierarchy-group--shelf">
      <div className="scan-group-header">
        <div>
          <p className="eyebrow">Shelf</p>
          <h4>{shelf.shelf_code || shelf.id}</h4>
          <span>{shelf.label || 'No shelf label'}</span>
        </div>
        <ScanNavigationButton record={shelfRecord} navigateTo={navigateTo}>
          Open shelf
        </ScanNavigationButton>
      </div>

      {bays.length ? (
        <div className="scan-bay-groups">
          {bays.map((bay) => (
            <ScanBayGroup
              key={bay.id}
              bay={bay}
              bins={bins.filter((bin) => bin.bay_id === bay.id)}
              rows={rows.filter((row) => row.bay_id === bay.id)}
              navigateTo={navigateTo}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No bays under this shelf">
          The scanned shelf resolved, but the existing hierarchy read returned no bays under it.
        </EmptyState>
      )}
    </section>
  );
}

function ScanHierarchyNavigation({ model, locationSheet, navigateTo }) {
  const upRecords = model.ancestors.filter((record) => record.id !== model.locationRecord?.id);
  const downRecords = [
    ...(model.scopeType === 'unit' ? model.shelves.map((shelf) => ({
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
    })) : []),
    ...(['unit', 'shelf'].includes(model.scopeType) ? model.bays.map((bay) => ({
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
    })) : []),
    ...(['unit', 'shelf', 'bay'].includes(model.scopeType) ? model.bins.map((bin) => ({
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
    })) : []),
  ];

  return (
    <section className="cart-panel scan-navigation-panel">
      <div className="count-section-header">
        <div>
          <p className="eyebrow">Hierarchy Navigation</p>
          <h3>Move within scanned location scope</h3>
        </div>
        <span>Read + navigation</span>
      </div>

      <div className="scan-nav-section">
        <strong>Up</strong>
        {upRecords.length ? (
          <div className="scan-nav-grid">
            {upRecords.map((record) => (
              <ScanNavigationButton key={record.id} record={record} navigateTo={navigateTo}>
                {getHierarchySummary(record, locationSheet)}
              </ScanNavigationButton>
            ))}
          </div>
        ) : (
          <p className="muted">This is the top level for the scanned scope.</p>
        )}
      </div>

      <div className="scan-nav-section">
        <strong>Down</strong>
        {downRecords.length ? (
          <div className="scan-nav-grid">
            {downRecords.map((record) => (
              <ScanNavigationButton key={`${record.type}:${record.id}`} record={record} navigateTo={navigateTo}>
                {getHierarchySummary(record, locationSheet)}
              </ScanNavigationButton>
            ))}
          </div>
        ) : (
          <p className="muted">Bin pages are the action level; no lower location level is available.</p>
        )}
      </div>
    </section>
  );
}

function ScanScopedContents({ model, rows, navigateTo }) {
  if (model.scopeType === 'bin') {
    const binRows = getScanRowsForBin(model.bin, rows);
    return (
      <ScanMaterialRows
        rows={binRows}
        emptyTitle="No contents in this bin"
        emptyText="No authorized stocked material was found for this scanned bin."
      />
    );
  }

  if (model.scopeType === 'bay') {
    return (
      <ScanBayGroup
        bay={model.bay}
        bins={model.bins}
        rows={rows}
        navigateTo={navigateTo}
      />
    );
  }

  if (model.scopeType === 'shelf') {
    return (
      <ScanShelfGroup
        shelf={model.shelf}
        bays={model.bays}
        bins={model.bins}
        rows={rows}
        navigateTo={navigateTo}
      />
    );
  }

  return (
    <div className="scan-shelf-groups">
      {model.shelves.length ? (
        model.shelves.map((shelf) => (
          <ScanShelfGroup
            key={shelf.id}
            shelf={shelf}
            bays={model.bays.filter((bay) => bay.shelf_id === shelf.id)}
            bins={model.bins}
            rows={rows.filter((row) => row.shelf_id === shelf.id)}
            navigateTo={navigateTo}
          />
        ))
      ) : (
        <EmptyState title="No shelves under this unit">
          The scanned unit resolved, but the existing hierarchy read returned no shelves under it.
        </EmptyState>
      )}
    </div>
  );
}

function LocationScanResult({ permissions, locationId, navigateTo }) {
  const canReadLocations = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const locationSheet = useInventoryCountSheet({ enabled: canReadLocations });
  const scanModel = useMemo(
    () => buildScanDestinationModel(locationId, locationSheet),
    [
      locationId,
      locationSheet.storageUnits,
      locationSheet.shelves,
      locationSheet.bays,
      locationSheet.bins,
    ],
  );
  const locationRows = getRowsForScanScope(scanModel, locationSheet.rows);
  const totalQuantity = locationRows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? row.system_quantity ?? 0), 0);

  if (!canReadLocations) {
    return (
      <article className="card card--wide scan-result">
        <div className="card__header">
          <div>
            <p className="eyebrow">Scan Result</p>
            <h2>Location unavailable</h2>
          </div>
          <span className="status-pill status-pill--warn">Access unavailable</span>
        </div>
        <p>Scanning a QR code does not grant access. Sign in with server permissions that can read inventory locations.</p>
      </article>
    );
  }

  return (
    <article className="card card--wide scan-result">
      <div className="card__header">
        <div>
          <p className="eyebrow">Scan Result</p>
          <h2>{scanModel?.locationRecord ? scanModel.locationRecord.path || scanModel.locationRecord.code : 'Resolving location'}</h2>
          <p>Read-first location page from the scanned UUID. Human-readable codes are display text only.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => navigateTo('/')}>
          Back to Dashboard
        </button>
      </div>

      <div className="location-note">
        <MapPin aria-hidden="true" />
        <span>
          Scan pages dispatch into existing inventory workflows. Bin cart staging and count correction use the existing approved flows and do not change inventory until those workflows are completed.
        </span>
      </div>

      {locationSheet.error ? (
        <div className="alert">Location unavailable. The scan target could not be resolved through the current server read path.</div>
      ) : null}
      {locationSheet.isLoading ? <p className="muted">Resolving scanned location...</p> : null}

      {!locationSheet.isLoading && !locationSheet.error && !scanModel?.locationRecord ? (
        <EmptyState title="Location not found or unavailable">
          This scan target is not available through the current server read path.
        </EmptyState>
      ) : null}

      {scanModel?.locationRecord ? (
        <>
          <div className="scan-location-summary">
            <span>Level: {scanModel.locationRecord.typeLabel}</span>
            <span>Code: {scanModel.locationRecord.code || 'No display code'}</span>
            <span>Path: {scanModel.locationRecord.path || 'No path available'}</span>
            <span>UUID: {scanModel.locationRecord.id}</span>
            <span>Material rows in scope: {locationRows.length}</span>
            <span>Total quantity in scope: {totalQuantity.toFixed(2)}</span>
          </div>

          <ScanBinCartEntry
            model={scanModel}
            rows={locationRows}
            permissions={permissions}
            navigateTo={navigateTo}
          />

          <ScanBinCountEntry
            model={scanModel}
            rows={locationRows}
            permissions={permissions}
            navigateTo={navigateTo}
          />

          <ScanHierarchyNavigation model={scanModel} locationSheet={locationSheet} navigateTo={navigateTo} />

          <section className="cart-panel scan-contents-panel">
            <div className="count-section-header">
              <div>
                <p className="eyebrow">Current Contents</p>
                <h3>{getLocationRecordTitle(scanModel.locationRecord)}</h3>
              </div>
              <span>Read only</span>
            </div>

            {!locationRows.length && scanModel.scopeType !== 'bin' ? (
              <EmptyState title="No material rows under this scope">
                The scanned location resolved, but the existing read path returned no active material rows under this scope.
              </EmptyState>
            ) : null}

            <ScanScopedContents model={scanModel} rows={locationRows} navigateTo={navigateTo} />
          </section>
        </>
      ) : null}
    </article>
  );
}

async function createNativeQrDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return null;
  }

  const BarcodeDetector = window.BarcodeDetector;

  if (typeof BarcodeDetector.getSupportedFormats === 'function') {
    try {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      if (Array.isArray(supportedFormats) && !supportedFormats.includes('qr_code')) {
        return null;
      }
    } catch {
      return null;
    }
  }

  try {
    return new BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function decodeQrFromVideoFrame(video, canvasRef) {
  if (!video?.videoWidth || !video?.videoHeight) {
    return '';
  }

  const canvas = canvasRef.current ?? document.createElement('canvas');
  canvasRef.current = canvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? '';
}

function LocationScannerPanel({ permissions, navigateTo }) {
  const canReadLocations = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const locationSheet = useInventoryCountSheet({ enabled: canReadLocations });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const [manualPayload, setManualPayload] = useState('');
  const [manualLocationMatches, setManualLocationMatches] = useState([]);
  const [scannerMessage, setScannerMessage] = useState('');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [scannerMode, setScannerMode] = useState('idle');
  const [lastPayload, setLastPayload] = useState('');

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
  }, []);

  function openMatchedLocation(record) {
    if (!record?.id) return;
    setManualLocationMatches([]);
    setScannerMessage('');
    navigateTo(buildLocationScanPath(record.id));
  }

  function handlePayload(payload, { allowCodeLookup = false } = {}) {
    setLastPayload(payload);
    setManualLocationMatches([]);
    const parsed = parseLocationScanPayload(payload);
    if (!parsed.ok) {
      if (allowCodeLookup && isManualLocationCodeInput(payload)) {
        if (locationSheet.isLoading || !locationSheet.lastLoadedAt) {
          setScannerMessage('Location hierarchy is still loading. Try again in a moment.');
          return false;
        }

        if (locationSheet.error) {
          setScannerMessage('Location unavailable. The scan target could not be resolved through the current server read path.');
          return false;
        }

        const matches = getManualLocationCodeMatches(payload, locationSheet);
        if (matches.length === 1) {
          openMatchedLocation(matches[0]);
          return true;
        }

        if (matches.length > 1) {
          setManualLocationMatches(matches);
          setScannerMessage('Multiple matching locations found. Choose the correct location.');
          return false;
        }

        setScannerMessage('No matching location found.');
        return false;
      }

      setScannerMessage(parsed.error);
      return false;
    }

    setScannerMessage('');
    navigateTo(parsed.path);
    return true;
  }

  function stopCamera() {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStatus('idle');
    setScannerMode('idle');
  }

  async function startCamera() {
    if (!canReadLocations) {
      setScannerMessage('Server inventory read access is required before scanning.');
      return;
    }

    if (typeof window === 'undefined' || !window.isSecureContext) {
      setScannerMessage('Camera scanning requires HTTPS. Use manual entry in this context.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('This browser does not expose camera access. Use manual entry.');
      return;
    }

    try {
      setScannerMessage('');
      setCameraStatus('starting');
      let detector = await createNativeQrDetector();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      if (!videoRef.current) {
        throw new Error('Scanner video element is unavailable.');
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const initialMode = detector ? 'native' : 'compatibility';
      setScannerMode(initialMode);
      if (initialMode === 'compatibility') {
        setScannerMessage('Native QR scanning is unavailable in this browser. Using the compatibility camera scanner.');
      }
      setCameraStatus('scanning');

      async function detectFrame() {
        if (!videoRef.current || !streamRef.current) return;

        try {
          let rawValue = '';
          if (detector) {
            try {
              const codes = await detector.detect(videoRef.current);
              rawValue = codes.find((code) => code.rawValue)?.rawValue ?? '';
            } catch {
              detector = null;
              setScannerMode('compatibility');
              setScannerMessage('Native QR scanning stopped responding. Using the compatibility camera scanner.');
            }
          }

          if (!rawValue) {
            rawValue = decodeQrFromVideoFrame(videoRef.current, canvasRef);
          }

          if (rawValue && handlePayload(rawValue)) {
            stopCamera();
            return;
          }
        } catch {
          setScannerMessage('Camera frame could not be decoded. Manual entry is still available.');
        }

        frameRef.current = requestAnimationFrame(detectFrame);
      }

      frameRef.current = requestAnimationFrame(detectFrame);
    } catch (error) {
      console.error('QR scanner camera failed', error);
      stopCamera();
      setScannerMessage('Camera permission was denied or the camera is unavailable. Use manual entry.');
    }
  }

  function submitManualPayload(event) {
    event.preventDefault();
    handlePayload(manualPayload, { allowCodeLookup: true });
  }

  if (!canReadLocations) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Location Scanner</p>
            <h3>Scan Location QR</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>Scanner access uses the existing inventory read permission gate. QR codes do not bypass server permissions.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel scanner-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Location Scanner</p>
          <h3>Scan Location QR</h3>
          <p>Use Northgate HQ location QR codes only. Unsupported QR codes are ignored, and scanning never creates or modifies inventory.</p>
        </div>
        <span className="status-pill status-pill--good">Read only</span>
      </div>

      <div className="location-note">
        <QrCode aria-hidden="true" />
        <span>
          Scan a Northgate HQ location QR, paste a QR link, or enter a location code like <strong>C211</strong>.
        </span>
      </div>
      {cameraStatus === 'scanning' ? (
        <div className="cart-facts">
          <span>Camera mode: {scannerMode === 'native' ? 'Native scanner' : 'Compatibility scanner'}</span>
          <span>Manual entry: available</span>
          <span>Scan route: /scan/location/&lt;uuid&gt;</span>
        </div>
      ) : null}

      <div className="scanner-layout">
        <section className="scanner-camera">
          <div className="scanner-video-frame">
            <video ref={videoRef} muted playsInline />
            {cameraStatus !== 'scanning' ? (
              <div className="scanner-placeholder">
                <Camera aria-hidden="true" />
                <span>Camera scanner starts on request.</span>
              </div>
            ) : null}
          </div>
          <div className="cart-actions">
            <button type="button" className="secondary-button" onClick={startCamera} disabled={cameraStatus === 'starting' || cameraStatus === 'scanning'}>
              <Camera aria-hidden="true" /> {cameraStatus === 'starting' ? 'Starting...' : 'Start Camera'}
            </button>
            <button type="button" className="secondary-button" onClick={stopCamera} disabled={cameraStatus !== 'scanning'}>
              <CameraOff aria-hidden="true" /> Stop Camera
            </button>
          </div>
        </section>

        <section className="scanner-manual">
          <form className="scanner-manual-form" onSubmit={submitManualPayload}>
            <label>
              Manual scan payload
              <textarea
                value={manualPayload}
                onChange={(event) => {
                  setManualPayload(event.target.value);
                  setManualLocationMatches([]);
                }}
                placeholder="Paste /scan/location/<uuid>, a full QR URL, or enter C211"
                rows={5}
              />
            </label>
            <button type="submit" className="primary-button">Open Scan Result</button>
          </form>
          {manualLocationMatches.length ? (
            <div className="scan-disambiguation">
              <strong>Choose a matching location</strong>
              <div className="scan-nav-grid">
                {manualLocationMatches.map((match) => (
                  <button type="button" className="scan-nav-button" key={match.id} onClick={() => openMatchedLocation(match)}>
                    <span>{match.typeLabel}</span>
                    <strong>{getLocationDisplayCode(match)}</strong>
                    <small>{match.path || match.label || 'Matching location'}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {scannerMessage ? <div className="alert">{scannerMessage}</div> : null}
          {lastPayload ? (
            <p className="muted">Last scanned payload: {lastPayload}</p>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function formatTransactionType(type) {
  return String(type ?? 'unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatHistoryTimestamp(value) {
  return value ? new Date(value).toLocaleString() : 'No timestamp';
}

function formatHistoryQuantity(row) {
  if (row.target_quantity !== null && row.target_quantity !== undefined) {
    return `Target ${Number(row.target_quantity).toFixed(2)}`;
  }

  return `Qty ${Number(row.quantity ?? 0).toFixed(2)}`;
}

function formatDestination(row) {
  if (row.destination_label) {
    return row.destination_label;
  }

  if (!row.destination_type) {
    return 'None';
  }

  return [formatTransactionType(row.destination_type), row.destination_id].filter(Boolean).join(' / ');
}

function formatHistoryActor(row) {
  return row.actor_name || row.actor_user_id || 'Unknown';
}

function TransactionHistoryPanel({ permissions }) {
  const canReadHistory = permissions.permissionSource === 'server' && (
    permissions.canViewAllDivisions ||
    permissions.canManageInventory ||
    permissions.canInventoryTransactions
  );
  const [search, setSearch] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [limit, setLimit] = useState(50);
  const history = useInventoryTransactionHistory({
    enabled: canReadHistory,
    limit,
    transactionType,
    search,
  });

  if (!canReadHistory) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Read-only review</p>
            <h3>Recent Inventory Transactions</h3>
          </div>
          <span className="status-pill status-pill--warn">Inventory read access required</span>
        </div>
        <p>
          Transaction history follows the server-side division read rule for cross-division, own-division, or self-scoped inventory access.
        </p>
      </section>
    );
  }

  return (
    <section className="cart-panel transaction-history">
      <div className="card__header">
        <div>
          <p className="eyebrow">Read-only review</p>
          <h3>Recent Inventory Transactions</h3>
        </div>
        <button type="button" className="secondary-button" onClick={history.reload} disabled={history.isLoading}>
          {history.isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="history-toolbar">
        <label>
          Search
          <input
            type="search"
            placeholder="Material, item, or bin"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          Type
          <select value={transactionType} onChange={(event) => setTransactionType(event.target.value)}>
            {TRANSACTION_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Latest
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
          </select>
        </label>
      </div>

      {history.error ? (
        <div className="alert">Transaction history failed to load. Confirm server permissions and deployed read-rule RPC.</div>
      ) : null}
      {history.isLoading ? <p className="muted">Loading transaction history...</p> : null}

      {history.rows.length ? (
        <>
          <div className="table-wrap history-table-wrap">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Actor</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Bin</th>
                  <th>Qty / Target</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Unit Cost</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row) => (
                  <tr key={row.transaction_item_id}>
                    <td>{formatHistoryTimestamp(row.occurred_at ?? row.transaction_created_at)}</td>
                    <td>{formatHistoryActor(row)}</td>
                    <td>{formatTransactionType(row.transaction_type)}</td>
                    <td>
                      <strong>{row.item_name}</strong>
                      <span>{row.material_code}</span>
                    </td>
                    <td>{row.bin_code}</td>
                    <td>{formatHistoryQuantity(row)}</td>
                    <td>{formatDestination(row)}</td>
                    <td>{formatTransactionType(row.status)}</td>
                    <td>{Number(row.unit_cost_at_time ?? 0).toFixed(2)}</td>
                    <td>{row.note ?? 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-list history-mobile-list">
            {history.rows.map((row) => (
              <article className="mobile-item" key={row.transaction_item_id}>
                <strong>{row.item_name}</strong>
                <span>{row.material_code} / Bin {row.bin_code}</span>
                <div className="meta-grid">
                  <span>{formatHistoryTimestamp(row.occurred_at ?? row.transaction_created_at)}</span>
                  <span>Actor: {formatHistoryActor(row)}</span>
                  <span>{formatTransactionType(row.transaction_type)}</span>
                  <span>{formatHistoryQuantity(row)}</span>
                  <span>{formatDestination(row)}</span>
                  <span>Status: {formatTransactionType(row.status)}</span>
                  <span>Unit cost: {Number(row.unit_cost_at_time ?? 0).toFixed(2)}</span>
                </div>
                <p className="muted">{row.note ?? 'No note'}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title="No transaction rows">
          No inventory movement history matches the current filters.
        </EmptyState>
      )}

      <p className="build-note">
        Last loaded: {history.lastLoadedAt ? new Date(history.lastLoadedAt).toLocaleString() : 'not loaded yet'}
      </p>
    </section>
  );
}

function buildCountFilterOptions(rows, key, labelBuilder) {
  return rows
    .reduce((options, row) => {
      const value = row[key];
      if (!value || options.some((option) => option.value === value)) {
        return options;
      }
      return [...options, { value, label: labelBuilder(row) }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
}

function getCategoryLabel(row) {
  return [
    row.broad_category,
    row.sub_category,
    row.sub_category_2,
    row.sub_category_3,
    row.sub_category_4,
  ].filter(Boolean).join(' / ') || 'Uncategorized';
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  return `$${numericValue.toFixed(2)}`;
}

function formatAccountingCell(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function formatExportQuantity(row) {
  return row.rowType === 'item' ? row.quantity.toFixed(2) : '0.00';
}

function formatCsvCell(value) {
  const rawValue = String(value ?? '');
  const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename, columns, rows) {
  if (typeof window === 'undefined') return false;

  const csvRows = [
    columns.map((column) => formatCsvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => formatCsvCell(column.getValue(row))).join(',')),
  ];
  const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const csvUrl = window.URL.createObjectURL(csvBlob);
  const link = window.document.createElement('a');
  link.href = csvUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(csvUrl);
  return true;
}

function buildGrandMasterLocationContext(countSheet) {
  const unitById = new Map(countSheet.storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(countSheet.shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(countSheet.bays.map((bay) => [bay.id, bay]));

  return new Map(countSheet.bins.map((bin) => {
    const bay = bayById.get(bin.bay_id) ?? {};
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};

    return [bin.id, {
      bin_id: bin.id,
      bin_code: bin.bin_code ?? '',
      bin_label: bin.label ?? '',
      bay_id: bay.id ?? '',
      bay_code: bay.bay_code ?? '',
      bay_label: bay.label ?? '',
      shelf_id: shelf.id ?? '',
      shelf_code: shelf.shelf_code ?? '',
      shelf_label: shelf.label ?? '',
      storage_unit_id: unit.id ?? '',
      storage_unit_code: unit.unit_code ?? '',
      storage_unit_name: unit.name ?? '',
      division: unit.division ?? '',
      locationPath: [unit.unit_code, shelf.shelf_code, bay.bay_code, bin.bin_code].filter(Boolean).join(' / '),
    }];
  }));
}

function buildGrandMasterRows(countSheet) {
  const locationByBinId = buildGrandMasterLocationContext(countSheet);
  const rowCountByBinId = new Map();
  const positiveQuantityByBinId = new Map();

  countSheet.rows.forEach((row) => {
    const quantity = Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
    rowCountByBinId.set(row.bin_id, (rowCountByBinId.get(row.bin_id) ?? 0) + 1);
    if (quantity > 0) {
      positiveQuantityByBinId.set(row.bin_id, (positiveQuantityByBinId.get(row.bin_id) ?? 0) + quantity);
    }
  });

  const itemRows = countSheet.rows.map((row) => {
    const quantity = Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
    const unitCost = row.price_per_unit === null || row.price_per_unit === undefined || row.price_per_unit === ''
      ? null
      : Number(row.price_per_unit);
    const location = locationByBinId.get(row.bin_id) ?? {};
    const effectiveUnitCost = Number.isFinite(unitCost) ? unitCost : null;

    return {
      id: row.bin_item_id,
      rowType: 'item',
      stockStatus: quantity > 0 ? 'stocked' : 'empty',
      material_code: row.material_code ?? '',
      item_name: row.item_name ?? '',
      unit_of_measure: row.unit_of_measure ?? '',
      size: row.size ?? row.sub_category_4 ?? '',
      categoryLabel: getCategoryLabel(row),
      broad_category: row.broad_category ?? '',
      description: row.description ?? '',
      manufacturer_part_number: row.manufacturer_part_number ?? '',
      vendor_part_number: row.vendor_part_number ?? '',
      quantity,
      unitCost: effectiveUnitCost,
      extendedValue: effectiveUnitCost === null ? null : effectiveUnitCost * quantity,
      division: row.division ?? row.storage_unit_division ?? location.division ?? '',
      ...location,
    };
  });

  const emptyLocationRows = Array.from(locationByBinId.values())
    .filter((location) => !rowCountByBinId.has(location.bin_id))
    .map((location) => ({
      id: `empty-${location.bin_id}`,
      rowType: 'empty-location',
      stockStatus: 'empty',
      material_code: '',
      item_name: 'No stocked material',
      unit_of_measure: '',
      categoryLabel: '',
      broad_category: '',
      description: '',
      manufacturer_part_number: '',
      vendor_part_number: '',
      quantity: 0,
      unitCost: null,
      extendedValue: null,
      division: location.division ?? '',
      ...location,
    }));

  return {
    rows: [...itemRows, ...emptyLocationRows],
    positiveBinIds: new Set(positiveQuantityByBinId.keys()),
  };
}

function matchesGrandMasterSearch(row, searchText) {
  const queryTokens = tokenizeSearchText(searchText);
  if (!queryTokens.length) return true;

  const compactSearch = normalizeLocationSegment(searchText);
  const compactLocationCode = buildCompactLocationCode(row);
  const searchableValues = [
    row.material_code,
    row.item_name,
    row.categoryLabel,
    row.description,
    row.manufacturer_part_number,
    row.vendor_part_number,
    row.unit_of_measure,
    row.size,
    row.division,
    compactLocationCode,
    ...getLocationSearchValues(row),
  ];
  const tokenMatch = matchesTokenizedSearch(searchableValues, searchText);
  const compactLocationMatch = compactSearch ? compactLocationCode.startsWith(compactSearch) : false;

  return tokenMatch || compactLocationMatch;
}

function getAccountingExportColumns() {
  return [
    { label: 'Material code', getValue: (row) => row.material_code },
    { label: 'Material name', getValue: (row) => row.item_name },
    { label: 'Category', getValue: (row) => row.categoryLabel },
    { label: 'Quantity on hand', getValue: (row) => formatExportQuantity(row) },
    { label: 'Unit of measure', getValue: (row) => row.unit_of_measure },
    { label: 'Unit cost', getValue: (row) => row.unitCost === null ? '' : row.unitCost.toFixed(2) },
    { label: 'Extended value', getValue: (row) => row.extendedValue === null ? '' : row.extendedValue.toFixed(2) },
    { label: 'Division', getValue: (row) => row.division || 'Unassigned' },
    { label: 'Unit', getValue: (row) => row.storage_unit_code },
    { label: 'Shelf', getValue: (row) => row.shelf_code },
    { label: 'Bay', getValue: (row) => row.bay_code },
    { label: 'Bin', getValue: (row) => row.bin_code },
    { label: 'Compact location code', getValue: (row) => buildCompactLocationCode(row) },
    { label: 'Storage path', getValue: (row) => row.locationPath || buildStoragePath(row) },
    { label: 'Stock status', getValue: (row) => row.stockStatus },
  ];
}

const ACCOUNTING_EXPORT_VIEW_OPTIONS = [
  { value: 'detail', label: 'Detail rows', fileToken: 'detail' },
  { value: 'category', label: 'By category', fileToken: 'by-category' },
  { value: 'location', label: 'By location', fileToken: 'by-location' },
  { value: 'stockStatus', label: 'By stocked status', fileToken: 'by-stocked-status' },
  { value: 'division', label: 'By division', fileToken: 'by-division' },
];

function getAccountingExportViewOption(viewMode) {
  return ACCOUNTING_EXPORT_VIEW_OPTIONS.find((option) => option.value === viewMode) ?? ACCOUNTING_EXPORT_VIEW_OPTIONS[0];
}

function getAccountingExportGroupLabel(row, viewMode) {
  if (viewMode === 'category') return row.categoryLabel || 'Uncategorized';
  if (viewMode === 'stockStatus') return row.stockStatus === 'stocked' ? 'Stocked' : 'Empty / zero quantity';
  if (viewMode === 'division') return row.division || 'Unassigned';
  if (viewMode === 'location') {
    const compactLocation = buildCompactLocationCode(row);
    const storagePath = row.locationPath || buildStoragePath(row);
    if (compactLocation && storagePath && compactLocation !== storagePath) return `${compactLocation} / ${storagePath}`;
    return compactLocation || storagePath || 'Unassigned location';
  }
  return 'Detail rows';
}

function buildAccountingExportGroups(rows, viewMode) {
  if (viewMode === 'detail') return [];

  const groupMap = new Map();
  rows.forEach((row) => {
    const groupLabel = getAccountingExportGroupLabel(row, viewMode);
    if (!groupMap.has(groupLabel)) {
      groupMap.set(groupLabel, {
        id: `${viewMode}-${groupLabel}`,
        groupLabel,
        rowCount: 0,
        stockedRowCount: 0,
        emptyZeroRowCount: 0,
        totalQuantity: 0,
        knownInventoryValue: 0,
        valueRowCount: 0,
        rowsMissingCost: 0,
      });
    }

    const group = groupMap.get(groupLabel);
    const isItem = row.rowType === 'item';
    const quantity = isItem ? Number(row.quantity ?? 0) : 0;
    const isStocked = isItem && quantity > 0;

    group.rowCount += 1;
    if (isStocked) {
      group.stockedRowCount += 1;
      group.totalQuantity += quantity;
    } else {
      group.emptyZeroRowCount += 1;
    }

    if (isItem && row.unitCost === null) group.rowsMissingCost += 1;
    if (isItem && row.extendedValue !== null) {
      group.knownInventoryValue += Number(row.extendedValue ?? 0);
      group.valueRowCount += 1;
    }
  });

  return Array.from(groupMap.values())
    .sort((first, second) => first.groupLabel.localeCompare(second.groupLabel, undefined, { numeric: true, sensitivity: 'base' }));
}

function getAccountingExportGroupColumns() {
  return [
    { label: 'Group label', getValue: (group) => group.groupLabel },
    { label: 'Row count', getValue: (group) => group.rowCount },
    { label: 'Stocked row count', getValue: (group) => group.stockedRowCount },
    { label: 'Empty / zero row count', getValue: (group) => group.emptyZeroRowCount },
    { label: 'Total quantity', getValue: (group) => group.totalQuantity.toFixed(2) },
    { label: 'Known inventory value', getValue: (group) => group.valueRowCount ? group.knownInventoryValue.toFixed(2) : '' },
    { label: 'Rows missing cost', getValue: (group) => group.rowsMissingCost },
  ];
}

function AccountingExportPreviewPanel({ permissions }) {
  const canReadExportPreview = permissions.permissionSource === 'server';
  const countSheet = useInventoryCountSheet({ enabled: canReadExportPreview });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('detail');
  const [filters, setFilters] = useState({
    storage_unit_id: '',
    shelf_id: '',
    bay_id: '',
    bin_id: '',
    category: '',
    division: '',
    stockStatus: '',
  });
  const [csvMessage, setCsvMessage] = useState('');
  const exportModel = useMemo(() => buildGrandMasterRows(countSheet), [countSheet]);
  const rows = exportModel.rows;
  const categoryOptions = rows
    .reduce((options, row) => {
      if (!row.categoryLabel || options.some((option) => option.value === row.categoryLabel)) return options;
      return [...options, { value: row.categoryLabel, label: row.categoryLabel }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const divisionOptions = rows
    .reduce((options, row) => {
      const value = row.division || 'Unassigned';
      if (options.some((option) => option.value === value)) return options;
      return [...options, { value, label: value }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const storageUnitOptions = countSheet.storageUnits
    .map((unit) => ({
      value: unit.id,
      label: `${unit.unit_code}${unit.name ? ` / ${unit.name}` : ''}`,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const shelfOptions = countSheet.shelves
    .map((shelf) => ({ value: shelf.id, label: shelf.shelf_code || shelf.label || shelf.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const bayOptions = countSheet.bays
    .map((bay) => ({ value: bay.id, label: bay.bay_code || bay.label || bay.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const binOptions = countSheet.bins
    .map((bin) => ({ value: bin.id, label: bin.bin_code || bin.label || bin.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const filteredRows = rows.filter((row) => {
    if (filters.storage_unit_id && row.storage_unit_id !== filters.storage_unit_id) return false;
    if (filters.shelf_id && row.shelf_id !== filters.shelf_id) return false;
    if (filters.bay_id && row.bay_id !== filters.bay_id) return false;
    if (filters.bin_id && row.bin_id !== filters.bin_id) return false;
    if (filters.category && row.categoryLabel !== filters.category) return false;
    if (filters.division && (row.division || 'Unassigned') !== filters.division) return false;
    if (filters.stockStatus && row.stockStatus !== filters.stockStatus) return false;
    return matchesGrandMasterSearch(row, search);
  });
  const visibleStockedRows = filteredRows.filter((row) => row.rowType === 'item' && row.quantity > 0).length;
  const visibleEmptyOrZeroRows = filteredRows.filter((row) => row.rowType === 'empty-location' || (row.rowType === 'item' && row.quantity <= 0)).length;
  const visibleQuantity = filteredRows
    .filter((row) => row.rowType === 'item' && row.quantity > 0)
    .reduce((sum, row) => sum + row.quantity, 0);
  const visibleValueRows = filteredRows.filter((row) => row.rowType === 'item' && row.extendedValue !== null).length;
  const visibleMissingCostRows = filteredRows.filter((row) => row.rowType === 'item' && row.unitCost === null).length;
  const visibleKnownValue = filteredRows
    .filter((row) => row.rowType === 'item' && row.extendedValue !== null)
    .reduce((sum, row) => sum + row.extendedValue, 0);
  const groupedRows = buildAccountingExportGroups(filteredRows, viewMode);
  const activeView = getAccountingExportViewOption(viewMode);
  const exportColumns = getAccountingExportColumns();
  const groupColumns = getAccountingExportGroupColumns();
  const currentCsvRows = viewMode === 'detail' ? filteredRows : groupedRows;
  const currentCsvColumns = viewMode === 'detail' ? exportColumns : groupColumns;
  const currentCsvUnitLabel = viewMode === 'detail' ? 'row' : 'group';

  function clearFilters() {
    setSearch('');
    setFilters({
      storage_unit_id: '',
      shelf_id: '',
      bay_id: '',
      bin_id: '',
      category: '',
      division: '',
      stockStatus: '',
    });
    setCsvMessage('');
  }

  function downloadVisibleCsv() {
    if (!currentCsvRows.length) {
      setCsvMessage(`No visible authorized preview ${currentCsvUnitLabel}s are available to download.`);
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const didDownload = downloadCsvFile(`northgate-inventory-accounting-${activeView.fileToken}-${dateStamp}.csv`, currentCsvColumns, currentCsvRows);
    setCsvMessage(didDownload
      ? `Downloaded ${currentCsvRows.length} visible authorized preview ${currentCsvUnitLabel}${currentCsvRows.length === 1 ? '' : 's'} from ${activeView.label}.`
      : 'CSV download is unavailable in this browser context.');
  }

  function printExportPreview() {
    window.print();
  }

  if (!canReadExportPreview) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Accounting Export</p>
            <h3>Accounting Export Preview</h3>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
        <p>Accounting export preview uses the existing server-authorized inventory read path.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel accounting-export-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Accounting Export</p>
          <h3>Accounting Export Preview</h3>
          <p>
            Development preview — generated from currently authorized inventory rows. Not a finalized accounting integration.
          </p>
        </div>
        <div className="accounting-export-actions">
          <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
            {countSheet.isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="secondary-button" onClick={printExportPreview} disabled={!currentCsvRows.length}>
            Print Export Preview
          </button>
          <button type="button" className="secondary-button" onClick={downloadVisibleCsv} disabled={!currentCsvRows.length}>
            Download Current View CSV
          </button>
        </div>
      </div>

      {countSheet.error ? (
        <div className="alert">Accounting export preview failed to load through the existing authorized read path.</div>
      ) : null}
      {countSheet.isLoading ? <p className="muted">Loading accounting export preview...</p> : null}
      {csvMessage ? <p className="muted">{csvMessage}</p> : null}

      <div className="location-note">
        <span>
          Export Preview is a client-side review surface. It filters and downloads only the rows already returned to this signed-in user; it does not create backend export jobs, storage files, ledger entries, accounting approvals, or backend print exports.
        </span>
        <span>
          Grouping and totals are calculated client-side from the currently authorized inventory rows.
        </span>
      </div>

      <div className="count-grid grand-master-summary">
        <CountCard label="Visible rows" value={filteredRows.length} />
        <CountCard label="Stocked rows" value={visibleStockedRows} />
        <CountCard label="Empty / zero rows" value={visibleEmptyOrZeroRows} />
        <CountCard label="Total quantity" value={formatQuantitySummary(visibleQuantity)} />
        <CountCard label="Known inventory value" value={formatMoney(visibleValueRows ? visibleKnownValue : null)} />
        <CountCard label="Rows missing cost" value={visibleMissingCostRows} />
      </div>

      <div className="count-toolbar grand-master-toolbar">
        <label>
          Review mode
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
            {ACCOUNTING_EXPORT_VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, code, C211, bin, category, or description"
          />
        </label>
        <label>
          Unit
          <select value={filters.storage_unit_id} onChange={(event) => setFilters((current) => ({ ...current, storage_unit_id: event.target.value }))}>
            <option value="">All units</option>
            {storageUnitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Shelf
          <select value={filters.shelf_id} onChange={(event) => setFilters((current) => ({ ...current, shelf_id: event.target.value }))}>
            <option value="">All shelves</option>
            {shelfOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Bay
          <select value={filters.bay_id} onChange={(event) => setFilters((current) => ({ ...current, bay_id: event.target.value }))}>
            <option value="">All bays</option>
            {bayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Bin
          <select value={filters.bin_id} onChange={(event) => setFilters((current) => ({ ...current, bin_id: event.target.value }))}>
            <option value="">All bins</option>
            {binOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Category
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">All categories</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Division
          <select value={filters.division} onChange={(event) => setFilters((current) => ({ ...current, division: event.target.value }))}>
            <option value="">All visible divisions</option>
            {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Stock status
          <select value={filters.stockStatus} onChange={(event) => setFilters((current) => ({ ...current, stockStatus: event.target.value }))}>
            <option value="">Stocked and empty</option>
            <option value="stocked">Stocked only</option>
            <option value="empty">Empty / zero only</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="cart-facts count-summary">
        <span>Authorized source rows: {countSheet.rows.length}</span>
        <span>Preview rows: {rows.length}</span>
        <span>Current view: {activeView.label}</span>
        <span>{viewMode === 'detail' ? 'Visible detail rows' : 'Visible groups'}: {currentCsvRows.length}</span>
        <span>Last updated: {countSheet.lastLoadedAt ? new Date(countSheet.lastLoadedAt).toLocaleString() : 'not loaded yet'}</span>
        <span>CSV source: current visible {viewMode === 'detail' ? 'preview rows' : 'grouped summary rows'} only</span>
        <span>Build marker: {DEVELOPMENT_STATUS.buildMarker}</span>
        <span>Print export: current Accounting Export view only</span>
        <span>Cost visibility: authorized inventory row scope</span>
        <span>Backend export jobs: none</span>
      </div>

      {currentCsvRows.length ? (
        viewMode === 'detail' ? (
          <>
          <div className="table-wrap accounting-export-table-wrap">
            <table className="data-table accounting-export-table">
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Ext. Value</th>
                  <th>Division</th>
                  <th>Unit</th>
                  <th>Shelf</th>
                  <th>Bay</th>
                  <th>Bin</th>
                  <th>Storage Path / Compact Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatAccountingCell(row.material_code)}</td>
                    <td>{formatAccountingCell(row.item_name)}</td>
                    <td>{formatAccountingCell(row.categoryLabel)}</td>
                    <td>{row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '0.00'}</td>
                    <td>{formatMoney(row.unitCost)}</td>
                    <td>{formatMoney(row.extendedValue)}</td>
                    <td>{row.division || 'Unassigned'}</td>
                    <td>{formatAccountingCell(row.storage_unit_code)}</td>
                    <td>{formatAccountingCell(row.shelf_code)}</td>
                    <td>{formatAccountingCell(row.bay_code)}</td>
                    <td>{formatAccountingCell(row.bin_code)}</td>
                    <td>
                      <strong>{buildCompactLocationCode(row) || '-'}</strong>
                      <span>{row.locationPath || buildStoragePath(row) || '-'}</span>
                    </td>
                    <td>
                      <span className={row.stockStatus === 'stocked' ? 'status-pill status-pill--good' : 'status-pill'}>
                        {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-list accounting-export-mobile-list">
            {filteredRows.map((row) => (
              <article className="mobile-item" key={row.id}>
                <strong>{row.item_name}</strong>
                <span>{row.material_code || 'No material code'} / {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}</span>
                <div className="meta-grid">
                  <span>Category: {row.categoryLabel || '-'}</span>
                  <span>Qty: {row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '0.00'}</span>
                  <span>Unit cost: {formatMoney(row.unitCost)}</span>
                  <span>Value: {formatMoney(row.extendedValue)}</span>
                  <span>Division: {row.division || 'Unassigned'}</span>
                  <span>Unit: {formatAccountingCell(row.storage_unit_code)}</span>
                  <span>Shelf: {formatAccountingCell(row.shelf_code)}</span>
                  <span>Bay: {formatAccountingCell(row.bay_code)}</span>
                  <span>Bin: {formatAccountingCell(row.bin_code)}</span>
                  <span>Location: {buildCompactLocationCode(row) || row.locationPath || '-'}</span>
                </div>
              </article>
            ))}
          </div>
          </>
        ) : (
          <>
            <div className="table-wrap accounting-export-table-wrap">
              <table className="data-table accounting-export-group-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Rows</th>
                    <th>Stocked Rows</th>
                    <th>Empty / Zero Rows</th>
                    <th>Total Quantity</th>
                    <th>Known Inventory Value</th>
                    <th>Rows Missing Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((group) => (
                    <tr key={group.id}>
                      <td>{group.groupLabel}</td>
                      <td>{group.rowCount}</td>
                      <td>{group.stockedRowCount}</td>
                      <td>{group.emptyZeroRowCount}</td>
                      <td>{formatQuantitySummary(group.totalQuantity)}</td>
                      <td>{formatMoney(group.valueRowCount ? group.knownInventoryValue : null)}</td>
                      <td>{group.rowsMissingCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-list accounting-export-mobile-list">
              {groupedRows.map((group) => (
                <article className="mobile-item" key={group.id}>
                  <strong>{group.groupLabel}</strong>
                  <span>{group.rowCount} row{group.rowCount === 1 ? '' : 's'} / {group.stockedRowCount} stocked</span>
                  <div className="meta-grid">
                    <span>Empty / zero: {group.emptyZeroRowCount}</span>
                    <span>Total quantity: {formatQuantitySummary(group.totalQuantity)}</span>
                    <span>Known value: {formatMoney(group.valueRowCount ? group.knownInventoryValue : null)}</span>
                    <span>Missing cost: {group.rowsMissingCost}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )
      ) : (
        <EmptyState title="No export preview rows match">
          No authorized inventory rows, empty locations, or grouped summary rows match the current export preview filters.
        </EmptyState>
      )}
      <AccountingExportPrintSheet
        viewLabel={activeView.label}
        viewMode={viewMode}
        detailRows={filteredRows}
        groupedRows={groupedRows}
      />
    </section>
  );
}

function AccountingExportPrintSheet({ viewLabel, viewMode, detailRows, groupedRows }) {
  const rows = viewMode === 'detail' ? detailRows : groupedRows;
  const unitLabel = viewMode === 'detail' ? 'detail row' : 'group';

  return (
    <section className="accounting-export-print-sheet" aria-label="Printable accounting export preview">
      <div className="accounting-export-print-header">
        <h1>Northgate HQ - Accounting Export Preview</h1>
        <div>
          <span>Printed: {new Date().toLocaleString()}</span>
          <span>Current view: {viewLabel}</span>
          <span>{rows.length} {unitLabel}{rows.length === 1 ? '' : 's'}</span>
        </div>
        <p>Development preview - generated from currently authorized inventory rows. Not a finalized accounting integration.</p>
      </div>

      {viewMode === 'detail' ? (
        <table className="accounting-export-print-table">
          <thead>
            <tr>
              <th>Material Code</th>
              <th>Material Name</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Ext. Value</th>
              <th>Division</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row) => (
              <tr key={row.id}>
                <td>{formatAccountingCell(row.material_code)}</td>
                <td>{formatAccountingCell(row.item_name)}</td>
                <td>{formatAccountingCell(row.categoryLabel)}</td>
                <td>{row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '0.00'}</td>
                <td>{formatMoney(row.unitCost)}</td>
                <td>{formatMoney(row.extendedValue)}</td>
                <td>{row.division || 'Unassigned'}</td>
                <td>
                  <strong>{buildCompactLocationCode(row) || '-'}</strong>
                  <span>{row.locationPath || buildStoragePath(row) || '-'}</span>
                </td>
                <td>{row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="accounting-export-print-table accounting-export-print-table--grouped">
          <thead>
            <tr>
              <th>Group</th>
              <th>Rows</th>
              <th>Stocked Rows</th>
              <th>Empty / Zero Rows</th>
              <th>Total Qty</th>
              <th>Known Value</th>
              <th>Rows Missing Cost</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((group) => (
              <tr key={group.id}>
                <td>{group.groupLabel}</td>
                <td>{group.rowCount}</td>
                <td>{group.stockedRowCount}</td>
                <td>{group.emptyZeroRowCount}</td>
                <td>{formatQuantitySummary(group.totalQuantity)}</td>
                <td>{formatMoney(group.valueRowCount ? group.knownInventoryValue : null)}</td>
                <td>{group.rowsMissingCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CountPrintSheet({ rows, countDrafts, filterSummary = [] }) {
  return (
    <section className="count-print-sheet" aria-label="Printable inventory count sheet">
      <div className="count-print-header">
        <h1>Northgate HQ - Inventory Count Sheet</h1>
        <div>
          <span>Printed: {new Date().toLocaleString()}</span>
          <span>Rows: {rows.length}</span>
        </div>
        {filterSummary.length ? (
          <p>{filterSummary.join(' | ')}</p>
        ) : (
          <p>Filters: All visible count rows</p>
        )}
      </div>

      <table className="count-print-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Shelf</th>
            <th>Bay</th>
            <th>Bin</th>
            <th>Material Code</th>
            <th>Material Name / Description</th>
            <th>System Qty</th>
            <th>Counted Qty</th>
            <th>Variance</th>
            <th>Notes / Initials</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const draft = countDrafts[row.bin_item_id] ?? { countedQuantity: '' };
            const countedQuantity = Number(draft.countedQuantity);
            const hasCount = draft.countedQuantity !== '' && Number.isFinite(countedQuantity);
            const systemQuantity = Number(row.system_quantity ?? 0);
            const variance = hasCount ? countedQuantity - systemQuantity : null;

            return (
              <tr key={row.bin_item_id}>
                <td>{row.storage_unit_code || '-'}</td>
                <td>{row.shelf_code || '-'}</td>
                <td>{row.bay_code || '-'}</td>
                <td>{row.bin_code || '-'}</td>
                <td>{row.material_code || '-'}</td>
                <td>
                  <strong>{row.item_name || '-'}</strong>
                  <span>{getCategoryLabel(row)}</span>
                </td>
                <td>{systemQuantity.toFixed(2)} {row.unit_of_measure ?? ''}</td>
                <td>{hasCount ? countedQuantity.toFixed(2) : ''}</td>
                <td>{variance === null ? '' : variance.toFixed(2)}</td>
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function CountHistoryForItem({ row, permissions }) {
  const isDeveloper = permissions.permissionSource === 'server' && permissions.role === 'Developer';
  const history = useInventoryTransactionHistory({
    enabled: Boolean(row && isDeveloper),
    limit: 25,
    transactionType: 'physical_count_correction',
    search: row?.material_code ?? '',
  });
  const matchingRows = history.rows.filter((historyRow) => historyRow.bin_item_id === row?.bin_item_id);

  if (!row) {
    return (
      <section className="cart-panel count-history-panel">
        <h3>Count History</h3>
        <p className="muted">Select a bin/material row to review its count corrections.</p>
      </section>
    );
  }

  if (!isDeveloper) {
    return (
      <section className="cart-panel cart-panel--locked count-history-panel">
        <h3>Count History</h3>
        <p>Count history uses the existing transaction-history read path and remains Developer-only.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel count-history-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Existing history read</p>
          <h3>Count History</h3>
        </div>
        <button type="button" className="secondary-button" onClick={history.reload} disabled={history.isLoading}>
          {history.isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <p className="muted">
        {row.material_code} / {row.item_name} / Bin {row.bin_code}
      </p>
      {history.error ? <div className="alert">Count history failed to load through the existing history RPC.</div> : null}
      {history.isLoading ? <p className="muted">Loading count history...</p> : null}
      {matchingRows.length ? (
        <div className="count-history-list">
          {matchingRows.map((historyRow) => (
            <article className="count-history-item" key={historyRow.transaction_item_id}>
              <strong>{formatHistoryTimestamp(historyRow.occurred_at ?? historyRow.transaction_created_at)}</strong>
              <span>Target: {Number(historyRow.target_quantity ?? 0).toFixed(2)}</span>
              <span>Actor: {formatHistoryActor(historyRow)}</span>
              <span>{historyRow.note ?? 'No note'}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No count corrections returned for this bin/material in the latest history window.</p>
      )}
    </section>
  );
}

function InventoryCountCorrectionPanel({ permissions }) {
  const canReadCounts = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const countSheet = useInventoryCountSheet({ enabled: canReadCounts });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    storage_unit_id: '',
    shelf_id: '',
    bay_id: '',
    bin_id: '',
    category: '',
  });
  const [reviewRepeats, setReviewRepeats] = useState(false);
  const [countDrafts, setCountDrafts] = useState({});
  const [selectedHistoryBinItemId, setSelectedHistoryBinItemId] = useState('');
  const normalizedSearch = normalizeSearchText(search);
  const categoryOptions = countSheet.rows
    .reduce((options, row) => {
      const label = getCategoryLabel(row);
      if (options.some((option) => option.value === label)) {
        return options;
      }
      return [...options, { value: label, label }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const storageUnitOptions = buildCountFilterOptions(
    countSheet.rows,
    'storage_unit_id',
    (row) => `${row.storage_unit_code}${row.storage_unit_name ? ` / ${row.storage_unit_name}` : ''}`,
  );
  const shelfOptions = buildCountFilterOptions(countSheet.rows, 'shelf_id', (row) => row.shelf_code);
  const bayOptions = buildCountFilterOptions(countSheet.rows, 'bay_id', (row) => row.bay_code);
  const binOptions = buildCountFilterOptions(countSheet.rows, 'bin_id', (row) => row.bin_code);
  const repeatReview = useMemo(() => buildRepeatReview(countSheet.rows), [countSheet.rows]);
  const baseFilteredRows = countSheet.rows.filter((row) => {
    if (filters.storage_unit_id && row.storage_unit_id !== filters.storage_unit_id) return false;
    if (filters.shelf_id && row.shelf_id !== filters.shelf_id) return false;
    if (filters.bay_id && row.bay_id !== filters.bay_id) return false;
    if (filters.bin_id && row.bin_id !== filters.bin_id) return false;
    if (filters.category && getCategoryLabel(row) !== filters.category) return false;
    return matchesCountRowSearch(row, normalizedSearch);
  });
  const filteredRows = reviewRepeats
    ? baseFilteredRows.filter((row) => repeatReview.rowMatchesById.has(row.bin_item_id))
    : baseFilteredRows;
  const visibleRepeatGroups = reviewRepeats
    ? repeatReview.groups.filter((group) => group.rows.some((row) => filteredRows.some((visibleRow) => visibleRow.bin_item_id === row.bin_item_id)))
    : [];
  const selectedHistoryRow = countSheet.rows.find((row) => row.bin_item_id === selectedHistoryBinItemId) ?? null;
  const countPrintFilterSummary = [
    search.trim() ? `Search: ${search.trim()}` : null,
    filters.storage_unit_id ? `Unit: ${storageUnitOptions.find((option) => option.value === filters.storage_unit_id)?.label ?? filters.storage_unit_id}` : null,
    filters.shelf_id ? `Shelf: ${shelfOptions.find((option) => option.value === filters.shelf_id)?.label ?? filters.shelf_id}` : null,
    filters.bay_id ? `Bay: ${bayOptions.find((option) => option.value === filters.bay_id)?.label ?? filters.bay_id}` : null,
    filters.bin_id ? `Bin: ${binOptions.find((option) => option.value === filters.bin_id)?.label ?? filters.bin_id}` : null,
    filters.category ? `Category: ${filters.category}` : null,
    reviewRepeats ? 'Review Repeats: on' : null,
  ].filter(Boolean);

  function getCountDraft(row) {
    return countDrafts[row.bin_item_id] ?? { countedQuantity: '' };
  }

  function updateCountDraft(binItemId, updates) {
    setCountDrafts((current) => ({
      ...current,
      [binItemId]: {
        countedQuantity: '',
        ...(current[binItemId] ?? {}),
        ...updates,
      },
    }));
  }

  function clearFilters() {
    setSearch('');
    setFilters({
      storage_unit_id: '',
      shelf_id: '',
      bay_id: '',
      bin_id: '',
      category: '',
    });
  }

  function printCountSheet() {
    window.print();
  }

  if (!canReadCounts) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Physical storage bins</p>
            <h3>Inventory Count & Correction</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>This count screen is available only when server permissions include inventory management.</p>
      </section>
    );
  }

  return (
    <div className="count-workspace">
      <section className="cart-panel count-workspace__main">
        <div className="card__header">
          <div>
            <p className="eyebrow">Physical storage bins</p>
            <h3>Inventory Count & Correction</h3>
          </div>
          <span className="status-pill status-pill--warn">Read only</span>
        </div>

        <div className="count-toolbar">
          <label>
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Material, C111, bin, shelf, bay, or unit"
            />
          </label>
          <label>
            Storage unit
            <select value={filters.storage_unit_id} onChange={(event) => setFilters((current) => ({ ...current, storage_unit_id: event.target.value }))}>
              <option value="">All units</option>
              {storageUnitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Shelf
            <select value={filters.shelf_id} onChange={(event) => setFilters((current) => ({ ...current, shelf_id: event.target.value }))}>
              <option value="">All shelves</option>
              {shelfOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Bay
            <select value={filters.bay_id} onChange={(event) => setFilters((current) => ({ ...current, bay_id: event.target.value }))}>
              <option value="">All bays</option>
              {bayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Bin
            <select value={filters.bin_id} onChange={(event) => setFilters((current) => ({ ...current, bin_id: event.target.value }))}>
              <option value="">All bins</option>
              {binOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Category
            <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">All categories</option>
              {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="count-toggle">
            <input
              type="checkbox"
              checked={reviewRepeats}
              onChange={(event) => setReviewRepeats(event.target.checked)}
            />
            <span>Review Repeats</span>
          </label>
          <button type="button" className="secondary-button" onClick={clearFilters}>Clear Filters</button>
          <button type="button" className="secondary-button" onClick={printCountSheet}>Print Count Sheet</button>
        </div>

        {countSheet.error ? <div className="alert">Inventory count list failed to load. Confirm can_manage_inventory and existing inventory read access.</div> : null}
        {countSheet.isLoading ? <p className="muted">Loading count sheet...</p> : null}

        <div className="cart-facts count-summary">
          <span>Loaded rows: {countSheet.rows.length}</span>
          <span>Visible rows: {filteredRows.length}</span>
          {reviewRepeats ? <span>Repeat rows: {filteredRows.length} / {repeatReview.repeatedRowCount}</span> : null}
          <span>Correction writes: Deferred</span>
          <span>Last loaded: {countSheet.lastLoadedAt ? new Date(countSheet.lastLoadedAt).toLocaleString() : 'not loaded yet'}</span>
        </div>

        {reviewRepeats ? (
          <div className="repeat-review-panel">
            <div>
              <strong>Review Repeats</strong>
              <span>{visibleRepeatGroups.length} repeated field groups in the current view.</span>
            </div>
            {visibleRepeatGroups.length ? (
              <div className="repeat-chip-list repeat-chip-list--summary">
                {visibleRepeatGroups.slice(0, 10).map((group) => (
                  <span className="repeat-chip" key={group.key}>
                    {group.fieldLabel}: {group.value} ({group.rowIds.size})
                  </span>
                ))}
                {visibleRepeatGroups.length > 10 ? <span className="repeat-chip">+{visibleRepeatGroups.length - 10} more</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {filteredRows.length ? (
          <>
            <div className="table-wrap count-table-wrap">
              <table className="data-table count-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Physical Location</th>
                    <th>System Quantity</th>
                    <th>Counted Quantity</th>
                    <th>Variance</th>
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const draft = getCountDraft(row);
                    const countedQuantity = Number(draft.countedQuantity);
                    const hasCount = draft.countedQuantity !== '' && Number.isFinite(countedQuantity);
                    const systemQuantity = Number(row.system_quantity ?? 0);
                    const variance = hasCount ? countedQuantity - systemQuantity : null;

                    return (
                      <tr key={row.bin_item_id}>
                        <td>
                          <strong>{row.item_name}</strong>
                          <span>{row.material_code}</span>
                          <span>{getCategoryLabel(row)}</span>
                          {reviewRepeats ? <RepeatMatchChips matches={repeatReview.rowMatchesById.get(row.bin_item_id)} /> : null}
                        </td>
                        <td>
                          <strong>{row.bin_code}</strong>
                          <span>{row.storage_unit_code} / {row.shelf_code} / {row.bay_code} / {row.bin_code}</span>
                        </td>
                        <td>{systemQuantity.toFixed(2)} {row.unit_of_measure ?? ''}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draft.countedQuantity}
                            onChange={(event) => updateCountDraft(row.bin_item_id, { countedQuantity: event.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td className={variance === null ? '' : variance === 0 ? 'variance-neutral' : variance > 0 ? 'variance-positive' : 'variance-negative'}>
                          {variance === null ? '—' : variance.toFixed(2)}
                        </td>
                        <td>
                          <button type="button" className="secondary-button" onClick={() => setSelectedHistoryBinItemId(row.bin_item_id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-list count-mobile-list">
              {filteredRows.map((row) => {
                const draft = getCountDraft(row);
                const countedQuantity = Number(draft.countedQuantity);
                const hasCount = draft.countedQuantity !== '' && Number.isFinite(countedQuantity);
                const systemQuantity = Number(row.system_quantity ?? 0);
                const variance = hasCount ? countedQuantity - systemQuantity : null;

                return (
                  <article className="mobile-item count-mobile-item" key={row.bin_item_id}>
                    <strong>{row.item_name}</strong>
                    <span>{row.material_code} / Bin {row.bin_code}</span>
                    <div className="meta-grid">
                      <span>{row.storage_unit_code} / {row.shelf_code} / {row.bay_code} / {row.bin_code}</span>
                      <span>System Quantity: {systemQuantity.toFixed(2)} {row.unit_of_measure ?? ''}</span>
                      <span>Variance: {variance === null ? '—' : variance.toFixed(2)}</span>
                      <span>{getCategoryLabel(row)}</span>
                    </div>
                    {reviewRepeats ? <RepeatMatchChips matches={repeatReview.rowMatchesById.get(row.bin_item_id)} /> : null}
                    <label>
                      Counted Quantity
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.countedQuantity}
                        onChange={(event) => updateCountDraft(row.bin_item_id, { countedQuantity: event.target.value })}
                        placeholder="0"
                      />
                    </label>
                    <div className="cart-actions">
                      <button type="button" className="secondary-button" onClick={() => setSelectedHistoryBinItemId(row.bin_item_id)}>
                        View History
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState title="No count rows">
            No physical bin/material rows match the current count filters.
          </EmptyState>
        )}
      </section>

      <CountHistoryForItem row={selectedHistoryRow} permissions={permissions} />
      <CountPrintSheet rows={filteredRows} countDrafts={countDrafts} filterSummary={countPrintFilterSummary} />
    </div>
  );
}

function InventoryCountIntakePanel({ permissions, scanCountContext = null }) {
  const canReadCounts = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const canWriteCounts = canReadCounts && isDeveloperOrAdminRole(permissions.role);
  const canRetireBinItems = canReadCounts && isDeveloperOrAdminRole(permissions.role) && permissions.canArchiveRecords;
  const countSheet = useInventoryCountSheet({ enabled: canReadCounts });
  const intake = useInventoryCountIntake();
  const retirement = useBinItemRetirement();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    storage_unit_id: '',
    shelf_id: '',
    bay_id: '',
    bin_id: '',
    category: '',
  });
  const [reviewRepeats, setReviewRepeats] = useState(false);
  const [countDrafts, setCountDrafts] = useState({});
  const [rowMessages, setRowMessages] = useState({});
  const [selectedHistoryBinItemId, setSelectedHistoryBinItemId] = useState('');
  const [retirementDraft, setRetirementDraft] = useState({
    binItemId: '',
    reason: '',
  });
  const [newItemSearch, setNewItemSearch] = useState('');
  const [newItemDraft, setNewItemDraft] = useState({
    item_id: '',
    countedQuantity: '',
    reason: 'initial shelf count',
    customReason: '',
  });
  const [scanBinFilter, setScanBinFilter] = useState(scanCountContext?.binId ? scanCountContext : null);
  const normalizedSearch = normalizeSearchText(search);
  const normalizedNewItemSearch = newItemSearch.trim().toLowerCase();
  const selectedUnit = countSheet.storageUnits.find((unit) => unit.id === filters.storage_unit_id) ?? null;
  const selectedShelf = countSheet.shelves.find((shelf) => shelf.id === filters.shelf_id) ?? null;
  const selectedBay = countSheet.bays.find((bay) => bay.id === filters.bay_id) ?? null;
  const selectedBin = countSheet.bins.find((bin) => bin.id === filters.bin_id) ?? null;
  const selectedPathSegments = [
    selectedUnit ? { label: 'Unit', value: selectedUnit.unit_code, detail: selectedUnit.name } : null,
    selectedShelf ? { label: 'Shelf', value: selectedShelf.shelf_code, detail: selectedShelf.label } : null,
    selectedBay ? { label: 'Bay', value: selectedBay.bay_code, detail: selectedBay.label } : null,
    selectedBin ? { label: 'Bin', value: selectedBin.bin_code, detail: selectedBin.label } : null,
  ].filter(Boolean);
  const selectedPathLabel = selectedPathSegments.map((segment) => segment.value).join(' / ');
  const shelvesForUnit = filters.storage_unit_id
    ? countSheet.shelves.filter((shelf) => shelf.unit_id === filters.storage_unit_id)
    : [];
  const baysForShelf = filters.shelf_id
    ? countSheet.bays.filter((bay) => bay.shelf_id === filters.shelf_id)
    : [];
  const binsForBay = filters.bay_id
    ? countSheet.bins.filter((bin) => bin.bay_id === filters.bay_id)
    : [];
  const categoryOptions = countSheet.rows
    .reduce((options, row) => {
      const label = getCategoryLabel(row);
      if (options.some((option) => option.value === label)) return options;
      return [...options, { value: label, label }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const repeatReview = useMemo(() => buildRepeatReview(countSheet.rows), [countSheet.rows]);
  const baseFilteredRows = countSheet.rows.filter((row) => {
    if (scanBinFilter?.binId && row.bin_id !== scanBinFilter.binId) return false;
    if (filters.storage_unit_id && row.storage_unit_id !== filters.storage_unit_id) return false;
    if (filters.shelf_id && row.shelf_id !== filters.shelf_id) return false;
    if (filters.bay_id && row.bay_id !== filters.bay_id) return false;
    if (filters.bin_id && row.bin_id !== filters.bin_id) return false;
    if (filters.category && getCategoryLabel(row) !== filters.category) return false;
    return matchesCountRowSearch(row, normalizedSearch);
  });
  const filteredRows = reviewRepeats
    ? baseFilteredRows.filter((row) => repeatReview.rowMatchesById.has(row.bin_item_id))
    : baseFilteredRows;
  const visibleRepeatGroups = reviewRepeats
    ? repeatReview.groups.filter((group) => group.rows.some((row) => filteredRows.some((visibleRow) => visibleRow.bin_item_id === row.bin_item_id)))
    : [];
  const rowsForSelectedBin = filters.bin_id
    ? countSheet.rows.filter((row) => row.bin_id === filters.bin_id)
    : [];
  const countPrintFilterSummary = [
    scanBinFilter ? `Scanned bin: ${scanBinFilter.binCode || scanBinFilter.binId}` : null,
    selectedPathLabel ? `Selected path: ${selectedPathLabel}` : null,
    search.trim() ? `Search: ${search.trim()}` : null,
    filters.category ? `Category: ${filters.category}` : null,
    reviewRepeats ? 'Review Repeats: on' : null,
  ].filter(Boolean);
  const existingItemIdsInSelectedBin = new Set(rowsForSelectedBin.map((row) => row.item_id));
  const catalogOptions = countSheet.catalogItems
    .filter((item) => !existingItemIdsInSelectedBin.has(item.id))
    .filter((item) => {
      if (!normalizedNewItemSearch) return true;
      return [
        item.material_code,
        item.name,
        item.broad_category,
        item.sub_category,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalizedNewItemSearch));
    })
    .slice(0, 80);
  const selectedHistoryRow = countSheet.rows.find((row) => row.bin_item_id === selectedHistoryBinItemId) ?? null;

  useEffect(() => {
    if (scanCountContext?.binId) {
      setScanBinFilter(scanCountContext);
      setSearch('');
      setNewItemSearch('');
    }
  }, [scanCountContext?.binId, scanCountContext?.binCode]);

  useEffect(() => {
    if (!scanBinFilter?.binId) {
      return;
    }

    const nextPath = getCountPathFiltersForBin(scanBinFilter.binId, countSheet);
    if (!nextPath) {
      return;
    }

    setFilters((current) => ({
      ...current,
      ...nextPath,
      category: '',
    }));
  }, [scanBinFilter?.binId, countSheet.bins, countSheet.bays, countSheet.shelves, countSheet.storageUnits]);

  function getCountDraft(row) {
    return countDrafts[row.bin_item_id] ?? {
      countedQuantity: '',
      reason: 'cycle count',
      customReason: '',
    };
  }

  function updateCountDraft(binItemId, updates) {
    setCountDrafts((current) => ({
      ...current,
      [binItemId]: {
        countedQuantity: '',
        reason: 'cycle count',
        customReason: '',
        ...(current[binItemId] ?? {}),
        ...updates,
      },
    }));
    setRowMessages((current) => ({ ...current, [binItemId]: null }));
  }

  function resolveReason(draft) {
    return draft.reason === 'custom' ? draft.customReason.trim() : draft.reason;
  }

  function isDraftReady(draft) {
    const countedQuantity = Number(draft.countedQuantity);
    return (
      draft.countedQuantity !== '' &&
      Number.isFinite(countedQuantity) &&
      countedQuantity >= 0 &&
      resolveReason(draft).length > 0
    );
  }

  function setPath(nextFilters) {
    setFilters((current) => ({
      ...current,
      ...nextFilters,
    }));
  }

  function clearFilters() {
    setSearch('');
    setNewItemSearch('');
    setNewItemDraft({
      item_id: '',
      countedQuantity: '',
      reason: 'initial shelf count',
      customReason: '',
    });
    setFilters({
      storage_unit_id: '',
      shelf_id: '',
      bay_id: '',
      bin_id: '',
      category: '',
    });
  }

  function clearScanBinFilter() {
    setScanBinFilter(null);
    clearFilters();
  }

  function printCountSheet() {
    window.print();
  }

  async function recordExistingCount(row) {
    const draft = getCountDraft(row);
    if (!canWriteCounts || !isDraftReady(draft)) {
      setRowMessages((current) => ({
        ...current,
        [row.bin_item_id]: { type: 'error', text: 'Developer/Admin role, count, and reason are required.' },
      }));
      return;
    }

    const result = await intake.recordCount({
      binId: row.bin_id,
      itemId: row.item_id,
      countedQuantity: Number(draft.countedQuantity),
      reason: resolveReason(draft),
    });

    if (!result) {
      setRowMessages((current) => ({
        ...current,
        [row.bin_item_id]: { type: 'error', text: 'Count intake failed. Check role and server validation.' },
      }));
      return;
    }

    setRowMessages((current) => ({
      ...current,
      [row.bin_item_id]: {
        type: 'success',
        text: `Recorded ${Number(result.counted_quantity ?? 0).toFixed(2)}. Variance ${Number(result.variance ?? 0).toFixed(2)}.`,
      },
    }));
    setCountDrafts((current) => ({
      ...current,
      [row.bin_item_id]: {
        countedQuantity: '',
        reason: 'cycle count',
        customReason: '',
      },
    }));
    setSelectedHistoryBinItemId(result.bin_item_id);
    countSheet.reload();
  }

  async function recordNewItemCount() {
    if (!selectedBin || !canWriteCounts || !newItemDraft.item_id || !isDraftReady(newItemDraft)) {
      setRowMessages((current) => ({
        ...current,
        new: { type: 'error', text: 'Select a bin, catalog item, count, and reason with Developer/Admin role.' },
      }));
      return;
    }

    const result = await intake.recordCount({
      binId: selectedBin.id,
      itemId: newItemDraft.item_id,
      countedQuantity: Number(newItemDraft.countedQuantity),
      reason: resolveReason(newItemDraft),
    });

    if (!result) {
      setRowMessages((current) => ({
        ...current,
        new: { type: 'error', text: 'Count intake failed. Check role and server validation.' },
      }));
      return;
    }

    setRowMessages((current) => ({
      ...current,
      new: {
        type: 'success',
        text: `Recorded catalog item in bin. Variance ${Number(result.variance ?? 0).toFixed(2)}.`,
      },
    }));
    setNewItemDraft({
      item_id: '',
      countedQuantity: '',
      reason: 'initial shelf count',
      customReason: '',
    });
    setSelectedHistoryBinItemId(result.bin_item_id);
    countSheet.reload();
  }

  function startRetirement(row) {
    const systemQuantity = Number(row.system_quantity ?? 0);

    if (!canRetireBinItems) {
      setRowMessages((current) => ({
        ...current,
        [row.bin_item_id]: { type: 'error', text: 'Developer/Admin role and can_archive_records are required.' },
      }));
      return;
    }

    if (systemQuantity !== 0) {
      setRowMessages((current) => ({
        ...current,
        [row.bin_item_id]: { type: 'error', text: 'Record a zero physical count before retiring this material from the bin.' },
      }));
      return;
    }

    setRetirementDraft({
      binItemId: row.bin_item_id,
      reason: '',
    });
    setRowMessages((current) => ({ ...current, [row.bin_item_id]: null }));
  }

  function cancelRetirement() {
    setRetirementDraft({
      binItemId: '',
      reason: '',
    });
  }

  async function confirmRetirement(row) {
    const reason = retirementDraft.reason.trim();

    if (!canRetireBinItems || retirementDraft.binItemId !== row.bin_item_id || !reason) {
      setRowMessages((current) => ({
        ...current,
        [row.bin_item_id]: { type: 'error', text: 'A retirement reason is required.' },
      }));
      return;
    }

    const result = await retirement.retireBinItem({
      binItemId: row.bin_item_id,
      reason,
    });

    if (!result) {
      const message = retirement.error?.message?.includes('balance is')
        ? 'Record a zero physical count before retiring this material from the bin.'
        : 'Retirement failed. Confirm permissions, zero balance, and deployed RPC.';
      setRowMessages((current) => ({
        ...current,
        [row.bin_item_id]: { type: 'error', text: message },
      }));
      return;
    }

    setRowMessages((current) => ({
      ...current,
      [row.bin_item_id]: { type: 'success', text: 'Material retired from active bin views. History is preserved.' },
    }));
    setRetirementDraft({
      binItemId: '',
      reason: '',
    });
    setSelectedHistoryBinItemId('');
    countSheet.reload();
  }

  function renderReasonControls(draft, onChange) {
    return (
      <>
        <select value={draft.reason} onChange={(event) => onChange({ reason: event.target.value })}>
          {COUNT_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {draft.reason === 'custom' ? (
          <input
            type="text"
            value={draft.customReason}
            onChange={(event) => onChange({ customReason: event.target.value })}
            placeholder="Required note"
          />
        ) : null}
      </>
    );
  }

  if (!canReadCounts) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Physical storage bins</p>
            <h3>Inventory Count Intake</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>This count screen is available only when server permissions include inventory management.</p>
      </section>
    );
  }

  return (
    <div className="count-workspace">
      <section className="cart-panel count-workspace__main">
        <div className="card__header">
          <div>
            <p className="eyebrow">Physical storage bins</p>
            <h3>Inventory Count Intake</h3>
          </div>
          <span className={`status-pill ${canWriteCounts ? 'status-pill--good' : 'status-pill--warn'}`}>
            {canWriteCounts ? 'Developer/Admin intake' : 'Read only'}
          </span>
        </div>

        {scanBinFilter ? (
          <div className="scan-count-context-panel">
            <div>
              <p className="eyebrow">Scanned bin</p>
              <h3>{selectedPathLabel || scanBinFilter.binCode || scanBinFilter.binId}</h3>
              <p>Uses the existing Inventory Count & Correction flow. Inventory is not changed until the count correction is submitted through the approved path.</p>
            </div>
            <button type="button" className="secondary-button" onClick={clearScanBinFilter}>
              Show all count rows
            </button>
          </div>
        ) : null}

        <div className="count-toolbar count-path-toolbar">
          <label>
            Storage unit
            <select
              value={filters.storage_unit_id}
              onChange={(event) => setPath({
                storage_unit_id: event.target.value,
                shelf_id: '',
                bay_id: '',
                bin_id: '',
              })}
            >
              <option value="">Select unit</option>
              {countSheet.storageUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.unit_code}{unit.name ? ` / ${unit.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Shelf
            <select
              value={filters.shelf_id}
              onChange={(event) => setPath({ shelf_id: event.target.value, bay_id: '', bin_id: '' })}
              disabled={!filters.storage_unit_id}
            >
              <option value="">Select shelf</option>
              {shelvesForUnit.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>{shelf.shelf_code}{shelf.label ? ` / ${shelf.label}` : ''}</option>
              ))}
            </select>
          </label>
          <label>
            Bay
            <select
              value={filters.bay_id}
              onChange={(event) => setPath({ bay_id: event.target.value, bin_id: '' })}
              disabled={!filters.shelf_id}
            >
              <option value="">Select bay</option>
              {baysForShelf.map((bay) => (
                <option key={bay.id} value={bay.id}>{bay.bay_code}{bay.label ? ` / ${bay.label}` : ''}</option>
              ))}
            </select>
          </label>
          <label>
            Bin
            <select value={filters.bin_id} onChange={(event) => setPath({ bin_id: event.target.value })} disabled={!filters.bay_id}>
              <option value="">Select bin</option>
              {binsForBay.map((bin) => (
                <option key={bin.id} value={bin.id}>{bin.bin_code}{bin.label ? ` / ${bin.label}` : ''}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="count-toolbar">
          <label>
            Search rows
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Material, C111, bin, shelf, bay, or unit"
            />
            <span className="field-hint">Compact paths filter by unit, shelf, bay, and bin.</span>
          </label>
          <label>
            Category
            <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">All categories</option>
              {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="count-toggle">
            <input
              type="checkbox"
              checked={reviewRepeats}
              onChange={(event) => setReviewRepeats(event.target.checked)}
            />
            <span>Review Repeats</span>
          </label>
          <button type="button" className="secondary-button" onClick={clearFilters}>Clear Filters</button>
          <button type="button" className="secondary-button" onClick={printCountSheet}>Print Count Sheet</button>
        </div>

        {countSheet.error ? <div className="alert">Inventory count list failed to load. Confirm can_manage_inventory and existing inventory read access.</div> : null}
        {intake.error ? <div className="alert">Inventory count intake failed. Confirm Developer/Admin role and deployed RPC.</div> : null}
        {retirement.error ? <div className="alert">Bin item retirement failed. Confirm Developer/Admin role, can_archive_records, zero balance, and deployed RPC.</div> : null}
        {countSheet.isLoading ? <p className="muted">Loading count sheet...</p> : null}

        <div className="count-guard-panel">
          <strong>Official count workflow</strong>
          <span>Recorded quantities create physical count corrections through the existing intake path. Zero is valid. Catalog items must already exist.</span>
        </div>

        <section className="count-help-panel" aria-label="How to use this count intake screen">
          <div>
            <p className="eyebrow">How to use this screen</p>
            <h3>Field-use notes</h3>
          </div>
          <ul>
            {COUNT_INTAKE_HELP_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <div className="cart-facts count-summary">
          <span>Loaded bin/material rows: {countSheet.rows.length}</span>
          <span>Visible rows: {filteredRows.length}</span>
          <span>Selected bin rows: {rowsForSelectedBin.length}</span>
          {reviewRepeats ? <span>Repeat rows: {filteredRows.length} / {repeatReview.repeatedRowCount}</span> : null}
          <span>Last loaded: {countSheet.lastLoadedAt ? new Date(countSheet.lastLoadedAt).toLocaleString() : 'not loaded yet'}</span>
        </div>

        {reviewRepeats ? (
          <div className="repeat-review-panel">
            <div>
              <strong>Review Repeats</strong>
              <span>{visibleRepeatGroups.length} repeated field groups in the current view.</span>
            </div>
            {visibleRepeatGroups.length ? (
              <div className="repeat-chip-list repeat-chip-list--summary">
                {visibleRepeatGroups.slice(0, 10).map((group) => (
                  <span className="repeat-chip" key={group.key}>
                    {group.fieldLabel}: {group.value} ({group.rowIds.size})
                  </span>
                ))}
                {visibleRepeatGroups.length > 10 ? <span className="repeat-chip">+{visibleRepeatGroups.length - 10} more</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="count-intake-card">
          <div>
            <p className="eyebrow">Selected path</p>
            <h3>{selectedPathLabel || 'Choose a bin'}</h3>
            {selectedPathSegments.length ? (
              <div className="count-path-crumbs">
                {selectedPathSegments.map((segment) => (
                  <span key={segment.label}>
                    {segment.label}: {segment.value}{segment.detail ? ` / ${segment.detail}` : ''}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <p className="muted">
            Selected-bin catalog intake is separate from existing stocked rows below.
          </p>

          {selectedBin ? (
            <div className="count-intake-form">
              <label>
                Material search
                <input
                  type="search"
                  value={newItemSearch}
                  onChange={(event) => setNewItemSearch(event.target.value)}
                  placeholder="Search catalog"
                />
              </label>
              <label>
                Existing catalog item
                <select
                  value={newItemDraft.item_id}
                  onChange={(event) => setNewItemDraft((current) => ({ ...current, item_id: event.target.value }))}
                >
                  <option value="">Select item</option>
                  {catalogOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.material_code} / {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Counted quantity
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newItemDraft.countedQuantity}
                  onChange={(event) => setNewItemDraft((current) => ({ ...current, countedQuantity: event.target.value }))}
                  placeholder="0"
                />
              </label>
              <label>
                Reason
                {renderReasonControls(newItemDraft, (updates) => setNewItemDraft((current) => ({ ...current, ...updates })))}
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={recordNewItemCount}
                disabled={!canWriteCounts || intake.isRecording || !newItemDraft.item_id || !isDraftReady(newItemDraft)}
              >
                {intake.isRecording ? 'Recording...' : 'Record Count'}
              </button>
              <p className="count-form-note">
                This records an official count correction for the selected bin/material pair.
              </p>
            </div>
          ) : (
            <EmptyState title="Select a bin">
              Choose a storage unit, shelf, bay, and bin before counting an existing catalog item into a bin.
            </EmptyState>
          )}
          {rowMessages.new ? (
            <div className={`count-row-message count-row-message--${rowMessages.new.type}`}>{rowMessages.new.text}</div>
          ) : null}
          {intake.result ? (
            <div className="cart-facts count-correction-facts">
              <span>Last bin item: {intake.result.bin_item_id}</span>
              <span>Prior: {Number(intake.result.prior_system_quantity ?? 0).toFixed(2)}</span>
              <span>Counted: {Number(intake.result.counted_quantity ?? 0).toFixed(2)}</span>
              <span>Variance: {Number(intake.result.variance ?? 0).toFixed(2)}</span>
            </div>
          ) : null}
        </section>

        {filteredRows.length ? (
          <>
            <div className="count-section-header">
              <div>
                <p className="eyebrow">Existing bin/material rows</p>
                <h3>{reviewRepeats ? 'Repeated values review' : 'Count loaded stock'}</h3>
              </div>
              <span>{filteredRows.length} visible</span>
            </div>
            <div className="table-wrap count-table-wrap">
              <table className="data-table count-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Physical Location</th>
                    <th>System Quantity</th>
                    <th>Counted Quantity</th>
                    <th>Variance</th>
                    <th>Reason</th>
                    <th>Action</th>
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const draft = getCountDraft(row);
                    const countedQuantity = Number(draft.countedQuantity);
                    const hasCount = draft.countedQuantity !== '' && Number.isFinite(countedQuantity);
                    const systemQuantity = Number(row.system_quantity ?? 0);
                    const variance = hasCount ? countedQuantity - systemQuantity : null;
                    const rowMessage = rowMessages[row.bin_item_id];

                    return (
                      <Fragment key={row.bin_item_id}>
                        <tr>
                          <td>
                            <strong>{row.item_name}</strong>
                            <span>{row.material_code}</span>
                            <span>{getCategoryLabel(row)}</span>
                            {reviewRepeats ? <RepeatMatchChips matches={repeatReview.rowMatchesById.get(row.bin_item_id)} /> : null}
                          </td>
                          <td>
                            <strong>{row.bin_code}</strong>
                            <span>{row.storage_unit_code} / {row.shelf_code} / {row.bay_code} / {row.bin_code}</span>
                          </td>
                          <td>{systemQuantity.toFixed(2)} {row.unit_of_measure ?? ''}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.countedQuantity}
                              onChange={(event) => updateCountDraft(row.bin_item_id, { countedQuantity: event.target.value })}
                              placeholder="0"
                            />
                          </td>
                          <td className={variance === null ? '' : variance === 0 ? 'variance-neutral' : variance > 0 ? 'variance-positive' : 'variance-negative'}>
                            {variance === null ? '-' : variance.toFixed(2)}
                          </td>
                          <td className="count-reason-cell">
                            {renderReasonControls(draft, (updates) => updateCountDraft(row.bin_item_id, updates))}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => recordExistingCount(row)}
                              disabled={!canWriteCounts || intake.isRecording || !isDraftReady(draft)}
                            >
                              Record
                            </button>
                            {rowMessage ? (
                              <span className={`count-inline-message count-inline-message--${rowMessage.type}`}>{rowMessage.text}</span>
                            ) : null}
                          </td>
                          <td>
                            <div className="count-action-stack">
                              <button type="button" className="secondary-button" onClick={() => setSelectedHistoryBinItemId(row.bin_item_id)}>
                                View
                              </button>
                              {canRetireBinItems ? (
                                <button
                                  type="button"
                                  className="secondary-button secondary-button--danger"
                                  onClick={() => startRetirement(row)}
                                  disabled={retirement.isRetiring}
                                  title={systemQuantity === 0 ? 'Retire this bin/material link' : 'Record a zero physical count before retiring'}
                                >
                                  Retire
                                </button>
                              ) : null}
                            </div>
                            {canRetireBinItems && systemQuantity !== 0 ? (
                              <span className="count-inline-message count-inline-message--error">Zero count required first</span>
                            ) : null}
                          </td>
                        </tr>
                        {retirementDraft.binItemId === row.bin_item_id ? (
                          <tr className="count-retire-row">
                            <td colSpan="8">
                              <div className="count-retire-panel">
                                <div>
                                  <strong>Retire {row.material_code} from bin {row.bin_code}</strong>
                                  <span>Archives the bin/material link only. Ledger history and quantities are not changed.</span>
                                </div>
                                <label>
                                  Reason
                                  <input
                                    type="text"
                                    value={retirementDraft.reason}
                                    onChange={(event) => setRetirementDraft((current) => ({ ...current, reason: event.target.value }))}
                                    placeholder="Required retirement reason"
                                  />
                                </label>
                                <div className="count-action-stack count-action-stack--inline">
                                  <button
                                    type="button"
                                    className="primary-button"
                                    onClick={() => confirmRetirement(row)}
                                    disabled={retirement.isRetiring || !retirementDraft.reason.trim()}
                                  >
                                    {retirement.isRetiring ? 'Retiring...' : 'Confirm Retire'}
                                  </button>
                                  <button type="button" className="secondary-button" onClick={cancelRetirement} disabled={retirement.isRetiring}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-list count-mobile-list">
              {filteredRows.map((row) => {
                const draft = getCountDraft(row);
                const countedQuantity = Number(draft.countedQuantity);
                const hasCount = draft.countedQuantity !== '' && Number.isFinite(countedQuantity);
                const systemQuantity = Number(row.system_quantity ?? 0);
                const variance = hasCount ? countedQuantity - systemQuantity : null;
                const rowMessage = rowMessages[row.bin_item_id];

                return (
                  <article className="mobile-item count-mobile-item" key={row.bin_item_id}>
                    <strong>{row.item_name}</strong>
                    <span>{row.material_code} / Bin {row.bin_code}</span>
                    <div className="meta-grid">
                      <span>{row.storage_unit_code} / {row.shelf_code} / {row.bay_code} / {row.bin_code}</span>
                      <span>System Quantity: {systemQuantity.toFixed(2)} {row.unit_of_measure ?? ''}</span>
                      <span>Variance: {variance === null ? '-' : variance.toFixed(2)}</span>
                      <span>{getCategoryLabel(row)}</span>
                    </div>
                    {reviewRepeats ? <RepeatMatchChips matches={repeatReview.rowMatchesById.get(row.bin_item_id)} /> : null}
                    <label>
                      Counted Quantity
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.countedQuantity}
                        onChange={(event) => updateCountDraft(row.bin_item_id, { countedQuantity: event.target.value })}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      Reason
                      {renderReasonControls(draft, (updates) => updateCountDraft(row.bin_item_id, updates))}
                    </label>
                    {rowMessage ? (
                      <div className={`count-row-message count-row-message--${rowMessage.type}`}>{rowMessage.text}</div>
                    ) : null}
                    <div className="cart-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => recordExistingCount(row)}
                        disabled={!canWriteCounts || intake.isRecording || !isDraftReady(draft)}
                      >
                        Record Count
                      </button>
                      <button type="button" className="secondary-button" onClick={() => setSelectedHistoryBinItemId(row.bin_item_id)}>
                        View History
                      </button>
                      {canRetireBinItems ? (
                        <button
                          type="button"
                          className="secondary-button secondary-button--danger"
                          onClick={() => startRetirement(row)}
                          disabled={retirement.isRetiring}
                        >
                          Retire
                        </button>
                      ) : null}
                    </div>
                    {canRetireBinItems && systemQuantity !== 0 ? (
                      <div className="count-row-message count-row-message--error">Record a zero physical count before retiring this material from the bin.</div>
                    ) : null}
                    {retirementDraft.binItemId === row.bin_item_id ? (
                      <div className="count-retire-panel">
                        <div>
                          <strong>Retire {row.material_code} from bin {row.bin_code}</strong>
                          <span>Archives the bin/material link only. Ledger history and quantities are not changed.</span>
                        </div>
                        <label>
                          Reason
                          <input
                            type="text"
                            value={retirementDraft.reason}
                            onChange={(event) => setRetirementDraft((current) => ({ ...current, reason: event.target.value }))}
                            placeholder="Required retirement reason"
                          />
                        </label>
                        <div className="cart-actions">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => confirmRetirement(row)}
                            disabled={retirement.isRetiring || !retirementDraft.reason.trim()}
                          >
                            {retirement.isRetiring ? 'Retiring...' : 'Confirm Retire'}
                          </button>
                          <button type="button" className="secondary-button" onClick={cancelRetirement} disabled={retirement.isRetiring}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState title="No count rows">
            {scanBinFilter && !countSheet.rows.some((row) => row.bin_id === scanBinFilter.binId)
              ? 'No authorized material rows were found for this scanned bin.'
              : 'No active bin/material rows match the current search, path, category, and repeat filters.'}
          </EmptyState>
        )}
      </section>

      <CountHistoryForItem row={selectedHistoryRow} permissions={permissions} />
      <CountPrintSheet rows={filteredRows} countDrafts={countDrafts} filterSummary={countPrintFilterSummary} />
    </div>
  );
}

function CartScaffold({ permissions, cartCandidates, destinationReferences, onInventoryReload, scanCartContext = null }) {
  const { getToken } = useAuth();
  const cartState = useInventoryCart();
  const [lineDestinations, setLineDestinations] = useState({});
  const [applyAllDestination, setApplyAllDestination] = useState({
    destination_type: 'unknown',
    destination_id: '',
    note: '',
  });
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [issueToJobHandoff, setIssueToJobHandoff] = useState(null);
  const [issueToJobSuggestedQuantity, setIssueToJobSuggestedQuantity] = useState(0);
  const [issueToJobBanner, setIssueToJobBanner] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateQuantities, setCandidateQuantities] = useState({});
  const [candidateQuantityMessage, setCandidateQuantityMessage] = useState('');
  const [candidateRowMessages, setCandidateRowMessages] = useState({});
  const [addAllProgress, setAddAllProgress] = useState(null);
  const [isAddingAllCandidates, setIsAddingAllCandidates] = useState(false);
  const [scanBinFilter, setScanBinFilter] = useState(scanCartContext?.binId ? scanCartContext : null);
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const cart = cartState.cart;
  const cartDraftKey = getCartDestinationDraftKey(cart?.cart_id);
  const cartIsActive = cart?.status === 'active';
  const cartIsCheckedOut = cart?.status === 'checked_out' || cartState.checkoutResult?.status === 'checked_out';
  const normalizedCandidateSearch = candidateSearch.trim().toLowerCase();
  const hasScanBinFilter = Boolean(scanBinFilter?.binId);
  const stockedCandidateItems = cartCandidates
    .filter((candidate) => Number(candidate.quantity_on_hand ?? 0) > DEFAULT_CANDIDATE_QUANTITY);
  const scanFilteredCandidateItems = hasScanBinFilter
    ? stockedCandidateItems.filter((candidate) => candidate.bin_id === scanBinFilter.binId)
    : stockedCandidateItems;
  const candidateItems = scanFilteredCandidateItems
    .filter((candidate) => {
      if (!normalizedCandidateSearch) {
        return true;
      }

      return [
        candidate.material_code,
        candidate.item_name,
        candidate.bin_code,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalizedCandidateSearch));
    });

  async function loadJobs() {
    if (permissions.permissionSource !== 'server') {
      setJobs([]);
      return;
    }

    setIsLoadingJobs(true);
    setJobsError(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('jobs')
        .select(JOBS_SELECT_FIELDS)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setJobs(data ?? []);
    } catch (error) {
      console.error('Cart job lookup failed', error);
      setJobs([]);
      setJobsError(error);
    } finally {
      setIsLoadingJobs(false);
    }
  }

  useEffect(() => {
    if (scanCartContext?.binId) {
      setScanBinFilter(scanCartContext);
      setCandidateSearch('');
    }
  }, [scanCartContext?.binId, scanCartContext?.binCode]);

  useEffect(() => {
    if (!cartDraftKey) {
      setLineDestinations({});
      return;
    }

    try {
      const savedDraft = window.localStorage.getItem(cartDraftKey);
      setLineDestinations(savedDraft ? JSON.parse(savedDraft) : {});
    } catch (caughtError) {
      console.warn('Failed to load cart destination draft', caughtError);
      setLineDestinations({});
    }
  }, [cartDraftKey]);

  useEffect(() => {
    if (!cartDraftKey || cartIsCheckedOut) {
      return;
    }

    try {
      if (Object.keys(lineDestinations).length) {
        window.localStorage.setItem(cartDraftKey, JSON.stringify(lineDestinations));
      } else {
        window.localStorage.removeItem(cartDraftKey);
      }
    } catch (caughtError) {
      console.warn('Failed to save cart destination draft', caughtError);
    }
  }, [cartDraftKey, cartIsCheckedOut, lineDestinations]);

  useEffect(() => {
    loadJobs();
  }, [getToken, permissions.permissionSource]);

  useEffect(() => {
    const savedHandoff = consumeIssueToJobHandoff();
    if (!savedHandoff) {
      return;
    }

    setIssueToJobHandoff(savedHandoff);
    const suggestion = Number(savedHandoff.requestedQuantity ?? 0);
    setIssueToJobSuggestedQuantity(Number.isFinite(suggestion) && suggestion > DEFAULT_CANDIDATE_QUANTITY ? suggestion : DEFAULT_CANDIDATE_QUANTITY);
    if (savedHandoff.jobId) {
      setApplyAllDestination({
        destination_type: 'job',
        destination_id: savedHandoff.jobId,
        note: '',
      });
    }
    setIssueToJobBanner(
      savedHandoff.jobDisplayLabel
        ? `Issue to Job handoff: ${savedHandoff.jobDisplayLabel}. Requested quantity is a suggestion. Confirm actual source bin and quantity during checkout.`
        : 'Issue to Job handoff loaded. Requested quantity is a suggestion. Confirm actual source bin and quantity during checkout.',
    );
    if (savedHandoff.materialSearch) {
      setCandidateSearch(savedHandoff.materialSearch);
    }
  }, []);

  useEffect(() => {
    if (!issueToJobHandoff?.jobId || !cart?.cart_id || !cartState.cartItems.length) {
      return;
    }

    setLineDestinations((current) => {
      const next = { ...current };
      cartState.cartItems.forEach((item) => {
        next[item.cart_item_id] = {
          ...(current[item.cart_item_id] ?? {}),
          destination_type: 'job',
          destination_id: issueToJobHandoff.jobId,
          note: current[item.cart_item_id]?.note ?? '',
        };
      });
      return next;
    });
    if (issueToJobHandoff.materialSearch) {
      setCandidateSearch(issueToJobHandoff.materialSearch);
    }
    setIssueToJobHandoff(null);
  }, [cart?.cart_id, cartState.cartItems, issueToJobHandoff]);

  function getLineDestination(cartItem) {
    const savedLine = lineDestinations[cartItem.cart_item_id];
    const destinationType = normalizeDestinationType(
      savedLine?.destination_type ?? cartItem.destination_type ?? applyAllDestination.destination_type,
    );

    return {
      ...(savedLine ?? {}),
      destination_type: destinationType,
      destination_id: savedLine?.destination_id ?? cartItem.destination_id ?? '',
      note: savedLine?.note ?? cartItem.note ?? '',
    };
  }

  function updateLineDestination(cartItemId, updates) {
    setLineDestinations((current) => ({
      ...current,
      [cartItemId]: {
        destination_type: applyAllDestination.destination_type,
        destination_id: '',
        note: '',
        ...(current[cartItemId] ?? {}),
        ...updates,
      },
    }));
  }

  function updateApplyAllDestination(updates) {
    setApplyAllDestination((current) => ({
      ...current,
      ...updates,
    }));
  }

  function applyDestinationToAll() {
    setLineDestinations((current) => {
      const next = { ...current };
      cartState.cartItems.forEach((item) => {
        next[item.cart_item_id] = {
          destination_type: applyAllDestination.destination_type,
          destination_id: applyAllDestination.destination_id,
          note: applyAllDestination.note,
        };
      });
      return next;
    });
  }

  function isLineDestinationValid(cartItem) {
    const line = getLineDestination(cartItem);
    if (!VALID_DESTINATION_TYPES.has(line.destination_type)) {
      return false;
    }
    if (DESTINATIONS_REQUIRING_ID.has(line.destination_type) && !line.destination_id?.trim()) {
      return false;
    }
    if (line.destination_type === 'unknown' && !line.note?.trim()) {
      return false;
    }
    return true;
  }

  function isDestinationDraftValid(destinationDraft) {
    if (!VALID_DESTINATION_TYPES.has(destinationDraft.destination_type)) {
      return false;
    }
    if (DESTINATIONS_REQUIRING_ID.has(destinationDraft.destination_type) && !destinationDraft.destination_id?.trim()) {
      return false;
    }
    if (destinationDraft.destination_type === 'unknown' && !destinationDraft.note?.trim()) {
      return false;
    }
    return true;
  }

  async function handleAddCandidate(candidate) {
    if (!cart?.cart_id || !cartIsActive) {
      return;
    }

    const quantity = getCandidateQuantityForSubmit(candidate);
    if (quantity <= DEFAULT_CANDIDATE_QUANTITY) {
      setCandidateQuantityMessage('Enter a quantity greater than 0 before adding a stocked material.');
      setCandidateRowMessage(candidate.bin_item_id, 'error', 'Enter a quantity greater than 0.');
      return;
    }

    clearCandidateRowMessage(candidate.bin_item_id);
    const result = await cartState.addItem({
      cartId: cart.cart_id,
      binItemId: candidate.bin_item_id,
      quantity,
    });

    if (result) {
      setCandidateQuantity(candidate.bin_item_id, String(DEFAULT_CANDIDATE_QUANTITY));
      setCandidateRowMessage(candidate.bin_item_id, 'success', `Added ${quantity} to the cart.`);
    } else {
      setCandidateRowMessage(candidate.bin_item_id, 'error', 'Add failed. Check available balance and permissions.');
    }
  }

  function getCandidateQuantityInputValue(candidate) {
    return candidateQuantities[candidate.bin_item_id] ?? (
      issueToJobSuggestedQuantity > DEFAULT_CANDIDATE_QUANTITY
        ? String(issueToJobSuggestedQuantity)
        : String(DEFAULT_CANDIDATE_QUANTITY)
    );
  }

  function getCandidateQuantityForAction(candidate) {
    const maxQuantity = Math.max(DEFAULT_CANDIDATE_QUANTITY, Number(candidate.quantity_on_hand ?? DEFAULT_CANDIDATE_QUANTITY));
    const requestedQuantity = Number(getCandidateQuantityInputValue(candidate));

    if (!Number.isFinite(requestedQuantity)) {
      return DEFAULT_CANDIDATE_QUANTITY;
    }

    return Math.min(Math.max(requestedQuantity, DEFAULT_CANDIDATE_QUANTITY), maxQuantity);
  }

  function getCandidateQuantityForSubmit(candidate) {
    const maxQuantity = Math.max(DEFAULT_CANDIDATE_QUANTITY, Number(candidate.quantity_on_hand ?? DEFAULT_CANDIDATE_QUANTITY));
    const requestedQuantity = Number(getCandidateQuantityInputValue(candidate));

    if (!Number.isFinite(requestedQuantity)) {
      setCandidateQuantities((current) => ({
        ...current,
        [candidate.bin_item_id]: String(DEFAULT_CANDIDATE_QUANTITY),
      }));
      setCandidateQuantityMessage('Quantity reset to 0 because the field was blank or invalid.');
      return DEFAULT_CANDIDATE_QUANTITY;
    }

    const clampedQuantity = Math.min(Math.max(requestedQuantity, DEFAULT_CANDIDATE_QUANTITY), maxQuantity);
    setCandidateQuantities((current) => ({
      ...current,
      [candidate.bin_item_id]: String(clampedQuantity),
    }));

    if (clampedQuantity !== requestedQuantity) {
      setCandidateQuantityMessage(`Quantity adjusted to ${clampedQuantity} based on available stock.`);
    } else {
      setCandidateQuantityMessage('');
    }

    return clampedQuantity;
  }

  function setCandidateQuantity(binItemId, rawValue) {
    setCandidateQuantities((current) => ({
      ...current,
      [binItemId]: rawValue,
    }));
  }

  function updateCandidateQuantity(candidate, rawValue) {
    setCandidateQuantity(candidate.bin_item_id, rawValue);
    clearCandidateRowMessage(candidate.bin_item_id);
    setCandidateQuantityMessage('');
  }

  function setCandidateRowMessage(binItemId, type, text) {
    setCandidateRowMessages((current) => ({
      ...current,
      [binItemId]: { type, text },
    }));
  }

  function clearCandidateRowMessage(binItemId) {
    setCandidateRowMessages((current) => {
      if (!current[binItemId]) {
        return current;
      }

      const next = { ...current };
      delete next[binItemId];
      return next;
    });
  }

  function clearCandidateQuantities() {
    setCandidateQuantities({});
    setCandidateRowMessages({});
    setCandidateQuantityMessage('Quantities cleared.');
    setAddAllProgress(null);
  }

  function clearScanBinFilter() {
    setScanBinFilter(null);
    setCandidateQuantityMessage('Showing all stocked bin candidates.');
  }

  async function handleAddAllCandidates() {
    if (!cart?.cart_id || !cartIsActive) {
      return;
    }

    const selectedCandidates = candidateItems
      .map((candidate) => ({
        candidate,
        quantity: getCandidateQuantityForSubmit(candidate),
      }))
      .filter((selection) => selection.quantity > DEFAULT_CANDIDATE_QUANTITY);

    if (!selectedCandidates.length) {
      setCandidateQuantityMessage('Enter a quantity greater than 0 for at least one stocked material.');
      return;
    }

    setIsAddingAllCandidates(true);
    setAddAllProgress({ completed: 0, total: selectedCandidates.length });
    setCandidateQuantityMessage(`Adding 0 of ${selectedCandidates.length} selected material${selectedCandidates.length === 1 ? '' : 's'}...`);

    try {
      const addedBinItemIds = [];
      const failedBinItemIds = [];

      for (let index = 0; index < selectedCandidates.length; index += 1) {
        const { candidate, quantity } = selectedCandidates[index];
        setAddAllProgress({ completed: index, total: selectedCandidates.length });
        clearCandidateRowMessage(candidate.bin_item_id);

        const result = await cartState.addItem({
          cartId: cart.cart_id,
          binItemId: candidate.bin_item_id,
          quantity,
        });

        if (!result) {
          failedBinItemIds.push(candidate.bin_item_id);
          setCandidateRowMessage(candidate.bin_item_id, 'error', 'Add failed. Quantity was left in place.');
        } else {
          addedBinItemIds.push(candidate.bin_item_id);
          setCandidateRowMessage(candidate.bin_item_id, 'success', `Added ${quantity} to the cart.`);
        }
      }

      setAddAllProgress({ completed: selectedCandidates.length, total: selectedCandidates.length });
      setCandidateQuantities((current) => {
        const next = { ...current };
        addedBinItemIds.forEach((binItemId) => {
          next[binItemId] = String(DEFAULT_CANDIDATE_QUANTITY);
        });
        return next;
      });

      if (failedBinItemIds.length) {
        setCandidateQuantityMessage(`Added ${addedBinItemIds.length} material${addedBinItemIds.length === 1 ? '' : 's'}; ${failedBinItemIds.length} failed and kept its quantity.`);
      } else {
        setCandidateQuantityMessage(`Added ${addedBinItemIds.length} material${addedBinItemIds.length === 1 ? '' : 's'} to the cart.`);
      }
    } finally {
      setAddAllProgress(null);
      setIsAddingAllCandidates(false);
    }
  }

  async function handleRemoveCartItem(cartItemId) {
    if (!cart?.cart_id || !cartIsActive) {
      return;
    }

    const result = await cartState.removeItem({
      cartId: cart.cart_id,
      cartItemId,
    });

    if (result) {
      setLineDestinations((current) => {
        const next = { ...current };
        delete next[cartItemId];
        return next;
      });
    }
  }

  async function handleCheckout() {
    if (!cart?.cart_id || !cartState.cartItems.length || !cartIsActive) {
      return;
    }

    const preparedLineDestinations = cartState.cartItems.map((item) => {
      const line = getLineDestination(item);
      return {
        cart_item_id: item.cart_item_id,
        destination_type: line.destination_type,
        destination_id: line.destination_id?.trim() || null,
        note: line.note?.trim() || null,
      };
    });

    const result = await cartState.checkoutCart({
      cartId: cart.cart_id,
      destinationType: applyAllDestination.destination_type,
      destinationId: null,
      note: 'Normal cart checkout from per-line destination UI',
      lineDestinations: preparedLineDestinations,
    });

    if (result && cartDraftKey) {
      window.localStorage.removeItem(cartDraftKey);
      setLineDestinations({});
    }
  }

  const hasInvalidLineDestinations = cartState.cartItems.some((item) => !isLineDestinationValid(item));
  const applyAllDestinationIsValid = isDestinationDraftValid(applyAllDestination);
  const selectedCandidateSelections = candidateItems
    .map((candidate) => ({
      candidate,
      quantity: getCandidateQuantityForAction(candidate),
    }))
    .filter((selection) => selection.quantity > DEFAULT_CANDIDATE_QUANTITY);
  const selectedCandidateCount = selectedCandidateSelections.length;
  const selectedCandidateTotalQuantity = selectedCandidateSelections.reduce((total, selection) => total + selection.quantity, 0);
  const cartActionInProgress = isAddingAllCandidates || cartState.isAddingItem || cartState.isRemovingItem || cartState.isCheckingOut || cartState.isReadingItems;

  return (
    <div className="cart-scaffold" aria-label="Inventory cart scaffold">
      <div className="cart-scaffold__summary">
        <section className="cart-panel">
          <div className="card__header">
            <div>
              <p className="eyebrow">Inventory Step 4H</p>
              <h3>Removable Cart Lines</h3>
            </div>
            <span className={cart ? 'status-pill status-pill--good' : 'status-pill status-pill--warn'}>
              {cartIsCheckedOut ? 'Cart checked out' : cart ? 'Active cart opened' : 'Cart not opened'}
            </span>
          </div>
          <p>
            Cart lines reload from the server after each cart action. Destination selections are saved locally as cart drafts until checkout writes them permanently.
          </p>
          <button
            type="button"
            className="primary-button"
            disabled={!canUseCart || cartState.isOpening || cartState.isReadingItems || cartIsCheckedOut}
            onClick={cartState.openCart}
          >
            {cartState.isOpening ? 'Opening Cart…' : cartState.isReadingItems ? 'Loading Cart Items…' : cart ? 'Cart Opened' : 'Open Cart'}
          </button>
          {cartState.error ? (
            <div className="alert">Cart action failed. Check permissions, destination requirements, available balance, or deployment status.</div>
          ) : null}
          <div className="cart-facts">
            <span>Cart status: {cart?.status ?? 'Not opened'}</span>
            <span>Cart rows: {cartState.cartItems.length}</span>
            <span>Cart ID: {cart?.cart_id ? `${cart.cart_id.slice(0, 8)}…` : 'None'}</span>
            <span>Draft destinations: {Object.keys(lineDestinations).length}</span>
          </div>
        </section>

        <section className="cart-panel cart-panel--locked">
          <h3>Destination Sources</h3>
          <p>
            User and vehicle references come from live Supabase when available. Job destinations use the live Jobs read path when accessible.
          </p>
          <div className="cart-facts">
            <span>Users loaded: {destinationReferences?.users?.length ?? 0}</span>
            <span>Vehicles loaded: {destinationReferences?.vehicles?.length ?? 0}</span>
            <span>Jobs loaded: {jobs.length}</span>
          </div>
        </section>
      </div>

      <div className="cart-scaffold__body">
        <section className="cart-panel">
          <div className="cart-panel__toolbar">
            <h3>{hasScanBinFilter ? 'Scanned Bin Candidates' : 'Stocked Bin Candidates'}</h3>
            <div className="cart-panel__toolbar-actions">
              <label className="cart-search">
                <span>Search</span>
                <input
                  type="search"
                  placeholder="Code, item, or bin"
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                />
              </label>
              <div className="cart-picker-summary" aria-live="polite">
                <span>{selectedCandidateCount} selected</span>
                <span>{selectedCandidateTotalQuantity.toFixed(2)} total qty</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={cartActionInProgress || selectedCandidateCount === 0}
                onClick={clearCandidateQuantities}
              >
                Clear Quantities
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!cart?.cart_id || !cartIsActive || !canUseCart || cartActionInProgress || selectedCandidateCount === 0}
                onClick={handleAddAllCandidates}
              >
                {isAddingAllCandidates && addAllProgress ? `Adding ${addAllProgress.completed} of ${addAllProgress.total}...` : `Add All (${selectedCandidateCount})`}
              </button>
            </div>
          </div>
          {hasScanBinFilter ? (
            <div className="scan-cart-context-panel">
              <div>
                <p className="eyebrow">Scanned bin</p>
                <h3>{scanBinFilter.binCode || scanBinFilter.binId}</h3>
                <p>Uses the existing cart checkout flow. Inventory is not changed until checkout is completed.</p>
              </div>
              <button type="button" className="secondary-button" onClick={clearScanBinFilter}>
                Show all stocked bins
              </button>
            </div>
          ) : null}
          {selectedCandidateCount === 0 ? (
            <p className="muted">Enter quantities greater than 0 to enable Add All.</p>
          ) : null}
          {candidateItems.length ? (
            <div className="cart-candidate-list">
              {candidateItems.map((item) => {
                const maxQuantity = Number(item.quantity_on_hand ?? DEFAULT_CANDIDATE_QUANTITY);
                const quantityInputValue = getCandidateQuantityInputValue(item);
                const rowMessage = candidateRowMessages[item.bin_item_id];
                const canAddRow = getCandidateQuantityForAction(item) > DEFAULT_CANDIDATE_QUANTITY;

                return (
                  <article className="cart-candidate" key={item.bin_item_id}>
                    <div>
                      <strong>{item.item_name}</strong>
                      <span>{item.material_code} · Bin {item.bin_code} · On hand: {maxQuantity.toFixed(2)} {item.unit_of_measure ?? ''}</span>
                      {rowMessage ? <span className={`cart-candidate__message cart-candidate__message--${rowMessage.type}`}>{rowMessage.text}</span> : null}
                    </div>
                    <div className="cart-candidate__actions">
                      <label className="quantity-field">
                        <span>Qty</span>
                        <input
                          type="number"
                          min={DEFAULT_CANDIDATE_QUANTITY}
                          max={maxQuantity}
                          step="1"
                          value={quantityInputValue}
                          onChange={(event) => updateCandidateQuantity(item, event.target.value)}
                          onBlur={() => getCandidateQuantityForSubmit(item)}
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!cart?.cart_id || !cartIsActive || !canUseCart || cartActionInProgress || !canAddRow}
                        onClick={() => handleAddCandidate(item)}
                      >
                        {cartState.isAddingItem ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title={hasScanBinFilter && !scanFilteredCandidateItems.length ? 'No stocked material' : 'No stocked candidates'}>
              {hasScanBinFilter && !scanFilteredCandidateItems.length
                ? 'No authorized stocked material was found for this scanned bin.'
                : 'No stocked bin items match the current picker filters.'}
            </EmptyState>
          )}
          {candidateQuantityMessage ? <p className="muted">{candidateQuantityMessage}</p> : null}
        </section>

        <section className="cart-panel">
          <h3>Cart Destinations</h3>
          {issueToJobBanner ? <div className="location-note tool-catalogue__note"><ClipboardCheck aria-hidden="true" /><span>{issueToJobBanner}</span></div> : null}
          {jobsError ? <div className="alert">Job destination lookup failed. Existing user and vehicle destinations are unchanged.</div> : null}
          {cartState.isReadingItems ? <p className="muted">Reloading cart items from server…</p> : null}
          {cartState.isRemovingItem ? <p className="muted">Removing cart item…</p> : null}
          <div className="cart-apply-all">
            <label>
              Apply destination
              <select
                value={applyAllDestination.destination_type}
                onChange={(event) => updateApplyAllDestination({ destination_type: event.target.value, destination_id: '', note: '' })}
              >
                {DESTINATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <DestinationIdControl
              line={applyAllDestination}
              cartItemId="apply-all-destination"
              destinationReferences={destinationReferences}
              jobs={jobs}
              isLoadingJobs={isLoadingJobs}
              onChange={(_, updates) => updateApplyAllDestination(updates)}
            />
            <label>
              Note
              <input
                type="text"
                placeholder={applyAllDestination.destination_type === 'unknown' ? 'Required for unknown' : 'Optional'}
                value={applyAllDestination.note}
                onChange={(event) => updateApplyAllDestination({ note: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={!cartState.cartItems.length || !applyAllDestinationIsValid || cartActionInProgress}
              onClick={applyDestinationToAll}
            >
              Apply Destination to All Lines
            </button>
          </div>

          {cartState.cartItems.length ? (
            <div className="cart-candidate-list">
              {cartState.cartItems.map((item) => {
                const line = getLineDestination(item);
                const requiresNote = line.destination_type === 'unknown';
                return (
                  <article className="cart-candidate" key={item.cart_item_id}>
                    <div>
                      <strong>{item.item_name ?? `Cart item ${item.cart_item_id.slice(0, 8)}…`}</strong>
                      <span>
                        {item.material_code ?? 'No material code'} · Bin {item.bin_code ?? item.bin_item_id.slice(0, 8)} · Quantity: {Number(item.quantity ?? 0).toFixed(2)} {item.unit_of_measure ?? ''} · On hand: {Number(item.quantity_on_hand ?? 0).toFixed(2)}
                      </span>
                      <div className="meta-grid">
                        <label>
                          Destination
                          <select value={line.destination_type} onChange={(event) => updateLineDestination(item.cart_item_id, { destination_type: event.target.value, destination_id: '', note: '' })}>
                            {DESTINATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <DestinationIdControl
                          line={line}
                          cartItemId={item.cart_item_id}
                          destinationReferences={destinationReferences}
                          jobs={jobs}
                          isLoadingJobs={isLoadingJobs}
                          onChange={updateLineDestination}
                        />
                        <label>
                          Note
                          <input
                            type="text"
                            placeholder={requiresNote ? 'Required for unknown' : 'Optional'}
                            value={line.note}
                            onChange={(event) => updateLineDestination(item.cart_item_id, { note: event.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!cartIsActive || cartActionInProgress}
                      onClick={() => handleRemoveCartItem(item.cart_item_id)}
                    >
                      {cartState.isRemovingItem ? 'Removing…' : 'Remove'}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No cart items yet">
              Open the cart, then add one stocked bin candidate. Checkout is enabled after each line has a valid destination.
            </EmptyState>
          )}
          <div className="cart-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!cart?.cart_id || !cartIsActive || !cartState.cartItems.length || hasInvalidLineDestinations || !canUseCart || cartActionInProgress}
              onClick={handleCheckout}
            >
              {cartState.isCheckingOut ? 'Checking Out…' : 'Checkout Selected Destinations'}
            </button>
          </div>
          {hasInvalidLineDestinations ? (
            <p className="muted">Job, service call, vehicle, and user destinations require an ID. Unknown requires a note.</p>
          ) : null}
          {cartState.checkoutResult ? (
            <div className="cart-facts">
              <span>Checkout status: {cartState.checkoutResult.status}</span>
              <span>Transaction rows: {cartState.checkoutResult.transaction_item_count}</span>
              <span>Transaction ID: {cartState.checkoutResult.transaction_id.slice(0, 8)}…</span>
              <span>Destinations: per line</span>
            </div>
          ) : null}
          <p className="build-note">
            Current step: removable cart lines. Draft selections clear after successful checkout.
          </p>
        </section>
      </div>
    </div>
  );
}

function InventoryReadOnlyPanel({ permissions, navigateTo, requestedTab = '', scanCartContext = null, scanCountContext = null, designPreviewEnabled = false }) {
  const [activeTab, setActiveTab] = useState(INVENTORY_TABS.has(requestedTab) ? requestedTab : 'grand-master');
  const inventory = useInventoryReadModel({ enabled: permissions.permissionSource === 'server' });
  const counts = inventory.model.counts;

  useEffect(() => {
    if (INVENTORY_TABS.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  return (
    <article className="card card--wide inventory-module-card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Inventory Step 1–4I</p>
          <h2>Inventory Command Center</h2>
          <p>
            This module reads from live v2 Supabase and supports controlled cart-open, add-to-cart, remove-line, durable cart item reads, draft destination persistence, and per-line normal checkout. Express checkout remains locked.
          </p>
        </div>
        <span className={permissions.permissionSource === 'server' ? 'status-pill status-pill--good' : 'status-pill status-pill--warn'}>
          {permissions.permissionSource === 'server' ? 'Server permissions verified' : 'Waiting on server permissions'}
        </span>
      </div>

      {inventory.error ? (
        <div className="alert">
          Inventory read failed. Stop before write-capable UI and resolve the read path first.
        </div>
      ) : null}

      <div className="count-grid">
        <CountCard label="Active catalog items" value={counts.activeItems} />
        <CountCard label="Storage units" value={counts.storageUnits} />
        <CountCard label="Shelves" value={counts.shelves} />
        <CountCard label="Bays" value={counts.bays} />
        <CountCard label="Bins" value={counts.bins} />
        <CountCard label="Bin items" value={counts.binItems} />
        <CountCard label="Balance rows" value={counts.inventoryBalances} />
        <CountCard label="Inventory Overview rows" value={counts.grandMasterRows} />
      </div>

      <div className="inventory-module-shell">
        <aside className="module-sidebar" aria-label="Inventory module navigation">
          <div className="module-sidebar__header">
            <p className="eyebrow">Workspace</p>
            <h3>Inventory</h3>
          </div>
          <div className="module-tabs" role="tablist" aria-label="Inventory read-only views">
        <button className="module-tab" type="button" aria-selected={activeTab === 'grand-master'} onClick={() => setActiveTab('grand-master')}>
          Inventory Overview
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'accounting-export'} onClick={() => setActiveTab('accounting-export')}>
          Accounting Export
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')}>
          Catalog Preview
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'storage'} onClick={() => setActiveTab('storage')}>
          Storage Browser
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'locations'} onClick={() => setActiveTab('locations')}>
          Locations & QR
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'scan'} onClick={() => setActiveTab('scan')}>
          Scan QR
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'labels'} onClick={() => setActiveTab('labels')}>
          Label Designer
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
          Tool Catalogue
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'cart'} onClick={() => setActiveTab('cart')}>
          Cart Checkout
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'count'} onClick={() => setActiveTab('count')}>
          Inventory Count & Correction
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')}>
          Transactions
        </button>
          </div>
        </aside>

        <div className="module-content">

      {inventory.isLoading ? <p className="muted">Loading live inventory data…</p> : null}
      {activeTab === 'grand-master' ? <GrandMasterOverviewPanel permissions={permissions} /> : null}
      {activeTab === 'accounting-export' ? <AccountingExportPreviewPanel permissions={permissions} /> : null}
      {activeTab === 'catalog' ? <CatalogPreview rows={inventory.model.catalogPreview} /> : null}
      {activeTab === 'storage' ? <StoragePreview storageUnits={inventory.model.storageUnitsPreview} bins={inventory.model.binsPreview} /> : null}
      {activeTab === 'locations' ? <LocationManagementPanel permissions={permissions} /> : null}
      {activeTab === 'scan' ? <LocationScannerPanel permissions={permissions} navigateTo={navigateTo} /> : null}
      {activeTab === 'labels' ? <LabelTemplateDesignerPanel permissions={permissions} /> : null}
      {activeTab === 'tools' ? <ToolCataloguePanel permissions={permissions} designPreviewEnabled={designPreviewEnabled} /> : null}
      {activeTab === 'cart' ? (
        <CartScaffold
          permissions={permissions}
          cartCandidates={inventory.model.cartCandidates}
          destinationReferences={inventory.model.destinationReferences}
          onInventoryReload={inventory.reload}
          scanCartContext={scanCartContext}
        />
      ) : null}
      {activeTab === 'count' ? (
        <InventoryCountIntakePanel permissions={permissions} scanCountContext={scanCountContext} />
      ) : null}
      {activeTab === 'transactions' ? <TransactionHistoryPanel permissions={permissions} /> : null}

      <p className="build-note">
        Last loaded: {inventory.lastLoadedAt ? new Date(inventory.lastLoadedAt).toLocaleString() : 'not loaded yet'}
      </p>
        </div>
      </div>
    </article>
  );
}

function InventoryWorkspacePanel({ permissions, navigateTo, requestedTab = '', scanCartContext = null, scanCountContext = null, designPreviewEnabled = false }) {
  const [activeTab, setActiveTab] = useState(INVENTORY_TABS.has(requestedTab) ? requestedTab : 'grand-master');
  const [isPrimarySidebarCollapsed, setIsPrimarySidebarCollapsed] = useState(false);
  const [isPrimarySidebarOpen, setIsPrimarySidebarOpen] = useState(false);
  const [isSecondarySidebarOpen, setIsSecondarySidebarOpen] = useState(false);
  const inventory = useInventoryReadModel({ enabled: permissions.permissionSource === 'server' });
  const counts = inventory.model.counts;
  const activeSection = INVENTORY_TAB_META.get(activeTab) ?? INVENTORY_TAB_ITEMS[0];
  const inventorySidebarItems = useMemo(() => buildInventorySidebarItems(counts), [counts]);
  const inventoryContext = useMemo(() => getInventoryContext(activeTab, counts), [activeTab, counts]);

  useEffect(() => {
    if (INVENTORY_TABS.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    setIsPrimarySidebarOpen(false);
    setIsSecondarySidebarOpen(false);
  }, [activeTab]);

  return (
    <article className="card card--wide workspace-card inventory-workspace">
      <WorkspaceHeader
        eyebrow="Phase 1 shell / Inventory"
        title="Inventory Command Center"
        description="Inventory now sits inside the locked Northgate shell while keeping the same live Supabase reads, controlled cart flow, count tools, print surfaces, and permission-aware states."
        status={(
          <span className={permissions.permissionSource === 'server' ? 'status-pill status-pill--good' : 'status-pill status-pill--warn'}>
            {permissions.permissionSource === 'server' ? 'Server permissions verified' : 'Waiting on server permissions'}
          </span>
        )}
        actions={(
          <>
            <button
              type="button"
              className="workspace-toggle secondary-button"
              onClick={() => setIsPrimarySidebarOpen(true)}
            >
              Sections
            </button>
            <button
              type="button"
              className="workspace-toggle secondary-button"
              onClick={() => setIsSecondarySidebarOpen(true)}
            >
              Context
            </button>
          </>
        )}
      />

      {inventory.error ? (
        <div className="alert">
          Inventory read failed. Stop before write-capable UI and resolve the read path first.
        </div>
      ) : null}

      <div className="inventory-workspace__toolbar">
        <div className="inventory-workspace__toolbar-meta">
          <span className="inventory-workspace__meta-pill">
            Active section: {activeSection.shortLabel}
          </span>
          <span className="inventory-workspace__meta-pill">
            Rows visible to this session: {counts.grandMasterRows}
          </span>
          <span className="inventory-workspace__meta-pill">
            Last loaded: {inventory.lastLoadedAt ? new Date(inventory.lastLoadedAt).toLocaleString() : 'not loaded yet'}
          </span>
        </div>
        <div className="inventory-workspace__toolbar-meta">
          <span className="inventory-workspace__meta-pill">
            Express checkout remains locked
          </span>
        </div>
      </div>

      <div className="count-grid">
        <CountCard label="Active catalog items" value={counts.activeItems} />
        <CountCard label="Storage units" value={counts.storageUnits} />
        <CountCard label="Shelves" value={counts.shelves} />
        <CountCard label="Bays" value={counts.bays} />
        <CountCard label="Bins" value={counts.bins} />
        <CountCard label="Bin items" value={counts.binItems} />
        <CountCard label="Balance rows" value={counts.inventoryBalances} />
        <CountCard label="Inventory Overview rows" value={counts.grandMasterRows} />
      </div>

      <div className="workspace-layout workspace-layout--with-secondary inventory-workspace__layout">
        <PrimarySidebar
          eyebrow="Inventory"
          title="Module sections"
          description="Use the module rail to move between the current live Inventory surfaces without changing the underlying workflows."
          items={inventorySidebarItems}
          activeKey={activeTab}
          onSelect={setActiveTab}
          collapsed={isPrimarySidebarCollapsed}
          onToggleCollapse={() => setIsPrimarySidebarCollapsed((current) => !current)}
          mobileOpen={isPrimarySidebarOpen}
          onCloseMobile={() => setIsPrimarySidebarOpen(false)}
          footer={(
            <div className="inventory-workspace__sidebar-footer">
              <p className="inventory-workspace__sidebar-note">
                Northgate red marks the active section while the actual permission checks remain server-authoritative.
              </p>
              <span className="status-pill status-pill--warn">
                Express checkout is still reserved
              </span>
            </div>
          )}
        />

        <div className="workspace-surface">
          <WorkspaceHeader
            eyebrow="Active inventory section"
            title={activeSection.label}
            description={activeSection.description}
          />

          {inventory.isLoading ? <p className="muted">Loading live inventory data...</p> : null}
          {activeTab === 'grand-master' ? <GrandMasterOverviewPanel permissions={permissions} /> : null}
          {activeTab === 'accounting-export' ? <AccountingExportPreviewPanel permissions={permissions} /> : null}
          {activeTab === 'catalog' ? <CatalogPreview rows={inventory.model.catalogPreview} /> : null}
          {activeTab === 'storage' ? <StoragePreview storageUnits={inventory.model.storageUnitsPreview} bins={inventory.model.binsPreview} /> : null}
          {activeTab === 'locations' ? <LocationManagementPanel permissions={permissions} /> : null}
          {activeTab === 'scan' ? <LocationScannerPanel permissions={permissions} navigateTo={navigateTo} /> : null}
          {activeTab === 'labels' ? <LabelTemplateDesignerPanel permissions={permissions} /> : null}
          {activeTab === 'tools' ? <ToolCataloguePanel permissions={permissions} designPreviewEnabled={designPreviewEnabled} /> : null}
          {activeTab === 'cart' ? (
            <CartScaffold
              permissions={permissions}
              cartCandidates={inventory.model.cartCandidates}
              destinationReferences={inventory.model.destinationReferences}
              onInventoryReload={inventory.reload}
              scanCartContext={scanCartContext}
            />
          ) : null}
          {activeTab === 'count' ? (
            <InventoryCountIntakePanel permissions={permissions} scanCountContext={scanCountContext} />
          ) : null}
          {activeTab === 'transactions' ? <TransactionHistoryPanel permissions={permissions} /> : null}

          <p className="build-note">
            Last loaded: {inventory.lastLoadedAt ? new Date(inventory.lastLoadedAt).toLocaleString() : 'not loaded yet'}
          </p>
        </div>

        <SecondarySidebar
          eyebrow={inventoryContext.eyebrow}
          title={inventoryContext.title}
          description={inventoryContext.description}
          mobileOpen={isSecondarySidebarOpen}
          onCloseMobile={() => setIsSecondarySidebarOpen(false)}
        >
          <div className="inventory-context">
            <div className="inventory-context__stats">
              {inventoryContext.stats.map((stat) => (
                <div className="inventory-context__stat" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
            <p className="inventory-context__note">
              The visual shell changed in this phase, but the underlying Inventory actions still route through the same approved hooks, RPCs, and permission checks.
            </p>
            <ul className="inventory-context__list">
              {inventoryContext.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </SecondarySidebar>
      </div>
    </article>
  );
}

function DevelopmentStatusCard() {
  return (
    <article className="card development-status-card">
      <p className="eyebrow">Development Status</p>
      <h2>Latest Build Marker</h2>
      <div className="development-status-grid">
        <span>Most recent change: {DEVELOPMENT_STATUS.mostRecentChange}</span>
        <span>Related HANDOFF: {DEVELOPMENT_STATUS.relatedHandoff}</span>
        <span>Architecture: {DEVELOPMENT_STATUS.architectureVersion}</span>
        <span>Current step: {DEVELOPMENT_STATUS.currentStep}</span>
        <span>Build marker: {DEVELOPMENT_STATUS.buildMarker}</span>
        <span>Deployment note: {DEVELOPMENT_STATUS.deploymentNote}</span>
      </div>
    </article>
  );
}

function DashboardWorkspace({
  user,
  permissions,
  inventorySnapshot,
  inventoryLoading,
  inventoryError,
  silasEnabled,
  canAccessDeveloper,
  onOpenWorkspace,
}) {
  const [activePanel, setActivePanel] = useState('overview');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const counts = inventorySnapshot?.counts ?? {
    activeItems: 0,
    inventoryBalances: 0,
  };
  const destinationReferences = inventorySnapshot?.destinationReferences ?? { users: [], vehicles: [] };
  const dashboardSidebarItems = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Role-aware module snapshot.' },
    { key: 'work', label: 'My Work', icon: Briefcase, description: 'Fast access to live workspaces.' },
    { key: 'notices', label: 'Notices', icon: AlertCircle, description: 'Operational constraints and follow-ups.' },
  ];
  const quickLinks = [
    {
      key: 'inventory',
      title: 'Inventory',
      description: 'Open the live stock, cart, count, and transaction workflows.',
      icon: Briefcase,
    },
    {
      key: 'jobs',
      title: 'Jobs',
      description: 'Browse the active Jobs directory and selected-record workspace.',
      icon: HardHat,
    },
    {
      key: 'estimating',
      title: 'Estimates',
      description: 'Open the new layout foundation for browse, detail, and create states.',
      icon: FileText,
    },
    {
      key: 'employees',
      title: 'Employees',
      description: 'Review the employee directory shell and current-user information.',
      icon: Users,
    },
    {
      key: 'vehicles',
      title: 'Vehicles',
      description: 'Browse live destination vehicles and the new detail workspace.',
      icon: Truck,
    },
  ];

  if (silasEnabled) {
    quickLinks.push({
      key: 'silas',
      title: 'Silas',
      description: 'Jump directly into the existing chat workspace.',
      icon: MessageSquare,
    });
  }

  if (canAccessDeveloper) {
    quickLinks.push({
      key: 'developer',
      title: 'Developer',
      description: 'Open the Developer-only status and diagnostics workspace.',
      icon: SlidersHorizontal,
    });
  }

  const notices = [];
  if (permissions.permissionSource !== 'server') {
    notices.push('Server permissions are not fully resolved yet, so module access remains fail-closed.');
  }
  if (!permissions.division) {
    notices.push('This user does not have a resolved division yet, so create/edit flows remain limited.');
  }
  if (inventoryError) {
    notices.push('Inventory summary reads were unavailable, so dashboard metrics are reduced to account context only.');
  }
  if (!silasEnabled) {
    notices.push('Silas is currently disabled, so chat entry points stay hidden outside the Developer workspace.');
  }

  const summaryCards = [
    { label: 'Role', value: permissions.role ?? 'User', detail: 'Server-authoritative access profile' },
    { label: 'Division', value: permissions.division ?? 'Unassigned', detail: 'Current workspace division' },
    { label: 'Inventory items', value: counts.activeItems, detail: inventoryLoading ? 'Loading inventory read model...' : 'Live read-model count', tone: 'accent' },
    { label: 'Visible vehicles', value: destinationReferences.vehicles.length, detail: 'Inventory destination references' },
    { label: 'Visible people', value: destinationReferences.users.length, detail: 'Employee/contact references' },
  ];

  return (
    <article className="card card--wide workspace-card module-workspace-card">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Northgate's application-wide landing workspace. It summarizes live access context, launches real modules, and keeps unfinished regions honest until their deeper workflows are built."
        status={<span className="status-pill">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Authenticated user'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsSecondaryOpen(true)}>
              Context
            </button>
            <button type="button" className="primary-button" onClick={() => onOpenWorkspace('inventory')}>
              Open Inventory
            </button>
          </>
        )}
      />

      <div className="module-summary-grid">
        {summaryCards.map((card) => (
          <SummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            tone={card.tone ?? 'default'}
          />
        ))}
      </div>

      <div className={`workspace-layout workspace-layout--with-secondary${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Dashboard Views"
          title="Dashboard"
          description="Use the dashboard to orient quickly before dropping into a specific module."
          items={dashboardSidebarItems}
          activeKey={activePanel}
          onSelect={setActivePanel}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Live data only</strong>
              <p>No fake counts, activity, or financial summaries are shown here.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activePanel === 'overview' ? (
            <div className="module-grid">
              <article className="card workspace-card">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">Welcome</p>
                    <h3>{user?.firstName ? `${user.firstName}'s dashboard` : 'Northgate overview'}</h3>
                    <p>Start from the shell, then move directly into the module where the real work already exists.</p>
                  </div>
                </div>
                <div className="quick-link-grid">
                  {quickLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="quick-link-card"
                        onClick={() => onOpenWorkspace(item.key)}
                      >
                        <span className="quick-link-card__icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className="card workspace-card">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">Assigned Work</p>
                    <h3>Current focus areas</h3>
                    <p>These cards expose real module entry points without pretending unfinished data feeds already exist.</p>
                  </div>
                </div>
                <div className="state-panel-stack">
                  <StatePanel
                    eyebrow="Live workflow"
                    title="Inventory remains the operational anchor"
                    description="Inventory keeps the deepest live workflows today: read model, storage hierarchy, QR, cart, count correction, and transaction history."
                    tone="info"
                    compact
                    actions={<button type="button" className="secondary-button" onClick={() => onOpenWorkspace('inventory')}>Open Inventory</button>}
                  />
                  <StatePanel
                    eyebrow="Live workflow"
                    title="Jobs keeps the browse/create/detail pattern"
                    description="Jobs already models the explicit browse vs create split and remains the reference for record-oriented workspaces."
                    tone="neutral"
                    compact
                    actions={<button type="button" className="secondary-button" onClick={() => onOpenWorkspace('jobs')}>Open Jobs</button>}
                  />
                </div>
              </article>

              <StatePanel
                eyebrow="Recent Activity"
                title="Activity feed is not wired yet"
                description="This region is now structurally reserved for real recent activity once an approved source is available. No sample events are rendered in the meantime."
                tone="neutral"
              />

              <StatePanel
                eyebrow="Schedule"
                title="Upcoming dates remain source-limited"
                description="Upcoming schedule and deadline cards will appear here only after a real approved source exists. The layout is in place without inventing calendar data."
                tone="neutral"
              />
            </div>
          ) : null}

          {activePanel === 'work' ? (
            <div className="module-grid module-grid--single">
              <article className="card workspace-card">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">Quick Links</p>
                    <h3>Jump into work</h3>
                    <p>The dashboard stays light on fake operations and instead routes directly into the modules that already own the real workflows.</p>
                  </div>
                </div>
                <div className="quick-link-grid">
                  {quickLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="quick-link-card"
                        onClick={() => onOpenWorkspace(item.key)}
                      >
                        <span className="quick-link-card__icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            </div>
          ) : null}

          {activePanel === 'notices' ? (
            <div className="state-panel-stack">
              {notices.length ? notices.map((notice) => (
                <StatePanel
                  key={notice}
                  eyebrow="Notice"
                  title="Attention item"
                  description={notice}
                  tone="warning"
                  compact
                />
              )) : (
                <StatePanel
                  eyebrow="Notice"
                  title="No blocking dashboard notices"
                  description="Permissions, division context, and the current dashboard shell do not show any additional blocking issues in this session."
                  tone="success"
                />
              )}
            </div>
          ) : null}
        </div>

        <SecondarySidebar
          eyebrow="Session Context"
          title="Dashboard context"
          description="This side rail summarizes the live information sources available to the dashboard without inventing module metrics."
          mobileOpen={isSecondaryOpen}
          onCloseMobile={() => setIsSecondaryOpen(false)}
        >
          <div className="context-stat-grid">
            <div className="context-stat">
              <span>Permission source</span>
              <strong>{permissions.permissionSource}</strong>
            </div>
            <div className="context-stat">
              <span>Inventory balances</span>
              <strong>{counts.inventoryBalances}</strong>
            </div>
            <div className="context-stat">
              <span>Silas status</span>
              <strong>{silasEnabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className="context-stat">
              <span>Developer access</span>
              <strong>{canAccessDeveloper ? 'Authorized' : 'Hidden'}</strong>
            </div>
          </div>
          <StatePanel
            eyebrow="Boundary"
            title="Real-data rule stays active"
            description="When a dashboard region lacks an approved source, it remains a clearly labeled placeholder instead of rendering synthetic metrics or activity."
            tone="neutral"
            compact
          />
        </SecondarySidebar>
      </div>
    </article>
  );
}

function EstimatesWorkspace({ permissions }) {
  const canAccessEstimates = permissions.permissionSource === 'server' && (permissions.canEstimate || permissions.canApproveEstimates);
  const [activeView, setActiveView] = useState('all');
  const [mode, setMode] = useState('browse');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const sidebarItems = [
    { key: 'all', label: 'All Estimates', icon: FileText, description: 'Directory foundation for every visible estimate.' },
    { key: 'mine', label: 'My Estimates', icon: HardHat, description: 'Reserved for the current estimator view.' },
    { key: 'drafts', label: 'Drafts', icon: Pencil, description: 'Draft estimate layout foundation.' },
    { key: 'submitted', label: 'Submitted', icon: ChevronUp, description: 'Submitted estimate queue foundation.' },
    { key: 'approved', label: 'Approved', icon: ShieldCheck, description: 'Approved estimate archive foundation.' },
  ];
  const estimateTabs = [
    { key: 'overview', label: 'Overview', disabled: true, meta: 'Needs a selected estimate' },
    { key: 'pricing', label: 'Pricing', disabled: true, meta: 'Permission-gated when live' },
    { key: 'documents', label: 'Documents', disabled: true, meta: 'Reserved' },
    { key: 'approval', label: 'Approval', disabled: true, meta: 'Reserved' },
    { key: 'history', label: 'History', disabled: true, meta: 'Reserved' },
  ];

  if (!canAccessEstimates) {
    return (
      <article className="card card--wide workspace-card module-workspace-card">
        <WorkspaceHeader
          eyebrow="Workspace"
          title="Estimates"
          description="The layout foundation is in place, but this session does not have estimate access through the existing permission model."
        />
        <StatePanel
          eyebrow="Permission Denied"
          title="Estimate access is not available in this session"
          description="This workspace stays fail-closed until the existing estimate permissions grant access. No estimate data or financial detail is exposed without those checks."
          tone="danger"
        />
      </article>
    );
  }

  return (
    <article className="card card--wide workspace-card module-workspace-card">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Estimates"
        description="Stable browse, create, and selected-record structure for estimates. Real estimate reads and write flows will drop into this shell later without redesigning the module."
        status={<span className="status-pill">{activeView === 'mine' ? 'My queue' : 'Browse mode'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsSecondaryOpen(true)}>
              Context
            </button>
            <button type="button" className="primary-button" onClick={() => setMode('create')}>
              <Plus aria-hidden="true" /> Create Estimate
            </button>
          </>
        )}
      />

      <div className="module-summary-grid">
        <SummaryCard label="Estimate access" value={permissions.canEstimate ? 'Yes' : 'No'} detail="Existing estimate permission" />
        <SummaryCard label="Approval access" value={permissions.canApproveEstimates ? 'Yes' : 'No'} detail="Approval boundary only" />
        <SummaryCard label="Financial visibility" value={permissions.canViewFinancials ? 'Yes' : 'No'} detail="Protected fields stay gated" />
      </div>

      <div className={`workspace-layout workspace-layout--with-secondary${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Estimate Views"
          title="Estimates"
          description="Use the same browse/create/detail pattern established by Jobs."
          items={sidebarItems}
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
              <strong>Foundation only</strong>
              <p>No estimate records or create handlers are fabricated in this pass.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card module-directory-panel">
            <div className="module-toolbar">
              <div>
                <p className="eyebrow">Directory</p>
                <h3>{sidebarItems.find((item) => item.key === activeView)?.label ?? 'Estimates'}</h3>
              </div>
              <div className="module-toolbar__actions">
                <label className="module-search">
                  <span className="sr-only">Search estimates</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search estimates..."
                  />
                </label>
                <button type="button" className="secondary-button" onClick={() => setSearch('')}>
                  Clear
                </button>
              </div>
            </div>

            <StatePanel
              eyebrow={search ? 'No Results' : 'Empty State'}
              title={search ? 'No estimates match this search yet' : 'Estimate directory is structurally ready'}
              description={search
                ? 'Search is local UI state only for now because a real estimate dataset is not yet wired into this workspace.'
                : 'The final list, filters, selected-record header, and protected financial tabs will live here once an approved estimate read path is available.'}
              tone="neutral"
            />
          </article>

          <article className="card workspace-card module-detail-panel">
            {mode === 'create' ? (
              <StatePanel
                eyebrow="Create Mode"
                title="Create Estimate will live here"
                description="The create surface is explicit and separate from browse mode, but no estimate creation workflow is being invented in this pass."
                tone="info"
                actions={<button type="button" className="secondary-button" onClick={() => setMode('browse')}><ArrowLeft aria-hidden="true" /> Back to All Estimates</button>}
              />
            ) : (
              <>
                <RecordHeader
                  eyebrow="Selected Estimate"
                  title="No estimate selected"
                  description="Browse mode remains separate from create mode, and the selected-estimate workspace waits for a real record selection."
                  meta={[
                    { label: 'View', value: sidebarItems.find((item) => item.key === activeView)?.label ?? 'All Estimates' },
                    { label: 'Protected pricing', value: permissions.canViewFinancials ? 'Visible when live' : 'Hidden when live' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={estimateTabs}
                  activeKey="overview"
                  onChange={() => {}}
                  ariaLabel="Estimate detail sections"
                />
                <StatePanel
                  eyebrow="No Selection"
                  title="Select an estimate when a real directory is available"
                  description="This panel is reserved for the persistent estimate header, tabs, and approved actions once a supported estimate record is selected."
                  tone="neutral"
                />
              </>
            )}
          </article>
        </div>

        <SecondarySidebar
          eyebrow="Estimate Context"
          title="Permissions and boundaries"
          description="The estimate module keeps protected financial data omitted entirely for users without the existing permission checks."
          mobileOpen={isSecondaryOpen}
          onCloseMobile={() => setIsSecondaryOpen(false)}
        >
          <div className="context-stat-grid">
            <div className="context-stat">
              <span>Estimate access</span>
              <strong>{permissions.canEstimate ? 'Granted' : 'Not granted'}</strong>
            </div>
            <div className="context-stat">
              <span>Approval access</span>
              <strong>{permissions.canApproveEstimates ? 'Granted' : 'Not granted'}</strong>
            </div>
            <div className="context-stat">
              <span>Create mode</span>
              <strong>Explicit only</strong>
            </div>
          </div>
          <StatePanel
            eyebrow="Boundary"
            title="No hidden estimate fallback form"
            description="Browse mode does not silently drop into a form. Create mode remains an explicit state, matching the corrected Jobs pattern."
            tone="neutral"
            compact
          />
        </SecondarySidebar>
      </div>
    </article>
  );
}

function EmployeesWorkspace({ permissions, user, people, isLoading, error }) {
  const [activeView, setActiveView] = useState('directory');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const employeeViews = [
    { key: 'directory', label: 'Employee Directory', icon: Users, description: 'Live contact rows where available.', badge: people.length },
    { key: 'mine', label: 'My Information', icon: ShieldCheck, description: 'Current user profile and division context.' },
  ];
  const employeeTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'contact', label: 'Contact' },
    { key: 'activity', label: 'Activity', meta: 'Deferred layout', disabled: false },
  ];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredPeople = people.filter((person) => {
    if (activeView === 'mine' && person.clerk_user_id !== permissions.userId) {
      return false;
    }
    if (!normalizedSearch) return true;

    return [
      person.display_name,
      person.email,
      person.role,
      person.division,
    ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedSearch));
  });
  const selectedEmployee = filteredPeople.find((person) => person.clerk_user_id === selectedEmployeeId)
    ?? people.find((person) => person.clerk_user_id === selectedEmployeeId)
    ?? null;
  const divisions = [...new Set(people.map((person) => person.division).filter(Boolean))];

  useEffect(() => {
    if (activeView === 'mine') {
      setSelectedEmployeeId(permissions.userId ?? '');
    }
  }, [activeView, permissions.userId]);

  useEffect(() => {
    if (selectedEmployeeId && !people.some((person) => person.clerk_user_id === selectedEmployeeId)) {
      setSelectedEmployeeId('');
    }
  }, [people, selectedEmployeeId]);

  return (
    <article className="card card--wide workspace-card module-workspace-card">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Employees"
        description="Directory and profile foundation for employee information. This workspace reuses the Northgate shell while keeping role changes, permission editing, and Clerk identity controls out of scope."
        status={<span className="status-pill">{people.length} visible contact{people.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsSecondaryOpen(true)}>
              Context
            </button>
            <button type="button" className="primary-button" disabled={!permissions.canManageEmployees}>
              <Plus aria-hidden="true" /> Create Employee
            </button>
          </>
        )}
      />

      <div className="module-summary-grid">
        <SummaryCard label="Visible people" value={people.length} detail={isLoading ? 'Loading directory...' : 'Live destination-user references'} tone="accent" />
        <SummaryCard label="Divisions" value={divisions.length} detail="Distinct visible divisions" />
        <SummaryCard label="Manage employees" value={permissions.canManageEmployees ? 'Yes' : 'No'} detail="No employee-management actions added here" />
      </div>

      <div className={`workspace-layout workspace-layout--with-secondary${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Employee Views"
          title="Employees"
          description="Keep directory browsing and current-user profile context in one stable module shell."
          items={employeeViews}
          activeKey={activeView}
          onSelect={setActiveView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Protected boundary</strong>
              <p>This page does not edit roles, permissions, Clerk identities, or employee source-of-truth records.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card module-directory-panel">
            <div className="module-toolbar">
              <div>
                <p className="eyebrow">Directory</p>
                <h3>{employeeViews.find((item) => item.key === activeView)?.label ?? 'Employees'}</h3>
              </div>
              <div className="module-toolbar__actions">
                <label className="module-search">
                  <span className="sr-only">Search employees</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search employees..."
                  />
                </label>
              </div>
            </div>

            {error ? <StatePanel eyebrow="Error" title="Employee references failed to load" description="The existing destination-user reference view was unavailable in this session, so the directory surface cannot show live rows right now." tone="danger" /> : null}
            {isLoading ? <StatePanel eyebrow="Loading" title="Loading employee directory" description="The workspace shell is ready while the existing reference rows load." tone="info" /> : null}
            {!isLoading && !error && !filteredPeople.length ? (
              <StatePanel
                eyebrow={search ? 'No Results' : 'Empty State'}
                title={search ? 'No employees matched this search' : activeView === 'mine' ? 'My information is not available yet' : 'No employee rows are visible'}
                description={search
                  ? 'Try a different name, role, email, or division search.'
                  : activeView === 'mine'
                    ? 'The current user is not present in the existing reference view yet, so this module shows the layout foundation without inventing profile data.'
                    : 'This workspace will render real employee directory rows when the existing read path has visible data.'}
                tone="neutral"
              />
            ) : null}

            {!isLoading && !error && filteredPeople.length ? (
              <>
                <div className="table-wrap">
                  <table className="data-table module-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Division</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPeople.map((person) => (
                        <tr
                          key={person.clerk_user_id || person.email}
                          className={selectedEmployeeId === person.clerk_user_id ? 'is-selected' : undefined}
                          onClick={() => {
                            setSelectedEmployeeId(person.clerk_user_id);
                            setActiveTab('overview');
                          }}
                        >
                          <td><strong>{person.display_name || 'Unnamed user'}</strong></td>
                          <td>{person.role || 'User'}</td>
                          <td>{person.division || 'Unassigned'}</td>
                          <td>{person.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-list tool-mobile-list">
                  {filteredPeople.map((person) => (
                    <article
                      className={`mobile-item${selectedEmployeeId === person.clerk_user_id ? ' is-selected' : ''}`}
                      key={person.clerk_user_id || person.email}
                    >
                      <strong>{person.display_name || 'Unnamed user'}</strong>
                      <div className="meta-grid">
                        <span>Role: {person.role || 'User'}</span>
                        <span>Division: {person.division || 'Unassigned'}</span>
                        <span>Email: {person.email || '-'}</span>
                      </div>
                      <div className="cart-actions">
                        <button type="button" className="secondary-button" onClick={() => {
                          setSelectedEmployeeId(person.clerk_user_id);
                          setActiveTab('overview');
                        }}>
                          View
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <article className="card workspace-card module-detail-panel">
            {selectedEmployee ? (
              <>
                <RecordHeader
                  eyebrow="Selected Employee"
                  title={selectedEmployee.display_name || 'Unnamed user'}
                  description="Employee detail remains read-oriented in this phase. The shell is ready for richer sections later without implying account or permission editing."
                  meta={[
                    { label: 'Role', value: selectedEmployee.role || 'User' },
                    { label: 'Division', value: selectedEmployee.division || 'Unassigned' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={employeeTabs}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Employee detail sections"
                />

                {activeTab === 'overview' ? (
                  <div className="module-grid module-grid--single">
                    <div className="module-fact-grid">
                      <SummaryCard label="Email" value={selectedEmployee.email || '-'} detail="Live contact field" />
                      <SummaryCard label="Profile source" value="Reference view" detail="No source-of-truth mutation added" />
                    </div>
                    <StatePanel
                      eyebrow="Overview"
                      title="Employee workspace foundation is active"
                      description="Overview, contact, assignment, credentials, and activity regions can be inserted into this selected-record shell later without revisiting the layout."
                      tone="neutral"
                    />
                  </div>
                ) : null}

                {activeTab === 'contact' ? (
                  <StatePanel
                    eyebrow="Contact"
                    title="Contact details"
                    description={`Email: ${selectedEmployee.email || 'Unavailable'}. Additional contact fields such as phone or supervisor will appear here only when an approved live source exists.`}
                    tone="info"
                  />
                ) : null}

                {activeTab === 'activity' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Employee activity is not implemented yet"
                    description="This tab is structurally reserved without inventing assignments, credentials, documents, or activity history."
                    tone="neutral"
                  />
                ) : null}
              </>
            ) : (
              <StatePanel
                eyebrow="No Selection"
                title="Select an employee to open the detail workspace"
                description={activeView === 'mine'
                  ? `Use the current-user row once it is available in the live reference view. Signed in as ${user?.primaryEmailAddress?.emailAddress ?? user?.id ?? 'current user'}.`
                  : 'The selected-employee header and tabs appear here when you choose a row from the directory.'}
                tone="neutral"
              />
            )}
          </article>
        </div>

        <SecondarySidebar
          eyebrow="Employee Context"
          title="Directory context"
          description="This context rail stays presentation-only and does not expose role or permission mutation controls."
          mobileOpen={isSecondaryOpen}
          onCloseMobile={() => setIsSecondaryOpen(false)}
        >
          <div className="context-stat-grid">
            <div className="context-stat">
              <span>Visible contacts</span>
              <strong>{people.length}</strong>
            </div>
            <div className="context-stat">
              <span>Current role</span>
              <strong>{permissions.role ?? 'User'}</strong>
            </div>
            <div className="context-stat">
              <span>Current division</span>
              <strong>{permissions.division ?? 'Unassigned'}</strong>
            </div>
          </div>
          <StatePanel
            eyebrow="Boundary"
            title="No role or permission editor"
            description="Profile and contact presentation can live here, but role changes, overrides, and permission management remain outside this pass."
            tone="neutral"
            compact
          />
        </SecondarySidebar>
      </div>
    </article>
  );
}

function VehiclesWorkspace({ permissions, vehicles, isLoading, error }) {
  const [activeView, setActiveView] = useState('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const vehicleViews = [
    { key: 'all', label: 'All Vehicles', icon: Truck, description: 'Every visible destination vehicle.', badge: vehicles.length },
    { key: 'stock', label: 'Stock Vehicles', icon: Briefcase, description: 'Vehicles flagged to hold inventory.', badge: vehicles.filter((vehicle) => vehicle.holds_stock).length },
    { key: 'fleet', label: 'General Fleet', icon: MapPin, description: 'Visible vehicles not flagged as stock-holding.', badge: vehicles.filter((vehicle) => !vehicle.holds_stock).length },
  ];
  const vehicleTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'assignment', label: 'Assignment' },
    { key: 'service', label: 'Service' },
    { key: 'history', label: 'History' },
  ];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredVehicles = vehicles.filter((vehicle) => {
    if (activeView === 'stock' && !vehicle.holds_stock) return false;
    if (activeView === 'fleet' && vehicle.holds_stock) return false;
    if (!normalizedSearch) return true;

    return [
      vehicle.vehicle_number,
      vehicle.make,
      vehicle.model,
      vehicle.classification,
      vehicle.division,
    ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedSearch));
  });
  const selectedVehicle = filteredVehicles.find((vehicle) => vehicle.id === selectedVehicleId)
    ?? vehicles.find((vehicle) => vehicle.id === selectedVehicleId)
    ?? null;
  const divisions = [...new Set(vehicles.map((vehicle) => vehicle.division).filter(Boolean))];

  useEffect(() => {
    if (selectedVehicleId && !vehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId('');
    }
  }, [selectedVehicleId, vehicles]);

  return (
    <article className="card card--wide workspace-card module-workspace-card">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Vehicles"
        description="Fleet layout foundation using the live vehicle destination-reference path where available. Assignment, service, and history remain honest placeholders until their approved data surfaces are added."
        status={<span className="status-pill">{vehicles.length} visible vehicle{vehicles.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsSecondaryOpen(true)}>
              Context
            </button>
            <button type="button" className="primary-button" disabled={!permissions.canManageVehicles}>
              <Plus aria-hidden="true" /> Add Vehicle
            </button>
          </>
        )}
      />

      <div className="module-summary-grid">
        <SummaryCard label="Visible vehicles" value={vehicles.length} detail={isLoading ? 'Loading vehicle references...' : 'Live destination-vehicle references'} tone="accent" />
        <SummaryCard label="Stock vehicles" value={vehicles.filter((vehicle) => vehicle.holds_stock).length} detail="Vehicles marked as inventory-capable" />
        <SummaryCard label="Divisions" value={divisions.length} detail="Distinct visible divisions" />
      </div>

      <div className={`workspace-layout workspace-layout--with-secondary${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Vehicle Views"
          title="Vehicles"
          description="The shell is ready for browse, selected-record, and deferred assignment/service tabs."
          items={vehicleViews}
          activeKey={activeView}
          onSelect={setActiveView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Foundation only</strong>
              <p>No assignment writes, maintenance records, or service workflows are fabricated here.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card module-directory-panel">
            <div className="module-toolbar">
              <div>
                <p className="eyebrow">Directory</p>
                <h3>{vehicleViews.find((item) => item.key === activeView)?.label ?? 'Vehicles'}</h3>
              </div>
              <div className="module-toolbar__actions">
                <label className="module-search">
                  <span className="sr-only">Search vehicles</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search vehicles..."
                  />
                </label>
              </div>
            </div>

            {error ? <StatePanel eyebrow="Error" title="Vehicle references failed to load" description="The existing destination-vehicle reference view was unavailable, so the workspace cannot show live fleet rows right now." tone="danger" /> : null}
            {isLoading ? <StatePanel eyebrow="Loading" title="Loading vehicles" description="The layout foundation is ready while live vehicle references load." tone="info" /> : null}
            {!isLoading && !error && !filteredVehicles.length ? (
              <StatePanel
                eyebrow={search ? 'No Results' : 'Empty State'}
                title={search ? 'No vehicles matched this search' : 'No vehicles are visible'}
                description={search
                  ? 'Try searching by unit number, make, model, classification, or division.'
                  : 'This directory stays honest when the existing read path has no visible vehicles.'}
                tone="neutral"
              />
            ) : null}

            {!isLoading && !error && filteredVehicles.length ? (
              <>
                <div className="table-wrap">
                  <table className="data-table module-table">
                    <thead>
                      <tr>
                        <th>Unit #</th>
                        <th>Classification</th>
                        <th>Make</th>
                        <th>Model</th>
                        <th>Division</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVehicles.map((vehicle) => (
                        <tr
                          key={vehicle.id}
                          className={selectedVehicleId === vehicle.id ? 'is-selected' : undefined}
                          onClick={() => {
                            setSelectedVehicleId(vehicle.id);
                            setActiveTab('overview');
                          }}
                        >
                          <td><strong>{vehicle.vehicle_number || vehicle.id}</strong></td>
                          <td>{vehicle.classification || 'Vehicle'}</td>
                          <td>{vehicle.make || '-'}</td>
                          <td>{vehicle.model || '-'}</td>
                          <td>{vehicle.division || 'Unassigned'}</td>
                          <td>{vehicle.holds_stock ? 'Holds stock' : 'Fleet only'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-list tool-mobile-list">
                  {filteredVehicles.map((vehicle) => (
                    <article className={`mobile-item${selectedVehicleId === vehicle.id ? ' is-selected' : ''}`} key={vehicle.id}>
                      <strong>{vehicle.vehicle_number || vehicle.id}</strong>
                      <div className="meta-grid">
                        <span>Classification: {vehicle.classification || 'Vehicle'}</span>
                        <span>Make/Model: {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '-'}</span>
                        <span>Division: {vehicle.division || 'Unassigned'}</span>
                        <span>Stock: {vehicle.holds_stock ? 'Holds stock' : 'Fleet only'}</span>
                      </div>
                      <div className="cart-actions">
                        <button type="button" className="secondary-button" onClick={() => {
                          setSelectedVehicleId(vehicle.id);
                          setActiveTab('overview');
                        }}>
                          View
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <article className="card workspace-card module-detail-panel">
            {selectedVehicle ? (
              <>
                <RecordHeader
                  eyebrow="Selected Vehicle"
                  title={selectedVehicle.vehicle_number || selectedVehicle.id}
                  description="This selected-record shell preserves a persistent header and horizontal tabs without inventing assignment or maintenance workflows."
                  meta={[
                    { label: 'Classification', value: selectedVehicle.classification || 'Vehicle' },
                    { label: 'Division', value: selectedVehicle.division || 'Unassigned' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={vehicleTabs}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Vehicle detail sections"
                />

                {activeTab === 'overview' ? (
                  <div className="module-fact-grid">
                    <SummaryCard label="Make" value={selectedVehicle.make || '-'} detail="Live vehicle reference field" />
                    <SummaryCard label="Model" value={selectedVehicle.model || '-'} detail="Live vehicle reference field" />
                    <SummaryCard label="Stock capable" value={selectedVehicle.holds_stock ? 'Yes' : 'No'} detail="Destination-reference flag" />
                  </div>
                ) : null}

                {activeTab === 'assignment' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Assignment details are not wired yet"
                    description="This region is reserved for real assignment data only when an approved source-of-truth path exists."
                    tone="neutral"
                  />
                ) : null}

                {activeTab === 'service' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Service records are not wired yet"
                    description="No maintenance history, mileage, inspections, or service alerts are fabricated in this pass."
                    tone="neutral"
                  />
                ) : null}

                {activeTab === 'history' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Vehicle history is not wired yet"
                    description="This tab remains reserved for real history once an approved read source exists."
                    tone="neutral"
                  />
                ) : null}
              </>
            ) : (
              <StatePanel
                eyebrow="No Selection"
                title="Select a vehicle to open the detail workspace"
                description="The persistent vehicle header and horizontal detail tabs appear here when you choose a row from the live vehicle directory."
                tone="neutral"
              />
            )}
          </article>
        </div>

        <SecondarySidebar
          eyebrow="Vehicle Context"
          title="Fleet context"
          description="This side rail keeps the module grounded in live fields that already exist."
          mobileOpen={isSecondaryOpen}
          onCloseMobile={() => setIsSecondaryOpen(false)}
        >
          <div className="context-stat-grid">
            <div className="context-stat">
              <span>Visible vehicles</span>
              <strong>{vehicles.length}</strong>
            </div>
            <div className="context-stat">
              <span>Stock-capable</span>
              <strong>{vehicles.filter((vehicle) => vehicle.holds_stock).length}</strong>
            </div>
            <div className="context-stat">
              <span>Can manage vehicles</span>
              <strong>{permissions.canManageVehicles ? 'Yes' : 'No'}</strong>
            </div>
          </div>
          <StatePanel
            eyebrow="Boundary"
            title="No assignment or service mutations"
            description="This layout exposes real rows where available, but assignment changes and service workflows remain outside this front-end foundation pass."
            tone="neutral"
            compact
          />
        </SecondarySidebar>
      </div>
    </article>
  );
}

function DeveloperWorkspace({
  user,
  permissions,
  showDevDashboard,
  onShow,
  onHide,
  formattingTunerValues,
  setFormattingTunerValues,
  resetFormattingTunerValues,
  silasEnabled,
  silasSettingsLoading,
  silasSettingsError,
  silasTogglePending,
  onToggleSilas,
}) {
  return (
    <article className="card card--wide workspace-card module-workspace-card">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Developer"
        description="Developer-only status, diagnostics, and approved utilities. This workspace remains gated by the existing server-authoritative developer access check."
        status={<span className="status-pill">{permissions.canAccessDeveloper ? 'Developer access confirmed' : 'Developer access required'}</span>}
      />

      <div className="module-summary-grid">
        <SummaryCard label="Role" value={permissions.role ?? 'User'} detail="Server-authoritative role" />
        <SummaryCard label="Division" value={permissions.division ?? 'Unassigned'} detail="Current operator division" />
        <SummaryCard label="Silas" value={silasEnabled ? 'Enabled' : 'Disabled'} detail="Developer-controlled global state" />
        <SummaryCard label="Permission source" value={permissions.permissionSource} detail="Must remain server-derived" />
      </div>

      <StatePanel
        eyebrow="Boundary"
        title="Developer scope remains status-oriented"
        description="This module does not add granular permission editors, SQL consoles, service-role access, environment secret views, or target-user effective-permission viewers."
        tone="neutral"
        compact
      />

      <DeveloperDashboard
        user={user}
        permissions={permissions}
        showDevDashboard={showDevDashboard}
        onShow={onShow}
        onHide={onHide}
        formattingTunerValues={formattingTunerValues}
        setFormattingTunerValues={setFormattingTunerValues}
        resetFormattingTunerValues={resetFormattingTunerValues}
        silasEnabled={silasEnabled}
        silasSettingsLoading={silasSettingsLoading}
        silasSettingsError={silasSettingsError}
        silasTogglePending={silasTogglePending}
        onToggleSilas={onToggleSilas}
      />
    </article>
  );
}

function ComingSoonWorkspace({ title, description }) {
  return (
    <article className="card card--wide workspace-card module-workspace-card">
      <WorkspaceHeader eyebrow="Workspace" title={title} description={description} />
      <StatePanel
        eyebrow="Not Implemented"
        title={`${title} foundation is still deferred`}
        description={description}
        tone="neutral"
      />
    </article>
  );
}

function JobsWorkspace({ permissions, navigateTo }) {
  const { getToken } = useAuth();
  const canReadJobs = permissions.permissionSource === 'server';
  const canCreateJobs = canReadJobs && permissions.canCreateJobs;
  const canManageJobs = canReadJobs && permissions.canManageJobs;
  const canViewFinancials = canReadJobs && permissions.canViewFinancials;
  const canApproveBudget = canReadJobs && permissions.canApproveBudget;
  const canIssueToJob = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const hasWritableDivision = Boolean(permissions.division);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [jobMessage, setJobMessage] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [activeJobDetailTab, setActiveJobDetailTab] = useState('overview');
  const [draft, setDraft] = useState(() => createJobDraft());
  const [jobMaterials, setJobMaterials] = useState([]);
  const [isLoadingJobMaterials, setIsLoadingJobMaterials] = useState(false);
  const [isSavingJobMaterial, setIsSavingJobMaterial] = useState(false);
  const [jobMaterialsError, setJobMaterialsError] = useState(null);
  const [jobMaterialMessage, setJobMaterialMessage] = useState('');
  const [jobMaterialSearch, setJobMaterialSearch] = useState('');
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [materialDraft, setMaterialDraft] = useState(() => createJobMaterialDraft());
  const [buyoutLines, setBuyoutLines] = useState([]);
  const [isLoadingBuyoutLines, setIsLoadingBuyoutLines] = useState(false);
  const [isSavingBuyoutLine, setIsSavingBuyoutLine] = useState(false);
  const [buyoutLinesError, setBuyoutLinesError] = useState(null);
  const [buyoutLineMessage, setBuyoutLineMessage] = useState('');
  const [buyoutLineSearch, setBuyoutLineSearch] = useState('');
  const [buyoutCatalogSearch, setBuyoutCatalogSearch] = useState('');
  const [buyoutDraft, setBuyoutDraft] = useState(() => createJobBuyoutDraft());
  const [buyoutInStockByItemId, setBuyoutInStockByItemId] = useState(() => new Map());
  const [isLoadingBuyoutInStock, setIsLoadingBuyoutInStock] = useState(false);
  const [buyoutInStockError, setBuyoutInStockError] = useState(null);
  const [jobTransactions, setJobTransactions] = useState([]);
  const [isLoadingJobTransactions, setIsLoadingJobTransactions] = useState(false);
  const [jobTransactionsError, setJobTransactionsError] = useState(null);
  const [budgetLines, setBudgetLines] = useState([]);
  const [isLoadingBudgetLines, setIsLoadingBudgetLines] = useState(false);
  const [isSavingBudgetLine, setIsSavingBudgetLine] = useState(false);
  const [budgetLinesError, setBudgetLinesError] = useState(null);
  const [budgetLineMessage, setBudgetLineMessage] = useState('');
  const [budgetLineSearch, setBudgetLineSearch] = useState('');
  const [budgetDraft, setBudgetDraft] = useState(() => createJobBudgetDraft());
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [documentsError, setDocumentsError] = useState(null);
  const [documentMessage, setDocumentMessage] = useState('');
  const [documentDraft, setDocumentDraft] = useState(() => createJobDocumentDraft());
  const [documentFileInputKey, setDocumentFileInputKey] = useState(0);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [isLoadingScheduleItems, setIsLoadingScheduleItems] = useState(false);
  const [isSavingScheduleItem, setIsSavingScheduleItem] = useState(false);
  const [scheduleItemsError, setScheduleItemsError] = useState(null);
  const [scheduleItemMessage, setScheduleItemMessage] = useState('');
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState(() => createJobScheduleDraft());
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    division: '',
  });
  const [jobsWorkspaceMode, setJobsWorkspaceMode] = useState('browse');
  const [isJobsUtilityRailCollapsed, setIsJobsUtilityRailCollapsed] = useState(false);
  const [isJobsStatusRailCollapsed, setIsJobsStatusRailCollapsed] = useState(false);
  const selectedJob = jobs.find((row) => row.id === selectedJobId) ?? null;
  const selectedJobCanEdit = Boolean(selectedJob && canManageJobs && selectedJob.division === permissions.division);
  const selectedJobCanManageBudget = Boolean(selectedJob && canApproveBudget && selectedJob.division === permissions.division);
  const selectedJobCanManageDocuments = Boolean(selectedJob && canManageJobs && selectedJob.division === permissions.division);
  const selectedJobCanManageSchedule = Boolean(selectedJob && canManageJobs && selectedJob.division === permissions.division);
  const formCanSave = selectedJob ? selectedJobCanEdit : canCreateJobs && hasWritableDivision;
  const jobDetailTabs = useMemo(() => getJobDetailTabs(canViewFinancials), [canViewFinancials]);
  const divisionOptions = useMemo(
    () => [...new Set(jobs.map((row) => row.division || 'Unassigned'))]
      .sort((first, second) => first.localeCompare(second)),
    [jobs],
  );
  const showDivisionFilter = permissions.canViewAllDivisions && divisionOptions.length > 1;
  const filteredJobs = useMemo(() => filterJobRows(jobs, filters), [jobs, filters]);
  const filteredJobMaterials = useMemo(() => filterJobMaterialRows(jobMaterials, jobMaterialSearch), [jobMaterials, jobMaterialSearch]);
  const jobMaterialSummary = useMemo(() => getJobMaterialSummary(jobMaterials), [jobMaterials]);
  const catalogMatches = useMemo(() => filterJobMaterialCatalogItems(catalogItems, catalogSearch), [catalogItems, catalogSearch]);
  const selectedCatalogItem = catalogItems.find((item) => item.id === materialDraft.item_id) ?? null;
  const materialFormCanSave = Boolean(selectedJobCanEdit && selectedJob && !isSavingJobMaterial);
  const catalogById = useMemo(() => new Map(catalogItems.map((item) => [item.id, item])), [catalogItems]);
  const filteredBuyoutLines = useMemo(() => filterJobBuyoutRows(buyoutLines, buyoutLineSearch), [buyoutLines, buyoutLineSearch]);
  const buyoutSummary = useMemo(() => getJobBuyoutSummary(buyoutLines), [buyoutLines]);
  const buyoutCatalogMatches = useMemo(() => filterJobMaterialCatalogItems(catalogItems, buyoutCatalogSearch), [catalogItems, buyoutCatalogSearch]);
  const selectedBuyoutCatalogItem = catalogItems.find((item) => item.id === buyoutDraft.item_id) ?? null;
  const buyoutFormCanSave = Boolean(selectedJobCanEdit && selectedJob && !isSavingBuyoutLine);
  const filteredJobTransactions = useMemo(() => jobTransactions, [jobTransactions]);
  const orderedBudgetLines = useMemo(() => sortJobBudgetRows(budgetLines), [budgetLines]);
  const filteredBudgetLines = useMemo(() => filterJobBudgetRows(orderedBudgetLines, budgetLineSearch), [orderedBudgetLines, budgetLineSearch]);
  const budgetSummary = useMemo(() => getJobBudgetSummary(orderedBudgetLines), [orderedBudgetLines]);
  const documentSummary = useMemo(() => getJobDocumentSummary(documents), [documents]);
  const orderedScheduleItems = useMemo(() => sortJobScheduleRows(scheduleItems), [scheduleItems]);
  const filteredScheduleItems = useMemo(() => filterJobScheduleRows(orderedScheduleItems, scheduleSearch), [orderedScheduleItems, scheduleSearch]);
  const scheduleSummary = useMemo(() => getJobScheduleSummary(orderedScheduleItems), [orderedScheduleItems]);
  const documentSuggestedName = useMemo(
    () => (selectedJob && documentDraft.file
      ? buildJobDocumentSuggestedName(
        selectedJob,
        documentDraft.document_type,
        documentDraft.description,
        documentDraft.file?.name ?? '',
      )
      : ''),
    [selectedJob, documentDraft.document_type, documentDraft.description, documentDraft.file],
  );
  const budgetFormCanSave = Boolean(selectedJobCanManageBudget && selectedJob && !isSavingBudgetLine);
  const documentFormCanSave = Boolean(selectedJobCanManageDocuments && selectedJob && documentDraft.file && !isSavingDocument);
  const scheduleFormCanSave = Boolean(selectedJobCanManageSchedule && selectedJob && !isSavingScheduleItem);
  const jobsDashboardShellClassName = [
    'jobs-dashboard-shell',
    isJobsUtilityRailCollapsed ? 'is-utility-collapsed' : '',
    isJobsStatusRailCollapsed ? 'is-status-collapsed' : '',
  ].filter(Boolean).join(' ');
  const jobStatusCounts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter((row) => row.status === 'active').length,
    on_hold: jobs.filter((row) => row.status === 'on_hold').length,
    complete: jobs.filter((row) => row.status === 'complete').length,
    cancelled: jobs.filter((row) => row.status === 'cancelled').length,
  }), [jobs]);
  const jobsPanelTitle = filters.status ? formatJobStatusLabel(filters.status) : 'All Jobs';
  const jobsStatusRailItems = useMemo(() => ([
    { key: '', label: 'All Jobs', shortLabel: 'All', badge: jobStatusCounts.all },
    { key: 'active', label: 'Active Jobs', shortLabel: 'Act', badge: jobStatusCounts.active },
    { key: 'on_hold', label: 'On Hold', shortLabel: 'Hold', badge: jobStatusCounts.on_hold },
    { key: 'complete', label: 'Completed', shortLabel: 'Done', badge: jobStatusCounts.complete },
    { key: 'cancelled', label: 'Cancelled', shortLabel: 'Off', badge: jobStatusCounts.cancelled },
  ]), [jobStatusCounts]);
  const isCreateJobPanelOpen = jobsWorkspaceMode === 'create' && !selectedJob;

  async function loadJobs({ preserveMessage = false } = {}) {
    if (!canReadJobs) return;

    setIsLoadingJobs(true);
    setJobsError(null);
    if (!preserveMessage) setJobMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('jobs')
        .select(JOBS_SELECT_FIELDS)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setJobs(data ?? []);
    } catch (error) {
      console.error('Jobs load failed', error);
      setJobs([]);
      setJobsError(error);
    } finally {
      setIsLoadingJobs(false);
    }
  }

  async function loadJobMaterials(jobId, { preserveMessage = false } = {}) {
    if (!canReadJobs || !jobId) {
      setJobMaterials([]);
      return;
    }

    setIsLoadingJobMaterials(true);
    setJobMaterialsError(null);
    if (!preserveMessage) setJobMaterialMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('job_materials')
        .select(JOB_MATERIALS_SELECT_FIELDS)
        .eq('job_id', jobId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setJobMaterials(data ?? []);
    } catch (error) {
      console.error('Job Material List load failed', error);
      setJobMaterials([]);
      setJobMaterialsError(error);
    } finally {
      setIsLoadingJobMaterials(false);
    }
  }

  async function loadJobMaterialCatalog() {
    if (!canReadJobs) {
      setCatalogItems([]);
      return;
    }

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('items')
        .select(JOB_MATERIAL_CATALOG_SELECT_FIELDS)
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('material_code', { ascending: true })
        .limit(1000);
      if (error) throw error;
      setCatalogItems(data ?? []);
    } catch (error) {
      console.error('Job Material catalog load failed', error);
      setCatalogItems([]);
      setJobMaterialMessage('Catalog materials failed to load for this job division.');
    }
  }

  async function loadBuyoutLines(jobId, { preserveMessage = false } = {}) {
    if (!canReadJobs || !jobId) {
      setBuyoutLines([]);
      setBuyoutInStockByItemId(new Map());
      setIsLoadingBuyoutLines(false);
      return;
    }

    setIsLoadingBuyoutLines(true);
    setBuyoutLinesError(null);
    if (!preserveMessage) setBuyoutLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('job_buyout_lines')
        .select(JOB_BUYOUT_LINES_SELECT_FIELDS)
        .eq('job_id', jobId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setBuyoutLines(data ?? []);
    } catch (error) {
      console.error('Buyout List load failed', error);
      setBuyoutLines([]);
      setBuyoutLinesError(error);
    } finally {
      setIsLoadingBuyoutLines(false);
    }
  }

  async function loadBuyoutInStockSignals(lines = buyoutLines, division = selectedJob?.division ?? '') {
    if (!canReadJobs || !division) {
      setBuyoutInStockByItemId(new Map());
      setIsLoadingBuyoutInStock(false);
      return;
    }

    const itemIds = [...new Set(lines.map((row) => row.item_id).filter(Boolean))];
    if (!itemIds.length) {
      setBuyoutInStockByItemId(new Map());
      setIsLoadingBuyoutInStock(false);
      return;
    }

    setIsLoadingBuyoutInStock(true);
    setBuyoutInStockError(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('inventory_cart_candidates_view')
        .select('item_id, division, quantity_on_hand')
        .eq('division', division)
        .in('item_id', itemIds);
      if (error) throw error;

      const next = new Map();
      (data ?? []).forEach((row) => {
        const itemId = row.item_id;
        if (!itemId) return;
        const quantity = Number(row.quantity_on_hand ?? 0);
        if (!Number.isFinite(quantity)) return;
        next.set(itemId, (next.get(itemId) ?? 0) + quantity);
      });
      setBuyoutInStockByItemId(next);
    } catch (error) {
      console.error('Buyout List In Stock lookup failed', error);
      setBuyoutInStockByItemId(new Map());
      setBuyoutInStockError(error);
    } finally {
      setIsLoadingBuyoutInStock(false);
    }
  }

  async function loadJobTransactions(jobId) {
    if (!canReadJobs || !jobId) {
      setJobTransactions([]);
      setIsLoadingJobTransactions(false);
      setJobTransactionsError(null);
      return;
    }

    setIsLoadingJobTransactions(true);
    setJobTransactionsError(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('job_transaction_log')
        .select('transaction_item_id, transaction_id, occurred_at, transaction_created_at, division, job_id, item_id, material_code, item_name, unit_of_measure, quantity, transaction_type, source_bin_id, source_bin_code, source_bin_label, source_location_label, performed_by, performed_by_user_id, note, ledger_sequence')
        .eq('job_id', jobId)
        .order('occurred_at', { ascending: false })
        .order('ledger_sequence', { ascending: false });
      if (error) throw error;
      setJobTransactions(data ?? []);
    } catch (error) {
      console.error('Job Transactions Log load failed', error);
      setJobTransactions([]);
      setJobTransactionsError(error);
    } finally {
      setIsLoadingJobTransactions(false);
    }
  }

  async function loadJobDocuments(jobId, { preserveMessage = false } = {}) {
    if (!canReadJobs || !jobId) {
      setDocuments([]);
      setIsLoadingDocuments(false);
      setDocumentsError(null);
      return;
    }

    setIsLoadingDocuments(true);
    setDocumentsError(null);
    if (!preserveMessage) setDocumentMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('documents')
        .select(JOB_DOCUMENTS_SELECT_FIELDS)
        .eq('owner_type', 'job')
        .eq('owner_id', jobId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data ?? []);
    } catch (error) {
      console.error('Job Documents load failed', error);
      setDocuments([]);
      setDocumentsError(error);
    } finally {
      setIsLoadingDocuments(false);
    }
  }

  async function loadJobBudgetLines(jobId, { preserveMessage = false } = {}) {
    if (!canViewFinancials || !jobId) {
      setBudgetLines([]);
      setIsLoadingBudgetLines(false);
      setBudgetLinesError(null);
      return;
    }

    setIsLoadingBudgetLines(true);
    setBudgetLinesError(null);
    if (!preserveMessage) setBudgetLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('job_budget_lines')
        .select(JOB_BUDGET_LINES_SELECT_FIELDS)
        .eq('job_id', jobId)
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      setBudgetLines(data ?? []);
    } catch (error) {
      console.error('Job Financials load failed', error);
      setBudgetLines([]);
      setBudgetLinesError(error);
    } finally {
      setIsLoadingBudgetLines(false);
    }
  }

  async function loadJobScheduleItems(jobId, { preserveMessage = false } = {}) {
    if (!canReadJobs || !jobId) {
      setScheduleItems([]);
      setIsLoadingScheduleItems(false);
      setScheduleItemsError(null);
      return;
    }

    setIsLoadingScheduleItems(true);
    setScheduleItemsError(null);
    if (!preserveMessage) setScheduleItemMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client
        .from('job_schedule_items')
        .select(JOB_SCHEDULE_SELECT_FIELDS)
        .eq('job_id', jobId)
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      setScheduleItems(data ?? []);
    } catch (error) {
      console.error('Job Schedule load failed', error);
      setScheduleItems([]);
      setScheduleItemsError(error);
    } finally {
      setIsLoadingScheduleItems(false);
    }
  }

  function issueMaterialToJob(row) {
    if (!canIssueToJob || !selectedJob || !navigateTo) {
      return;
    }

    const materialSearch = [row.material_code_snapshot, row.material_name_snapshot]
      .filter(Boolean)
      .join(' ')
      .trim();

    const stored = setIssueToJobHandoff({
      jobId: selectedJob.id,
      jobDisplayLabel: buildJobDisplayLabel(selectedJob),
      jobNumber: selectedJob.job_number ?? '',
      jobName: selectedJob.name ?? '',
      serviceCallNumber: selectedJob.service_call_number ?? '',
      division: selectedJob.division ?? '',
      itemId: row.item_id ?? '',
      materialCode: row.material_code_snapshot ?? '',
      materialName: row.material_name_snapshot ?? '',
      materialSearch,
      requestedQuantity: row.requested_quantity ?? '',
      lineId: row.id ?? '',
      source: 'job-material-line',
      createdAt: new Date().toISOString(),
    });

    if (!stored) {
      setJobMaterialMessage('Issue to Job handoff failed to save locally. Please try again.');
      return;
    }

    navigateTo('/?workspace=inventory&inventoryTab=cart');
  }

  useEffect(() => {
    loadJobs();
  }, [canReadJobs, getToken]);

  useEffect(() => {
    setMaterialDraft(createJobMaterialDraft());
    setCatalogSearch('');
    setJobMaterialSearch('');
    setJobMaterialMessage('');
    setBuyoutDraft(createJobBuyoutDraft());
    setBuyoutCatalogSearch('');
    setBuyoutLineSearch('');
    setBuyoutLineMessage('');
    setBuyoutLinesError(null);
    setBuyoutInStockByItemId(new Map());
    setBuyoutInStockError(null);
    setJobTransactions([]);
    setJobTransactionsError(null);
    setBudgetDraft(createJobBudgetDraft());
    setBudgetLineSearch('');
    setBudgetLineMessage('');
    setBudgetLines([]);
    setBudgetLinesError(null);
    setDocumentDraft(createJobDocumentDraft());
    setDocumentMessage('');
    setDocuments([]);
    setDocumentsError(null);
    setDocumentFileInputKey((value) => value + 1);
    setScheduleDraft(createJobScheduleDraft());
    setScheduleSearch('');
    setScheduleItemMessage('');
    setScheduleItems([]);
    setScheduleItemsError(null);

    if (!selectedJob) {
      setJobMaterials([]);
      setBuyoutLines([]);
      setCatalogItems([]);
      setJobMaterialsError(null);
      setBuyoutLinesError(null);
      setJobTransactions([]);
      setJobTransactionsError(null);
      setBudgetLines([]);
      setBudgetLinesError(null);
      setDocuments([]);
      setDocumentsError(null);
      setScheduleItems([]);
      setScheduleItemsError(null);
      return;
    }

    loadJobMaterials(selectedJob.id);
    loadBuyoutLines(selectedJob.id);
    loadJobTransactions(selectedJob.id);
    loadJobDocuments(selectedJob.id);
    loadJobScheduleItems(selectedJob.id);
    if (canViewFinancials) {
      loadJobBudgetLines(selectedJob.id);
    }
    if (selectedJobCanEdit) {
      loadJobMaterialCatalog();
    } else {
      setCatalogItems([]);
    }
  }, [selectedJobId, selectedJobCanEdit, selectedJob?.division, canViewFinancials]);

  useEffect(() => {
    if (!selectedJob?.division) {
      setBuyoutInStockByItemId(new Map());
      return;
    }

    loadBuyoutInStockSignals(buyoutLines, selectedJob.division);
  }, [buyoutLines, selectedJob?.division]);

  useEffect(() => {
    if (selectedJobId && !jobs.some((row) => row.id === selectedJobId)) {
      setSelectedJobId('');
      setJobsWorkspaceMode('browse');
    }
  }, [selectedJobId, jobs]);

  useEffect(() => {
    setActiveJobDetailTab((current) => normalizeJobDetailTab(current, jobDetailTabs));
  }, [jobDetailTabs]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateMaterialDraft(key, value) {
    setMaterialDraft((current) => ({ ...current, [key]: value }));
  }

  function updateBudgetDraft(key, value) {
    setBudgetDraft((current) => ({ ...current, [key]: value }));
  }

  function updateDocumentDraft(key, value) {
    setDocumentDraft((current) => ({ ...current, [key]: value }));
  }

  function updateScheduleDraft(key, value) {
    setScheduleDraft((current) => ({ ...current, [key]: value }));
  }

  function openJobsDirectory(status = '') {
    setSelectedJobId('');
    setJobsWorkspaceMode('browse');
    setFilters((current) => ({ ...current, status }));
    setJobMessage('');
  }

  function startNewJob() {
    setSelectedJobId('');
    setJobsWorkspaceMode('create');
    setActiveJobDetailTab('overview');
    setDraft(createJobDraft());
    setJobMessage('');
  }

  function handleJobDetailTabChange(tabKey) {
    const nextTab = normalizeJobDetailTab(tabKey, jobDetailTabs);
    setActiveJobDetailTab(nextTab);
  }

  function viewJob(row, detailTab = 'overview') {
    setSelectedJobId(row.id);
    setJobsWorkspaceMode('browse');
    handleJobDetailTabChange(detailTab);
    setDraft(createJobDraft(row));
    setJobMessage('');
  }

  function startNewJobMaterial() {
    setMaterialDraft(createJobMaterialDraft());
    setCatalogSearch('');
    setJobMaterialMessage('');
  }

  function startEditJobMaterial(row) {
    if (!selectedJobCanEdit) {
      setJobMaterialMessage('Material List edits are limited to the current user division with can_manage_jobs.');
      return;
    }
    setMaterialDraft(createJobMaterialDraft(row));
    setCatalogSearch('');
    setJobMaterialMessage('');
  }

  function startEditJob(row) {
    if (!canManageJobs || row.division !== permissions.division) {
      setJobMessage('Job edit is limited to the current user division.');
      viewJob(row, 'details');
      return;
    }
    viewJob(row, 'details');
  }

  async function saveJob(event) {
    event.preventDefault();
    if (!formCanSave || isSavingJob) return;
    if (!hasWritableDivision) {
      setJobMessage('Job save blocked because the current user division could not be determined from server permissions.');
      return;
    }
    if (selectedJob && selectedJob.division !== permissions.division) {
      setJobMessage('Job save blocked because this row is outside the current user division.');
      return;
    }

    const payload = buildJobMutationPayload(draft);
    if (!payload.name) {
      setJobMessage('Job name is required.');
      return;
    }

    setIsSavingJob(true);
    setJobMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (selectedJobId) {
        const { error } = await client
          .from('jobs')
          .update(payload)
          .eq('id', selectedJobId);
        if (error) throw error;
        await loadJobs({ preserveMessage: true });
        setJobMessage('Job saved.');
      } else {
        const { error } = await client
          .from('jobs')
          .insert({ division: permissions.division, created_by: permissions.userId, ...payload })
          .select('id')
          .single();
        if (error) throw error;
        setJobsWorkspaceMode('browse');
        setSelectedJobId('');
        setDraft(createJobDraft());
        await loadJobs({ preserveMessage: true });
        setJobMessage('Job added.');
      }
    } catch (error) {
      console.error('Jobs save failed', error);
      setJobMessage('Job save failed. Confirm permissions, division scope, and the Jobs Foundation migration.');
    } finally {
      setIsSavingJob(false);
    }
  }

  async function saveJobMaterial(event) {
    event.preventDefault();
    if (!materialFormCanSave || !selectedJob) return;

    const payload = buildJobMaterialMutationPayload(materialDraft);
    if (!Number.isFinite(payload.requested_quantity) || payload.requested_quantity <= 0) {
      setJobMaterialMessage('Requested quantity must be greater than zero.');
      return;
    }

    if (!materialDraft.id && !selectedCatalogItem) {
      setJobMaterialMessage('Choose an existing catalog material.');
      return;
    }

    setIsSavingJobMaterial(true);
    setJobMaterialMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (materialDraft.id) {
        const { error } = await client
          .from('job_materials')
          .update(payload)
          .eq('id', materialDraft.id);
        if (error) throw error;
        await loadJobMaterials(selectedJob.id, { preserveMessage: true });
        setJobMaterialMessage('Material line saved.');
      } else {
        const { error } = await client
          .from('job_materials')
          .insert({
            job_id: selectedJob.id,
            division: selectedJob.division,
            item_id: selectedCatalogItem.id,
            ...payload,
            material_name_snapshot: cleanToolText(selectedCatalogItem.name),
            material_code_snapshot: cleanToolText(selectedCatalogItem.material_code),
            created_by: permissions.userId,
          });
        if (error) throw error;
        await loadJobMaterials(selectedJob.id, { preserveMessage: true });
        setMaterialDraft(createJobMaterialDraft());
        setCatalogSearch('');
        setJobMaterialMessage('Material line added.');
      }
    } catch (error) {
      console.error('Job Material List save failed', error);
      setJobMaterialMessage(`Material line save failed. ${error?.message || 'Confirm can_manage_jobs and the Job Material List migration.'}`);
    } finally {
      setIsSavingJobMaterial(false);
    }
  }

  async function archiveJobMaterial(row) {
    if (!selectedJobCanEdit || isSavingJobMaterial || !row?.id) return;
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingJobMaterial(true);
    setJobMaterialMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_materials')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
        })
        .eq('id', row.id);
      if (error) throw error;

      if (materialDraft.id === row.id) startNewJobMaterial();
      await loadJobMaterials(selectedJob.id, { preserveMessage: true });
      setJobMaterialMessage('Material line removed from the active list.');
    } catch (error) {
      console.error('Job Material List archive failed', error);
      setJobMaterialMessage('Material line archive failed. Confirm can_manage_jobs and division scope.');
    } finally {
      setIsSavingJobMaterial(false);
    }
  }

  function updateBuyoutDraft(key, value) {
    setBuyoutDraft((current) => ({ ...current, [key]: value }));
  }

  function startNewBuyoutLine() {
    setBuyoutDraft(createJobBuyoutDraft());
    setBuyoutCatalogSearch('');
    setBuyoutLineMessage('');
  }

  function startNewBudgetLine() {
    setBudgetDraft(createJobBudgetDraft());
    setBudgetLineMessage('');
  }

  function startEditBudgetLine(row) {
    if (!selectedJobCanManageBudget) {
      setBudgetLineMessage('Financials editing and reordering are limited to the current job division with can_approve_budget.');
      return;
    }
    setBudgetDraft(createJobBudgetDraft(row));
    setBudgetLineMessage('');
  }

  async function moveBudgetLine(rowId, direction) {
    if (!selectedJobCanManageBudget || isSavingBudgetLine || !selectedJob?.id) return;

    const currentRows = sortJobBudgetRows(budgetLines);
    const currentIndex = currentRows.findIndex((row) => row.id === rowId);
    if (currentIndex < 0) return;

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= currentRows.length) return;

    const currentRow = currentRows[currentIndex];
    const targetRow = currentRows[targetIndex];
    const currentSort = Number(currentRow.sort_order ?? currentIndex + 1);
    const targetSort = Number(targetRow.sort_order ?? targetIndex + 1);

    setIsSavingBudgetLine(true);
    setBudgetLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const updates = [
        client.from('job_budget_lines').update({ sort_order: targetSort }).eq('id', currentRow.id),
        client.from('job_budget_lines').update({ sort_order: currentSort }).eq('id', targetRow.id),
      ];
      const results = await Promise.all(updates);
      const error = results.find((result) => result.error)?.error ?? null;
      if (error) throw error;

      await loadJobBudgetLines(selectedJob.id, { preserveMessage: true });
      setBudgetLineMessage(direction < 0 ? 'Budget line moved up.' : 'Budget line moved down.');
    } catch (error) {
      console.error('Job Financials reorder failed', error);
      setBudgetLineMessage(`Budget line reorder failed. ${error?.message || 'Confirm can_approve_budget and the job_budget_lines migration.'}`);
    } finally {
      setIsSavingBudgetLine(false);
    }
  }

  function startEditBuyoutLine(row) {
    if (!selectedJobCanEdit) {
      setBuyoutLineMessage('Buyout List edits are limited to the current user division with can_manage_jobs.');
      return;
    }
    setBuyoutDraft(createJobBuyoutDraft(row));
    setBuyoutCatalogSearch('');
    setBuyoutLineMessage('');
  }

  async function saveBuyoutLine(event) {
    event.preventDefault();
    if (!buyoutFormCanSave || !selectedJob) return;

    const payload = buildJobBuyoutMutationPayload(buyoutDraft);
    if (!payload.item_id && !payload.item_description) {
      setBuyoutLineMessage('Choose a catalog item or enter a free-text item description.');
      return;
    }
    if (!Number.isFinite(payload.quantity_needed) || payload.quantity_needed <= 0) {
      setBuyoutLineMessage('Qty Needed must be greater than zero.');
      return;
    }
    if (payload.quantity_ordered !== null && (!Number.isFinite(payload.quantity_ordered) || payload.quantity_ordered < 0)) {
      setBuyoutLineMessage('Qty Ordered must be blank, zero, or greater.');
      return;
    }

    setIsSavingBuyoutLine(true);
    setBuyoutLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (buyoutDraft.id) {
        const { error } = await client
          .from('job_buyout_lines')
          .update(payload)
          .eq('id', buyoutDraft.id);
        if (error) throw error;
        await loadBuyoutLines(selectedJob.id, { preserveMessage: true });
        setBuyoutLineMessage('Buyout line saved.');
      } else {
        const { error } = await client
          .from('job_buyout_lines')
          .insert({
            job_id: selectedJob.id,
            division: selectedJob.division,
            created_by: permissions.userId,
            ...payload,
          });
        if (error) throw error;
        await loadBuyoutLines(selectedJob.id, { preserveMessage: true });
        setBuyoutDraft(createJobBuyoutDraft());
        setBuyoutCatalogSearch('');
        setBuyoutLineMessage('Buyout line added.');
      }
    } catch (error) {
      console.error('Buyout List save failed', error);
      setBuyoutLineMessage(`Buyout line save failed. ${error?.message || 'Confirm can_manage_jobs and the Buyout Planning migration.'}`);
    } finally {
      setIsSavingBuyoutLine(false);
    }
  }

  async function archiveBuyoutLine(row) {
    if (!selectedJobCanEdit || isSavingBuyoutLine || !row?.id) return;
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingBuyoutLine(true);
    setBuyoutLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_buyout_lines')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
        })
        .eq('id', row.id);
      if (error) throw error;

      if (buyoutDraft.id === row.id) startNewBuyoutLine();
      await loadBuyoutLines(selectedJob.id, { preserveMessage: true });
      setBuyoutLineMessage('Buyout line removed from the active list.');
    } catch (error) {
      console.error('Buyout List archive failed', error);
      setBuyoutLineMessage('Buyout line archive failed. Confirm can_manage_jobs and division scope.');
    } finally {
      setIsSavingBuyoutLine(false);
    }
  }

  async function saveBudgetLine(event) {
    event.preventDefault();
    if (!budgetFormCanSave || !selectedJob) return;

    const payload = buildJobBudgetMutationPayload(budgetDraft);
    const budgetAmountText = String(budgetDraft.budget_amount ?? '').trim();
    if (!payload.category) {
      setBudgetLineMessage('Category is required.');
      return;
    }
    if (!payload.description) {
      setBudgetLineMessage('Description is required.');
      return;
    }
    if (budgetAmountText === '') {
      setBudgetLineMessage('Budget amount is required.');
      return;
    }
    if (!Number.isFinite(payload.budget_amount)) {
      setBudgetLineMessage('Budget amount must be a valid number.');
      return;
    }
    if (payload.budget_amount < 0) {
      setBudgetLineMessage('Budget amount cannot be negative.');
      return;
    }

    setIsSavingBudgetLine(true);
    setBudgetLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (budgetDraft.id) {
        const { error } = await client
          .from('job_budget_lines')
          .update(payload)
          .eq('id', budgetDraft.id);
        if (error) throw error;
        await loadJobBudgetLines(selectedJob.id, { preserveMessage: true });
        setBudgetLineMessage('Budget line saved.');
      } else {
        const { error } = await client
          .from('job_budget_lines')
          .insert({
            job_id: selectedJob.id,
            division: selectedJob.division,
            created_by: permissions.userId,
            sort_order: getNextBudgetSortOrder(orderedBudgetLines),
            ...payload,
          });
        if (error) throw error;
        await loadJobBudgetLines(selectedJob.id, { preserveMessage: true });
        setBudgetDraft(createJobBudgetDraft());
        setBudgetLineMessage('Budget line added.');
      }
    } catch (error) {
      console.error('Job Financials save failed', error);
      setBudgetLineMessage(`Budget line save failed. ${error?.message || 'Confirm Financials permissions and the job_budget_lines migration.'}`);
    } finally {
      setIsSavingBudgetLine(false);
    }
  }

  async function archiveBudgetLine(row) {
    if (!selectedJobCanManageBudget || isSavingBudgetLine || !row?.id) return;
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingBudgetLine(true);
    setBudgetLineMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_budget_lines')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
        })
        .eq('id', row.id);
      if (error) throw error;

      if (budgetDraft.id === row.id) startNewBudgetLine();
      await loadJobBudgetLines(selectedJob.id, { preserveMessage: true });
      setBudgetLineMessage('Budget line archived from the active list.');
    } catch (error) {
      console.error('Job Financials archive failed', error);
      setBudgetLineMessage('Budget line archive failed. Confirm can_approve_budget and division scope.');
    } finally {
      setIsSavingBudgetLine(false);
    }
  }

  function startNewDocumentUpload() {
    setDocumentDraft(createJobDocumentDraft());
    setDocumentMessage('');
    setDocumentFileInputKey((value) => value + 1);
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (!documentFormCanSave || !selectedJob || !documentDraft.file) return;

    setIsSavingDocument(true);
    setDocumentMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const documentId = crypto.randomUUID();
      const fileName = buildJobDocumentSuggestedName(
        selectedJob,
        documentDraft.document_type,
        documentDraft.description,
        documentDraft.file.name,
      );
      const storagePath = buildJobDocumentStoragePath(selectedJob.id, documentId, fileName);
      const fileType = documentDraft.file.type || 'application/octet-stream';

      const { error: uploadError } = await client.storage
        .from(DOCUMENTS_STORAGE_BUCKET)
        .upload(storagePath, documentDraft.file, {
          contentType: fileType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: insertError } = await client
        .from('documents')
        .insert({
          id: documentId,
          division: selectedJob.division,
          owner_type: 'job',
          owner_id: selectedJob.id,
          storage_path: storagePath,
          file_name: fileName,
          document_type: cleanDocumentText(documentDraft.document_type),
          description: cleanDocumentText(documentDraft.description),
          file_size_bytes: documentDraft.file.size ?? null,
          mime_type: fileType,
          created_by: permissions.userId,
        });
      if (insertError) throw insertError;

      await loadJobDocuments(selectedJob.id, { preserveMessage: true });
      startNewDocumentUpload();
      setDocumentMessage('Document uploaded.');
    } catch (error) {
      console.error('Job Documents save failed', error);
      setDocumentMessage(`Document upload failed. ${error?.message || 'Confirm northgate-files storage policies and can_manage_jobs.'}`);
    } finally {
      setIsSavingDocument(false);
    }
  }

  async function openDocument(row) {
    if (!row?.storage_path || !selectedJob) return;

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client.storage
        .from(DOCUMENTS_STORAGE_BUCKET)
        .createSignedUrl(row.storage_path, 5 * 60);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Unable to create a document link.');
      const opened = window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setDocumentMessage('Browser blocked the document preview popup.');
      }
    } catch (error) {
      console.error('Job Documents open failed', error);
      setDocumentMessage(`Open failed. ${error?.message || 'Confirm document storage access.'}`);
    }
  }

  async function downloadDocument(row) {
    if (!row?.storage_path || !selectedJob) return;

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error } = await client.storage
        .from(DOCUMENTS_STORAGE_BUCKET)
        .download(row.storage_path);
      if (error) throw error;
      if (!data) throw new Error('Document download returned no data.');

      const fileUrl = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = row.file_name || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(fileUrl), 1000);
    } catch (error) {
      console.error('Job Documents download failed', error);
      setDocumentMessage(`Download failed. ${error?.message || 'Confirm document storage access.'}`);
    }
  }

  async function archiveDocument(row) {
    if (!selectedJobCanManageDocuments || isSavingDocument || !row?.id) return;
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingDocument(true);
    setDocumentMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('documents')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanDocumentText(reason),
        })
        .eq('id', row.id);
      if (error) throw error;

      await loadJobDocuments(selectedJob.id, { preserveMessage: true });
      setDocumentMessage('Document archived from the active list.');
    } catch (error) {
      console.error('Job Documents archive failed', error);
      setDocumentMessage('Document archive failed. Confirm can_manage_jobs and division scope.');
    } finally {
      setIsSavingDocument(false);
    }
  }

  function startNewScheduleItem() {
    setScheduleDraft(createJobScheduleDraft());
    setScheduleItemMessage('');
  }

  function startEditScheduleItem(row) {
    if (!selectedJobCanManageSchedule) {
      setScheduleItemMessage('Schedule editing and reordering are limited to the current job division with can_manage_jobs.');
      return;
    }
    setScheduleDraft(createJobScheduleDraft(row));
    setScheduleItemMessage('');
  }

  async function moveScheduleItem(rowId, direction) {
    if (!selectedJobCanManageSchedule || isSavingScheduleItem || !selectedJob?.id) return;

    const currentRows = sortJobScheduleRows(scheduleItems);
    const currentIndex = currentRows.findIndex((row) => row.id === rowId);
    if (currentIndex < 0) return;

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= currentRows.length) return;

    const currentRow = currentRows[currentIndex];
    const targetRow = currentRows[targetIndex];
    const currentSort = Number(currentRow.sort_order ?? currentIndex + 1);
    const targetSort = Number(targetRow.sort_order ?? targetIndex + 1);

    setIsSavingScheduleItem(true);
    setScheduleItemMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const results = await Promise.all([
        client.from('job_schedule_items').update({ sort_order: targetSort }).eq('id', currentRow.id),
        client.from('job_schedule_items').update({ sort_order: currentSort }).eq('id', targetRow.id),
      ]);
      const error = results.find((result) => result.error)?.error ?? null;
      if (error) throw error;

      await loadJobScheduleItems(selectedJob.id, { preserveMessage: true });
      setScheduleItemMessage(direction < 0 ? 'Schedule item moved up.' : 'Schedule item moved down.');
    } catch (error) {
      console.error('Job Schedule reorder failed', error);
      setScheduleItemMessage(`Schedule reorder failed. ${error?.message || 'Confirm can_manage_jobs and the job_schedule_items migration.'}`);
    } finally {
      setIsSavingScheduleItem(false);
    }
  }

  async function saveScheduleItem(event) {
    event.preventDefault();
    if (!scheduleFormCanSave || !selectedJob) return;

    const payload = buildJobScheduleMutationPayload(scheduleDraft);
    if (!payload.title) {
      setScheduleItemMessage('Title is required.');
      return;
    }
    if (!payload.status) {
      setScheduleItemMessage('Status is required.');
      return;
    }

    setIsSavingScheduleItem(true);
    setScheduleItemMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (scheduleDraft.id) {
        const { error } = await client
          .from('job_schedule_items')
          .update(payload)
          .eq('id', scheduleDraft.id);
        if (error) throw error;
        await loadJobScheduleItems(selectedJob.id, { preserveMessage: true });
        setScheduleItemMessage('Schedule item saved.');
      } else {
        const { error } = await client
          .from('job_schedule_items')
          .insert({
            job_id: selectedJob.id,
            division: selectedJob.division,
            created_by: permissions.userId,
            sort_order: getNextScheduleSortOrder(orderedScheduleItems),
            ...payload,
          });
        if (error) throw error;
        await loadJobScheduleItems(selectedJob.id, { preserveMessage: true });
        setScheduleDraft(createJobScheduleDraft());
        setScheduleItemMessage('Schedule item added.');
      }
    } catch (error) {
      console.error('Job Schedule save failed', error);
      setScheduleItemMessage(`Schedule save failed. ${error?.message || 'Confirm can_manage_jobs and the job_schedule_items migration.'}`);
    } finally {
      setIsSavingScheduleItem(false);
    }
  }

  async function archiveScheduleItem(row) {
    if (!selectedJobCanManageSchedule || isSavingScheduleItem || !row?.id) return;
    let reason = '';
    try {
      reason = window.prompt('Archive reason (optional)') ?? '';
    } catch (error) {
      console.warn('Job Schedule archive reason prompt unavailable', error);
    }

    setIsSavingScheduleItem(true);
    setScheduleItemMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('job_schedule_items')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
        })
        .eq('id', row.id);
      if (error) throw error;

      if (scheduleDraft.id === row.id) startNewScheduleItem();
      setScheduleItems((current) => current.filter((item) => item.id !== row.id));
      await loadJobScheduleItems(selectedJob.id, { preserveMessage: true });
      setScheduleItemMessage('Schedule item archived from the active list.');
    } catch (error) {
      console.error('Job Schedule archive failed', error);
      setScheduleItemMessage('Schedule archive failed. Confirm can_manage_jobs and division scope.');
    } finally {
      setIsSavingScheduleItem(false);
    }
  }

  function exportBuyoutLines() {
    if (!selectedJob) return;
    const ok = downloadBuyoutCsvFile({
      jobLabel: buildJobDisplayLabel(selectedJob),
      rows: filteredBuyoutLines,
      catalogItems,
      inStockByItemId: buyoutInStockByItemId,
    });
    if (!ok) {
      setBuyoutLineMessage('CSV export is unavailable in this browser.');
      return;
    }
    setBuyoutLineMessage('Buyout CSV export downloaded.');
  }

  function printBuyoutLines() {
    if (!selectedJob) return;
    const ok = openBuyoutPrintWindow({
      title: `Buyout List - ${buildJobDisplayLabel(selectedJob)}`,
      jobLabel: buildJobDisplayLabel(selectedJob),
      rows: filteredBuyoutLines,
      catalogItems,
      inStockByItemId: buyoutInStockByItemId,
    });
    if (!ok) {
      setBuyoutLineMessage('Print view is unavailable in this browser.');
    }
  }

  async function archiveJob(row) {
    if (!canManageJobs || isSavingJob || !row?.id || row.archived_at) return;
    if (row.division !== permissions.division) {
      setJobMessage('Job archive is limited to the current user division.');
      return;
    }
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingJob(true);
    setJobMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('jobs')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
        })
        .eq('id', row.id);
      if (error) throw error;

      if (selectedJobId === row.id) startNewJob();
      await loadJobs({ preserveMessage: true });
      setJobMessage('Job archived.');
    } catch (error) {
      console.error('Jobs archive failed', error);
      setJobMessage('Job archive failed. Confirm permissions and division scope.');
    } finally {
      setIsSavingJob(false);
    }
  }

  function renderSelectedJobHeader() {
    if (!selectedJob) return null;

    const addressSummary = buildJobAddressSummary(selectedJob);
    const metaChips = [
      selectedJob.job_number ? `Job #${selectedJob.job_number}` : 'No job number',
      formatJobType(selectedJob.job_type),
      selectedJob.service_call_number ? `Service Call #${selectedJob.service_call_number}` : null,
      selectedJob.division || 'Unassigned division',
    ].filter(Boolean);

    return (
      <section className="job-detail-header">
        <div className="job-detail-header__hero">
          <div className="job-detail-header__icon" aria-hidden="true">
            <Briefcase />
          </div>
          <div className="job-detail-header__body">
            <p className="eyebrow">Selected job</p>
            <div className="job-detail-header__title-row">
              <div>
                <h3>{selectedJob.name || 'Unnamed job'}</h3>
                <p>{addressSummary || 'No address recorded.'}</p>
              </div>
              <span className={getJobStatusBadgeClass(selectedJob.status)}>{formatJobStatusLabel(selectedJob.status)}</span>
            </div>
            <div className="job-detail-header__meta">
              {metaChips.map((value) => <span key={value}>{value}</span>)}
            </div>
          </div>
        </div>
        <div className="job-detail-header__aside">
          <div className="job-detail-header__facts">
            <div className="job-detail-header__fact">
              <span>Division</span>
              <strong>{selectedJob.division || 'Unassigned'}</strong>
            </div>
            <div className="job-detail-header__fact">
              <span>Type</span>
              <strong>{formatJobType(selectedJob.job_type)}</strong>
            </div>
          </div>
          <div className="job-detail-header__actions">
            <button type="button" className="secondary-button" onClick={startNewJob} disabled={isSavingJob}>
              <Plus aria-hidden="true" /> New Job
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderJobOverviewTab() {
    if (!selectedJob) return null;

    const addressSummary = buildJobAddressSummary(selectedJob);

    return (
      <section className="job-overview-panel">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h3>Job overview</h3>
            <p>Lightweight read-only summary for the selected job.</p>
          </div>
          <span>Read only</span>
        </div>

        <div className="job-overview-grid">
          <SummaryCard label="Material Lines" value={jobMaterialSummary.count} detail="Tracked against this job" tone="accent" />
          <SummaryCard label="Requested Qty" value={formatRequestedQuantity(jobMaterialSummary.total)} detail="Material list total" />
          <SummaryCard label="Buyout Lines" value={buyoutSummary.count} detail="Quoted or ordered items" />
          <SummaryCard label="Pending Buyout" value={buyoutSummary.pendingCount} detail="Still awaiting action" />
          <SummaryCard label="Ordered / Received" value={buyoutSummary.orderedCount + buyoutSummary.receivedCount} detail="Active procurement progress" />
        </div>

        <div className="job-overview-summary">
          <span>Job #: {formatToolValue(selectedJob.job_number)}</span>
          <span>Status: {selectedJob.status || '-'}</span>
          <span>Type: {formatJobType(selectedJob.job_type)}</span>
          <span>Service Call #: {formatToolValue(selectedJob.service_call_number)}</span>
          <span>Division: {selectedJob.division || 'Unassigned'}</span>
          <span>Address: {addressSummary || 'No address recorded.'}</span>
          <span>Created: {formatJobDateTime(selectedJob.created_at)}</span>
          <span>Updated: {formatJobDateTime(selectedJob.updated_at || selectedJob.created_at)}</span>
        </div>

        {selectedJob.description || selectedJob.notes ? (
          <div className="job-overview-notes">
            {selectedJob.description ? (
              <div className="empty-state">
                <strong>Description</strong>
                <p>{selectedJob.description}</p>
              </div>
            ) : null}
            {selectedJob.notes ? (
              <div className="empty-state">
                <strong>Notes</strong>
                <p>{selectedJob.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  function renderJobDetailsTab() {
    if (!selectedJob) return null;

    return (
      <section className="job-details-panel">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Details</p>
            <h3>Job details</h3>
            <p>Existing job edit form and save flow for the selected job.</p>
          </div>
          <span>{selectedJob.division ?? 'Unassigned'}</span>
        </div>

        <div className="empty-state">
          <strong>{selectedJob.name}</strong>
          <p>Job #: {formatToolValue(selectedJob.job_number)} / {formatJobType(selectedJob.job_type)} / {selectedJob.status}</p>
          <p>{buildJobAddressSummary(selectedJob) || 'No address recorded.'}</p>
          <p>Created: {formatJobDateTime(selectedJob.created_at)} / Updated: {formatJobDateTime(selectedJob.updated_at)}</p>
        </div>

        <form className="tool-form" onSubmit={saveJob}>
          <label className="tool-form__wide">
            Name
            <input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} disabled={!formCanSave || isSavingJob} />
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)} disabled={!formCanSave || isSavingJob}>
              {JOB_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>
            Job Type
            <select value={draft.job_type} onChange={(event) => updateDraft('job_type', event.target.value)} disabled={!formCanSave || isSavingJob}>
              {JOB_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{formatJobType(type)}</option>)}
            </select>
          </label>
          {JOB_TEXT_FORM_FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <input value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!formCanSave || isSavingJob} />
            </label>
          ))}
          {JOB_TEXTAREA_FORM_FIELDS.map((field) => (
            <label className="tool-form__wide" key={field.key}>
              {field.label}
              <textarea value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!formCanSave || isSavingJob} />
            </label>
          ))}
          <div className="cart-actions tool-form__wide">
            <button type="submit" className="secondary-button" disabled={!formCanSave || isSavingJob}>
              <Plus aria-hidden="true" /> {isSavingJob ? 'Saving...' : selectedJob ? 'Save Job' : 'Create Job'}
            </button>
            <button type="button" className="secondary-button" onClick={startNewJob} disabled={isSavingJob}>
              New Job
            </button>
          </div>
        </form>
      </section>
    );
  }

  function renderJobMaterialsTab() {
    if (!selectedJob) return null;

    return (
      <section className="job-material-list">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Material List</p>
            <h3>Job Material List</h3>
            <p>{JOB_MATERIAL_HELPER_COPY}</p>
          </div>
          <span>{jobMaterialSummary.count} line{jobMaterialSummary.count === 1 ? '' : 's'} / {formatRequestedQuantity(jobMaterialSummary.total)} requested</span>
        </div>

        <div className="location-note tool-catalogue__note">
          <ClipboardCheck aria-hidden="true" />
          <span>{JOB_MATERIAL_HELPER_COPY}</span>
        </div>

        {jobMaterialsError ? <div className="alert">Job Material List failed to load. Confirm the `public.job_materials` migration and server permissions.</div> : null}
        {jobMaterialMessage ? <div className="alert">{jobMaterialMessage}</div> : null}

        <form className="job-material-form" onSubmit={saveJobMaterial}>
          {!materialDraft.id ? (
            <>
              <label>
                Material search
                <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} disabled={!materialFormCanSave} />
              </label>
              <label>
                Catalog material
                <select value={materialDraft.item_id} onChange={(event) => updateMaterialDraft('item_id', event.target.value)} disabled={!materialFormCanSave}>
                  <option value="">Select material</option>
                  {catalogMatches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {[item.material_code, item.name, item.unit_of_measure].filter(Boolean).join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <div className="job-material-form__locked">
              <strong>{getJobMaterialLabel(jobMaterials.find((row) => row.id === materialDraft.id) ?? {})}</strong>
              <span>Catalog material is fixed for this planning line.</span>
            </div>
          )}
          <label>
            Requested quantity
            <input
              type="number"
              min="0"
              step="any"
              value={materialDraft.requested_quantity}
              onChange={(event) => updateMaterialDraft('requested_quantity', event.target.value)}
              disabled={!materialFormCanSave}
            />
          </label>
          <label className="job-material-form__wide">
            Note
            <input value={materialDraft.note} onChange={(event) => updateMaterialDraft('note', event.target.value)} disabled={!materialFormCanSave} />
          </label>
          <div className="cart-actions job-material-form__wide">
            <button type="submit" className="secondary-button" disabled={!materialFormCanSave}>
              <Plus aria-hidden="true" /> {isSavingJobMaterial ? 'Saving...' : materialDraft.id ? 'Save Material Line' : 'Add Material Line'}
            </button>
            <button type="button" className="secondary-button" onClick={startNewJobMaterial} disabled={isSavingJobMaterial}>
              New Material Line
            </button>
          </div>
        </form>

        <div className="tool-toolbar job-material-toolbar">
          <label>
            Search material lines
            <input value={jobMaterialSearch} onChange={(event) => setJobMaterialSearch(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={() => loadJobMaterials(selectedJob.id)} disabled={isLoadingJobMaterials}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
        </div>

        {isLoadingJobMaterials ? <p className="muted">Loading Job Material List...</p> : null}
        {!isLoadingJobMaterials && !filteredJobMaterials.length ? (
          <div className="empty-state">
            <strong>No material lines yet.</strong>
            <p>Add existing catalog materials as planning demand for this job.</p>
          </div>
        ) : null}

        {filteredJobMaterials.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table job-material-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Requested</th>
                    <th>Note</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobMaterials.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.material_name_snapshot || 'Catalog material'}</strong>
                        <span>{row.material_code_snapshot || row.item_id}</span>
                      </td>
                      <td>{formatRequestedQuantity(row.requested_quantity)}</td>
                      <td>{row.note || '-'}</td>
                      <td>{formatJobDateTime(row.updated_at || row.created_at)}</td>
                      <td>
                        <div className="count-action-stack">
                          {ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION ? (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => issueMaterialToJob(row)}
                              disabled={!canIssueToJob || !selectedJob || isSavingJobMaterial}
                              title={!canIssueToJob ? 'Inventory checkout permission required' : 'Route this line into checkout with the current job selected'}
                            >
                              <ShoppingCart aria-hidden="true" /> Issue to Job
                            </button>
                          ) : null}
                          <button type="button" className="secondary-button" onClick={() => startEditJobMaterial(row)} disabled={!selectedJobCanEdit || isSavingJobMaterial}>
                            <Pencil aria-hidden="true" /> Edit
                          </button>
                          <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveJobMaterial(row)} disabled={!selectedJobCanEdit || isSavingJobMaterial}>
                            <Archive aria-hidden="true" /> Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-list tool-mobile-list">
              {filteredJobMaterials.map((row) => (
                <article className="mobile-item" key={row.id}>
                  <strong>{row.material_name_snapshot || 'Catalog material'}</strong>
                  <div className="meta-grid">
                    <span>Code: {row.material_code_snapshot || row.item_id}</span>
                    <span>Requested: {formatRequestedQuantity(row.requested_quantity)}</span>
                    <span>Note: {row.note || '-'}</span>
                    <span>Updated: {formatJobDateTime(row.updated_at || row.created_at)}</span>
                  </div>
                  <div className="cart-actions">
                    {ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => issueMaterialToJob(row)}
                        disabled={!canIssueToJob || !selectedJob || isSavingJobMaterial}
                        title={!canIssueToJob ? 'Inventory checkout permission required' : 'Route this line into checkout with the current job selected'}
                      >
                        <ShoppingCart aria-hidden="true" /> Issue to Job
                      </button>
                    ) : null}
                    <button type="button" className="secondary-button" onClick={() => startEditJobMaterial(row)} disabled={!selectedJobCanEdit || isSavingJobMaterial}>
                      <Pencil aria-hidden="true" /> Edit
                    </button>
                    <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveJobMaterial(row)} disabled={!selectedJobCanEdit || isSavingJobMaterial}>
                      <Archive aria-hidden="true" /> Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  function renderJobBuyoutTab() {
    if (!selectedJob) return null;

    return (
      <section className="job-buyout-list">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Planning</p>
            <h3>Buyout List</h3>
            <p>{BUYOUT_LIST_HELPER_COPY}</p>
          </div>
          <span>{buyoutSummary.committedCount} of {buyoutSummary.count} line{buyoutSummary.count === 1 ? '' : 's'} ordered / received</span>
        </div>

        <div className="location-note tool-catalogue__note">
          <ClipboardCheck aria-hidden="true" />
          <span>{BUYOUT_LIST_HELPER_COPY}</span>
        </div>

        {buyoutLinesError ? <div className="alert">Buyout List failed to load. Confirm the `public.job_buyout_lines` migration and server permissions.</div> : null}
        {buyoutInStockError ? <div className="alert">In Stock lookup failed. The Buyout List is still available, but read-time on-hand values could not be loaded.</div> : null}
        {buyoutLineMessage ? <div className="alert">{buyoutLineMessage}</div> : null}

        <div className="tool-toolbar job-buyout-toolbar">
          <label>
            Search buyout lines
            <input value={buyoutLineSearch} onChange={(event) => setBuyoutLineSearch(event.target.value)} />
          </label>
          <div className="cart-actions job-buyout-toolbar__actions">
            <button type="button" className="secondary-button" onClick={exportBuyoutLines} disabled={isLoadingBuyoutLines}>
              <Download aria-hidden="true" /> CSV
            </button>
            <button type="button" className="secondary-button" onClick={printBuyoutLines} disabled={isLoadingBuyoutLines}>
              <Printer aria-hidden="true" /> Print
            </button>
            <button type="button" className="secondary-button" onClick={() => loadBuyoutLines(selectedJob.id)} disabled={isLoadingBuyoutLines}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        {isLoadingBuyoutLines ? <p className="muted">Loading Buyout List...</p> : null}
        {isLoadingBuyoutInStock ? <p className="muted">Loading In Stock levels...</p> : null}

        {buyoutFormCanSave ? (
          <form className="job-buyout-form" onSubmit={saveBuyoutLine}>
            <label>
              Item search
              <input value={buyoutCatalogSearch} onChange={(event) => setBuyoutCatalogSearch(event.target.value)} disabled={!buyoutFormCanSave} />
            </label>
            <label>
              Catalog item
              <select value={buyoutDraft.item_id} onChange={(event) => updateBuyoutDraft('item_id', event.target.value)} disabled={!buyoutFormCanSave}>
                <option value="">Select item</option>
                {buyoutCatalogMatches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.material_code, item.name, item.unit_of_measure].filter(Boolean).join(' / ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="job-buyout-form__wide">
              Free-text description
              <input
                value={buyoutDraft.item_description}
                onChange={(event) => updateBuyoutDraft('item_description', event.target.value)}
                disabled={!buyoutFormCanSave}
                placeholder="Optional when a catalog item is selected"
              />
            </label>
            <label>
              Qty Needed
              <input
                type="number"
                min="0"
                step="any"
                value={buyoutDraft.quantity_needed}
                onChange={(event) => updateBuyoutDraft('quantity_needed', event.target.value)}
                disabled={!buyoutFormCanSave}
              />
            </label>
            <label>
              Qty Ordered
              <input
                type="number"
                min="0"
                step="any"
                value={buyoutDraft.quantity_ordered}
                onChange={(event) => updateBuyoutDraft('quantity_ordered', event.target.value)}
                disabled={!buyoutFormCanSave}
              />
            </label>
            <label>
              Status
              <select value={buyoutDraft.status} onChange={(event) => updateBuyoutDraft('status', event.target.value)} disabled={!buyoutFormCanSave}>
                {BUYOUT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="job-buyout-form__wide">
              Vendor note
              <input value={buyoutDraft.vendor_note} onChange={(event) => updateBuyoutDraft('vendor_note', event.target.value)} disabled={!buyoutFormCanSave} />
            </label>
            <label className="job-buyout-form__wide">
              Lead time note
              <input value={buyoutDraft.lead_time_note} onChange={(event) => updateBuyoutDraft('lead_time_note', event.target.value)} disabled={!buyoutFormCanSave} />
            </label>
            <label className="job-buyout-form__wide">
              Note
              <input value={buyoutDraft.note} onChange={(event) => updateBuyoutDraft('note', event.target.value)} disabled={!buyoutFormCanSave} />
            </label>
            <div className="cart-actions job-buyout-form__wide">
              <button type="submit" className="secondary-button" disabled={!buyoutFormCanSave}>
                <Plus aria-hidden="true" /> {isSavingBuyoutLine ? 'Saving...' : buyoutDraft.id ? 'Save Buyout Line' : 'Add Buyout Line'}
              </button>
              <button type="button" className="secondary-button" onClick={startNewBuyoutLine} disabled={isSavingBuyoutLine}>
                New Buyout Line
              </button>
            </div>
            <p className="job-buyout-form__help">Choose a catalog item or enter a free-text description. At least one source is required.</p>
            {selectedBuyoutCatalogItem ? (
              <div className="job-buyout-form__locked">
                <strong>{[selectedBuyoutCatalogItem.material_code, selectedBuyoutCatalogItem.name].filter(Boolean).join(' / ')}</strong>
                <span>Selected catalog item. In Stock is read at display time only.</span>
              </div>
            ) : null}
          </form>
        ) : (
          <div className="empty-state">
            <strong>Buyout List editing is limited to the current job division.</strong>
            <p>Read-only buyout planning details remain visible.</p>
          </div>
        )}

        {isLoadingBuyoutLines ? null : !filteredBuyoutLines.length ? (
          <div className="empty-state">
            <strong>No buyout lines yet.</strong>
            <p>Add items that need to be quoted or ordered for this job.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table job-buyout-table">
                <thead>
                  <tr>
                    <th>Item / Description</th>
                    <th>Qty Needed</th>
                    <th>Qty Ordered</th>
                    <th>Status</th>
                    <th>In Stock</th>
                    <th>Lead Time</th>
                    <th>Vendor</th>
                    <th>Note</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuyoutLines.map((row) => {
                    const catalogItem = row.item_id ? catalogById.get(row.item_id) ?? null : null;
                    const inStock = row.item_id ? buyoutInStockByItemId.get(row.item_id) ?? null : null;

                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{getBuyoutItemLabel(row, catalogItem)}</strong>
                          <span>{row.item_id ? (catalogItem ? 'Catalog item' : row.item_id) : 'Free-text line'}</span>
                        </td>
                        <td>{formatQuantitySummary(row.quantity_needed)}</td>
                        <td>{formatOptionalQuantity(row.quantity_ordered)}</td>
                        <td><span className={getBuyoutStatusBadgeClass(row.status)}>{row.status}</span></td>
                        <td>{row.item_id ? formatOptionalQuantity(inStock) : '-'}</td>
                        <td>{row.lead_time_note || '-'}</td>
                        <td>{row.vendor_note || '-'}</td>
                        <td>{row.note || '-'}</td>
                        <td>{formatJobDateTime(row.updated_at || row.created_at)}</td>
                        <td>
                          <div className="count-action-stack">
                            <button type="button" className="secondary-button" onClick={() => startEditBuyoutLine(row)} disabled={!selectedJobCanEdit || isSavingBuyoutLine}>
                              <Pencil aria-hidden="true" /> Edit
                            </button>
                            <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveBuyoutLine(row)} disabled={!selectedJobCanEdit || isSavingBuyoutLine}>
                              <Archive aria-hidden="true" /> Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-list tool-mobile-list">
              {filteredBuyoutLines.map((row) => {
                const catalogItem = row.item_id ? catalogById.get(row.item_id) ?? null : null;
                const inStock = row.item_id ? buyoutInStockByItemId.get(row.item_id) ?? null : null;

                return (
                  <article className="mobile-item" key={row.id}>
                    <strong>{getBuyoutItemLabel(row, catalogItem)}</strong>
                    <div className="meta-grid">
                      <span>Qty Needed: {formatQuantitySummary(row.quantity_needed)}</span>
                      <span>Qty Ordered: {formatOptionalQuantity(row.quantity_ordered)}</span>
                      <span>Status: <span className={getBuyoutStatusBadgeClass(row.status)}>{row.status}</span></span>
                      <span>In Stock: {row.item_id ? formatOptionalQuantity(inStock) : '-'}</span>
                      <span>Lead Time: {row.lead_time_note || '-'}</span>
                      <span>Vendor: {row.vendor_note || '-'}</span>
                      <span>Note: {row.note || '-'}</span>
                      <span>Updated: {formatJobDateTime(row.updated_at || row.created_at)}</span>
                    </div>
                    <div className="cart-actions">
                      <button type="button" className="secondary-button" onClick={() => startEditBuyoutLine(row)} disabled={!selectedJobCanEdit || isSavingBuyoutLine}>
                        <Pencil aria-hidden="true" /> Edit
                      </button>
                      <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveBuyoutLine(row)} disabled={!selectedJobCanEdit || isSavingBuyoutLine}>
                        <Archive aria-hidden="true" /> Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    );
  }

  function renderJobFinancialsTab() {
    if (!selectedJob || !canViewFinancials) return null;

    return (
      <section className="job-financials-list">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Financials</p>
            <h3>Job Financials v1</h3>
            <p>{JOB_FINANCIALS_HELPER_COPY}</p>
          </div>
          <span>{budgetSummary.count} line{budgetSummary.count === 1 ? '' : 's'}</span>
        </div>

        <div className="location-note tool-catalogue__note">
          <ClipboardCheck aria-hidden="true" />
          <span>{JOB_FINANCIALS_HELPER_COPY}</span>
        </div>

        {budgetLinesError ? <div className="alert">Job Financials failed to load. Confirm the `public.job_budget_lines` migration and Financials permissions.</div> : null}
        {budgetLineMessage ? <div className="alert">{budgetLineMessage}</div> : null}

        <div className="job-financials-summary-grid">
          <article className="job-overview-card">
            <strong>{formatBudgetCurrency(budgetSummary.totalBudget)}</strong>
            <span>Total budget</span>
          </article>
          <article className="job-overview-card">
            <strong>{budgetSummary.count}</strong>
            <span>Budget lines</span>
          </article>
          <article className="job-overview-card">
            <strong>{selectedJobCanManageBudget ? 'Editable' : 'Read only'}</strong>
            <span>{selectedJobCanManageBudget ? 'can_approve_budget in current division' : 'View-only Financials access'}</span>
          </article>
        </div>

        <section className="job-financials-category-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Summary</p>
              <h4>Budget by category</h4>
            </div>
          </div>
          <div className="job-financials-category-grid">
            {JOB_BUDGET_CATEGORY_OPTIONS.map((option) => (
              <article className="job-overview-card" key={option.value}>
                <strong>{formatBudgetCurrency(budgetSummary.categoryTotals[option.value] ?? 0)}</strong>
                <span>{option.label}</span>
              </article>
            ))}
          </div>
        </section>

        <div className="tool-toolbar job-financials-toolbar">
          <label>
            Search budget lines
            <input value={budgetLineSearch} onChange={(event) => setBudgetLineSearch(event.target.value)} />
          </label>
          <div className="cart-actions">
            <button type="button" className="secondary-button" onClick={() => loadJobBudgetLines(selectedJob.id)} disabled={isLoadingBudgetLines}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        {isLoadingBudgetLines ? <p className="muted">Loading Job Financials...</p> : null}

        {budgetFormCanSave ? (
          <form className="job-financials-form" onSubmit={saveBudgetLine}>
            <label>
              Category
              <select value={budgetDraft.category} onChange={(event) => updateBudgetDraft('category', event.target.value)} disabled={!budgetFormCanSave}>
                {JOB_BUDGET_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Cost code
              <input value={budgetDraft.cost_code} onChange={(event) => updateBudgetDraft('cost_code', event.target.value)} disabled={!budgetFormCanSave} />
            </label>
            <label className="job-financials-form__wide">
              Description
              <input value={budgetDraft.description} onChange={(event) => updateBudgetDraft('description', event.target.value)} disabled={!budgetFormCanSave} required />
            </label>
            <label>
              Budget amount
              <input
                type="number"
                min="0"
                step="any"
                value={budgetDraft.budget_amount}
                onChange={(event) => updateBudgetDraft('budget_amount', event.target.value)}
                disabled={!budgetFormCanSave}
                required
              />
            </label>
            <label className="job-financials-form__wide">
              Note
              <input value={budgetDraft.note} onChange={(event) => updateBudgetDraft('note', event.target.value)} disabled={!budgetFormCanSave} />
            </label>
            <div className="cart-actions job-financials-form__wide">
              <button type="submit" className="secondary-button" disabled={!budgetFormCanSave}>
                <Plus aria-hidden="true" /> {isSavingBudgetLine ? 'Saving...' : budgetDraft.id ? 'Save Budget Line' : 'Add Budget Line'}
              </button>
              <button type="button" className="secondary-button" onClick={startNewBudgetLine} disabled={isSavingBudgetLine}>
                New Budget Line
              </button>
            </div>
            <p className="job-financials-form__help">Budget amount may be temporarily blank while typing, but the final saved value cannot be blank or negative.</p>
          </form>
        ) : (
          <div className="empty-state">
            <strong>Financials is read-only for this job.</strong>
            <p>{selectedJob?.division === permissions.division ? 'can_approve_budget is required to add, edit, archive, or reorder budget lines.' : 'Budget line edits are limited to the current user division.'}</p>
          </div>
        )}

        {!isLoadingBudgetLines && !filteredBudgetLines.length ? (
          <div className="empty-state">
            <strong>No budget lines yet.</strong>
            <p>Add budgeted cost lines for this job only.</p>
          </div>
        ) : null}

        {filteredBudgetLines.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table job-financials-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Category</th>
                    <th>Cost Code</th>
                    <th>Description</th>
                    <th>Budget Amount</th>
                    <th>Note</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBudgetLines.map((row) => {
                    const budgetLineIndex = orderedBudgetLines.findIndex((item) => item.id === row.id);
                    const canMoveUp = selectedJobCanManageBudget && budgetLineIndex > 0;
                    const canMoveDown = selectedJobCanManageBudget && budgetLineIndex >= 0 && budgetLineIndex < orderedBudgetLines.length - 1;

                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="job-financials-order-cell">
                            <strong>{formatOptionalQuantity(row.sort_order)}</strong>
                            <span>Order</span>
                            {selectedJobCanManageBudget ? (
                              <div className="job-financials-order-controls">
                                <button type="button" className="secondary-button" onClick={() => moveBudgetLine(row.id, -1)} disabled={!canMoveUp || isSavingBudgetLine}>
                                  <ChevronUp aria-hidden="true" /> Up
                                </button>
                                <button type="button" className="secondary-button" onClick={() => moveBudgetLine(row.id, 1)} disabled={!canMoveDown || isSavingBudgetLine}>
                                  <ChevronDown aria-hidden="true" /> Down
                                </button>
                              </div>
                            ) : (
                              <span className="muted">Read only</span>
                            )}
                          </div>
                        </td>
                        <td>{getBudgetCategoryLabel(row.category)}</td>
                        <td>{row.cost_code || '-'}</td>
                        <td>
                          <strong>{row.description}</strong>
                          <span>{getBudgetCategoryLabel(row.category)}</span>
                        </td>
                        <td>{formatBudgetCurrency(row.budget_amount)}</td>
                        <td>{row.note || '-'}</td>
                        <td>{formatJobDateTime(row.updated_at || row.created_at)}</td>
                        <td>
                          {selectedJobCanManageBudget ? (
                            <div className="count-action-stack">
                              <button type="button" className="secondary-button" onClick={() => startEditBudgetLine(row)} disabled={isSavingBudgetLine}>
                                <Pencil aria-hidden="true" /> Edit
                              </button>
                              <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveBudgetLine(row)} disabled={isSavingBudgetLine}>
                                <Archive aria-hidden="true" /> Remove
                              </button>
                            </div>
                          ) : (
                            <span className="muted">Read only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-list job-financials-mobile-list">
              {filteredBudgetLines.map((row) => {
                const budgetLineIndex = orderedBudgetLines.findIndex((item) => item.id === row.id);
                const canMoveUp = selectedJobCanManageBudget && budgetLineIndex > 0;
                const canMoveDown = selectedJobCanManageBudget && budgetLineIndex >= 0 && budgetLineIndex < orderedBudgetLines.length - 1;

                return (
                  <article className="mobile-item" key={row.id}>
                    <strong>{row.description}</strong>
                    <div className="meta-grid">
                      <span>Order: {formatOptionalQuantity(row.sort_order)}</span>
                      <span>Category: {getBudgetCategoryLabel(row.category)}</span>
                      <span>Cost Code: {row.cost_code || '-'}</span>
                      <span>Budget: {formatBudgetCurrency(row.budget_amount)}</span>
                      <span>Note: {row.note || '-'}</span>
                      <span>Updated: {formatJobDateTime(row.updated_at || row.created_at)}</span>
                    </div>
                    {selectedJobCanManageBudget ? (
                      <>
                        <div className="cart-actions job-financials-reorder-actions">
                          <button type="button" className="secondary-button" onClick={() => moveBudgetLine(row.id, -1)} disabled={!canMoveUp || isSavingBudgetLine}>
                            <ChevronUp aria-hidden="true" /> Up
                          </button>
                          <button type="button" className="secondary-button" onClick={() => moveBudgetLine(row.id, 1)} disabled={!canMoveDown || isSavingBudgetLine}>
                            <ChevronDown aria-hidden="true" /> Down
                          </button>
                        </div>
                        <div className="cart-actions">
                          <button type="button" className="secondary-button" onClick={() => startEditBudgetLine(row)} disabled={isSavingBudgetLine}>
                            <Pencil aria-hidden="true" /> Edit
                          </button>
                          <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveBudgetLine(row)} disabled={isSavingBudgetLine}>
                            <Archive aria-hidden="true" /> Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="muted">Read only</p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  function renderJobDocumentsTab() {
    if (!selectedJob) return null;

    return (
      <section className="job-documents-list">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Documents</p>
            <h3>Job Documents v1</h3>
            <p>{JOB_DOCUMENTS_HELPER_COPY}</p>
          </div>
          <span>{documentSummary.count} document{documentSummary.count === 1 ? '' : 's'}</span>
        </div>

        <div className="location-note tool-catalogue__note">
          <ClipboardCheck aria-hidden="true" />
          <span>{JOB_DOCUMENTS_HELPER_COPY}</span>
        </div>

        <div className="job-documents-summary-grid">
          <article className="job-overview-card">
            <strong>{documentSummary.count}</strong>
            <span>Documents</span>
          </article>
          <article className="job-overview-card">
            <strong>{formatFileSizeBytes(documentSummary.totalBytes)}</strong>
            <span>Total file size</span>
          </article>
          <article className="job-overview-card">
            <strong>{DOCUMENTS_STORAGE_BUCKET}</strong>
            <span>Storage bucket</span>
          </article>
          <article className="job-overview-card">
            <strong>{selectedJobCanManageDocuments ? 'Editable' : 'Read only'}</strong>
            <span>{selectedJobCanManageDocuments ? 'can_manage_jobs in current division' : 'View-only document access'}</span>
          </article>
        </div>

        {documentsError ? <div className="alert">Job Documents failed to load. Confirm the live `public.documents` table and bucket policies.</div> : null}
        {documentMessage ? <div className="alert">{documentMessage}</div> : null}

        {selectedJobCanManageDocuments ? (
          <form className="job-documents-form" onSubmit={saveDocument}>
            <label className="job-documents-form__wide">
              File
              <input
                key={documentFileInputKey}
                type="file"
                onChange={(event) => updateDocumentDraft('file', event.target.files?.[0] ?? null)}
                required
                disabled={!selectedJobCanManageDocuments || isSavingDocument}
              />
            </label>
            <label>
              Document type
              <input
                value={documentDraft.document_type}
                onChange={(event) => updateDocumentDraft('document_type', event.target.value)}
                disabled={!selectedJobCanManageDocuments || isSavingDocument}
                placeholder="Invoice, photos, permit, etc."
              />
            </label>
            <label className="job-documents-form__wide">
              Description
              <input
                value={documentDraft.description}
                onChange={(event) => updateDocumentDraft('description', event.target.value)}
                disabled={!selectedJobCanManageDocuments || isSavingDocument}
                placeholder="Optional note"
              />
            </label>
            <div className="job-documents-form__wide job-documents-form__suggestion">
              <strong>Suggested name</strong>
              <span>{documentSuggestedName || 'Select a file to generate a suggested name.'}</span>
            </div>
            <div className="cart-actions job-documents-form__wide">
              <button type="submit" className="secondary-button" disabled={!documentFormCanSave}>
                <Plus aria-hidden="true" /> {isSavingDocument ? 'Uploading...' : 'Upload Document'}
              </button>
              <button type="button" className="secondary-button" onClick={startNewDocumentUpload} disabled={isSavingDocument}>
                Clear Form
              </button>
            </div>
            <p className="job-documents-form__help">
              Files are stored in {DOCUMENTS_STORAGE_BUCKET} and linked to the selected job after upload.
            </p>
          </form>
        ) : (
          <div className="empty-state">
            <strong>Documents are read only for this job.</strong>
            <p>{selectedJob?.division === permissions.division ? 'can_manage_jobs is required to upload or archive documents.' : 'Document upload and archive actions are limited to the current user division.'}</p>
          </div>
        )}

        {isLoadingDocuments ? <p className="muted">Loading Job Documents...</p> : null}

        {!isLoadingDocuments && !documents.length ? (
          <div className="empty-state">
            <strong>No documents yet.</strong>
            <p>Upload job records, photos, permits, or other supporting files for this job.</p>
          </div>
        ) : null}

        {documents.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table job-documents-table">
                <thead>
                  <tr>
                    <th>File name</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Uploaded</th>
                    <th>Uploaded by</th>
                    <th>Size</th>
                    <th>MIME type</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.file_name || row.storage_path}</strong>
                        <span>{row.storage_path}</span>
                      </td>
                      <td>{row.document_type || '-'}</td>
                      <td>{row.description || '-'}</td>
                      <td>{formatJobDateTime(row.created_at)}</td>
                      <td>{row.created_by || '-'}</td>
                      <td>{formatFileSizeBytes(row.file_size_bytes)}</td>
                      <td>{row.mime_type || '-'}</td>
                      <td>
                        <div className="count-action-stack">
                          <button type="button" className="secondary-button" onClick={() => openDocument(row)} disabled={isSavingDocument}>
                            <Copy aria-hidden="true" /> Open
                          </button>
                          <button type="button" className="secondary-button" onClick={() => downloadDocument(row)} disabled={isSavingDocument}>
                            <Download aria-hidden="true" /> Download
                          </button>
                          {selectedJobCanManageDocuments ? (
                            <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveDocument(row)} disabled={isSavingDocument}>
                              <Archive aria-hidden="true" /> Archive
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-list job-documents-mobile-list">
              {documents.map((row) => (
                <article className="mobile-item" key={row.id}>
                  <strong>{row.file_name || row.storage_path}</strong>
                  <div className="meta-grid">
                    <span>Type: {row.document_type || '-'}</span>
                    <span>Uploaded: {formatJobDateTime(row.created_at)}</span>
                    <span>By: {row.created_by || '-'}</span>
                    <span>Size: {formatFileSizeBytes(row.file_size_bytes)}</span>
                    <span>MIME: {row.mime_type || '-'}</span>
                    <span>Description: {row.description || '-'}</span>
                  </div>
                  <div className="cart-actions">
                    <button type="button" className="secondary-button" onClick={() => openDocument(row)} disabled={isSavingDocument}>
                      <Copy aria-hidden="true" /> Open
                    </button>
                    <button type="button" className="secondary-button" onClick={() => downloadDocument(row)} disabled={isSavingDocument}>
                      <Download aria-hidden="true" /> Download
                    </button>
                    {selectedJobCanManageDocuments ? (
                      <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveDocument(row)} disabled={isSavingDocument}>
                        <Archive aria-hidden="true" /> Archive
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  function renderJobTransactionsTab() {
    if (!selectedJob) return null;

    return (
      <section className="job-transactions-list">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Transactions</p>
            <h3>Job Transactions Log</h3>
            <p>This is a read-only log of material coded to this job through Inventory Checkout.</p>
          </div>
          <span>{filteredJobTransactions.length} row{filteredJobTransactions.length === 1 ? '' : 's'}</span>
        </div>

        {jobTransactionsError ? <div className="alert">Job Transactions Log failed to load. Confirm the deployed `public.job_transaction_log` view and server access.</div> : null}

        {isLoadingJobTransactions ? <p className="muted">Loading Job Transactions Log...</p> : null}

        {!isLoadingJobTransactions && !filteredJobTransactions.length ? (
          <div className="empty-state">
            <strong>No transactions have been coded to this job yet.</strong>
            <p>This log will populate after Inventory Checkout posts job-coded transactions.</p>
          </div>
        ) : null}

        {filteredJobTransactions.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table job-transactions-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Material / Item</th>
                    <th>Quantity</th>
                    <th>Source location / bin</th>
                    <th>Transaction type</th>
                    <th>Performed by</th>
                    <th>Notes / reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobTransactions.map((row) => (
                    <tr key={row.transaction_item_id}>
                      <td>{formatJobDateTime(row.occurred_at ?? row.transaction_created_at)}</td>
                      <td>
                        <strong>{[row.material_code, row.item_name].filter(Boolean).join(' / ') || row.item_id}</strong>
                        <span>{row.unit_of_measure || row.item_id || '-'}</span>
                      </td>
                      <td>{formatTransactionLogQuantity(row.quantity)}</td>
                      <td>
                        <strong>{row.source_location_label || row.source_bin_label || row.source_bin_code || row.source_bin_id || '-'}</strong>
                        <span>{row.source_bin_code || row.source_bin_id || '-'}</span>
                      </td>
                      <td>{formatTransactionType(row.transaction_type)}</td>
                      <td>{row.performed_by || row.performed_by_user_id || 'Unknown'}</td>
                      <td>{row.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-list job-transactions-mobile-list">
              {filteredJobTransactions.map((row) => (
                <article className="mobile-item" key={row.transaction_item_id}>
                  <strong>{[row.material_code, row.item_name].filter(Boolean).join(' / ') || row.item_id}</strong>
                  <div className="meta-grid">
                    <span>Date: {formatJobDateTime(row.occurred_at ?? row.transaction_created_at)}</span>
                    <span>Qty: {formatTransactionLogQuantity(row.quantity)}</span>
                    <span>Source: {row.source_location_label || row.source_bin_label || row.source_bin_code || row.source_bin_id || '-'}</span>
                    <span>Type: {formatTransactionType(row.transaction_type)}</span>
                    <span>By: {row.performed_by || row.performed_by_user_id || 'Unknown'}</span>
                    <span>Notes: {row.note || '-'}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  function renderJobScheduleTab() {
    if (!selectedJob) return null;

    return (
      <section className="job-schedule-list">
        <div className="count-section-header">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>Job Schedule v1</h3>
            <p>{JOB_SCHEDULE_HELPER_COPY}</p>
          </div>
          <span>{scheduleSummary.count} item{scheduleSummary.count === 1 ? '' : 's'}</span>
        </div>

        <div className="location-note tool-catalogue__note">
          <ClipboardCheck aria-hidden="true" />
          <span>{JOB_SCHEDULE_HELPER_COPY}</span>
        </div>

        <div className="job-schedule-summary-grid">
          <article className="job-overview-card">
            <strong>{scheduleSummary.count}</strong>
            <span>Schedule items</span>
          </article>
          <article className="job-overview-card">
            <strong>{scheduleSummary.completeCount}</strong>
            <span>Complete</span>
          </article>
          <article className="job-overview-card">
            <strong>{scheduleSummary.withDateCount}</strong>
            <span>With target date</span>
          </article>
          <article className="job-overview-card">
            <strong>{selectedJobCanManageSchedule ? 'Editable' : 'Read only'}</strong>
            <span>{selectedJobCanManageSchedule ? 'can_manage_jobs in current division' : 'View-only schedule access'}</span>
          </article>
        </div>

        {scheduleItemsError ? <div className="alert">Job Schedule failed to load. Confirm the `public.job_schedule_items` migration and Schedule permissions.</div> : null}
        {scheduleItemMessage ? <div className="alert">{scheduleItemMessage}</div> : null}

        <div className="tool-toolbar job-schedule-toolbar">
          <label>
            Search schedule items
            <input value={scheduleSearch} onChange={(event) => setScheduleSearch(event.target.value)} />
          </label>
          <div className="cart-actions">
            <button type="button" className="secondary-button" onClick={() => loadJobScheduleItems(selectedJob.id)} disabled={isLoadingScheduleItems}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        {isLoadingScheduleItems ? <p className="muted">Loading Job Schedule...</p> : null}

        {scheduleFormCanSave ? (
          <form className="job-schedule-form" onSubmit={saveScheduleItem}>
            <label className="job-schedule-form__wide">
              Title
              <input value={scheduleDraft.title} onChange={(event) => updateScheduleDraft('title', event.target.value)} disabled={!scheduleFormCanSave} required />
            </label>
            <label>
              Status
              <select value={scheduleDraft.status} onChange={(event) => updateScheduleDraft('status', event.target.value)} disabled={!scheduleFormCanSave}>
                {JOB_SCHEDULE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Target date
              <input type="date" value={scheduleDraft.target_date} onChange={(event) => updateScheduleDraft('target_date', event.target.value)} disabled={!scheduleFormCanSave} />
            </label>
            <label className="job-schedule-form__wide">
              Description
              <input value={scheduleDraft.description} onChange={(event) => updateScheduleDraft('description', event.target.value)} disabled={!scheduleFormCanSave} placeholder="Optional description" />
            </label>
            <label className="job-schedule-form__wide">
              Note
              <input value={scheduleDraft.note} onChange={(event) => updateScheduleDraft('note', event.target.value)} disabled={!scheduleFormCanSave} placeholder="Optional note" />
            </label>
            <div className="cart-actions job-schedule-form__wide">
              <button type="submit" className="secondary-button" disabled={!scheduleFormCanSave}>
                <Plus aria-hidden="true" /> {isSavingScheduleItem ? 'Saving...' : scheduleDraft.id ? 'Save Schedule Item' : 'Add Schedule Item'}
              </button>
              <button type="button" className="secondary-button" onClick={startNewScheduleItem} disabled={isSavingScheduleItem}>
                New Schedule Item
              </button>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            <strong>Schedule is read-only for this job.</strong>
            <p>{selectedJob?.division === permissions.division ? 'can_manage_jobs is required to add, edit, archive, or reorder schedule items.' : 'Schedule edits are limited to the current user division.'}</p>
          </div>
        )}

        {!isLoadingScheduleItems && !filteredScheduleItems.length ? (
          <div className="empty-state">
            <strong>No schedule items yet.</strong>
            <p>Add milestones or tasks to track this job without calendar sync or dependency logic.</p>
          </div>
        ) : null}

        {filteredScheduleItems.length ? (
          <>
            <div className="table-wrap">
              <table className="data-table job-schedule-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Target Date</th>
                    <th>Description</th>
                    <th>Note</th>
                    <th>Updated</th>
                    <th>Created By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScheduleItems.map((row) => {
                    const scheduleIndex = orderedScheduleItems.findIndex((item) => item.id === row.id);
                    const canMoveUp = selectedJobCanManageSchedule && scheduleIndex > 0;
                    const canMoveDown = selectedJobCanManageSchedule && scheduleIndex >= 0 && scheduleIndex < orderedScheduleItems.length - 1;

                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="job-financials-order-cell">
                            <strong>{formatOptionalQuantity(row.sort_order)}</strong>
                            <span>Order</span>
                            {selectedJobCanManageSchedule ? (
                              <div className="job-financials-order-controls">
                                <button type="button" className="secondary-button" onClick={() => moveScheduleItem(row.id, -1)} disabled={!canMoveUp || isSavingScheduleItem}>
                                  <ChevronUp aria-hidden="true" /> Up
                                </button>
                                <button type="button" className="secondary-button" onClick={() => moveScheduleItem(row.id, 1)} disabled={!canMoveDown || isSavingScheduleItem}>
                                  <ChevronDown aria-hidden="true" /> Down
                                </button>
                              </div>
                            ) : (
                              <span className="muted">Read only</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong>{row.title}</strong>
                          <span>Created: {formatJobDateTime(row.created_at)}</span>
                        </td>
                        <td><span className={getJobScheduleStatusBadgeClass(row.status)}>{getJobScheduleStatusLabel(row.status)}</span></td>
                        <td>{formatJobDate(row.target_date)}</td>
                        <td>{row.description || '-'}</td>
                        <td>{row.note || '-'}</td>
                        <td>{formatJobDateTime(row.updated_at || row.created_at)}</td>
                        <td>{row.created_by || '-'}</td>
                        <td>
                          {selectedJobCanManageSchedule ? (
                            <div className="count-action-stack">
                              <button type="button" className="secondary-button" onClick={() => startEditScheduleItem(row)} disabled={isSavingScheduleItem}>
                                <Pencil aria-hidden="true" /> Edit
                              </button>
                              <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveScheduleItem(row)} disabled={isSavingScheduleItem}>
                                <Archive aria-hidden="true" /> Archive
                              </button>
                            </div>
                          ) : (
                            <span className="muted">Read only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-list job-schedule-mobile-list">
              {filteredScheduleItems.map((row) => {
                const scheduleIndex = orderedScheduleItems.findIndex((item) => item.id === row.id);
                const canMoveUp = selectedJobCanManageSchedule && scheduleIndex > 0;
                const canMoveDown = selectedJobCanManageSchedule && scheduleIndex >= 0 && scheduleIndex < orderedScheduleItems.length - 1;

                return (
                  <article className="mobile-item" key={row.id}>
                    <strong>{row.title}</strong>
                    <div className="meta-grid">
                      <span>Order: {formatOptionalQuantity(row.sort_order)}</span>
                      <span>Status: <span className={getJobScheduleStatusBadgeClass(row.status)}>{getJobScheduleStatusLabel(row.status)}</span></span>
                      <span>Target Date: {formatJobDate(row.target_date)}</span>
                      <span>Description: {row.description || '-'}</span>
                      <span>Note: {row.note || '-'}</span>
                      <span>Updated: {formatJobDateTime(row.updated_at || row.created_at)}</span>
                      <span>Created By: {row.created_by || '-'}</span>
                    </div>
                    {selectedJobCanManageSchedule ? (
                      <>
                        <div className="cart-actions job-financials-reorder-actions">
                          <button type="button" className="secondary-button" onClick={() => moveScheduleItem(row.id, -1)} disabled={!canMoveUp || isSavingScheduleItem}>
                            <ChevronUp aria-hidden="true" /> Up
                          </button>
                          <button type="button" className="secondary-button" onClick={() => moveScheduleItem(row.id, 1)} disabled={!canMoveDown || isSavingScheduleItem}>
                            <ChevronDown aria-hidden="true" /> Down
                          </button>
                        </div>
                        <div className="cart-actions">
                          <button type="button" className="secondary-button" onClick={() => startEditScheduleItem(row)} disabled={isSavingScheduleItem}>
                            <Pencil aria-hidden="true" /> Edit
                          </button>
                          <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveScheduleItem(row)} disabled={isSavingScheduleItem}>
                            <Archive aria-hidden="true" /> Archive
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="muted">Read only</p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  function renderActiveJobDetailTab() {
    switch (activeJobDetailTab) {
      case 'details':
        return renderJobDetailsTab();
      case 'materials':
        return renderJobMaterialsTab();
      case 'buyout':
        return renderJobBuyoutTab();
      case 'financials':
        return renderJobFinancialsTab();
      case 'documents':
        return renderJobDocumentsTab();
      case 'transactions':
        return renderJobTransactionsTab();
      case 'schedule':
        return renderJobScheduleTab();
      case 'overview':
      default:
        return renderJobOverviewTab();
    }
  }

  if (!canReadJobs) {
    return (
      <article className="card card--wide inventory-module-card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Jobs</h2>
            <p>{JOBS_HELPER_COPY}</p>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
      </article>
    );
  }

  return (
    <article className="card card--wide workspace-card jobs-workspace-card">
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Jobs"
        description={JOBS_HELPER_COPY}
        status={<span className="status-pill">{filteredJobs.length} visible job{filteredJobs.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button" onClick={() => loadJobs()} disabled={isLoadingJobs}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
            <button type="button" className="primary-button" onClick={startNewJob} disabled={!canCreateJobs || isSavingJob}>
              <Plus aria-hidden="true" /> New Job
            </button>
          </>
        )}
      />

      {jobsError ? <div className="alert">Jobs failed to load. Confirm server permissions and the `public.jobs` migration.</div> : null}
      {!hasWritableDivision ? <div className="alert">Job create/edit is blocked because the current user division could not be determined from server permissions.</div> : null}
      {jobMessage ? <div className="alert">{jobMessage}</div> : null}

      <div className={jobsDashboardShellClassName}>
        <aside className={`jobs-utility-rail${isJobsUtilityRailCollapsed ? ' is-collapsed' : ''}`} aria-label="Jobs quick actions">
          <div className="jobs-rail__header-row">
            <button
              type="button"
              className="jobs-rail__collapse-button"
              aria-label={isJobsUtilityRailCollapsed ? 'Expand jobs quick actions' : 'Collapse jobs quick actions'}
              aria-pressed={isJobsUtilityRailCollapsed}
              onClick={() => setIsJobsUtilityRailCollapsed((current) => !current)}
            >
              {isJobsUtilityRailCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
            </button>
          </div>
          <button type="button" className="primary-button jobs-utility-rail__create" onClick={startNewJob} disabled={!canCreateJobs || isSavingJob} title="Create Job">
            <Plus aria-hidden="true" />
            <span>Create Job</span>
          </button>
          <div className="jobs-utility-rail__group">
            <button
              type="button"
              className={`jobs-utility-rail__item${jobsWorkspaceMode === 'browse' ? ' is-active' : ''}`}
              aria-current={jobsWorkspaceMode === 'browse' ? 'page' : undefined}
              title="My Jobs"
              onClick={() => openJobsDirectory('')}
            >
              <Briefcase aria-hidden="true" />
              <span>My Jobs</span>
            </button>
            <div className="jobs-utility-rail__meta">
              <span>Current division</span>
              <strong>{permissions.division ?? 'Unassigned'}</strong>
            </div>
            <div className="jobs-utility-rail__meta">
              <span>Visible jobs</span>
              <strong>{jobStatusCounts.all}</strong>
            </div>
          </div>
        </aside>

        <aside className={`jobs-status-rail${isJobsStatusRailCollapsed ? ' is-collapsed' : ''}`} aria-label="Jobs status navigation">
          <div className="jobs-rail__header-row jobs-status-rail__header-row">
            <div className="jobs-status-rail__header">
              <p className="eyebrow">Status Views</p>
              <h3>Jobs</h3>
              <p>Filter the live list without changing the underlying Jobs reads or detail flows.</p>
            </div>
            <button
              type="button"
              className="jobs-rail__collapse-button"
              aria-label={isJobsStatusRailCollapsed ? 'Expand jobs status navigation' : 'Collapse jobs status navigation'}
              aria-pressed={isJobsStatusRailCollapsed}
              onClick={() => setIsJobsStatusRailCollapsed((current) => !current)}
            >
              {isJobsStatusRailCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
            </button>
          </div>
          <div className="jobs-status-rail__list">
            {jobsStatusRailItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="jobs-status-rail__item"
                aria-current={filters.status === item.key ? 'page' : undefined}
                onClick={() => openJobsDirectory(item.key)}
                title={item.label}
              >
                <span className="jobs-status-rail__glyph" aria-hidden="true">{item.shortLabel}</span>
                <span className="jobs-status-rail__item-copy">
                  <strong>{item.label}</strong>
                  <small>{item.badge} job{item.badge === 1 ? '' : 's'}</small>
                </span>
                <span className="jobs-status-rail__badge">{item.badge}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="jobs-dashboard-main">
          <section className="cart-panel jobs-directory-panel">
            <div className="jobs-directory-toolbar">
              <div>
                <p className="eyebrow">Directory</p>
                <h3>{jobsPanelTitle}</h3>
              </div>
              <div className="jobs-directory-toolbar__actions">
                <label className="jobs-directory-toolbar__search">
                  <span className="sr-only">Search jobs</span>
                  <input
                    placeholder="Search jobs..."
                    value={filters.search}
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setFilters({ search: '', status: '', division: '' })}
                >
                  Filters
                </button>
                <button type="button" className="primary-button" onClick={startNewJob} disabled={!canCreateJobs || isSavingJob}>
                  <Plus aria-hidden="true" /> New Job
                </button>
              </div>
            </div>

            <div className="jobs-directory-filters">
              <label>
                Status
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">All statuses</option>
                  {JOB_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatJobStatusLabel(status)}</option>)}
                </select>
              </label>
              {showDivisionFilter ? (
                <label>
                  Division
                  <select value={filters.division} onChange={(event) => setFilters((current) => ({ ...current, division: event.target.value }))}>
                    <option value="">All visible divisions</option>
                    {divisionOptions.map((division) => <option key={division} value={division}>{division}</option>)}
                  </select>
                </label>
              ) : null}
            </div>

            {isLoadingJobs ? <p className="muted">Loading Jobs...</p> : null}
            {!isLoadingJobs && !filteredJobs.length ? (
              <div className="empty-state">
                <strong>No jobs are visible for the current filter.</strong>
                <p>{JOBS_HELPER_COPY}</p>
              </div>
            ) : null}

            {filteredJobs.length ? (
              <>
                <div className="table-wrap">
                  <table className="data-table jobs-table">
                    <thead>
                      <tr>
                        <th>Job #</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Service Call #</th>
                        <th>Division</th>
                        <th>Address</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((row) => (
                        <tr key={row.id} className={selectedJobId === row.id ? 'is-selected' : undefined}>
                          <td>{formatToolValue(row.job_number)}</td>
                          <td>
                            <strong>{row.name}</strong>
                            {row.description ? <span>{row.description}</span> : null}
                          </td>
                          <td><span className={getJobStatusBadgeClass(row.status)}>{formatJobStatusLabel(row.status)}</span></td>
                          <td>{formatJobType(row.job_type)}</td>
                          <td>{formatToolValue(row.service_call_number)}</td>
                          <td>{row.division || 'Unassigned'}</td>
                          <td>{buildJobAddressSummary(row) || '-'}</td>
                          <td>{formatJobDateTime(row.updated_at || row.created_at)}</td>
                          <td>
                            <div className="count-action-stack">
                              <button type="button" className="secondary-button" onClick={() => viewJob(row)}>
                                View
                              </button>
                              <button type="button" className="secondary-button" onClick={() => startEditJob(row)} disabled={!canManageJobs || isSavingJob || row.division !== permissions.division}>
                                <Pencil aria-hidden="true" /> Edit
                              </button>
                              <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveJob(row)} disabled={!canManageJobs || isSavingJob || row.division !== permissions.division}>
                                <Archive aria-hidden="true" /> Archive
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mobile-list tool-mobile-list">
                  {filteredJobs.map((row) => (
                    <article className={`mobile-item${selectedJobId === row.id ? ' is-selected' : ''}`} key={row.id}>
                      <strong>{row.name}</strong>
                      <div className="meta-grid">
                        <span>Job #: {formatToolValue(row.job_number)}</span>
                        <span>Status: <span className={getJobStatusBadgeClass(row.status)}>{formatJobStatusLabel(row.status)}</span></span>
                        <span>Type: {formatJobType(row.job_type)}</span>
                        <span>Service Call #: {formatToolValue(row.service_call_number)}</span>
                        <span>Division: {row.division || 'Unassigned'}</span>
                        <span>Address: {buildJobAddressSummary(row) || '-'}</span>
                        <span>Updated: {formatJobDateTime(row.updated_at || row.created_at)}</span>
                      </div>
                      <div className="cart-actions">
                        <button type="button" className="secondary-button" onClick={() => viewJob(row)}>
                          View
                        </button>
                        <button type="button" className="secondary-button" onClick={() => startEditJob(row)} disabled={!canManageJobs || isSavingJob || row.division !== permissions.division}>
                          <Pencil aria-hidden="true" /> Edit
                        </button>
                        <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveJob(row)} disabled={!canManageJobs || isSavingJob || row.division !== permissions.division}>
                          <Archive aria-hidden="true" /> Archive
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          {selectedJob || isCreateJobPanelOpen ? (
            <section className="tool-catalogue__form-panel job-detail-panel jobs-detail-panel">
              {selectedJob ? (
              <div className="job-detail-shell">
                {renderSelectedJobHeader()}

                <div className="job-detail-tabs" role="tablist" aria-label="Job detail sections">
                  {jobDetailTabs.map((tab) => {
                    const isDisabled = tab.isDisabled;
                    const isComingSoon = tab.isComingSoon;

                    return (
                      <button
                        key={tab.key}
                        type="button"
                        className={`job-detail-tab${activeJobDetailTab === tab.key ? ' job-detail-tab--active' : ''}${isDisabled ? ' job-detail-tab--disabled' : ''}`}
                        onClick={isDisabled ? undefined : () => handleJobDetailTabChange(tab.key)}
                        aria-selected={activeJobDetailTab === tab.key}
                        aria-disabled={isDisabled}
                        disabled={isDisabled}
                        title={isComingSoon ? `${tab.label} is coming soon.` : undefined}
                      >
                        <span>{tab.label}</span>
                        {isComingSoon ? <small>Coming soon</small> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="job-detail-module">
                  {renderActiveJobDetailTab()}
                </div>
              </div>
              ) : (
                <>
                <div className="count-section-header">
                  <div>
                    <p className="eyebrow">Create Job</p>
                    <h3>Create job</h3>
                  </div>
                  <span>{canCreateJobs ? `Division: ${permissions.division ?? 'Unassigned'}` : 'can_create_jobs required'}</span>
                </div>

                <form className="tool-form" onSubmit={saveJob}>
                  <label className="tool-form__wide">
                    Name
                    <input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} disabled={!formCanSave || isSavingJob} />
                  </label>
                  <label>
                    Status
                    <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)} disabled={!formCanSave || isSavingJob}>
                      {JOB_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatJobStatusLabel(status)}</option>)}
                    </select>
                  </label>
                  <label>
                    Job Type
                    <select value={draft.job_type} onChange={(event) => updateDraft('job_type', event.target.value)} disabled={!formCanSave || isSavingJob}>
                      {JOB_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{formatJobType(type)}</option>)}
                    </select>
                  </label>
                  {JOB_TEXT_FORM_FIELDS.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!formCanSave || isSavingJob} />
                    </label>
                  ))}
                  {JOB_TEXTAREA_FORM_FIELDS.map((field) => (
                    <label className="tool-form__wide" key={field.key}>
                      {field.label}
                      <textarea value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!formCanSave || isSavingJob} />
                    </label>
                  ))}
                  <div className="cart-actions tool-form__wide">
                    <button type="submit" className="primary-button" disabled={!formCanSave || isSavingJob}>
                      <Plus aria-hidden="true" /> {isSavingJob ? 'Saving...' : 'Create Job'}
                    </button>
                    <button type="button" className="secondary-button" onClick={startNewJob} disabled={isSavingJob}>
                      Clear Form
                    </button>
                  </div>
                  <div className="cart-actions tool-form__wide">
                    <button type="button" className="secondary-button" onClick={() => openJobsDirectory('')} disabled={isSavingJob}>
                      Back to All Jobs
                    </button>
                  </div>
                </form>
                </>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ToolsWorkspace({ permissions, designPreviewEnabled }) {
  return (
    <article className="card card--wide inventory-module-card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Tools</h2>
          <p>Tool Catalogue is live as a catalogue-only foundation. Checkout, assignments, QR labels, and tracking history remain reserved.</p>
        </div>
        <Wrench className="card__icon" aria-hidden="true" />
      </div>
      <div className="inventory-module-shell">
        <aside className="module-sidebar" aria-label="Tools workspace navigation">
          <div className="module-sidebar__header">
            <p className="eyebrow">Workspace</p>
            <h3>Tools</h3>
          </div>
          <div className="module-tabs" role="tablist" aria-label="Tools views">
            <button className="module-tab" type="button" aria-selected="true">
              Tool Catalogue
            </button>
          </div>
        </aside>
        <div className="module-content">
          <ToolCataloguePanel permissions={permissions} designPreviewEnabled={designPreviewEnabled} />
        </div>
      </div>
    </article>
  );
}

function FormattingTunerCard({ values, setValues, onReset }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const activePreset = getActiveFormattingPreset(values);

  function updateValue(field, value) {
    const numericValue = Number(value);
    const nextValue = Number.isFinite(numericValue)
      ? Math.min(field.max, Math.max(field.min, numericValue))
      : field.defaultValue;
    setValues((current) => ({ ...current, [field.key]: nextValue }));
    setCopyMessage('');
  }

  function applyPreset(presetKey) {
    const presetValues = FORMATTING_TUNER_PRESETS[presetKey];
    if (!presetValues) return;
    setValues(normalizeFormattingTunerValues(presetValues));
    setCopyMessage(`${presetKey[0].toUpperCase()}${presetKey.slice(1)} preset applied.`);
  }

  async function copyCss() {
    const cssSnippet = buildFormattingTunerCss(values);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(cssSnippet);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = cssSnippet;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopyMessage('CSS copied.');
    } catch (error) {
      console.warn('Formatting tuner copy failed', error);
      setCopyMessage('Copy failed. Select the CSS preview manually.');
    }
  }

  function resetValues() {
    onReset();
    setIsCollapsed(false);
    setCopyMessage('Defaults restored.');
  }

  return (
    <article className="card card--wide formatting-tuner">
      <div className="card__header formatting-tuner__header">
        <div>
          <p className="eyebrow">Developer Tool</p>
          <h2>Formatting Tuner</h2>
          <p>Local preview only. Values save in this browser under `northgate.formattingTuner.v1` and apply only during a developer-permitted session.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => setIsCollapsed((current) => !current)}>
          <SlidersHorizontal aria-hidden="true" /> {isCollapsed ? 'Expand Tuner' : 'Collapse Tuner'}
        </button>
      </div>

      {!isCollapsed ? (
        <div className="formatting-tuner__body">
          <div className="formatting-tuner__preset-row" role="group" aria-label="Formatting tuner presets">
            {['comfortable', 'standard', 'compact'].map((presetKey) => (
              <button
                key={presetKey}
                type="button"
                className={`secondary-button formatting-tuner__preset${activePreset === presetKey ? ' formatting-tuner__preset--active' : ''}`}
                aria-pressed={activePreset === presetKey}
                onClick={() => applyPreset(presetKey)}
              >
                {presetKey[0].toUpperCase()}{presetKey.slice(1)}
              </button>
            ))}
          </div>

          <div className="formatting-tuner__controls">
            {FORMATTING_TUNER_FIELDS.map((field) => (
              <label className="formatting-tuner__field" key={field.key}>
                <span>
                  {field.label}
                  <strong>{values[field.key]}{field.unit}</strong>
                </span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field, event.target.value)}
                />
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field, event.target.value)}
                />
              </label>
            ))}
          </div>

          <pre className="formatting-tuner__css">{buildFormattingTunerCss(values)}</pre>

          <div className="formatting-tuner__actions">
            <button type="button" className="secondary-button" onClick={copyCss}>
              <Copy aria-hidden="true" /> Copy CSS
            </button>
            <button type="button" className="secondary-button" onClick={resetValues}>
              <RotateCcw aria-hidden="true" /> Reset to Standard
            </button>
          </div>
          {copyMessage ? <p className="formatting-tuner__message">{copyMessage}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function DeveloperDashboard({
  user,
  permissions,
  showDevDashboard,
  onShow,
  onHide,
  formattingTunerValues,
  setFormattingTunerValues,
  resetFormattingTunerValues,
  silasEnabled,
  silasSettingsLoading,
  silasSettingsError,
  silasTogglePending,
  onToggleSilas,
}) {
  if (!showDevDashboard) {
    return (
      <article className="card card--wide developer-dashboard-hidden">
        <div className="card__header">
          <div>
            <p className="eyebrow">Developer Dashboard</p>
            <h2>Developer Dashboard Hidden</h2>
            <p>Development-only status cards are hidden in this browser. Show them when you want architecture, HANDOFF, build, and status details.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onShow}>
            Show Dev Dashboard
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="developer-dashboard">
      <article className="card card--wide">
        <div className="card__header">
          <div>
            <p className="eyebrow">Developer Dashboard</p>
            <h2>Developer Dashboard</h2>
            <p>Development-only status, architecture, permission, and build information. This workspace is separate from normal team-facing Inventory screens.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onHide}>
            Hide Dev Dashboard
          </button>
        </div>
      </article>

      <div className="dashboard-grid shell-status-grid">
        <article className="card">
          <LayoutDashboard className="card__icon" />
          <h2>Dashboard Shell</h2>
          <p>Base app shell is online. The inventory module supports read-only browsing, controlled cart-open, add-to-cart, remove-line, durable cart item reads, draft destination persistence, and per-line normal checkout.</p>
        </article>

        <article className="card">
          <ShieldCheck className="card__icon" />
          <h2>Server Permissions</h2>
          <p>Signed in as {user?.primaryEmailAddress?.emailAddress ?? user?.id}.</p>
          <p className="muted">
            Role: {permissions.isLoaded ? permissions.role : 'Loading'} / Division: {permissions.isLoaded ? permissions.division ?? 'Unassigned' : 'Loading'}
          </p>
          <p className="muted">Source: {permissions.permissionSource}</p>
        </article>

        <article className="card">
          <Database className="card__icon" />
          <h2>Supabase Client</h2>
          <p>Client initialized: {supabase ? 'yes' : 'no'}.</p>
          <p className="muted">Cart opening, add-to-cart, remove-line, checkout, and cart item reads are routed through server RPCs. Destination drafts are local until checkout writes them.</p>
        </article>

        <DevelopmentStatusCard />
      </div>

      <FormattingTunerCard
        values={formattingTunerValues}
        setValues={setFormattingTunerValues}
        onReset={resetFormattingTunerValues}
      />

      <article className="card card--wide dev-dashboard-card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Silas Control</p>
            <h2>Global Kill Switch</h2>
            <p>
              Silas uses one authenticated settings row for a server-enforced
              global enable/disable state. The backend still checks this value
              before any user-scoped Silas read or Claude call.
            </p>
          </div>
        </div>
        {silasSettingsError ? (
          <div className="alert">Silas settings failed to load in the Developer Dashboard.</div>
        ) : null}
        <div className="developer-toggle-row">
          <div>
            <strong>{silasEnabled ? 'Silas Enabled' : 'Silas Disabled'}</strong>
            <p className="muted">
              {silasSettingsLoading
                ? 'Loading Silas kill switch state...'
                : 'This toggle updates silas_settings.silas_enabled only. No new permission flags were added.'}
            </p>
          </div>
          <button
            type="button"
            className={silasEnabled ? 'secondary-button' : 'primary-button'}
            disabled={silasSettingsLoading || silasTogglePending}
            onClick={() => onToggleSilas(!silasEnabled)}
          >
            {silasTogglePending
              ? 'Updating...'
              : silasEnabled
                ? 'Disable Silas'
                : 'Enable Silas'}
          </button>
        </div>
      </article>

      <article className="card card--wide dev-dashboard-card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Cart Write Gate</p>
            <h2>Per-Line Checkout Is Controlled</h2>
            <p>
              The app can reload cart items from the server, remove mistaken cart rows, preserve draft destinations locally, and finalize each active cart line through `finalize_inventory_cart`. Express checkout is still not built.
            </p>
          </div>
          <ShoppingCart className="card__icon" />
        </div>
      </article>
    </section>
  );
}

function DeveloperWorkspaceLocked() {
  return (
    <article className="card card--wide developer-dashboard-hidden">
      <div className="card__header">
        <div>
          <p className="eyebrow">Developer Workspace</p>
          <h2>Developer Access Required</h2>
          <p>The developer workspace is gated by the existing `can_access_developer` permission and is not available in this session.</p>
        </div>
        <ShieldCheck className="card__icon" />
      </div>
    </article>
  );
}

function Dashboard() {
  const { user } = useUser();
  const permissions = usePermissions();
  const silas = useSilas({ permissions });
  const [browserPath, navigateTo] = useBrowserPath();
  const scanRoute = parseLocationScanPayload(browserPath);
  const dashboardRouteContext = useMemo(
    () => getDashboardInventoryRouteContext(browserPath),
    [browserPath],
  );
  const [showDevDashboard, setShowDevDashboard] = useState(() => readDevDashboardVisibility());
  const [formattingTunerValues, setFormattingTunerValues] = useState(() => readFormattingTunerValues());
  const [silasBubbleOpen, setSilasBubbleOpen] = useState(false);
  const designPreviewEnabled = hasDesignPreviewFlag(browserPath);
  const canAccessDeveloper = permissions.permissionSource === 'server' && permissions.canAccessDeveloper;
  const activeWorkspace = dashboardRouteContext.activeWorkspace;
  const sharedLayoutReadModel = useInventoryReadModel({
    enabled: permissions.permissionSource === 'server' && ['dashboard', 'employees', 'vehicles'].includes(activeWorkspace),
  });
  const devDashboardActive = activeWorkspace === 'developer' && showDevDashboard && canAccessDeveloper;
  const workspaceNavItems = useMemo(
    () => buildWorkspaceNavItems({ silasEnabled: silas.silasEnabled, canAccessDeveloper }),
    [silas.silasEnabled, canAccessDeveloper],
  );
  const shellWorkspace = scanRoute.ok ? 'inventory' : activeWorkspace;
  const identitySummary = useMemo(() => {
    if (!permissions.isLoaded) {
      return {
        role: 'Loading access',
        division: 'Resolving permissions',
      };
    }

    return {
      role: permissions.role ?? 'Authenticated user',
      division: permissions.division ?? 'No division assigned',
    };
  }, [permissions.division, permissions.isLoaded, permissions.role]);

  useEffect(() => {
    writeDevDashboardVisibility(showDevDashboard);
  }, [showDevDashboard]);

  useEffect(() => {
    if (!canAccessDeveloper) {
      clearFormattingTunerInlineValues();
      return undefined;
    }

    applyFormattingTunerValues(formattingTunerValues);

    if (typeof window !== 'undefined') {
      try {
        const defaults = getFormattingTunerDefaults();
        const isDefault = FORMATTING_TUNER_FIELDS.every((field) => Number(formattingTunerValues[field.key]) === Number(defaults[field.key]));
        if (isDefault) {
          window.localStorage.removeItem(FORMATTING_TUNER_STORAGE_KEY);
        } else {
          window.localStorage.setItem(FORMATTING_TUNER_STORAGE_KEY, JSON.stringify(formattingTunerValues));
        }
      } catch (error) {
        console.warn('Formatting tuner storage unavailable', error);
      }
    }

    return () => {
      clearFormattingTunerInlineValues();
    };
  }, [canAccessDeveloper, formattingTunerValues]);

  useEffect(() => {
    if (!silas.silasEnabled) {
      setSilasBubbleOpen(false);
    }
  }, [silas.silasEnabled]);

  function openWorkspace(workspace) {
    if (workspace === 'developer') {
      setShowDevDashboard(true);
    } else {
      setShowDevDashboard(false);
    }
    navigateTo(`/?workspace=${workspace}`);
  }

  function showDeveloperDashboard() {
    if (!canAccessDeveloper) return;
    setShowDevDashboard(true);
    navigateTo('/?workspace=developer');
  }

  function resetFormattingTunerValues() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(FORMATTING_TUNER_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_LAYOUT_TUNER_STORAGE_KEY);
    }
    setFormattingTunerValues(getFormattingTunerDefaults());
  }

  return (
    <>
      <AppShell
        eyebrow="Northgate HQ v2.0"
        title="Northgate HQ"
        buildLabel={DEVELOPMENT_STATUS.buildMarker}
        navItems={workspaceNavItems}
        activeWorkspace={shellWorkspace}
        onOpenWorkspace={openWorkspace}
        identitySummary={identitySummary}
        developerToggle={canAccessDeveloper ? (
          <button
            className="dev-dashboard-toggle"
            type="button"
            aria-pressed={devDashboardActive}
            title="Hides development-only status cards in this browser."
            onClick={() => {
              if (devDashboardActive) {
                setShowDevDashboard(false);
              } else {
                showDeveloperDashboard();
              }
            }}
          >
            {devDashboardActive ? 'Hide Dev Dashboard' : 'Show Dev Dashboard'}
          </button>
        ) : null}
        profileControl={<UserButton afterSignOutUrl="/" userProfileMode="modal" />}
      >
        {scanRoute.ok ? (
          <section className="app-main">
            <LocationScanResult
              permissions={permissions}
              locationId={scanRoute.locationId}
              navigateTo={navigateTo}
            />
          </section>
        ) : (
          <section className="app-main">
            {activeWorkspace === 'dashboard' ? (
              <DashboardWorkspace
                user={user}
                permissions={permissions}
                inventorySnapshot={sharedLayoutReadModel.model}
                inventoryLoading={sharedLayoutReadModel.isLoading}
                inventoryError={sharedLayoutReadModel.error}
                silasEnabled={silas.silasEnabled}
                canAccessDeveloper={canAccessDeveloper}
                onOpenWorkspace={openWorkspace}
              />
            ) : null}
            {activeWorkspace === 'inventory' ? (
              <InventoryWorkspacePanel
                permissions={permissions}
                navigateTo={navigateTo}
                requestedTab={dashboardRouteContext.requestedInventoryTab}
                scanCartContext={dashboardRouteContext.scanCartContext}
                scanCountContext={dashboardRouteContext.scanCountContext}
                designPreviewEnabled={designPreviewEnabled}
              />
            ) : null}
            {activeWorkspace === 'jobs' ? <JobsWorkspace permissions={permissions} navigateTo={navigateTo} /> : null}
            {activeWorkspace === 'silas' ? (
              <SilasWorkspacePanel
                enabled={silas.silasEnabled}
                settingsLoading={silas.settingsLoading}
                settingsError={silas.settingsError}
                conversations={silas.conversations}
                conversationsLoading={silas.conversationsLoading}
                activeConversationId={silas.activeConversationId}
                messages={silas.messages}
                messagesLoading={silas.messagesLoading}
                draftMessage={silas.draftMessage}
                setDraftMessage={silas.setDraftMessage}
                onSend={silas.sendMessage}
                onSelectConversation={silas.setActiveConversationId}
                onNewConversation={silas.startNewConversation}
                statusMessage={silas.statusMessage}
                chatError={silas.chatError}
                isSending={silas.isSending}
                responseSource={silas.responseSource}
              />
            ) : null}
            {activeWorkspace === 'estimating' ? <EstimatesWorkspace permissions={permissions} /> : null}
            {activeWorkspace === 'tools' ? <ToolsWorkspace permissions={permissions} designPreviewEnabled={designPreviewEnabled} /> : null}
            {activeWorkspace === 'employees' ? (
              <EmployeesWorkspace
                permissions={permissions}
                user={user}
                people={sharedLayoutReadModel.model.destinationReferences.users}
                isLoading={sharedLayoutReadModel.isLoading}
                error={sharedLayoutReadModel.error}
              />
            ) : null}
            {activeWorkspace === 'vehicles' ? (
              <VehiclesWorkspace
                permissions={permissions}
                vehicles={sharedLayoutReadModel.model.destinationReferences.vehicles}
                isLoading={sharedLayoutReadModel.isLoading}
                error={sharedLayoutReadModel.error}
              />
            ) : null}
            {activeWorkspace === 'developer' ? (
              canAccessDeveloper ? (
                <DeveloperWorkspace
                  user={user}
                  permissions={permissions}
                  showDevDashboard={showDevDashboard}
                  onShow={showDeveloperDashboard}
                  onHide={() => setShowDevDashboard(false)}
                  formattingTunerValues={formattingTunerValues}
                  setFormattingTunerValues={setFormattingTunerValues}
                  resetFormattingTunerValues={resetFormattingTunerValues}
                  silasEnabled={silas.silasEnabled}
                  silasSettingsLoading={silas.settingsLoading}
                  silasSettingsError={silas.settingsError}
                  silasTogglePending={silas.isUpdatingSettings}
                  onToggleSilas={silas.toggleSilasEnabled}
                />
              ) : (
                <DeveloperWorkspaceLocked />
              )
            ) : null}
          </section>
        )}
      </AppShell>
      <SilasBubble
        enabled={silas.silasEnabled}
        isOpen={silasBubbleOpen}
        onOpen={() => setSilasBubbleOpen(true)}
        onClose={() => setSilasBubbleOpen(false)}
        conversations={silas.conversations}
        activeConversationId={silas.activeConversationId}
        messages={silas.messages}
        messagesLoading={silas.messagesLoading}
        draftMessage={silas.draftMessage}
        setDraftMessage={silas.setDraftMessage}
        onSend={silas.sendMessage}
        onSelectConversation={silas.setActiveConversationId}
        statusMessage={silas.statusMessage}
        chatError={silas.chatError}
        isSending={silas.isSending}
      />
    </>
  );
}

function Landing() {
  return (
    <main className="landing">
      <section className="landing-card">
        <p className="eyebrow">Northgate HQ v2.0</p>
        <h1 className="app-title">Operations Platform</h1>
        <p className="muted">Sign in to access the Northgate HQ dashboard.</p>
        <div style={{ marginTop: '1.5rem' }}>
          <SignInButton mode="modal">
            <button className="primary-button" type="button">Sign In</button>
          </SignInButton>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <Landing />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}
