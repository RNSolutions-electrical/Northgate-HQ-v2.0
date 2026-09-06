import {
  Boxes,
  Camera,
  CameraOff,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  MapPinned,
  PackageSearch,
  Plus,
  QrCode,
  RefreshCw,
  Scale,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { Diagnostics, useDiagnostics } from '../../components/ui/Diagnostics.jsx';
import { InventoryStockBrowser } from './InventoryStockBrowser.jsx';
import { useBinItemRetirement } from '../../hooks/useBinItemRetirement.js';
import { useInventoryCart } from '../../hooks/useInventoryCart.js';
import { useInventoryCountCorrection } from '../../hooks/useInventoryCountCorrection.js';
import { useInventoryCountIntake } from '../../hooks/useInventoryCountIntake.js';
import { useInventoryCountSheet } from '../../hooks/useInventoryCountSheet.js';
import { useInventoryReadModel } from '../../hooks/useInventoryReadModel.js';
import { useInventoryTransactionHistory } from '../../hooks/useInventoryTransactionHistory.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { buildLocationQrSvg, buildLocationQrUrl, buildLocationScanPath, parseLocationScanPayload } from '../../lib/locationQr.js';

const INVENTORY_VIEWS = [
  { key: 'stock', label: 'Inventory', icon: PackageSearch },
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Live stock summary and valuation export preview.' },
  { key: 'catalog', label: 'Catalogue', icon: PackageSearch, description: 'Active material catalogue preview.' },
  { key: 'storage', label: 'Storage', icon: MapPinned, description: 'Storage units and bin previews.' },
  { key: 'locations', label: 'Locations & QR', icon: QrCode, description: 'Physical hierarchy records and QR outputs.' },
  { key: 'scan', label: 'Scan', icon: QrCode, description: 'Resolve location QR codes and dispatch to cart or count.' },
  { key: 'accounting', label: 'Accounting Export', icon: Download, description: 'Read-only inventory valuation export preview.' },
  { key: 'cart', label: 'Cart', icon: ShoppingCart, description: 'Open cart, add candidates, and remove staged lines.' },
  { key: 'count', label: 'Count', icon: Scale, description: 'Count sheet, correction, and new bin/material intake.' },
  { key: 'destinations', label: 'Destinations', icon: Truck, description: 'Approved user and vehicle destination references.' },
  { key: 'history', label: 'Transaction History', icon: History, description: 'Read-only ledger history through the preserved RPC.' },
  { key: 'controls', label: 'Reserved Controls', icon: ClipboardList, description: 'Cart, checkout, count, and archive boundaries.' },
];

const HISTORY_TYPES = [
  { value: '', label: 'All transaction types' },
  { value: 'checkout', label: 'Checkout group' },
  { value: 'physical_count_correction', label: 'Physical count correction' },
  { value: 'add_stock', label: 'Add stock' },
  { value: 'remove_stock', label: 'Remove stock' },
  { value: 'assign_to_vehicle', label: 'Assign to vehicle' },
  { value: 'assign_to_job', label: 'Assign to job' },
];

const DESTINATION_OPTIONS = [
  { value: 'job', label: 'Issue to Job' },
  { value: 'service_call', label: 'Issue to Service Call' },
  { value: 'vehicle', label: 'Vehicle Stock' },
  { value: 'vendor_return', label: 'Vendor Return' },
  { value: 'scrap', label: 'Scrap' },
  { value: 'unknown', label: 'Other / Uncoded (note required)' },
];

const DESTINATIONS_REQUIRING_ID = new Set(['job', 'service_call', 'vehicle', 'user']);
const VALID_DESTINATION_TYPES = new Set(DESTINATION_OPTIONS.map((option) => option.value));

const COUNT_REASON_OPTIONS = [
  { value: 'cycle count', label: 'Cycle Count' },
  { value: 'initial shelf count', label: 'Initial Shelf Count' },
  { value: 'correction', label: 'Correction' },
  { value: 'custom', label: 'Custom Note' },
];

const CATALOG_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'name', header: 'Name' },
  { key: 'broad_category', header: 'Category', fallback: '-' },
  { key: 'sub_category', header: 'Subcategory', fallback: '-' },
  { key: 'unit_of_measure', header: 'Unit', fallback: '-' },
  { key: 'division', header: 'Department', fallback: '-' },
  { key: 'price_per_unit', header: 'Unit Cost', numeric: true, render: (row) => formatMoney(row.price_per_unit) },
];

const STORAGE_COLUMNS = [
  { key: 'unit_code', header: 'Unit', render: (row) => <strong>{row.unit_code || '-'}</strong> },
  { key: 'name', header: 'Name', fallback: '-' },
  { key: 'division', header: 'Department', fallback: '-' },
];

const BIN_COLUMNS = [
  { key: 'bin_code', header: 'Bin', render: (row) => <strong>{row.bin_code || '-'}</strong> },
  { key: 'label', header: 'Label', fallback: '-' },
  { key: 'qr_code', header: 'QR Payload', fallback: '-' },
];

const CANDIDATE_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'item_name', header: 'Item' },
  { key: 'bin_code', header: 'Bin' },
  { key: 'quantity_on_hand', header: 'On Hand', numeric: true },
  { key: 'unit_of_measure', header: 'Unit', fallback: '-' },
  { key: 'division', header: 'Department', fallback: '-' },
  { key: 'price_per_unit', header: 'Unit Cost', numeric: true, render: (row) => formatMoney(row.price_per_unit) },
];

const CART_COLUMNS = [
  { key: 'item_name', header: 'Material', render: row => <span><strong>{row.item_name}</strong><small className="inventory-cart-code">{row.material_code}</small></span> },
  { key: 'bin_code', header: 'From' },
  { key: 'quantity', header: 'Quantity', numeric: true, render: row => `${formatQuantity(row.quantity)} ${row.unit_of_measure || ''}` },
];

const USER_COLUMNS = [
  { key: 'display_name', header: 'Name', render: (row) => <strong>{row.display_name || row.email || row.clerk_user_id}</strong> },
  { key: 'email', header: 'Email', fallback: '-' },
  { key: 'role', header: 'Role', fallback: '-' },
  { key: 'division', header: 'Department', fallback: '-' },
];

const VEHICLE_COLUMNS = [
  { key: 'vehicle_number', header: 'Vehicle', render: (row) => <strong>{row.vehicle_number || row.id}</strong> },
  { key: 'classification', header: 'Classification', fallback: '-' },
  { key: 'make', header: 'Make', fallback: '-' },
  { key: 'model', header: 'Model', fallback: '-' },
  { key: 'division', header: 'Department', fallback: '-' },
  {
    key: 'holds_stock',
    header: 'Stock',
    render: (row) => <StatusBadge tone={row.holds_stock ? 'good' : 'neutral'}>{row.holds_stock ? 'Holds stock' : 'Fleet only'}</StatusBadge>,
  },
];

const HISTORY_COLUMNS = [
  { key: 'occurred_at', header: 'Occurred', render: (row) => formatDateTime(row.occurred_at || row.transaction_created_at) },
  { key: 'transaction_type', header: 'Type', render: (row) => <StatusBadge status={row.transaction_type}>{formatTransactionType(row.transaction_type)}</StatusBadge> },
  { key: 'material_code', header: 'Code', fallback: '-' },
  { key: 'item_name', header: 'Item', fallback: '-' },
  { key: 'bin_code', header: 'Bin', fallback: '-' },
  { key: 'quantity', header: 'Qty', numeric: true },
  { key: 'destination_label', header: 'Destination', fallback: '-' },
  { key: 'actor_name', header: 'Actor', fallback: '-' },
];

const COUNT_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'item_name', header: 'Item' },
  { key: 'storage_path', header: 'Location', render: (row) => buildStoragePath(row) || row.bin_code || '-' },
  { key: 'system_quantity', header: 'System Qty', numeric: true, render: (row) => formatQuantity(row.system_quantity) },
  { key: 'unit_of_measure', header: 'Unit', fallback: '-' },
  { key: 'min_quantity', header: 'Min', numeric: true, render: (row) => formatQuantity(row.min_quantity) },
];

const SCAN_CONTENT_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'item_name', header: 'Item' },
  { key: 'bin_code', header: 'Bin' },
  { key: 'quantity_on_hand', header: 'On Hand', numeric: true, render: (row) => formatQuantity(row.quantity_on_hand ?? row.system_quantity) },
  { key: 'unit_of_measure', header: 'Unit', fallback: '-' },
];

const OVERVIEW_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'item_name', header: 'Item' },
  { key: 'storage_path', header: 'Location', render: (row) => buildStoragePath(row) || row.bin_code || '-' },
  { key: 'quantity_on_hand', header: 'On Hand', numeric: true, render: (row) => formatQuantity(row.quantity_on_hand ?? row.system_quantity) },
  { key: 'min_quantity', header: 'Min', numeric: true, render: (row) => formatQuantity(row.min_quantity) },
  { key: 'unit_of_measure', header: 'Unit', fallback: '-' },
  { key: 'division', header: 'Department', fallback: '-' },
];

const ACCOUNTING_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'item_name', header: 'Item' },
  { key: 'division', header: 'Department', fallback: '-' },
  { key: 'quantity_on_hand', header: 'Qty', numeric: true, render: (row) => formatQuantity(row.quantity_on_hand ?? row.system_quantity) },
  { key: 'price_per_unit', header: 'Unit Cost', numeric: true, render: (row) => formatMoney(row.price_per_unit) },
  { key: 'extended_value', header: 'Extended', numeric: true, render: (row) => formatMoney(getExtendedValue(row)) },
  { key: 'storage_path', header: 'Location', render: (row) => buildStoragePath(row) || row.bin_code || '-' },
];

const LOCATION_COLUMNS = [
  { key: 'typeLabel', header: 'Level', render: (row) => <StatusBadge tone={row.type === 'bin' ? 'good' : 'neutral'}>{row.typeLabel}</StatusBadge> },
  { key: 'code', header: 'Code', render: (row) => <strong>{row.code || '-'}</strong> },
  { key: 'label', header: 'Label', fallback: '-' },
  { key: 'path', header: 'Path', fallback: '-' },
];

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatTransactionType(value) {
  return String(value || '-').replaceAll('_', ' ');
}

