import {
  Boxes,
  ClipboardList,
  History,
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
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { useBinItemRetirement } from '../../hooks/useBinItemRetirement.js';
import { useInventoryCart } from '../../hooks/useInventoryCart.js';
import { useInventoryCountCorrection } from '../../hooks/useInventoryCountCorrection.js';
import { useInventoryCountIntake } from '../../hooks/useInventoryCountIntake.js';
import { useInventoryCountSheet } from '../../hooks/useInventoryCountSheet.js';
import { useInventoryReadModel } from '../../hooks/useInventoryReadModel.js';
import { useInventoryTransactionHistory } from '../../hooks/useInventoryTransactionHistory.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { buildLocationScanPath, parseLocationScanPayload } from '../../lib/locationQr.js';

const INVENTORY_VIEWS = [
  { key: 'catalog', label: 'Catalogue', icon: PackageSearch, description: 'Active material catalogue preview.' },
  { key: 'storage', label: 'Storage', icon: MapPinned, description: 'Storage units and bin previews.' },
  { key: 'scan', label: 'Scan', icon: QrCode, description: 'Resolve location QR codes and dispatch to cart or count.' },
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
  { key: 'division', header: 'Division', fallback: '-' },
  { key: 'price_per_unit', header: 'Unit Cost', numeric: true, render: (row) => formatMoney(row.price_per_unit) },
];

const STORAGE_COLUMNS = [
  { key: 'unit_code', header: 'Unit', render: (row) => <strong>{row.unit_code || '-'}</strong> },
  { key: 'name', header: 'Name', fallback: '-' },
  { key: 'division', header: 'Division', fallback: '-' },
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
  { key: 'division', header: 'Division', fallback: '-' },
  { key: 'price_per_unit', header: 'Unit Cost', numeric: true, render: (row) => formatMoney(row.price_per_unit) },
];

const CART_COLUMNS = [
  { key: 'material_code', header: 'Code', render: (row) => <strong>{row.material_code || '-'}</strong> },
  { key: 'item_name', header: 'Item' },
  { key: 'bin_code', header: 'Bin' },
  { key: 'quantity', header: 'Qty', numeric: true, render: (row) => formatQuantity(row.quantity) },
  { key: 'unit_of_measure', header: 'Unit', fallback: '-' },
  { key: 'quantity_on_hand', header: 'On Hand', numeric: true, render: (row) => formatQuantity(row.quantity_on_hand) },
];

const USER_COLUMNS = [
  { key: 'display_name', header: 'Name', render: (row) => <strong>{row.display_name || row.email || row.clerk_user_id}</strong> },
  { key: 'email', header: 'Email', fallback: '-' },
  { key: 'role', header: 'Role', fallback: '-' },
  { key: 'division', header: 'Division', fallback: '-' },
];

const VEHICLE_COLUMNS = [
  { key: 'vehicle_number', header: 'Vehicle', render: (row) => <strong>{row.vehicle_number || row.id}</strong> },
  { key: 'classification', header: 'Classification', fallback: '-' },
  { key: 'make', header: 'Make', fallback: '-' },
  { key: 'model', header: 'Model', fallback: '-' },
  { key: 'division', header: 'Division', fallback: '-' },
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
  return VALID_DESTINATION_TYPES.has(value) ? value : 'unknown';
}

function isDestinationValid(destination) {
  const destinationType = normalizeDestinationType(destination?.destination_type);
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const requestedView = searchParams.get('view') ?? '';
  const scanBinId = searchParams.get('scanBinId') ?? '';
  const scanBinCode = searchParams.get('scanBinCode') ?? '';
  const scanContext = scanBinId ? { binId: scanBinId, binCode: scanBinCode } : null;
  const canLoadInventory = permissions.permissionSource === 'server';
  const canTransact = permissions?.canInventoryTransactions === true;
  const canManageInventory = permissions?.canManageInventory === true;
  const canReadCounts = canLoadInventory && canManageInventory;
  const canWriteCounts = canReadCounts && isDeveloperOrAdminRole(permissions?.role);
  const canRetireBinItems = canWriteCounts && permissions?.canArchiveRecords === true;
  const readModel = useInventoryReadModel({ enabled: canLoadInventory });
  const cartState = useInventoryCart();
  const [activeView, setActiveView] = useState(
    INVENTORY_VIEWS.some((view) => view.key === requestedView) ? requestedView : 'catalog',
  );
  const [search, setSearch] = useState('');
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

  const history = useInventoryTransactionHistory({
    enabled: canLoadInventory && activeView === 'history',
    transactionType: historyType,
    search: historySearch,
    limit: 75,
  });
  const countSheet = useInventoryCountSheet({ enabled: canReadCounts && ['count', 'scan'].includes(activeView) });
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

  const visibleCatalogue = useMemo(
    () => filterRows(model.catalogPreview, search, ['material_code', 'name', 'broad_category', 'sub_category', 'division']),
    [model.catalogPreview, search],
  );
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

  const views = INVENTORY_VIEWS.map((view) => {
    const badge = {
      catalog: counts.activeItems,
      storage: counts.bins,
      cart: cartState.cartItems.length || model.cartCandidates.length,
      count: countSheet.rows.length || counts.binItems,
      scan: countSheet.bins.length || counts.bins,
      destinations: model.destinationReferences.users.length + model.destinationReferences.vehicles.length,
      history: history.rows.length,
      controls: null,
    }[view.key];
    return { ...view, badge };
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
          <button
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
              value={line.destination_type}
              disabled={!cartIsActive || cartActionInProgress}
              onChange={(event) => updateLineDestination(row.cart_item_id, {
                destination_type: event.target.value,
                destination_id: '',
                note: '',
              })}
            >
              {DESTINATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {renderDestinationIdControl(row.cart_item_id, line)}
            <input
              type="text"
              value={line.note}
              disabled={!cartIsActive || cartActionInProgress}
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
          className="secondary-button"
          disabled={!cartIsActive || cartActionInProgress}
          onClick={() => handleRemoveCartItem(row.cart_item_id)}
        >
          <Trash2 aria-hidden="true" /> Remove
        </button>
      ),
    },
  ], [cartActionInProgress, cartIsActive, lineDestinations, model.destinationReferences]);

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
            <button
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
              <button
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

  function renderDestinationIdControl(cartItemId, line) {
    const destinationType = normalizeDestinationType(line.destination_type);

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
          value={line.destination_id}
          disabled={!cartIsActive || cartActionInProgress}
          onChange={(event) => updateLineDestination(cartItemId, { destination_id: event.target.value })}
        >
          <option value="">Select vehicle</option>
          {model.destinationReferences.vehicles.map((vehicle) => (
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
        type="text"
        value={line.destination_id}
        disabled={!cartIsActive || cartActionInProgress || !requiresId}
        placeholder={requiresId ? 'Required ID' : 'No ID required'}
        onChange={(event) => updateLineDestination(cartItemId, { destination_id: event.target.value })}
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
    if (!['cart', 'count'].includes(nextView)) {
      params.delete('scanBinId');
      params.delete('scanBinCode');
    }
    navigate(`/inventory?${params.toString()}`, { replace: true });
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

  function setCountMessage(key, tone, text) {
    setCountMessages((current) => ({
      ...current,
      [key]: { tone, text },
    }));
  }

  async function handleOpenCart() {
    await cartState.openCart();
  }

  async function handleAddCandidate(candidate) {
    if (!cart?.cart_id || !cartIsActive) return;

    const quantity = getCandidateQuantity(candidate);
    if (quantity <= 0) {
      setCandidateMessage(candidate.bin_item_id, 'error', 'Enter a quantity greater than 0.');
      return;
    }

    const result = await cartState.addItem({
      cartId: cart.cart_id,
      binItemId: candidate.bin_item_id,
      quantity,
    });

    if (result) {
      updateCandidateQuantity(candidate.bin_item_id, '1');
      setCandidateMessage(candidate.bin_item_id, 'success', `Added ${formatQuantity(quantity)}.`);
    } else {
      setCandidateMessage(candidate.bin_item_id, 'error', 'Add failed. Check balance or permissions.');
    }
  }

  async function handleRemoveCartItem(cartItemId) {
    if (!cart?.cart_id || !cartIsActive) return;
    await cartState.removeItem({ cartId: cart.cart_id, cartItemId });
    setLineDestinations((current) => {
      const next = { ...current };
      delete next[cartItemId];
      return next;
    });
  }

  async function handleCheckout() {
    if (!cart?.cart_id || !cartIsActive || !cartState.cartItems.length || hasInvalidLineDestinations) return;

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
    if (activeView === 'scan') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Scan"
              title="Location QR Dispatch"
              description="Open Northgate location QR routes, or enter a location code. Scanning resolves context only; cart, count, and retirement actions remain separate."
              dense
            />

            {!canReadCounts ? (
              <StatePanel
                eyebrow="Scan Access"
                title="Inventory management permission required"
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
              <div className="inventory-scan-reader">
                <QrCode aria-hidden="true" />
                <div>
                  <p className="eyebrow">Accepted payloads</p>
                  <h3>Location QR only</h3>
                  <p>Paste a full QR URL, a `/scan/location/...` path, a raw UUID, or an exact location code such as a unit, shelf, bay, or bin code.</p>
                </div>
              </div>

              <form className="inventory-scan-form" onSubmit={handleManualScan}>
                <label>
                  <span>Manual Scan Payload</span>
                  <textarea
                    value={manualScanPayload}
                    disabled={!canReadCounts || countSheet.isLoading}
                    onChange={(event) => {
                      setManualScanPayload(event.target.value);
                      setScanMatches([]);
                    }}
                    placeholder="Paste /scan/location/<uuid>, a full QR URL, a UUID, or enter a location code"
                    rows={4}
                  />
                </label>
                <button type="submit" className="primary-button" disabled={!canReadCounts || countSheet.isLoading || !manualScanPayload.trim()}>
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
            <Toolbar
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
            <Toolbar
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
            <Toolbar
              eyebrow="Cart"
              title="Active Inventory Cart"
              description="Open or reuse your active server cart. Stage material, set approved destinations, then finalize through the preserved checkout RPC."
              actions={(
                <button type="button" className="primary-button" onClick={handleOpenCart} disabled={!canTransact || cartActionInProgress || cartIsActive}>
                  <ShoppingCart aria-hidden="true" /> {cartState.isOpening ? 'Opening...' : cartIsActive ? 'Cart Open' : 'Open Cart'}
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

            <div className="inventory-cart-facts">
              <span>Status: <strong>{cart?.status ?? 'Not opened'}</strong></span>
              <span>Rows: <strong>{cartState.cartItems.length}</strong></span>
              <span>Cart ID: <strong>{cart?.cart_id ? `${cart.cart_id.slice(0, 8)}...` : 'None'}</strong></span>
              <span>Expires: <strong>{cart?.expires_at ? formatDateTime(cart.expires_at) : '-'}</strong></span>
              <span>Checkout: <strong>{cartState.checkoutResult?.status ?? 'Not finalized'}</strong></span>
            </div>

            <div className="inventory-cart-checkout-panel">
              <div>
                <p className="eyebrow">Checkout</p>
                <h3>Apply Destination To Lines</h3>
                <p>Choose one destination for every current cart line, then adjust individual lines if needed before checkout.</p>
              </div>
              <div className="inventory-cart-checkout-controls">
                <select
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
                <input
                  type="text"
                  value={applyAllDestination.destination_id}
                  disabled={!cartIsActive || cartActionInProgress || !DESTINATIONS_REQUIRING_ID.has(applyAllDestination.destination_type)}
                  placeholder={DESTINATIONS_REQUIRING_ID.has(applyAllDestination.destination_type) ? 'Destination ID required' : 'No ID required'}
                  onChange={(event) => updateApplyAllDestination({ destination_id: event.target.value })}
                />
                <input
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
              minWidth="900px"
              emptyTitle="No staged cart lines"
              emptyDescription="Open a cart, then add stocked candidate rows below. Checkout is enabled once staged lines have valid destinations."
            />

            <div className="inventory-cart-finalize-row">
              <button
                type="button"
                className="primary-button"
                disabled={!canTransact || !cartIsActive || cartActionInProgress || !cartState.cartItems.length || hasInvalidLineDestinations}
                onClick={handleCheckout}
              >
                <ShoppingCart aria-hidden="true" /> {cartState.isCheckingOut ? 'Checking Out...' : 'Checkout Selected Destinations'}
              </button>
              {hasInvalidLineDestinations ? <span className="inventory-cart-row-message inventory-cart-row-message--error">Every line needs a valid destination before checkout.</span> : null}
            </div>
            {cartState.checkoutResult ? (
              <StatePanel
                eyebrow="Checkout Complete"
                title="Cart finalized"
                description={`${cartState.checkoutResult.transaction_item_count ?? 0} transaction item${cartState.checkoutResult.transaction_item_count === 1 ? '' : 's'} written through the preserved checkout RPC.`}
                tone="good"
                compact
              />
            ) : null}
          </article>

          <article className="card workspace-card">
            <Toolbar
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
          </article>
        </div>
      );
    }

    if (activeView === 'destinations') {
      return (
        <div className="inventory-section-stack">
          <article className="card workspace-card">
            <Toolbar
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
            <Toolbar
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
            <Toolbar
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
                <button
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
          <Toolbar
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
            description="Count sheet, existing row correction, new bin/material count intake, zero-balance retirement, and QR dispatch now use preserved paths."
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
          description="Preview rows from the retained `useInventoryReadModel` hook."
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
          emptyTitle="No catalogue rows in preview"
          emptyDescription="The read model limits this first preview while preserving the existing inventory data path."
        />
      </article>
    );
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Inventory"
        description="Inventory surface using preserved read hooks plus restored cart staging, checkout, physical count, zero-balance retirement, and location QR dispatch workflows."
        status={<span className="status-pill">{counts.activeItems} active item{counts.activeItems === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={readModel.reload} disabled={readModel.isLoading}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Active items" value={counts.activeItems} detail="Current catalogue count" />
        <SummaryCard label="Bins" value={counts.bins} detail={`${counts.storageUnits} units / ${counts.shelves} shelves / ${counts.bays} bays`} />
        <SummaryCard label="Bin items" value={counts.binItems} detail={`${counts.inventoryBalances} balance rows`} />
        <SummaryCard label="Cart / Count" value={cartState.cartItems.length} detail={`${model.cartCandidates.length} stocked candidates / ${countSheet.rows.length || counts.binItems} count rows`} />
      </div>

      <div className={`workspace-split inventory-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Inventory Views"
          title="Inventory"
          description="Read models first; write controls stay intentionally bounded."
          items={views}
          activeKey={activeView}
          onSelect={updateInventoryView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Guardrails</strong>
              <p>Cart staging, normal checkout, count correction, zero-balance retirement, and QR dispatch are live.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activeView !== 'history' && activeView !== 'controls' && activeView !== 'scan' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Filter"
                title={views.find((view) => view.key === activeView)?.label ?? 'Inventory'}
                description="Client-side filtering over the current bounded preview rows."
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
                actions={(
                  <button type="button" className="secondary-button" onClick={() => setSearch('')} disabled={!search}>
                    Clear
                  </button>
                )}
                dense
              />
            </article>
          ) : null}

          {renderActiveView()}

          <section className="inventory-boundary-grid">
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
          </section>
        </div>
      </div>
    </>
  );
}

export function InventoryScanRoute() {
  const permissions = usePermissions();
  const navigate = useNavigate();
  const { locationId = '' } = useParams();
  const canReadLocations = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const locationSheet = useInventoryCountSheet({ enabled: canReadLocations });
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
    params.set('view', view);
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
                      <ShoppingCart aria-hidden="true" /> Open Cart
                    </button>
                    <button type="button" className="secondary-button" onClick={() => dispatchTo('count', scanModel.bin)}>
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
                        <ShoppingCart aria-hidden="true" /> Cart
                      </button>
                      <button type="button" className="secondary-button" onClick={() => dispatchTo('count', bin)}>
                        <Scale aria-hidden="true" /> Count
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          <article className="card workspace-card">
            <Toolbar
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
