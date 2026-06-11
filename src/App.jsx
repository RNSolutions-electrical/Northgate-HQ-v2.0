import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Database, LayoutDashboard, ShieldCheck, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { supabase } from './services/supabaseClient.js';
import { useInventoryReadModel } from './hooks/useInventoryReadModel.js';
import { useInventoryCart } from './hooks/useInventoryCart.js';
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

function CartScaffold({ permissions, cartCandidates, destinationReferences }) {
  const candidateItems = cartCandidates.slice(0, 3);
  const cartState = useInventoryCart();
  const [lineDestinations, setLineDestinations] = useState({});
  const [applyAllDestination, setApplyAllDestination] = useState('office');
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const cart = cartState.cart;
  const cartIsActive = cart?.status === 'active';
  const cartIsCheckedOut = cart?.status === 'checked_out' || cartState.checkoutResult?.status === 'checked_out';

  function getLineDestination(cartItem) {
    return lineDestinations[cartItem.cart_item_id] ?? {
      destination_type: cartItem.destination_type ?? applyAllDestination,
      destination_id: cartItem.destination_id ?? '',
      note: cartItem.note ?? '',
    };
  }

  function updateLineDestination(cartItemId, updates) {
    setLineDestinations((current) => ({
      ...current,
      [cartItemId]: {
        destination_type: applyAllDestination,
        destination_id: '',
        note: '',
        ...(current[cartItemId] ?? {}),
        ...updates,
      },
    }));
  }

  function applyDestinationToAll() {
    setLineDestinations((current) => {
      const next = { ...current };
      cartState.cartItems.forEach((item) => {
        next[item.cart_item_id] = {
          destination_type: applyAllDestination,
          destination_id: '',
          note: '',
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

  async function handleAddCandidate(candidate) {
    if (!cart?.cart_id || !cartIsActive) {
      return;
    }

    await cartState.addItem({
      cartId: cart.cart_id,
      binItemId: candidate.bin_item_id,
      quantity: 1,
    });
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

    await cartState.checkoutCart({
      cartId: cart.cart_id,
      destinationType: applyAllDestination,
      destinationId: null,
      note: 'Normal cart checkout from per-line destination UI',
      lineDestinations: preparedLineDestinations,
    });
  }

  const hasInvalidLineDestinations = cartState.cartItems.some((item) => !isLineDestinationValid(item));

  return (
    <div className="cart-scaffold" aria-label="Inventory cart scaffold">
      <div className="cart-scaffold__summary">
        <section className="cart-panel">
          <div className="card__header">
            <div>
              <p className="eyebrow">Inventory Step 4F</p>
              <h3>Durable Cart Item Read</h3>
            </div>
            <span className={cart ? 'status-pill status-pill--good' : 'status-pill status-pill--warn'}>
              {cartIsCheckedOut ? 'Cart checked out' : cart ? 'Active cart opened' : 'Cart not opened'}
            </span>
          </div>
          <p>
            Cart opening, add-to-cart, and checkout are routed through controlled server RPCs. Cart lines are reloaded from the server after each cart action.
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
            <span>Permission source: {permissions.permissionSource}</span>
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
          <h3>Stocked Bin Candidates</h3>
          {candidateItems.length ? (
            <div className="cart-candidate-list">
              {candidateItems.map((item) => (
                <article className="cart-candidate" key={item.bin_item_id}>
                  <div>
                    <strong>{item.item_name}</strong>
                    <span>{item.material_code} · Bin {item.bin_code} · On hand: {Number(item.quantity_on_hand ?? 0).toFixed(2)} {item.unit_of_measure ?? ''}</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!cart?.cart_id || !cartIsActive || !canUseCart || cartState.isAddingItem || cartState.isCheckingOut || cartState.isReadingItems}
                    onClick={() => handleAddCandidate(item)}
                  >
                    {cartState.isAddingItem ? 'Adding…' : 'Add 1'}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No stocked candidates">
              No stocked bin items with available quantity were found. Add-to-cart requires a live bin item, not a catalog-only row.
            </EmptyState>
          )}
        </section>

        <section className="cart-panel">
          <h3>Cart Destinations</h3>
          {cartState.isReadingItems ? <p className="muted">Reloading cart items from server…</p> : null}
          <div className="meta-grid">
            <label>
              Apply to all
              <select value={applyAllDestination} onChange={(event) => setApplyAllDestination(event.target.value)}>
                {DESTINATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" className="secondary-button" disabled={!cartState.cartItems.length || cartState.isCheckingOut || cartState.isReadingItems} onClick={applyDestinationToAll}>
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
              disabled={!cart?.cart_id || !cartIsActive || !cartState.cartItems.length || hasInvalidLineDestinations || !canUseCart || cartState.isCheckingOut || cartState.isReadingItems}
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
            Current step: durable cart item read. Express checkout and manager override remain disabled.
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
          <p className="eyebrow">Inventory Step 1–4F</p>
          <h2>Read-only Inventory + Durable Cart Checkout</h2>
          <p>
            This module reads from live v2 Supabase and supports controlled cart-open, add-to-cart, durable cart item reads, and per-line normal checkout. Express checkout remains locked.
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
      </div>

      {inventory.isLoading ? <p className="muted">Loading live inventory data…</p> : null}
      {activeTab === 'catalog' ? <CatalogPreview rows={inventory.model.catalogPreview} /> : null}
      {activeTab === 'storage' ? <StoragePreview storageUnits={inventory.model.storageUnitsPreview} bins={inventory.model.binsPreview} /> : null}
      {activeTab === 'cart' ? (
        <CartScaffold
          permissions={permissions}
          cartCandidates={inventory.model.cartCandidates}
          destinationReferences={inventory.model.destinationReferences}
        />
      ) : null}

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
            <p className="build-note">Inventory durable cart read build: 2026-06-11.3</p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <section className="app-main dashboard-grid">
        <article className="card">
          <LayoutDashboard className="card__icon" />
          <h2>Dashboard Shell</h2>
          <p>Base app shell is online. The inventory module supports read-only browsing, controlled cart-open, add-to-cart, durable cart item reads, and per-line normal checkout.</p>
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
          <p className="muted">Cart opening, add-to-cart, checkout, and cart item reads are routed through server RPCs. Direct cart table mutation is blocked by RLS.</p>
        </article>

        <article className="card card--wide">
          <div className="card__header">
            <div>
              <p className="eyebrow">Cart Write Gate</p>
              <h2>Per-Line Checkout Is Controlled</h2>
              <p>
                The app can now reload cart items from the server and finalize each active cart line with its own destination through `finalize_inventory_cart`. Express checkout is still not built.
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