function getExtendedValue(row) {
  const quantity = Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
  const unitCost = Number(row.price_per_unit ?? 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;
  return quantity * unitCost;
}

function buildStoragePath(row) {
  return [
    row.storage_unit_code,
    row.shelf_code,
    row.bay_code,
    row.bin_code,
  ].filter(Boolean).join(' / ');
}

function sortByPositionThenCode(first, second, codeKey) {
  return Number(first.position ?? 0) - Number(second.position ?? 0)
    || String(first[codeKey] ?? '').localeCompare(String(second[codeKey] ?? ''));
}

function buildLocationRecords(locationSheet) {
  const unitById = new Map(locationSheet.storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(locationSheet.shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(locationSheet.bays.map((bay) => [bay.id, bay]));

  const unitRecords = locationSheet.storageUnits.map((unit) => ({
    id: unit.id,
    type: 'unit',
    typeLabel: 'Unit',
    code: unit.unit_code,
    label: unit.name,
    path: unit.unit_code,
  }));

  const shelfRecords = locationSheet.shelves.map((shelf) => {
    const unit = unitById.get(shelf.unit_id);
    return {
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
      path: [unit?.unit_code, shelf.shelf_code].filter(Boolean).join(' / '),
    };
  });

  const bayRecords = locationSheet.bays.map((bay) => {
    const shelf = shelfById.get(bay.shelf_id);
    const unit = shelf ? unitById.get(shelf.unit_id) : null;
    return {
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
      path: [unit?.unit_code, shelf?.shelf_code, bay.bay_code].filter(Boolean).join(' / '),
    };
  });

  const binRecords = locationSheet.bins.map((bin) => {
    const bay = bayById.get(bin.bay_id);
    const shelf = bay ? shelfById.get(bay.shelf_id) : null;
    const unit = shelf ? unitById.get(shelf.unit_id) : null;
    return {
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
      path: [unit?.unit_code, shelf?.shelf_code, bay?.bay_code, bin.bin_code].filter(Boolean).join(' / '),
    };
  });

  return [...unitRecords, ...shelfRecords, ...bayRecords, ...binRecords];
}

function getLocationDisplay(record) {
  if (!record) return 'Unknown location';
  return record.path || record.code || record.label || record.id;
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

  const shelves = scopeType === 'unit' ? getSortedShelves(unit.id) : shelf ? [shelf] : [];
  const bays = scopeType === 'unit' || scopeType === 'shelf' ? shelves.flatMap((row) => getSortedBays(row.id)) : bay ? [bay] : [];
  const bins = scopeType === 'unit' || scopeType === 'shelf' || scopeType === 'bay' ? bays.flatMap((row) => getSortedBins(row.id)) : bin ? [bin] : [];
  const locationRecord = buildLocationRecords(locationSheet).find((record) => record.id === locationId) ?? null;

  return {
    scopeType,
    locationRecord,
    bins,
    bin,
  };
}

function getRowsForScanScope(model, rows) {
  if (!model?.locationRecord) return [];
  if (model.scopeType === 'bin') {
    return rows.filter((row) => row.bin_id === model.bin?.id);
  }
  const binIds = new Set(model.bins.map((bin) => bin.id));
  return rows.filter((row) => binIds.has(row.bin_id));
}

function getScanQuery(bin) {
  const params = new URLSearchParams();
  if (bin?.id) params.set('scanBinId', bin.id);
  const label = bin?.bin_code || bin?.label || '';
  if (label) params.set('scanBinCode', label);
  return params;
}

function normalizeLocationLookup(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function locationRecordMatchesInput(record, input) {
  const normalizedInput = normalizeLocationLookup(input);
  if (!normalizedInput) return false;

  const candidates = [
    record.code,
    record.label,
    record.path,
    record.id,
    ...(record.path ? record.path.split('/') : []),
  ];

  return candidates.some((candidate) => normalizeLocationLookup(candidate) === normalizedInput);
}

function downloadTextFile(filename, text, type = 'text/plain') {
  if (typeof window === 'undefined') return;
  const blob = new Blob([text], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function buildAccountingCsv(rows) {
  const headers = ['material_code', 'item_name', 'division', 'quantity', 'unit_cost', 'extended_value', 'location'];
  const lines = rows.map((row) => [
    row.material_code,
    row.item_name,
    row.division,
    row.quantity_on_hand ?? row.system_quantity ?? 0,
    row.price_per_unit ?? 0,
    getExtendedValue(row),
    buildStoragePath(row) || row.bin_code || '',
  ].map(escapeCsvValue).join(','));
  return [headers.join(','), ...lines].join('\n');
}

async function decodeQrFromVideoFrame(video, canvasRef) {
  if (!video?.videoWidth || !video?.videoHeight) return '';
  const { default: jsQR } = await import('jsqr');
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

function filterRows(rows, search, fields) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return rows;

  return rows.filter((row) => fields
    .map((field) => row?.[field])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized));
}

function normalizeDestinationType(value) {
  return VALID_DESTINATION_TYPES.has(value) ? value : '';
}

function isDestinationValid(destination) {
  const destinationType = normalizeDestinationType(destination?.destination_type);
  if (!VALID_DESTINATION_TYPES.has(destinationType)) return false;
  if (DESTINATIONS_REQUIRING_ID.has(destinationType) && !destination?.destination_id?.trim()) {
    return false;
  }
  if (destinationType === 'unknown' && !destination?.note?.trim()) {
    return false;
  }
  return true;
}

function isDeveloperOrAdminRole(role) {
  return ['Developer', 'Administrator', 'Admin'].includes(role);
}

export function InventoryWorkspace({ permissions }) {
  const diagnostics = useDiagnostics();
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 899px), (pointer: coarse)').matches);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const addLock = useRef(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 899px), (pointer: coarse)');
    const update = () => setIsMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const requestedView = searchParams.get('view') ?? '';
  const scanBinId = searchParams.get('scanBinId') ?? '';
  const scanBinCode = searchParams.get('scanBinCode') ?? '';
  const scanContext = scanBinId ? { binId: scanBinId, binCode: scanBinCode } : null;
  const canLoadInventory = permissions.permissionSource === 'server';
  const canTransact = canLoadInventory && permissions?.canInventoryTransactions === true;
  const canManageInventory = permissions?.canManageInventory === true;
  const canReadCounts = canLoadInventory && canManageInventory;
  const canScan = canLoadInventory && (canManageInventory || canTransact);
  const canWriteCounts = canReadCounts && isDeveloperOrAdminRole(permissions?.role);
  const canRetireBinItems = canWriteCounts && permissions?.canArchiveRecords === true;
  const readModel = useInventoryReadModel({ enabled: canLoadInventory });
  const cartState = useInventoryCart();
  const [activeView, setActiveView] = useState(
    INVENTORY_VIEWS.some((view) => view.key === requestedView) ? requestedView : 'stock',
  );
  const [search, setSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogSubcategory, setCatalogSubcategory] = useState('');
  const [historyType, setHistoryType] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [candidateQuantities, setCandidateQuantities] = useState({});
  const [candidateMessages, setCandidateMessages] = useState({});
  const [lineDestinations, setLineDestinations] = useState({});
  const [applyAllDestination, setApplyAllDestination] = useState({
    destination_type: 'unknown',
    destination_id: '',
    note: '',
  });
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const [countSearch, setCountSearch] = useState('');
  const [countDrafts, setCountDrafts] = useState({});
  const [countMessages, setCountMessages] = useState({});
  const [countIntakeDraft, setCountIntakeDraft] = useState({
    bin_id: '',
    item_id: '',
    countedQuantity: '',
    reason: 'initial shelf count',
    customReason: '',
  });
  const [retirementDraft, setRetirementDraft] = useState({
    binItemId: '',
    reason: '',
  });
  const [manualScanPayload, setManualScanPayload] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [scanMatches, setScanMatches] = useState([]);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [selectedLocationId, setSelectedLocationId] = useState('');

  const history = useInventoryTransactionHistory({
    enabled: canLoadInventory && activeView === 'history',
    transactionType: historyType,
    search: historySearch,
    limit: 75,
  });
  const countSheet = useInventoryCountSheet({
    enabled: canReadCounts && ['overview', 'accounting', 'locations', 'count', 'scan'].includes(activeView),
  });
  const countCorrection = useInventoryCountCorrection();
  const countIntake = useInventoryCountIntake();
  const retirement = useBinItemRetirement();

  const model = readModel.model;
  const counts = model.counts;
  const cart = cartState.cart;
  const cartIsActive = cart?.status === 'active';
  const cartActionInProgress =
    cartState.isOpening ||
    cartState.isAddingItem ||
    cartState.isRemovingItem ||
    cartState.isCheckingOut ||
    cartState.isReadingItems;

  const catalogCategories = useMemo(
    () => [...new Set(model.catalogPreview.map((row) => row.broad_category).filter(Boolean))].sort(),
    [model.catalogPreview],
  );
  const catalogSubcategories = useMemo(
    () => [...new Set(model.catalogPreview
      .filter((row) => !catalogCategory || row.broad_category === catalogCategory)
      .map((row) => row.sub_category)
      .filter(Boolean))].sort(),
    [catalogCategory, model.catalogPreview],
  );
  const visibleCatalogue = useMemo(() => {
    const scopedRows = model.catalogPreview.filter((row) => (
      (!catalogCategory || row.broad_category === catalogCategory)
      && (!catalogSubcategory || row.sub_category === catalogSubcategory)
    ));
    return filterRows(scopedRows, search, [
      'material_code',
      'name',
      'description',
      'broad_category',
      'sub_category',
      'sub_category_2',
      'sub_category_3',
      'size',
      'length',
      'manufacturer',
      'division',
    ]);
  }, [catalogCategory, catalogSubcategory, model.catalogPreview, search]);
  const visibleStorageUnits = useMemo(
    () => filterRows(model.storageUnitsPreview, search, ['unit_code', 'name', 'division']),
    [model.storageUnitsPreview, search],
  );
  const visibleBins = useMemo(
    () => filterRows(model.binsPreview, search, ['bin_code', 'label', 'qr_code']),
    [model.binsPreview, search],
  );
  const visibleCandidates = useMemo(
    () => {
      const rows = scanContext?.binId
        ? model.cartCandidates.filter((row) => row.bin_id === scanContext.binId)
        : model.cartCandidates;
      return filterRows(rows, search, ['material_code', 'item_name', 'bin_code', 'bin_label', 'division']);
    },
    [model.cartCandidates, scanContext?.binId, search],
  );
  const visibleUsers = useMemo(
    () => filterRows(model.destinationReferences.users, search, ['display_name', 'email', 'role', 'division']),
    [model.destinationReferences.users, search],
  );
  const visibleVehicles = useMemo(
    () => filterRows(model.destinationReferences.vehicles, search, ['vehicle_number', 'make', 'model', 'classification', 'division']),
    [model.destinationReferences.vehicles, search],
  );
  const visibleCountRows = useMemo(
    () => {
      const rows = scanContext?.binId
        ? countSheet.rows.filter((row) => row.bin_id === scanContext.binId)
        : countSheet.rows;
      return filterRows(rows, countSearch, [
        'material_code',
        'item_name',
        'bin_code',
        'bin_label',
        'storage_unit_code',
        'shelf_code',
        'bay_code',
        'division',
      ]);
    },
    [countSearch, countSheet.rows, scanContext?.binId],
  );
  const countIntakeItems = useMemo(() => {
    const existingInBin = new Set(
      countSheet.rows
        .filter((row) => row.bin_id === countIntakeDraft.bin_id)
        .map((row) => row.item_id),
    );
    return countSheet.catalogItems
      .filter((item) => !existingInBin.has(item.id))
      .slice(0, 200);
  }, [countIntakeDraft.bin_id, countSheet.catalogItems, countSheet.rows]);
  const visibleOverviewRows = useMemo(
    () => filterRows(countSheet.rows, search, [
      'material_code',
      'item_name',
      'bin_code',
      'storage_unit_code',
      'shelf_code',
      'bay_code',
      'division',
      'broad_category',
      'sub_category',
    ]),
    [countSheet.rows, search],
  );
  const visibleAccountingRows = useMemo(
    () => visibleOverviewRows.filter((row) => Number(row.quantity_on_hand ?? row.system_quantity ?? 0) !== 0),
    [visibleOverviewRows],
  );
  const locationRecords = useMemo(
    () => buildLocationRecords(countSheet),
    [countSheet.storageUnits, countSheet.shelves, countSheet.bays, countSheet.bins],
  );
  const visibleLocationRecords = useMemo(
    () => filterRows(locationRecords, search, ['typeLabel', 'code', 'label', 'path', 'id']),
    [locationRecords, search],
  );
  const selectedLocation =
    visibleLocationRecords.find((record) => record.id === selectedLocationId)
    ?? locationRecords.find((record) => record.id === selectedLocationId)
    ?? visibleLocationRecords[0]
    ?? null;
  const overviewQuantity = visibleOverviewRows.reduce(
    (sum, row) => sum + Number(row.quantity_on_hand ?? row.system_quantity ?? 0),
    0,
  );
  const overviewValue = visibleAccountingRows.reduce((sum, row) => sum + getExtendedValue(row), 0);
  const lowStockRows = visibleOverviewRows.filter((row) => {
    const minQuantity = Number(row.min_quantity ?? 0);
    if (!Number.isFinite(minQuantity) || minQuantity <= 0) return false;
    return Number(row.quantity_on_hand ?? row.system_quantity ?? 0) <= minQuantity;
  });
  const hasInvalidLineDestinations = cartState.cartItems.some((item) => !isDestinationValid(getLineDestination(item)));
  const applyAllDestinationIsValid = isDestinationValid(applyAllDestination);

  useEffect(() => {
    if (cart?.status === 'checked_out') {
      setLineDestinations({});
    }
  }, [cart?.status]);

  useEffect(() => {
    if (INVENTORY_VIEWS.some((view) => view.key === requestedView)) {
      setActiveView(requestedView);
    }
  }, [requestedView]);

  useEffect(() => {
    if (activeView === 'count' && scanContext?.binId) {
      setCountIntakeDraft((current) => ({
        ...current,
        bin_id: scanContext.binId,
      }));
    }
  }, [activeView, scanContext?.binId]);

  useEffect(() => () => {
    stopCameraScanner();
  }, []);
  useEffect(() => {
    if (!isMobile) stopCameraScanner();
  }, [isMobile]);

  const views = INVENTORY_VIEWS.filter(view => {
    if (view.key === 'scan') return isMobile && canScan;
    if (['controls', 'destinations'].includes(view.key)) return diagnostics;
    if (view.key === 'catalog' || view.key === 'cart') return false;
    if (['overview', 'accounting', 'locations', 'count'].includes(view.key)) return canManageInventory;
    return true;
  }).map((view) => {
    const badge = {
      catalog: counts.activeItems,
      overview: countSheet.rows.length || counts.binItems,
      accounting: countSheet.rows.length || counts.inventoryBalances,
      storage: counts.bins,
      locations: locationRecords.length || counts.bins,
      cart: cartState.cartItems.length || model.cartCandidates.length,
      count: countSheet.rows.length || counts.binItems,
      scan: countSheet.bins.length || counts.bins,
      destinations: model.destinationReferences.users.length + model.destinationReferences.vehicles.length,
      history: history.rows.length,
      controls: null,
    }[view.key];
    return { ...view, badge: diagnostics ? badge : null };
  });

  const candidateColumns = useMemo(() => [
    ...CANDIDATE_COLUMNS,
    {
      key: 'stage_quantity',
      header: 'Stage',
      render: (row) => (
        <div className="inventory-cart-action-cell">
          <label>
            <span className="sr-only">Quantity for {row.item_name}</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={candidateQuantities[row.bin_item_id] ?? '1'}
              onChange={(event) => updateCandidateQuantity(row.bin_item_id, event.target.value)}
            />
          </label>
          <button hidden={!canTransact}
            type="button"
            className="secondary-button"
            disabled={!canTransact || !cartIsActive || cartActionInProgress}
            onClick={() => handleAddCandidate(row)}
          >
            <Plus aria-hidden="true" /> Add
          </button>
        </div>
      ),
    },
    {
      key: 'message',
      header: 'Result',
      render: (row) => candidateMessages[row.bin_item_id] ? (
        <span className={`inventory-cart-row-message inventory-cart-row-message--${candidateMessages[row.bin_item_id].tone}`}>
          {candidateMessages[row.bin_item_id].text}
        </span>
      ) : '-',
    },
  ], [canTransact, candidateMessages, candidateQuantities, cartActionInProgress, cartIsActive]);

  const cartColumns = useMemo(() => [
    ...CART_COLUMNS,
    {
      key: 'destination',
      header: 'Destination',
      render: (row) => {
        const line = getLineDestination(row);
        return (
          <div className="inventory-cart-destination-cell">
            <select
              aria-label={`Destination for ${row.item_name}`}
              value={line.destination_type}
              disabled={!canTransact || !cartIsActive || cartActionInProgress}
              onChange={(event) => updateLineDestination(row.cart_item_id, {
                destination_type: event.target.value,
                destination_id: '',
                note: '',
              })}
            >
              <option value="" disabled>Choose destination</option>
              {DESTINATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {renderDestinationIdControl(row.cart_item_id, line)}
            <input
              aria-label={`Destination note for ${row.item_name}`}
              type="text"
              value={line.note}
              disabled={!canTransact || !cartIsActive || cartActionInProgress}
              placeholder={line.destination_type === 'unknown' ? 'Required note' : 'Optional note'}
              onChange={(event) => updateLineDestination(row.cart_item_id, { note: event.target.value })}
            />
            {!isDestinationValid(line) ? <span className="inventory-cart-row-message inventory-cart-row-message--error">Destination required</span> : null}
          </div>
        );
      },
    },
    {
      key: 'remove',
      header: 'Remove',
      render: (row) => (
        <button
          type="button"
          className="icon-button"
          title={`Remove ${row.item_name}`}
          aria-label={`Remove ${row.item_name}`}
          hidden={!canTransact}
          disabled={!canTransact || !cartIsActive || cartActionInProgress}
          onClick={() => handleRemoveCartItem(row.cart_item_id)}
        >
          <Trash2 aria-hidden="true" />
        </button>
      ),
    },
  ], [canTransact, cartActionInProgress, cartIsActive, lineDestinations, applyAllDestination, model.destinationReferences]);

  const countColumns = useMemo(() => [
    ...COUNT_COLUMNS,
    {
      key: 'counted_quantity',
      header: 'Counted Qty',
      render: (row) => {
        const draft = getCountDraft(row);
        return (
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.countedQuantity}
            disabled={!canWriteCounts || countCorrection.isSettingQuantity}
            onChange={(event) => updateCountDraft(row.bin_item_id, { countedQuantity: event.target.value })}
            placeholder="0"
          />
        );
      },
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => {
        const draft = getCountDraft(row);
        return (
          <div className="inventory-count-reason-cell">
            <select
              value={draft.reason}
              disabled={!canWriteCounts || countCorrection.isSettingQuantity}
              onChange={(event) => updateCountDraft(row.bin_item_id, { reason: event.target.value })}
            >
              {COUNT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {draft.reason === 'custom' ? (
              <input
                type="text"
                value={draft.customReason}
                disabled={!canWriteCounts || countCorrection.isSettingQuantity}
                placeholder="Required note"
                onChange={(event) => updateCountDraft(row.bin_item_id, { customReason: event.target.value })}
              />
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'action',
      header: 'Set Count',
      render: (row) => {
        const message = countMessages[row.bin_item_id];
        return (
          <div className="inventory-count-action-cell">
            <button hidden={!canWriteCounts}
              type="button"
              className="secondary-button"
              disabled={!canWriteCounts || countCorrection.isSettingQuantity || !isCountDraftReady(getCountDraft(row))}
              onClick={() => handleSetCount(row)}
            >
              <Scale aria-hidden="true" /> Set Count
            </button>
            {message ? (
              <span className={`inventory-cart-row-message inventory-cart-row-message--${message.tone}`}>
                {message.text}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'retire',
      header: 'Retire',
      render: (row) => {
        const systemQuantity = Number(row.system_quantity ?? 0);
        const isRetiringThisRow = retirementDraft.binItemId === row.bin_item_id;
        const message = countMessages[`retire:${row.bin_item_id}`];

        if (!isRetiringThisRow) {
          return (
            <div className="inventory-count-retire-cell">
              <button hidden={!canRetireBinItems}
                type="button"
                className="secondary-button"
                disabled={!canRetireBinItems || retirement.isRetiring || systemQuantity !== 0}
                title={systemQuantity === 0 ? 'Retire this bin/material link' : 'Set count to zero before retiring'}
                onClick={() => startRetirement(row)}
              >
                <Trash2 aria-hidden="true" /> Retire
              </button>
              {systemQuantity !== 0 ? (
                <span className="inventory-cart-row-message inventory-cart-row-message--error">Zero count required first</span>
              ) : null}
              {message ? (
                <span className={`inventory-cart-row-message inventory-cart-row-message--${message.tone}`}>
                  {message.text}
                </span>
              ) : null}
            </div>
          );
        }

        return (
          <div className="inventory-count-retire-cell inventory-count-retire-cell--active">
            <input
              type="text"
              value={retirementDraft.reason}
              disabled={retirement.isRetiring}
              placeholder="Required retirement reason"
              onChange={(event) => setRetirementDraft((current) => ({ ...current, reason: event.target.value }))}
            />
            <div className="inventory-count-retire-actions">
              <button
                type="button"
                className="primary-button"
                disabled={retirement.isRetiring || !retirementDraft.reason.trim()}
                onClick={() => confirmRetirement(row)}
              >
                {retirement.isRetiring ? 'Retiring...' : 'Confirm'}
              </button>
              <button type="button" className="secondary-button" disabled={retirement.isRetiring} onClick={cancelRetirement}>
                Cancel
              </button>
            </div>
            {message ? (
              <span className={`inventory-cart-row-message inventory-cart-row-message--${message.tone}`}>
                {message.text}
              </span>
            ) : null}
          </div>
        );
      },
    },
  ], [canRetireBinItems, canWriteCounts, countCorrection.isSettingQuantity, countDrafts, countMessages, retirement.isRetiring, retirementDraft]);

  function getLineDestination(cartItem) {
    const savedLine = lineDestinations[cartItem.cart_item_id];
    const destinationType = normalizeDestinationType(
      savedLine?.destination_type ?? cartItem.destination_type ?? applyAllDestination.destination_type,
    );

    return {
      destination_type: destinationType,
      destination_id: savedLine?.destination_id ?? cartItem.destination_id ?? '',
      note: savedLine?.note ?? cartItem.note ?? '',
    };
  }

  function updateLineDestination(cartItemId, updates) {
    const item = cartState.cartItems.find(row => row.cart_item_id === cartItemId);
    const existing = item ? getLineDestination(item) : applyAllDestination;
    setLineDestinations((current) => ({
      ...current,
      [cartItemId]: {
        ...existing,
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

  function renderDestinationIdControl(cartItemId, line) {
    const destinationType = normalizeDestinationType(line.destination_type);
    const updateReference = value => cartItemId === '__all__'
      ? updateApplyAllDestination({ destination_id: value })
      : updateLineDestination(cartItemId, { destination_id: value });
    if (!DESTINATIONS_REQUIRING_ID.has(destinationType)) return null;

    if (destinationType === 'user' && model.destinationReferences.users.length) {
      return (
        <select
          value={line.destination_id}
          disabled={!cartIsActive || cartActionInProgress}
          onChange={(event) => updateLineDestination(cartItemId, { destination_id: event.target.value })}
        >
          <option value="">Select user</option>
          {model.destinationReferences.users.map((user) => (
            <option key={user.clerk_user_id} value={user.clerk_user_id}>
              {user.display_name || user.email || user.clerk_user_id}
            </option>
          ))}
        </select>
      );
    }

    if (destinationType === 'vehicle' && model.destinationReferences.vehicles.length) {
      return (
        <select
          aria-label={cartItemId === '__all__' ? 'Cart destination reference' : 'Vehicle destination'}
          value={line.destination_id}
          disabled={!cartIsActive || cartActionInProgress}
          onChange={(event) => updateReference(event.target.value)}
        >
          <option value="">Select vehicle</option>
          {model.destinationReferences.vehicles.filter(vehicle => vehicle.holds_stock).map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.vehicle_number || vehicle.id}
            </option>
          ))}
        </select>
      );
    }

    const requiresId = DESTINATIONS_REQUIRING_ID.has(destinationType);
    return (
      <input
        aria-label={cartItemId === '__all__' ? 'Cart destination reference' : 'Destination reference'}
        type="text"
        value={line.destination_id}
        disabled={!cartIsActive || cartActionInProgress || !requiresId}
        placeholder={requiresId ? 'Required ID' : 'No ID required'}
        onChange={(event) => updateReference(event.target.value)}
      />
    );
  }

  function updateCandidateQuantity(binItemId, value) {
    setCandidateQuantities((current) => ({
      ...current,
      [binItemId]: value,
    }));
  }

  function setCandidateMessage(binItemId, tone, text) {
    setCandidateMessages((current) => ({
      ...current,
      [binItemId]: { tone, text },
    }));
  }

  function getCandidateQuantity(candidate) {
    const rawValue = candidateQuantities[candidate.bin_item_id] ?? '1';
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : 0;
  }

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
    setCountMessages((current) => ({ ...current, [binItemId]: null }));
  }

  function resolveCountReason(draft) {
    return draft.reason === 'custom' ? draft.customReason.trim() : draft.reason;
  }

  function isCountDraftReady(draft) {
    const countedQuantity = Number(draft.countedQuantity);
    return (
      draft.countedQuantity !== '' &&
      Number.isFinite(countedQuantity) &&
      countedQuantity >= 0 &&
      resolveCountReason(draft).length > 0
    );
  }

  function updateCountIntakeDraft(updates) {
    setCountIntakeDraft((current) => ({
      ...current,
      ...updates,
    }));
    setCountMessages((current) => ({ ...current, new: null }));
  }

  function updateInventoryView(nextView) {
    setActiveView(nextView);
    setSearch('');
    setCountSearch('');

    const params = new URLSearchParams(location.search);
    params.set('view', nextView);
    if (!['cart', 'count', 'stock', 'catalog'].includes(nextView)) {
      params.delete('scanBinId');
      params.delete('scanBinCode');
    }
    navigate(`/inventory?${params.toString()}`, { replace: true });
    setIsPrimaryOpen(false);
    setConfirmCheckout(false);
    stopCameraScanner();
  }

  function openLocationScan(locationId) {
    if (!locationId) return;
    setScanMessage('');
    setScanMatches([]);
    navigate(buildLocationScanPath(locationId));
  }

  function handleManualScan(event) {
    event.preventDefault();
    const payload = manualScanPayload.trim();
    setScanMatches([]);

    const parsed = parseLocationScanPayload(payload);
    if (parsed.ok) {
      setScanMessage('');
      navigate(parsed.path);
      return;
    }

    const stockBins = [...new Map((model.stockRows ?? model.cartCandidates).map(row => [row.bin_id, {
      id: row.bin_id, type: 'bin', typeLabel: 'Bin', code: row.bin_code, label: row.bin_label, path: row.bin_code,
    }])).values()];
    const stockMatches = stockBins.filter(record => locationRecordMatchesInput(record, payload));
    if (stockMatches.length === 1) { openLocationScan(stockMatches[0].id); return; }
    if (stockMatches.length > 1) { setScanMatches(stockMatches); return; }
    if (!canManageInventory) { setScanMessage('No matching accessible stock bin found.'); return; }
    if (countSheet.isLoading || !countSheet.lastLoadedAt) {
      setScanMessage('Location hierarchy is still loading. Try again in a moment.');
      return;
    }

    if (countSheet.error) {
      setScanMessage('Location hierarchy failed to load. Confirm inventory management permission and try again.');
      return;
    }

    const matches = buildLocationRecords(countSheet)
      .filter((record) => locationRecordMatchesInput(record, payload))
      .slice(0, 12);

    if (matches.length === 1) {
      openLocationScan(matches[0].id);
      return;
    }

    if (matches.length > 1) {
      setScanMatches(matches);
      setScanMessage('Multiple locations match. Choose the correct scan target.');
      return;
    }

    setScanMessage('No matching Northgate location QR or location code found.');
  }

  function stopCameraScanner() {
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
  }

  async function startCameraScanner() {
    if (!canScan || !isMobile) {
      setScanMessage('Server inventory read access is required before scanning.');
      return;
    }
    if (typeof window === 'undefined' || !window.isSecureContext) {
      setScanMessage('Camera scanning requires HTTPS. Use manual entry in this context.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanMessage('This browser does not expose camera access. Use manual entry.');
      return;
    }

    try {
      setScanMessage('');
      setCameraStatus('starting');
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
      setCameraStatus('scanning');

      async function detectFrame() {
        if (!videoRef.current || !streamRef.current) return;
        const rawPayload = await decodeQrFromVideoFrame(videoRef.current, canvasRef);
        if (rawPayload) {
          const parsed = parseLocationScanPayload(rawPayload);
          if (parsed.ok) {
            stopCameraScanner();
            setScanMessage('');
            navigate(parsed.path);
            return;
          }
          setScanMessage(parsed.error);
        }
        frameRef.current = requestAnimationFrame(detectFrame);
      }

      frameRef.current = requestAnimationFrame(detectFrame);
    } catch (error) {
      console.error('QR scanner camera failed', error);
      stopCameraScanner();
      setScanMessage('Camera permission was denied or the camera is unavailable. Use manual entry.');
    }
  }

  function handleDownloadAccountingCsv() {
    downloadTextFile('northgate-inventory-accounting-export.csv', buildAccountingCsv(visibleAccountingRows), 'text/csv');
  }

  function handleDownloadSelectedQr() {
    if (!selectedLocation) return;
    const code = selectedLocation.code || selectedLocation.id;
    downloadTextFile(`northgate-location-${code}.svg`, buildLocationQrSvg(selectedLocation.id), 'image/svg+xml');
  }

  function setCountMessage(key, tone, text) {
    setCountMessages((current) => ({
      ...current,
      [key]: { tone, text },
    }));
  }

  async function handleOpenCart() {
    if (!canTransact || cartActionInProgress) return;
    await cartState.openCart();
  }

  async function handleAddCandidate(candidate) {
    if (!canTransact || cartActionInProgress || addLock.current) return;

    const quantity = getCandidateQuantity(candidate);
    if (quantity <= 0 || quantity > Number(candidate.quantity_on_hand)) {
      setCandidateMessage(candidate.bin_item_id, 'error', 'Enter a quantity greater than zero and no more than the available stock.');
      return;
    }
    addLock.current = true;
    try {
      const activeCart = cartIsActive ? cart : await cartState.openCart();
      if (!activeCart?.cart_id || activeCart.status !== 'active') return;
      const result = await cartState.addItem({
        cartId: activeCart.cart_id,
        binItemId: candidate.bin_item_id,
        quantity,
      });
      if (result) {
        updateCandidateQuantity(candidate.bin_item_id, '1');
        setCandidateMessage(candidate.bin_item_id, 'success', `Added ${formatQuantity(quantity)}.`);
      } else {
        setCandidateMessage(candidate.bin_item_id, 'error', 'Add failed. Check balance or permissions.');
      }
    } finally { addLock.current = false; }
  }

  async function handleRemoveCartItem(cartItemId) {
    if (!canTransact || cartActionInProgress || !cart?.cart_id || !cartIsActive) return;
    const result = await cartState.removeItem({ cartId: cart.cart_id, cartItemId });
    if (!result) return;
    setLineDestinations((current) => {
      const next = { ...current };
      delete next[cartItemId];
      return next;
    });
  }

  async function handleCheckout() {
    if (!canTransact || cartActionInProgress || !cart?.cart_id || !cartIsActive || !cartState.cartItems.length || hasInvalidLineDestinations) return;

    const lineDestinations = cartState.cartItems.map((item) => {
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
      note: 'Normal cart checkout from v3 per-line destination UI',
      lineDestinations,
    });

    if (result) {
      setConfirmCheckout(false);
      setLineDestinations({});
      setCandidateMessages({});
      readModel.reload();
      history.reload();
    }
  }

  async function handleSetCount(row) {
    const draft = getCountDraft(row);
    if (!canWriteCounts || !isCountDraftReady(draft)) {
      setCountMessages((current) => ({
        ...current,
        [row.bin_item_id]: { tone: 'error', text: 'Count and reason required.' },
      }));
      return;
    }

    const targetQuantity = Number(draft.countedQuantity);
    const result = await countCorrection.setCountQuantity({
      binItemId: row.bin_item_id,
      targetQuantity,
      reason: resolveCountReason(draft),
    });

    if (!result) {
      setCountMessages((current) => ({
        ...current,
        [row.bin_item_id]: { tone: 'error', text: 'Count failed. Check role or server validation.' },
      }));
      return;
    }

    setCountMessages((current) => ({
      ...current,
      [row.bin_item_id]: { tone: 'success', text: `Set to ${formatQuantity(result.quantity_on_hand ?? targetQuantity)}.` },
    }));
    setCountDrafts((current) => ({
      ...current,
      [row.bin_item_id]: {
        countedQuantity: '',
        reason: 'cycle count',
        customReason: '',
      },
    }));
    countSheet.reload();
    readModel.reload();
    history.reload();
  }

  async function handleRecordCountIntake() {
    if (!canWriteCounts || !isCountDraftReady(countIntakeDraft) || !countIntakeDraft.bin_id || !countIntakeDraft.item_id) {
      setCountMessages((current) => ({
        ...current,
        new: { tone: 'error', text: 'Bin, item, count, and reason required.' },
      }));
      return;
    }

    const result = await countIntake.recordCount({
      binId: countIntakeDraft.bin_id,
      itemId: countIntakeDraft.item_id,
      countedQuantity: Number(countIntakeDraft.countedQuantity),
      reason: resolveCountReason(countIntakeDraft),
    });

    if (!result) {
      setCountMessages((current) => ({
        ...current,
        new: { tone: 'error', text: 'Intake failed. Check role or server validation.' },
      }));
      return;
    }

    setCountMessages((current) => ({
      ...current,
      new: {
        tone: 'success',
        text: `Recorded ${formatQuantity(result.counted_quantity)}. Variance ${formatQuantity(result.variance)}.`,
      },
    }));
    setCountIntakeDraft({
      bin_id: countIntakeDraft.bin_id,
      item_id: '',
      countedQuantity: '',
      reason: 'initial shelf count',
      customReason: '',
    });
    countSheet.reload();
    readModel.reload();
    history.reload();
  }

  function startRetirement(row) {
    const systemQuantity = Number(row.system_quantity ?? 0);
    if (!canRetireBinItems) {
      setCountMessage(`retire:${row.bin_item_id}`, 'error', 'Developer/Admin and archive permission required.');
      return;
    }
    if (systemQuantity !== 0) {
      setCountMessage(`retire:${row.bin_item_id}`, 'error', 'Set count to zero before retiring.');
      return;
    }

    setRetirementDraft({
      binItemId: row.bin_item_id,
      reason: '',
    });
    setCountMessages((current) => ({ ...current, [`retire:${row.bin_item_id}`]: null }));
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
      setCountMessage(`retire:${row.bin_item_id}`, 'error', 'Retirement reason required.');
      return;
    }

    const result = await retirement.retireBinItem({
      binItemId: row.bin_item_id,
      reason,
    });

    if (!result) {
      setCountMessage(`retire:${row.bin_item_id}`, 'error', 'Retirement failed. Confirm zero balance and permissions.');
      return;
    }

    setCountMessage(`retire:${row.bin_item_id}`, 'success', 'Retired from active bin views.');
    setRetirementDraft({
      binItemId: '',
      reason: '',
    });
    countSheet.reload();
    readModel.reload();
    history.reload();
  }

  function renderActiveView() {
    if (activeView === 'stock' || activeView === 'catalog') {
      return <>
        {cartState.error ? <StatePanel title="Cart action failed" description={cartState.error.message} tone="danger" /> : null}
        <InventoryStockBrowser model={model} loading={readModel.isLoading} error={readModel.error}
          fullCatalogue={activeView === 'catalog'} onScopeChange={full => updateInventoryView(full ? 'catalog' : 'stock')}
          canTransact={canTransact} busy={cartActionInProgress} quantities={candidateQuantities} messages={candidateMessages}
          onQuantityChange={updateCandidateQuantity} onAdd={handleAddCandidate} scanBinId={scanBinId}
          onClearScan={() => navigate(`/inventory?view=${activeView}`)} />
      </>;
    }
    if (activeView === 'scan' && !isMobile) {
      return <StatePanel title="Find material" actions={<button className="primary-button" onClick={() => updateInventoryView('stock')}>Search Inventory</button>} />;
    }
    if (activeView === 'overview') {
      return (
        <div className="inventory-section-stack">
          <section className="summary-grid">
            <SummaryCard label="Rows in view" value={visibleOverviewRows.length} detail={`${countSheet.rows.length} loaded count rows`} />
            <SummaryCard label="Quantity in view" value={formatQuantity(overviewQuantity)} detail="Sum of visible system quantities" />
            <SummaryCard label="Low/min rows" value={lowStockRows.length} detail="Rows at or below min quantity" tone={lowStockRows.length ? 'warn' : 'good'} />
            <SummaryCard label="Inventory value" value={formatMoney(overviewValue)} detail="Visible non-zero rows at catalogue cost" />
          </section>
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Overview"
              title="Grand Master Inventory"
              description="Read-only count-sheet overview using the existing location, catalogue, and balance-derived quantity paths."
              actions={(
                <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
                  <RefreshCw aria-hidden="true" /> Refresh Overview
                </button>
              )}
              dense
            />
            <DataTable
              columns={OVERVIEW_COLUMNS}
              rows={visibleOverviewRows}
              getRowKey={(row) => row.bin_item_id}
              permissions={permissions}
              isLoading={countSheet.isLoading}
              error={countSheet.error}
              dense
              minWidth="980px"
              emptyTitle="No inventory rows"
              emptyDescription="The existing count sheet read model returned no rows for this view."
            />
          </article>
        </div>
      );
    }

    if (activeView === 'accounting') {
      return (
        <div className="inventory-section-stack">
          <section className="summary-grid">
            <SummaryCard detailIsDiagnostic label="Export rows" value={visibleAccountingRows.length} detail="Visible non-zero quantity rows" />
            <SummaryCard label="Export value" value={formatMoney(overviewValue)} detail="Quantity times catalogue unit cost" />
            <SummaryCard detailIsDiagnostic label="Filtered rows" value={visibleOverviewRows.length} detail="Rows matching current filter" />
            <SummaryCard developmentOnly label="Boundary" value="Read only" detail="No accounting post is created" tone="good" />
          </section>
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Accounting"
              title="Inventory Valuation Export"
              description="Read-only CSV preview from the existing count-sheet read model. Exporting downloads visible rows only and does not post to accounting."
              actions={(
                <button type="button" className="secondary-button" onClick={handleDownloadAccountingCsv} disabled={!visibleAccountingRows.length}>
                  <Download aria-hidden="true" /> Download CSV
                </button>
              )}
              dense
            />
            <DataTable
              columns={ACCOUNTING_COLUMNS}
              rows={visibleAccountingRows}
              getRowKey={(row) => row.bin_item_id}
              permissions={permissions}
              isLoading={countSheet.isLoading}
              error={countSheet.error}
              dense
              minWidth="1040px"
              emptyTitle="No export rows"
              emptyDescription="Only visible rows with non-zero quantity are included in the export preview."
            />
          </article>
        </div>
      );
    }

    if (activeView === 'locations') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Locations"
              title="Location Records"
              description="Read-only storage hierarchy records from the existing count-sheet location read model."
              actions={(
                <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
                  <RefreshCw aria-hidden="true" /> Refresh Locations
                </button>
              )}
              dense
            />
            <DataTable
              columns={LOCATION_COLUMNS}
              rows={visibleLocationRecords}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={countSheet.isLoading}
              error={countSheet.error}
              onRowClick={(row) => setSelectedLocationId(row.id)}
              selectedRowKey={selectedLocation?.id ?? null}
              dense
              minWidth="820px"
              emptyTitle="No location records"
              emptyDescription="The existing storage hierarchy read path returned no location rows."
            />
          </article>

          <article className="card workspace-card">
            {selectedLocation ? (
              <div className="inventory-location-qr-panel">
                <div>
                  <Toolbar
                    eyebrow="QR Output"
                    title={getLocationDisplay(selectedLocation)}
                    description="Stable location QR output. The QR route resolves context only and does not change inventory."
                    actions={(
                      <>
                        <button type="button" className="secondary-button" onClick={() => openLocationScan(selectedLocation.id)}>
                          <QrCode aria-hidden="true" /> Open Scan Result
                        </button>
                        <button type="button" className="secondary-button" onClick={handleDownloadSelectedQr}>
                          <Download aria-hidden="true" /> Download SVG
                        </button>
                      </>
                    )}
                    dense
                  />
                  <div className="inventory-cart-facts">
                    <span>Level: <strong>{selectedLocation.typeLabel}</strong></span>
                    <span>Code: <strong>{selectedLocation.code || '-'}</strong></span>
                    <span>Path: <strong>{selectedLocation.path || '-'}</strong></span>
                    <span>URL: <strong>{buildLocationQrUrl(selectedLocation.id)}</strong></span>
                  </div>
                </div>
                <div
                  className="inventory-location-qr-preview"
                  aria-label={`QR code for ${getLocationDisplay(selectedLocation)}`}
                  dangerouslySetInnerHTML={{ __html: buildLocationQrSvg(selectedLocation.id) }}
                />
              </div>
            ) : (
              <StatePanel
                eyebrow="QR Output"
                title="Select a location"
                description="Choose a unit, shelf, bay, or bin to preview and download its QR output."
                tone="neutral"
              />
            )}
          </article>
        </div>
      );
    }

    if (activeView === 'scan') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Scan"
              title="Scan Location"
              description="Open Northgate location QR routes, or enter a location code. Scanning resolves context only; cart, count, and retirement actions remain separate."
              dense
            />

            {!canScan ? (
              <StatePanel
                eyebrow="Scan Access"
                title="Inventory access required"
                description="QR scan resolution uses the existing inventory location read path and does not bypass server permissions."
                tone="warning"
                compact
              />
            ) : null}
            {countSheet.error ? (
              <StatePanel
                eyebrow="Scan Error"
                title="Location hierarchy failed to load"
                description={countSheet.error.message || 'Confirm inventory management permission and the existing location read path.'}
                tone="danger"
                compact
              />
            ) : null}

            <div className="inventory-scan-panel">
              <Diagnostics><div className="inventory-scan-reader">
                <QrCode aria-hidden="true" />
                <div>
                  <p className="eyebrow">Accepted payloads</p>
                  <h3>Location QR only</h3>
                  <p>Paste a full QR URL, a `/scan/location/...` path, a raw UUID, or an exact location code such as a unit, shelf, bay, or bin code.</p>
                </div>
              </div></Diagnostics>

              <section className="inventory-scan-camera">
                <div className="inventory-scan-video-frame">
                  <video ref={videoRef} muted playsInline />
                  {cameraStatus !== 'scanning' ? (
                    <div className="inventory-scan-video-placeholder">
                      <Camera aria-hidden="true" />
                      <span>Camera scanner starts on request.</span>
                    </div>
                  ) : null}
                </div>
                <div className="inventory-scan-camera-actions">
                  <button hidden={!canScan}
                    type="button"
                    className="secondary-button"
                    onClick={startCameraScanner}
                    disabled={!canScan || cameraStatus === 'starting' || cameraStatus === 'scanning'}
                  >
                    <Camera aria-hidden="true" /> {cameraStatus === 'starting' ? 'Starting...' : 'Start Camera'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={stopCameraScanner}
                    disabled={cameraStatus !== 'scanning'}
                  >
                    <CameraOff aria-hidden="true" /> Stop
                  </button>
                </div>
              </section>

              <form className="inventory-scan-form" onSubmit={handleManualScan}>
                <label>
                  <span>Location code or QR</span>
                  <textarea
                    value={manualScanPayload}
                    disabled={!canScan || countSheet.isLoading}
                    onChange={(event) => {
                      setManualScanPayload(event.target.value);
                      setScanMatches([]);
                    }}
                    placeholder="Enter location code or paste QR link"
                    rows={4}
                  />
                </label>
                <button hidden={!canScan} type="submit" className="primary-button" disabled={!canScan || countSheet.isLoading || !manualScanPayload.trim()}>
                  <QrCode aria-hidden="true" /> Open Scan Result
                </button>
              </form>
            </div>

            {scanMessage ? (
              <StatePanel
                eyebrow="Scan Result"
                title="Review required"
                description={scanMessage}
                tone={scanMatches.length ? 'warning' : 'danger'}
                compact
              />
            ) : null}

            {scanMatches.length ? (
              <div className="inventory-scan-match-grid">
                {scanMatches.map((match) => (
                  <button
                    type="button"
                    className="inventory-scan-match"
                    key={match.id}
                    onClick={() => openLocationScan(match.id)}
                  >
                    <span>{match.typeLabel}</span>
                    <strong>{match.code || match.id}</strong>
                    <small>{match.path || match.label || 'Matching location'}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        </div>
      );
    }

    if (activeView === 'storage') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Storage"
              title="Storage Units"
              description="Preview rows from the existing storage_units read path."
              dense
            />
            <DataTable
              columns={STORAGE_COLUMNS}
              rows={visibleStorageUnits}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={readModel.isLoading}
              error={readModel.error}
              dense
              minWidth="520px"
              emptyTitle="No storage units in preview"
              emptyDescription="This preview stays bounded to the retained inventory read model."
            />
          </article>
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Storage"
              title="Bins"
              description="Preview rows from the existing bins read path."
              dense
            />
            <DataTable
              columns={BIN_COLUMNS}
              rows={visibleBins}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={readModel.isLoading}
              error={readModel.error}
              dense
              minWidth="620px"
              emptyTitle="No bins in preview"
              emptyDescription="QR payloads are displayed only as existing read-model data."
            />
          </article>
        </div>
      );
    }

    if (activeView === 'cart') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Cart"
              title="My Cart"
              description="Open or reuse your active server cart. Stage material, set approved destinations, then finalize through the preserved checkout RPC."
              actions={(
                <button type="button" className="secondary-button" onClick={() => updateInventoryView('stock')}>
                  <Plus aria-hidden="true" /> Add Materials
                </button>
              )}
              dense
            />

            {cartState.error ? (
              <StatePanel
                eyebrow="Cart Error"
                title="Cart action failed"
                description={cartState.error.message || 'Check permissions, available balance, or deployment status.'}
                tone="danger"
                compact
              />
            ) : null}

            {scanContext ? (
              <StatePanel
                eyebrow="Scanned Bin"
                title={scanContext.binCode || scanContext.binId}
                description="Cart candidates are filtered to the scanned bin. Open and stage items normally; scanning does not change inventory by itself."
                tone="info"
                compact
              />
            ) : null}

            <Diagnostics><div className="inventory-cart-facts">
              <span>Status: <strong>{cart?.status ?? 'Not opened'}</strong></span>
              <span>Rows: <strong>{cartState.cartItems.length}</strong></span>
              <span>Cart ID: <strong>{cart?.cart_id ? `${cart.cart_id.slice(0, 8)}...` : 'None'}</strong></span>
              <span>Expires: <strong>{cart?.expires_at ? formatDateTime(cart.expires_at) : '-'}</strong></span>
              <span>Checkout: <strong>{cartState.checkoutResult?.status ?? 'Not finalized'}</strong></span>
            </div></Diagnostics>

            <div className="inventory-cart-checkout-panel">
              <div>
                <p className="eyebrow">Checkout</p>
                <h3>Destination</h3>
              </div>
              <div className="inventory-cart-checkout-controls">
                <select
                  aria-label="Cart destination type"
                  value={applyAllDestination.destination_type}
                  disabled={!cartIsActive || cartActionInProgress}
                  onChange={(event) => updateApplyAllDestination({
                    destination_type: event.target.value,
                    destination_id: '',
                    note: '',
                  })}
                >
                  {DESTINATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {renderDestinationIdControl('__all__', applyAllDestination)}
                <input
                  aria-label="Cart destination note"
                  type="text"
                  value={applyAllDestination.note}
                  disabled={!cartIsActive || cartActionInProgress}
                  placeholder={applyAllDestination.destination_type === 'unknown' ? 'Required note' : 'Optional note'}
                  onChange={(event) => updateApplyAllDestination({ note: event.target.value })}
                />
                <button type="button" className="secondary-button" disabled={!cartIsActive || cartActionInProgress || !cartState.cartItems.length || !applyAllDestinationIsValid} onClick={applyDestinationToAll}>
                  Apply To All
                </button>
              </div>
            </div>

            <DataTable
              columns={cartColumns}
              rows={cartState.cartItems}
              getRowKey={(row) => row.cart_item_id}
              permissions={permissions}
              isLoading={cartState.isReadingItems}
              dense
              minWidth="680px"
              emptyTitle="Your cart is empty"
              emptyDescription=""
            />

            <div className="inventory-cart-finalize-row">
              <button hidden={!canTransact}
                type="button"
                className="primary-button"
                disabled={!canTransact || !cartIsActive || cartActionInProgress || !cartState.cartItems.length || hasInvalidLineDestinations}
                onClick={() => setConfirmCheckout(true)}
              >
                <ShoppingCart aria-hidden="true" /> Review Checkout
              </button>
              {hasInvalidLineDestinations ? <span className="inventory-cart-row-message inventory-cart-row-message--error">Every line needs a valid destination before checkout.</span> : null}
            </div>
            {confirmCheckout ? <section className="inventory-checkout-review" aria-label="Checkout review">
              <h3>Confirm checkout</h3>
              <p>{cartState.cartItems.length} material line{cartState.cartItems.length === 1 ? '' : 's'}. Quantities will leave their source locations. Job costs will not be posted.</p>
              <ul>{cartState.cartItems.map(item => {
                const line = getLineDestination(item);
                return <li key={item.cart_item_id}>{formatQuantity(item.quantity)} {item.unit_of_measure} {item.item_name} from {item.bin_code}: {DESTINATION_OPTIONS.find(option => option.value === line.destination_type)?.label} {line.destination_id} {line.note}</li>;
              })}</ul>
              <button className="primary-button" disabled={!canTransact || cartActionInProgress || hasInvalidLineDestinations || !cartIsActive} onClick={handleCheckout}>{cartState.isCheckingOut ? 'Checking out...' : 'Confirm Checkout'}</button>
              <button className="secondary-button" disabled={cartActionInProgress} onClick={() => setConfirmCheckout(false)}>Cancel</button>
            </section> : null}
            {cartState.checkoutResult ? (
              <StatePanel
                eyebrow="Checkout Complete"
                title="Cart finalized"
                description={`${cartState.checkoutResult.transaction_item_count ?? 0} material movement${cartState.checkoutResult.transaction_item_count === 1 ? '' : 's'} recorded.`}
                tone="good"
                compact
              />
            ) : null}
          </article>

          <Diagnostics><article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Candidates"
              title="Add Stocked Rows"
              description="Rows come from the existing cart-candidates read model. Add-to-cart uses the preserved server RPC and respects current available balance."
              dense
            />
            <DataTable
              columns={candidateColumns}
              rows={visibleCandidates}
              getRowKey={(row) => row.bin_item_id}
              permissions={permissions}
              isLoading={readModel.isLoading}
              error={readModel.error}
              dense
              minWidth="1080px"
              emptyTitle="No checkout candidates in preview"
              emptyDescription="Only positive on-hand rows from the preserved read model appear here."
            />
          </article></Diagnostics>
        </div>
      );
    }

    if (activeView === 'destinations') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Destinations"
              title="Users"
              description="Approved user destination references from the retained read path."
              dense
            />
            <DataTable
              columns={USER_COLUMNS}
              rows={visibleUsers}
              getRowKey={(row) => row.clerk_user_id}
              permissions={permissions}
              isLoading={readModel.isLoading}
              error={readModel.error}
              dense
              minWidth="720px"
              emptyTitle="No user destinations in preview"
              emptyDescription="Destination references are optional and may be unavailable under RLS."
            />
          </article>
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Destinations"
              title="Vehicles"
              description="Approved vehicle destination references from the retained read path."
              dense
            />
            <DataTable
              columns={VEHICLE_COLUMNS}
              rows={visibleVehicles}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={readModel.isLoading}
              error={readModel.error}
              dense
              minWidth="820px"
              emptyTitle="No vehicle destinations in preview"
              emptyDescription="Vehicle destination rows are read-only in this v3 slice."
            />
          </article>
        </div>
      );
    }

    if (activeView === 'count') {
      const intakeMessage = countMessages.new;
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Count"
              title="Inventory Count"
              description="Set physical quantities through the preserved count correction RPC. Zero is valid; balance writes remain server-controlled."
              search={(
                <label>
                  <span className="sr-only">Search inventory count rows</span>
                  <input
                    type="search"
                    value={countSearch}
                    onChange={(event) => setCountSearch(event.target.value)}
                    placeholder="Search code, item, bin, location..."
                  />
                </label>
              )}
              actions={(
                <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
                  <RefreshCw aria-hidden="true" /> Refresh Counts
                </button>
              )}
              dense
            />

            {!canManageInventory ? (
              <StatePanel
                eyebrow="Count Access"
                title="Management permission required"
                description="This screen reads only after server permissions include inventory management. RPC authorization still decides every count write."
                tone="warning"
                compact
              />
            ) : null}
            {canReadCounts && !canWriteCounts ? (
              <StatePanel
                eyebrow="Count Writes"
                title="Developer/Admin role required"
                description="The count sheet can be reviewed here, but physical count corrections remain disabled until the server role matches the RPC contract."
                tone="warning"
                compact
              />
            ) : null}
            {canWriteCounts && !canRetireBinItems ? (
              <StatePanel
                eyebrow="Retirement"
                title="Archive permission required"
                description="Physical counts are available, but retiring a zero-balance bin/material link also requires can_archive_records."
                tone="warning"
                compact
              />
            ) : null}
            {countCorrection.error ? (
              <StatePanel
                eyebrow="Count Error"
                title="Correction failed"
                description={countCorrection.error.message || 'Check role, quantity, reason, and deployed RPC.'}
                tone="danger"
                compact
              />
            ) : null}
            {scanContext ? (
              <StatePanel
                eyebrow="Scanned Bin"
                title={scanContext.binCode || scanContext.binId}
                description="Count rows and intake defaults are filtered to the scanned bin. Count and retirement writes still require their normal confirmations."
                tone="info"
                compact
              />
            ) : null}

            <div className="inventory-cart-facts">
              <span>Loaded rows: <strong>{countSheet.rows.length}</strong></span>
              <span>Visible rows: <strong>{visibleCountRows.length}</strong></span>
              <span>Bins: <strong>{countSheet.bins.length}</strong></span>
              <span>Last loaded: <strong>{countSheet.lastLoadedAt ? formatDateTime(countSheet.lastLoadedAt) : '-'}</strong></span>
            </div>

            <DataTable
              columns={countColumns}
              rows={visibleCountRows}
              getRowKey={(row) => row.bin_item_id}
              permissions={permissions}
              isLoading={countSheet.isLoading}
              error={countSheet.error}
              dense
              minWidth="1120px"
              emptyTitle="No count rows"
              emptyDescription="Count rows come from the existing inventory count sheet read model."
            />
          </article>

          <article className="card workspace-card">
            <Toolbar
              eyebrow="Intake"
              title="Record Count Intake"
              description="Use this when a catalog item belongs in a bin but has no active bin/material row yet. The server finds or creates the link, then records a physical count correction."
              dense
            />
            {countIntake.error ? (
              <StatePanel
                eyebrow="Intake Error"
                title="Count intake failed"
                description={countIntake.error.message || 'Check role, bin, item, count, and deployed RPC.'}
                tone="danger"
                compact
              />
            ) : null}
            {retirement.error ? (
              <StatePanel
                eyebrow="Retirement Error"
                title="Bin/material retirement failed"
                description={retirement.error.message || 'Confirm Developer/Admin role, archive permission, zero balance, and deployed RPC.'}
                tone="danger"
                compact
              />
            ) : null}
            <div className="inventory-count-intake-grid">
              <label>
                <span>Bin</span>
                <select
                  value={countIntakeDraft.bin_id}
                  disabled={!canWriteCounts || countIntake.isRecording}
                  onChange={(event) => updateCountIntakeDraft({ bin_id: event.target.value, item_id: '' })}
                >
                  <option value="">Select bin</option>
                  {countSheet.bins.map((bin) => (
                    <option key={bin.id} value={bin.id}>
                      {bin.bin_code || bin.label || bin.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Catalog Item</span>
                <select
                  value={countIntakeDraft.item_id}
                  disabled={!canWriteCounts || countIntake.isRecording || !countIntakeDraft.bin_id}
                  onChange={(event) => updateCountIntakeDraft({ item_id: event.target.value })}
                >
                  <option value="">Select item</option>
                  {countIntakeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.material_code ? `${item.material_code} / ` : ''}{item.name || item.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Counted Qty</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={countIntakeDraft.countedQuantity}
                  disabled={!canWriteCounts || countIntake.isRecording}
                  onChange={(event) => updateCountIntakeDraft({ countedQuantity: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span>Reason</span>
                <select
                  value={countIntakeDraft.reason}
                  disabled={!canWriteCounts || countIntake.isRecording}
                  onChange={(event) => updateCountIntakeDraft({ reason: event.target.value })}
                >
                  {COUNT_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {countIntakeDraft.reason === 'custom' ? (
                <label>
                  <span>Custom Note</span>
                  <input
                    type="text"
                    value={countIntakeDraft.customReason}
                    disabled={!canWriteCounts || countIntake.isRecording}
                    onChange={(event) => updateCountIntakeDraft({ customReason: event.target.value })}
                    placeholder="Required note"
                  />
                </label>
              ) : null}
              <div className="inventory-count-intake-actions">
                <button hidden={!canWriteCounts}
                  type="button"
                  className="primary-button"
                  disabled={!canWriteCounts || countIntake.isRecording || !countIntakeDraft.bin_id || !countIntakeDraft.item_id || !isCountDraftReady(countIntakeDraft)}
                  onClick={handleRecordCountIntake}
                >
                  <Plus aria-hidden="true" /> {countIntake.isRecording ? 'Recording...' : 'Record Count Intake'}
                </button>
                {intakeMessage ? (
                  <span className={`inventory-cart-row-message inventory-cart-row-message--${intakeMessage.tone}`}>
                    {intakeMessage.text}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      );
    }

    if (activeView === 'history') {
      return (
        <article className="card workspace-card">
          <Toolbar descriptionIsDiagnostic
            eyebrow="Ledger"
            title="Transaction History"
            description="Read-only transaction history through the preserved `read_inventory_transaction_history` RPC."
            filters={(
              <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                {HISTORY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            )}
            search={(
              <label>
                <span className="sr-only">Search transaction history</span>
                <input
                  type="search"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Search code, item, bin..."
                />
              </label>
            )}
            actions={(
              <button type="button" className="secondary-button" onClick={history.reload} disabled={history.isLoading}>
                <RefreshCw aria-hidden="true" /> Refresh History
              </button>
            )}
          />
          <DataTable
            columns={HISTORY_COLUMNS}
            rows={history.rows}
            getRowKey={(row) => row.transaction_item_id}
            permissions={permissions}
            isLoading={history.isLoading}
            error={history.error}
            dense
            minWidth="980px"
            emptyTitle="No transaction history rows"
            emptyDescription="The preserved history RPC may return no rows under the current user's scope."
          />
        </article>
      );
    }

    if (activeView === 'controls') {
      if (!diagnostics) return null;
      return (
        <section className="inventory-boundary-grid">
          <StatePanel
            eyebrow="Cart / Checkout"
            title="Cart and checkout are live"
            description="Open cart, read cart lines, add/remove stocked candidates, set destinations, and finalize checkout now use the preserved server RPCs."
            tone="good"
            compact
            actions={<ShoppingCart aria-hidden="true" />}
          />
          <StatePanel
            eyebrow="Counts"
            title="Physical count correction is live"
            description="Overview, accounting export, locations/QR, count sheet, correction, intake, retirement, and QR dispatch now use preserved paths."
            tone="good"
            compact
            actions={<Scale aria-hidden="true" />}
          />
          <StatePanel
            eyebrow="Balances"
            title="Balances remain transaction-derived"
            description="No UI path here writes inventory_balances directly. Counts and checkout stay on approved server-controlled RPC paths."
            tone="good"
            compact
            actions={<Boxes aria-hidden="true" />}
          />
        </section>
      );
    }

    return (
      <article className="card workspace-card">
        <Toolbar
          eyebrow="Catalogue"
          title="Active Materials"
          description={`${visibleCatalogue.length} of ${model.catalogPreview.length} active materials match the current filters.`}
          dense
        />
        <DataTable
          columns={CATALOG_COLUMNS}
          rows={visibleCatalogue}
          getRowKey={(row) => row.id}
          permissions={permissions}
          isLoading={readModel.isLoading}
          error={readModel.error}
          dense
          minWidth="860px"
          emptyTitle="No materials match these filters"
          emptyDescription="Clear a category filter or try a broader search term."
        />
      </article>
    );
  }

  return (
    <>
      <WorkspaceHeader
        statusIsDiagnostic
        eyebrow="Workspace"
        title="Inventory"
        description="Inventory surface using preserved hooks plus restored overview, accounting export, locations/QR, cart, checkout, count, retirement, and scan dispatch workflows."
        status={<span className="status-pill">{counts.activeItems} active item{counts.activeItems === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Page Menu
            </button>
            {isMobile && canScan ? <button type="button" className="secondary-button" onClick={() => updateInventoryView('scan')}><QrCode aria-hidden="true" /> Scan</button> : null}
            {canTransact ? <button type="button" className="primary-button" disabled={cartActionInProgress} onClick={() => {
              updateInventoryView('cart');
              if (!cartIsActive) handleOpenCart();
            }}><ShoppingCart aria-hidden="true" /> My Cart{cartIsActive ? ` (${cartState.cartItems.length})` : ''}</button> : null}
            <button type="button" className="secondary-button" onClick={readModel.reload} disabled={readModel.isLoading}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </>
        )}
      />

      <Diagnostics><div className="summary-grid">
        <SummaryCard label="Active items" value={counts.activeItems} detail="Current catalogue count" />
        <SummaryCard label="Bins" value={counts.bins} detail={`${counts.storageUnits} units / ${counts.shelves} shelves / ${counts.bays} bays`} />
        <SummaryCard label="Bin items" value={counts.binItems} detail={`${counts.inventoryBalances} balance rows`} />
        <SummaryCard label="Cart / Count" value={cartState.cartItems.length} detail={`${model.cartCandidates.length} stocked candidates / ${countSheet.rows.length || counts.binItems} count rows`} />
      </div></Diagnostics>

      <div className={`workspace-split inventory-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Inventory Views"
          title="Inventory"
          description="Read models first; write controls stay intentionally bounded."
          items={views}
          activeKey={activeView === 'catalog' ? 'stock' : activeView}
          onSelect={updateInventoryView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Guardrails</strong>
              <p>Overview, accounting export, locations/QR, cart, checkout, count correction, retirement, and QR dispatch are live.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {!['history', 'controls', 'scan', 'stock', 'catalog', 'cart'].includes(activeView) ? (
            <article className="card workspace-card">
              <Toolbar descriptionIsDiagnostic
                eyebrow="Filter"
                title={views.find((view) => view.key === activeView)?.label ?? 'Inventory'}
                description={activeView === 'catalog' ? 'Search and narrow the complete active material catalogue.' : 'Client-side filtering over the current visible rows.'}
                search={(
                  <label>
                    <span className="sr-only">Search inventory preview</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search current view..."
                    />
                  </label>
                )}
                filters={activeView === 'catalog' ? (
                  <>
                    <select
                      aria-label="Filter catalogue by category"
                      value={catalogCategory}
                      onChange={(event) => {
                        setCatalogCategory(event.target.value);
                        setCatalogSubcategory('');
                      }}
                    >
                      <option value="">All categories</option>
                      {catalogCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <select
                      aria-label="Filter catalogue by subcategory"
                      value={catalogSubcategory}
                      onChange={(event) => setCatalogSubcategory(event.target.value)}
                    >
                      <option value="">All subcategories</option>
                      {catalogSubcategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </>
                ) : null}
                actions={(
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSearch('');
                      setCatalogCategory('');
                      setCatalogSubcategory('');
                    }}
                    disabled={!search && !catalogCategory && !catalogSubcategory}
                  >
                    Clear
                  </button>
                )}
                dense
              />
            </article>
          ) : null}

          {renderActiveView()}

          <Diagnostics><section className="inventory-boundary-grid">
            <StatePanel
              eyebrow="Permission Scope"
              title={canManageInventory || canTransact ? 'Inventory access granted' : 'Inventory access limited'}
              description="Module visibility still follows the existing inventory permission gates. Server-side RLS and RPC checks remain authoritative."
              tone="neutral"
              compact
              actions={<Users aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Data Contract"
              title="No direct balance writes"
              description="Cart, checkout, count, and retirement workflows write only through approved RPCs and do not write `inventory_balances` directly."
              tone="good"
              compact
              actions={<Boxes aria-hidden="true" />}
            />
          </section></Diagnostics>
        </div>
      </div>
    </>
  );
}

export function InventoryScanRoute() {
  const permissions = usePermissions();
  const navigate = useNavigate();
  const { locationId = '' } = useParams();
  const canReadLocations = permissions.permissionSource === 'server' && (permissions.canManageInventory || permissions.canInventoryTransactions);
  const hierarchy = useInventoryCountSheet({ enabled: canReadLocations && permissions.canManageInventory });
  const stock = useInventoryReadModel({ enabled: canReadLocations && !permissions.canManageInventory });
  // Transaction-only users can resolve bin labels already authorized by the stock view.
  // Unit/shelf/bay hierarchy access still requires the existing management permission.
  const locationSheet = useMemo(() => permissions.canManageInventory ? hierarchy : {
    ...hierarchy, isLoading: stock.isLoading, error: stock.error,
    rows: stock.model.stockRows ?? [],
    bins: [...new Map((stock.model.stockRows ?? []).map(row => [row.bin_id, { id: row.bin_id, bin_code: row.bin_code, label: row.bin_label }])).values()],
  }, [permissions.canManageInventory, hierarchy, stock.model, stock.isLoading, stock.error]);
  const scanModel = useMemo(
    () => buildScanDestinationModel(locationId.toLowerCase(), locationSheet),
    [locationId, locationSheet.storageUnits, locationSheet.shelves, locationSheet.bays, locationSheet.bins],
  );
  const scopedRows = useMemo(
    () => getRowsForScanScope(scanModel, locationSheet.rows),
    [scanModel, locationSheet.rows],
  );
  const totalQuantity = scopedRows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? row.system_quantity ?? 0), 0);

  function dispatchTo(view, bin) {
    const params = getScanQuery(bin);
    params.set('view', view === 'cart' ? 'stock' : view);
    navigate(`/inventory?${params.toString()}`);
  }

  if (permissions.isLoading) {
    return (
      <StatePanel eyebrow="Scan" title="Checking scan access..." tone="neutral" compact />
    );
  }

  if (!canReadLocations) {
    return (
      <>
        <WorkspaceHeader
          eyebrow="Scan Result"
          title="Location unavailable"
          description="Scanning a QR code does not grant access. Sign in with server permissions that can read inventory locations."
          actions={<button type="button" className="secondary-button" onClick={() => navigate('/inventory?view=scan')}>Open Scanner</button>}
        />
        <StatePanel
          eyebrow="Access"
          title="Inventory management permission required"
          description="The scan route uses the existing inventory location read path and does not bypass server permissions."
          tone="warning"
        />
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Scan Result"
        title={scanModel?.locationRecord ? getLocationDisplay(scanModel.locationRecord) : 'Resolving location'}
        description="Read-only location QR result. Use the actions below to open existing Inventory workflows with this scan context."
        status={<span className="status-pill">{scanModel?.locationRecord?.typeLabel ?? 'Location'}</span>}
        actions={<button type="button" className="secondary-button" onClick={() => navigate('/inventory?view=scan')}>Open Scanner</button>}
      />

      {locationSheet.error ? (
        <StatePanel
          eyebrow="Scan Error"
          title="Location hierarchy failed to load"
          description={locationSheet.error.message || 'Confirm inventory management permission and the existing location read path.'}
          tone="danger"
        />
      ) : null}

      {locationSheet.isLoading ? (
        <StatePanel eyebrow="Scan" title="Resolving scanned location..." tone="neutral" compact />
      ) : null}

      {!locationSheet.isLoading && !locationSheet.error && !scanModel?.locationRecord ? (
        <StatePanel
          eyebrow="Scan Result"
          title="Location not found"
          description="This QR target is not available through the current server read path."
          tone="warning"
        />
      ) : null}

      {scanModel?.locationRecord ? (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Location"
              title={scanModel.locationRecord.typeLabel}
              description="The scan result is context only. Inventory changes still happen inside Cart, Count, or Retirement controls."
              dense
            />
            <div className="inventory-cart-facts">
              <span>Code: <strong>{scanModel.locationRecord.code || '-'}</strong></span>
              <span>Path: <strong>{getLocationDisplay(scanModel.locationRecord)}</strong></span>
              <span>UUID: <strong>{scanModel.locationRecord.id}</strong></span>
              <span>Rows in scope: <strong>{scopedRows.length}</strong></span>
              <span>Total quantity: <strong>{formatQuantity(totalQuantity)}</strong></span>
            </div>
          </article>

          {scanModel.scopeType === 'bin' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Dispatch"
                title="Open Existing Workflow"
                description="Cart and Count open filtered to this scanned bin. No inventory changes are made from the scan result."
                actions={(
                  <>
                    <button type="button" className="primary-button" onClick={() => dispatchTo('cart', scanModel.bin)}>
                      <ShoppingCart aria-hidden="true" /> Select Materials
                    </button>
                    <button hidden={!permissions.canManageInventory} type="button" className="secondary-button" onClick={() => dispatchTo('count', scanModel.bin)}>
                      <Scale aria-hidden="true" /> Open Count
                    </button>
                  </>
                )}
                dense
              />
            </article>
          ) : (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Bins"
                title="Choose A Bin In Scope"
                description="Unit, shelf, and bay QR codes resolve to their bins. Choose a bin before opening Cart or Count."
                dense
              />
              <div className="inventory-scan-bin-grid">
                {scanModel.bins.map((bin) => (
                  <div className="inventory-scan-bin-card" key={bin.id}>
                    <strong>{bin.bin_code || bin.label || bin.id}</strong>
                    <span>{bin.label || 'Bin in scanned scope'}</span>
                    <div className="inventory-scan-bin-actions">
                      <button type="button" className="secondary-button" onClick={() => dispatchTo('cart', bin)}>
                        <ShoppingCart aria-hidden="true" /> Select Materials
                      </button>
                      <button hidden={!permissions.canManageInventory} type="button" className="secondary-button" onClick={() => dispatchTo('count', bin)}>
                        <Scale aria-hidden="true" /> Count
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          <article className="card workspace-card">
            <Toolbar descriptionIsDiagnostic
              eyebrow="Contents"
              title="Current Rows In Scope"
              description="Read-only count sheet rows under the scanned location."
              dense
            />
            <DataTable
              columns={SCAN_CONTENT_COLUMNS}
              rows={scopedRows}
              getRowKey={(row) => row.bin_item_id}
              permissions={permissions}
              isLoading={locationSheet.isLoading}
              error={locationSheet.error}
              dense
              minWidth="760px"
              emptyTitle="No active material rows"
              emptyDescription="This location resolved, but no active material rows were returned in scope."
            />
          </article>
        </div>
      ) : null}
    </>
  );
}
