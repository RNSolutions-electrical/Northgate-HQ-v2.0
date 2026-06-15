import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Database, LayoutDashboard, ShieldCheck, ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from './services/supabaseClient.js';
import { useInventoryReadModel } from './hooks/useInventoryReadModel.js';
import { useInventoryCart } from './hooks/useInventoryCart.js';
import { useInventoryCountCorrection } from './hooks/useInventoryCountCorrection.js';
import { useInventoryTransactionHistory } from './hooks/useInventoryTransactionHistory.js';
import { usePermissions } from './hooks/usePermissions.js';

const DESTINATION_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'job', label: 'Job' },
  { value: 'service_call', label: 'Service Call' },
  { value: 'vehicle', label: 'Vehicle Stock' },
  { value: 'user', label: 'User Possession' },
  { value: 'vendor_return', label: 'Vendor Return' },
  { value: 'scrap', label: 'Scrap' },
  { value: 'unknown', label: 'Unknown / Missing' },
];

const DESTINATIONS_REQUIRING_ID = new Set(['job', 'service_call', 'vehicle', 'user']);
const CART_DESTINATION_DRAFT_PREFIX = 'northgate.inventoryCart.destinationDrafts.';
const DEFAULT_CANDIDATE_QUANTITY = 1;
const TRANSACTION_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All movement' },
  { value: 'checkout', label: 'Checkout / Remove Stock' },
  { value: 'physical_count_correction', label: 'Physical Count Correction' },
  { value: 'add_stock', label: 'Add Stock' },
];

function getCartDestinationDraftKey(cartId) {
  return cartId ? `${CART_DESTINATION_DRAFT_PREFIX}${cartId}` : null;
}

function CountCard({ label, value }) {
  return (
    <div className="count-card">
      <span className="count-card__value">{value}</span>
      <span className="count-card__label">{label}</span>
    </div>
  );
}

function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function DestinationIdControl({ line, cartItemId, destinationReferences, onChange }) {
  const users = destinationReferences?.users ?? [];
  const vehicles = destinationReferences?.vehicles ?? [];

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
  if (!row.destination_type) {
    return 'None';
  }

  return [formatTransactionType(row.destination_type), row.destination_id].filter(Boolean).join(' / ');
}

