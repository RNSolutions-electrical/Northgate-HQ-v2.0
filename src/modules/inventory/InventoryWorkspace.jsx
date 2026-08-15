import {
  Boxes,
  ClipboardList,
  History,
  MapPinned,
  PackageSearch,
  Plus,
  RefreshCw,
  Scale,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { useInventoryCart } from '../../hooks/useInventoryCart.js';
import { useInventoryReadModel } from '../../hooks/useInventoryReadModel.js';
import { useInventoryTransactionHistory } from '../../hooks/useInventoryTransactionHistory.js';

const INVENTORY_VIEWS = [
  { key: 'catalog', label: 'Catalogue', icon: PackageSearch, description: 'Active material catalogue preview.' },
  { key: 'storage', label: 'Storage', icon: MapPinned, description: 'Storage units and bin previews.' },
  { key: 'cart', label: 'Cart', icon: ShoppingCart, description: 'Open cart, add candidates, and remove staged lines.' },
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

export function InventoryWorkspace({ permissions }) {
  const canLoadInventory = permissions.permissionSource === 'server';
  const readModel = useInventoryReadModel({ enabled: canLoadInventory });
  const cartState = useInventoryCart();
  const [activeView, setActiveView] = useState('catalog');
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

  const history = useInventoryTransactionHistory({
    enabled: canLoadInventory && activeView === 'history',
    transactionType: historyType,
    search: historySearch,
    limit: 75,
  });

  const model = readModel.model;
  const counts = model.counts;
  const canTransact = permissions?.canInventoryTransactions === true;
  const canManageInventory = permissions?.canManageInventory === true;
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
    () => filterRows(model.cartCandidates, search, ['material_code', 'item_name', 'bin_code', 'bin_label', 'division']),
    [model.cartCandidates, search],
  );
  const visibleUsers = useMemo(
    () => filterRows(model.destinationReferences.users, search, ['display_name', 'email', 'role', 'division']),
    [model.destinationReferences.users, search],
  );
  const visibleVehicles = useMemo(
    () => filterRows(model.destinationReferences.vehicles, search, ['vehicle_number', 'make', 'model', 'classification', 'division']),
    [model.destinationReferences.vehicles, search],
  );
  const hasInvalidLineDestinations = cartState.cartItems.some((item) => !isDestinationValid(getLineDestination(item)));
  const applyAllDestinationIsValid = isDestinationValid(applyAllDestination);

  useEffect(() => {
    if (cart?.status === 'checked_out') {
      setLineDestinations({});
    }
  }, [cart?.status]);

  const views = INVENTORY_VIEWS.map((view) => {
    const badge = {
      catalog: counts.activeItems,
      storage: counts.bins,
      cart: cartState.cartItems.length || model.cartCandidates.length,
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

  function renderActiveView() {
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
            title="Physical count correction is not ported yet"
            description="Quantity reconciliation must continue through the approved physical_count_correction path. This v3 surface adds no count writes."
            tone="warning"
            compact
            actions={<Scale aria-hidden="true" />}
          />
          <StatePanel
            eyebrow="Balances"
            title="Balances remain transaction-derived"
            description="No UI path here writes inventory_balances directly. Counts and checkout remain server-controlled future slices."
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
        description="Inventory surface using preserved read hooks plus restored cart staging and normal checkout finalization. Counts and archive actions remain deferred until their controls can be ported deliberately."
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
        <SummaryCard label="Cart rows" value={cartState.cartItems.length} detail={`${model.cartCandidates.length} stocked candidate rows`} />
      </div>

      <div className={`workspace-split inventory-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Inventory Views"
          title="Inventory"
          description="Read models first; write controls stay intentionally bounded."
          items={views}
          activeKey={activeView}
          onSelect={(key) => {
            setActiveView(key);
            setSearch('');
          }}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Guardrails</strong>
              <p>Cart staging and normal checkout are live. Count correction and retirement remain separate slices.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activeView !== 'history' && activeView !== 'controls' ? (
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
              description="Cart and checkout write only through approved RPCs and do not write `inventory_balances` directly; balance derivation remains server-controlled."
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