function TransactionHistoryPanel({ permissions }) {
  const isDeveloper = permissions.permissionSource === 'server' && permissions.role === 'Developer';
  const [search, setSearch] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [limit, setLimit] = useState(50);
  const history = useInventoryTransactionHistory({
    enabled: isDeveloper,
    limit,
    transactionType,
    search,
  });

  if (!isDeveloper) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Read-only review</p>
            <h3>Recent Inventory Transactions</h3>
          </div>
          <span className="status-pill status-pill--warn">Developer only</span>
        </div>
        <p>
          Transaction history is locked to Developer role while division-scoped history visibility is still undefined.
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
        <div className="alert">Transaction history failed to load. Confirm Developer role and deployed RPC.</div>
      ) : null}
      {history.isLoading ? <p className="muted">Loading transaction history...</p> : null}

      {history.rows.length ? (
        <>
          <div className="table-wrap history-table-wrap">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
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

function DeveloperCountCorrectionPanel({ permissions, cartCandidates, onSuccess }) {
  const countCorrection = useInventoryCountCorrection();
  const [selectedBinItemId, setSelectedBinItemId] = useState('');
  const [targetQuantity, setTargetQuantity] = useState('');
  const [reason, setReason] = useState('');
  const isDeveloper = permissions.permissionSource === 'server' && permissions.role === 'Developer';
  const selectedCandidate = cartCandidates.find((candidate) => candidate.bin_item_id === selectedBinItemId) ?? null;
  const parsedQuantity = Number(targetQuantity);
  const canSubmit = Boolean(
    selectedCandidate &&
    reason.trim() &&
    targetQuantity !== '' &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity >= 0 &&
    !countCorrection.isSettingQuantity,
  );

  if (!isDeveloper) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = await countCorrection.setCountQuantity({
      binItemId: selectedCandidate.bin_item_id,
      targetQuantity: parsedQuantity,
      reason: reason.trim(),
    });

    if (result) {
      setTargetQuantity('');
      setReason('');
      await onSuccess?.();
    }
  }

  return (
    <section className="cart-panel cart-panel--developer">
      <div className="card__header">
        <div>
          <p className="eyebrow">Developer Count Tool</p>
          <h3>Set / Adjust Quantity</h3>
        </div>
        <span className="status-pill status-pill--warn">Developer only</span>
      </div>
      <form className="count-correction-form" onSubmit={handleSubmit}>
        <label>
          Stocked bin item
          <select value={selectedBinItemId} onChange={(event) => setSelectedBinItemId(event.target.value)}>
            <option value="">Select stocked material</option>
            {cartCandidates.map((candidate) => (
              <option key={candidate.bin_item_id} value={candidate.bin_item_id}>
                {candidate.material_code} / {candidate.item_name} / Bin {candidate.bin_code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target quantity
          <input
            type="number"
            min="0"
            step="1"
            value={targetQuantity}
            onChange={(event) => setTargetQuantity(event.target.value)}
          />
        </label>
        <label>
          Reason
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required"
          />
        </label>
        {selectedCandidate ? (
          <div className="cart-facts count-correction-facts">
            <span>Item: {selectedCandidate.item_name}</span>
            <span>Code: {selectedCandidate.material_code}</span>
            <span>Bin: {selectedCandidate.bin_code}</span>
            <span>On hand: {Number(selectedCandidate.quantity_on_hand ?? 0).toFixed(2)} {selectedCandidate.unit_of_measure ?? ''}</span>
          </div>
        ) : null}
        <button type="submit" className="secondary-button" disabled={!canSubmit}>
          {countCorrection.isSettingQuantity ? 'Setting Count...' : 'Set Count Quantity'}
        </button>
      </form>
      {countCorrection.error ? (
        <div className="alert">Set count failed. Confirm Developer role, active item, nonnegative quantity, and required reason.</div>
      ) : null}
      {countCorrection.result ? (
        <div className="cart-facts">
          <span>Status: {countCorrection.result.status}</span>
          <span>Quantity: {Number(countCorrection.result.quantity_on_hand ?? 0).toFixed(2)}</span>
          <span>Transaction: {countCorrection.result.transaction_id.slice(0, 8)}...</span>
          <span>Bin: {countCorrection.result.bin_item_id.slice(0, 8)}...</span>
        </div>
      ) : null}
    </section>
  );
}

function CartScaffold({ permissions, cartCandidates, destinationReferences, onInventoryReload }) {
  const cartState = useInventoryCart();
  const [lineDestinations, setLineDestinations] = useState({});
  const [applyAllDestination, setApplyAllDestination] = useState({
    destination_type: 'office',
    destination_id: '',
    note: '',
  });
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateQuantities, setCandidateQuantities] = useState({});
  const [candidateQuantityMessage, setCandidateQuantityMessage] = useState('');
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const cart = cartState.cart;
  const cartDraftKey = getCartDestinationDraftKey(cart?.cart_id);
  const cartIsActive = cart?.status === 'active';
  const cartIsCheckedOut = cart?.status === 'checked_out' || cartState.checkoutResult?.status === 'checked_out';
  const normalizedCandidateSearch = candidateSearch.trim().toLowerCase();
  const candidateItems = cartCandidates
    .filter((candidate) => Number(candidate.quantity_on_hand ?? 0) >= DEFAULT_CANDIDATE_QUANTITY)
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

  function getLineDestination(cartItem) {
    return lineDestinations[cartItem.cart_item_id] ?? {
      destination_type: cartItem.destination_type ?? applyAllDestination.destination_type,
      destination_id: cartItem.destination_id ?? '',
      note: cartItem.note ?? '',
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
    if (DESTINATIONS_REQUIRING_ID.has(line.destination_type) && !line.destination_id?.trim()) {
      return false;
    }
    if (line.destination_type === 'unknown' && !line.note?.trim()) {
      return false;
    }
    return true;
  }

  function isDestinationDraftValid(destinationDraft) {
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

    await cartState.addItem({
      cartId: cart.cart_id,
      binItemId: candidate.bin_item_id,
      quantity,
    });
  }

  function getCandidateQuantityInputValue(candidate) {
    return candidateQuantities[candidate.bin_item_id] ?? String(DEFAULT_CANDIDATE_QUANTITY);
  }

  function getCandidateQuantityForSubmit(candidate) {
    const maxQuantity = Math.max(DEFAULT_CANDIDATE_QUANTITY, Number(candidate.quantity_on_hand ?? DEFAULT_CANDIDATE_QUANTITY));
    const requestedQuantity = Number(getCandidateQuantityInputValue(candidate));

    if (!Number.isFinite(requestedQuantity)) {
      setCandidateQuantities((current) => ({
        ...current,
        [candidate.bin_item_id]: String(DEFAULT_CANDIDATE_QUANTITY),
      }));
      setCandidateQuantityMessage('Quantity reset to 1 because the field was blank or invalid.');
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

  function updateCandidateQuantity(candidate, rawValue) {
    setCandidateQuantities((current) => ({
      ...current,
      [candidate.bin_item_id]: rawValue,
    }));
    setCandidateQuantityMessage('');
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
  const cartActionInProgress = cartState.isAddingItem || cartState.isRemovingItem || cartState.isCheckingOut || cartState.isReadingItems;

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
            User and vehicle references come from live Supabase when available. Jobs and service calls remain manual IDs until those modules are built.
          </p>
          <div className="cart-facts">
            <span>Users loaded: {destinationReferences?.users?.length ?? 0}</span>
            <span>Vehicles loaded: {destinationReferences?.vehicles?.length ?? 0}</span>
            <span>Job table: not built yet</span>
            <span>Service calls: not built yet</span>
          </div>
        </section>
      </div>

      <div className="cart-scaffold__body">
        <section className="cart-panel">
          <div className="cart-panel__toolbar">
            <h3>Stocked Bin Candidates</h3>
            <label className="cart-search">
              <span>Search</span>
              <input
                type="search"
                placeholder="Code, item, or bin"
                value={candidateSearch}
                onChange={(event) => setCandidateSearch(event.target.value)}
              />
            </label>
          </div>
          {candidateItems.length ? (
            <div className="cart-candidate-list">
              {candidateItems.map((item) => {
                const maxQuantity = Number(item.quantity_on_hand ?? DEFAULT_CANDIDATE_QUANTITY);
                const quantityInputValue = getCandidateQuantityInputValue(item);

                return (
                  <article className="cart-candidate" key={item.bin_item_id}>
                    <div>
                      <strong>{item.item_name}</strong>
                      <span>{item.material_code} · Bin {item.bin_code} · On hand: {maxQuantity.toFixed(2)} {item.unit_of_measure ?? ''}</span>
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
                        disabled={!cart?.cart_id || !cartIsActive || !canUseCart || cartActionInProgress}
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
            <EmptyState title="No stocked candidates">
              No stocked bin items match the current picker filters.
            </EmptyState>
          )}
          {candidateQuantityMessage ? <p className="muted">{candidateQuantityMessage}</p> : null}
        </section>

        <DeveloperCountCorrectionPanel
          permissions={permissions}
          cartCandidates={cartCandidates}
          onSuccess={onInventoryReload}
        />

        <section className="cart-panel">
          <h3>Cart Destinations</h3>
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

function InventoryReadOnlyPanel({ permissions }) {
  const [activeTab, setActiveTab] = useState('catalog');
  const inventory = useInventoryReadModel({ enabled: permissions.permissionSource === 'server' });
  const counts = inventory.model.counts;

  return (
    <article className="card card--wide">
      <div className="card__header">
        <div>
          <p className="eyebrow">Inventory Step 1–4I</p>
          <h2>Read-only Inventory + Cart Candidate Picker</h2>
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
        <CountCard label="Grand Master rows" value={counts.grandMasterRows} />
      </div>

      <div className="module-tabs" role="tablist" aria-label="Inventory read-only views">
        <button className="module-tab" type="button" aria-selected={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')}>
          Catalog Preview
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'storage'} onClick={() => setActiveTab('storage')}>
          Storage Browser
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'cart'} onClick={() => setActiveTab('cart')}>
          Cart Checkout
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')}>
          Transactions
        </button>
      </div>

      {inventory.isLoading ? <p className="muted">Loading live inventory data…</p> : null}
      {activeTab === 'catalog' ? <CatalogPreview rows={inventory.model.catalogPreview} /> : null}
      {activeTab === 'storage' ? <StoragePreview storageUnits={inventory.model.storageUnitsPreview} bins={inventory.model.binsPreview} /> : null}
      {activeTab === 'cart' ? (
        <CartScaffold
          permissions={permissions}
          cartCandidates={inventory.model.cartCandidates}
          destinationReferences={inventory.model.destinationReferences}
          onInventoryReload={inventory.reload}
        />
      ) : null}
      {activeTab === 'transactions' ? <TransactionHistoryPanel permissions={permissions} /> : null}

      <p className="build-note">
        Last loaded: {inventory.lastLoadedAt ? new Date(inventory.lastLoadedAt).toLocaleString() : 'not loaded yet'}
      </p>
    </article>
  );
}

function Dashboard() {
  const { user } = useUser();
  const permissions = usePermissions();

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="eyebrow">Northgate HQ v2.0</p>
            <h1 className="app-title">Operations Dashboard</h1>
            <p className="build-note">Inventory candidate picker build: 2026-06-11.6</p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <section className="app-main dashboard-grid">
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

        <article className="card card--wide">
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

        <InventoryReadOnlyPanel permissions={permissions} />
      </section>
    </main>
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
