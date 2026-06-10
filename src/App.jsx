import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Database, LayoutDashboard, ShieldCheck, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { supabase } from './services/supabaseClient.js';
import { useInventoryReadModel } from './hooks/useInventoryReadModel.js';
import { useInventoryCart } from './hooks/useInventoryCart.js';
import { usePermissions } from './hooks/usePermissions.js';

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

function CartScaffold({ permissions, cartCandidates }) {
  const candidateItems = cartCandidates.slice(0, 3);
  const cartState = useInventoryCart();
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const cart = cartState.cart;
  const cartIsActive = cart?.status === 'active';
  const cartIsCheckedOut = cart?.status === 'checked_out' || cartState.checkoutResult?.status === 'checked_out';

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

    await cartState.checkoutCart({
      cartId: cart.cart_id,
      destinationType: 'office',
      destinationId: null,
      note: 'Normal cart checkout to office destination from v2 UI',
    });
  }

  return (
    <div className="cart-scaffold" aria-label="Inventory cart scaffold">
      <div className="cart-scaffold__summary">
        <section className="cart-panel">
          <div className="card__header">
            <div>
              <p className="eyebrow">Inventory Step 4C</p>
              <h3>Open Cart + Add Item + Checkout</h3>
            </div>
            <span className={cart ? 'status-pill status-pill--good' : 'status-pill status-pill--warn'}>
              {cartIsCheckedOut ? 'Cart checked out' : cart ? 'Active cart opened' : 'Cart not opened'}
            </span>
          </div>
          <p>
            Cart opening, add-to-cart, and normal checkout are routed through controlled server RPCs. Express checkout remains out of scope.
          </p>
          <button
            type="button"
            className="primary-button"
            disabled={!canUseCart || cartState.isOpening || cartIsCheckedOut}
            onClick={cartState.openCart}
          >
            {cartState.isOpening ? 'Opening Cart…' : cart ? 'Cart Opened' : 'Open Cart'}
          </button>
          {cartState.error ? (
            <div className="alert">Cart action failed. Check permissions, available balance, or deployment status.</div>
          ) : null}
          <div className="cart-facts">
            <span>Cart status: {cart?.status ?? 'Not opened'}</span>
            <span>Cart rows: {cartState.cartItems.length}</span>
            <span>Cart ID: {cart?.cart_id ? `${cart.cart_id.slice(0, 8)}…` : 'None'}</span>
            <span>Permission source: {permissions.permissionSource}</span>
          </div>
        </section>

        <section className="cart-panel cart-panel--locked">
          <h3>Vehicle Snapshot</h3>
          <p>
            Vehicle snapshot is server-derived. There is no active user-to-vehicle assignment table yet, so the cart correctly snapshots NULL.
          </p>
          <div className="cart-facts">
            <span>Snapshot status: {cart ? 'Captured at cart open' : 'Pending cart open'}</span>
            <span>Vehicle snapshot: {cart?.active_vehicle_id ?? 'No active vehicle assignment found'}</span>
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
                    disabled={!cart?.cart_id || !cartIsActive || !canUseCart || cartState.isAddingItem || cartState.isCheckingOut}
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
          <h3>Cart Preview</h3>
          {cartState.cartItems.length ? (
            <div className="cart-candidate-list">
              {cartState.cartItems.map((item) => (
                <article className="cart-candidate" key={item.cart_item_id}>
                  <div>
                    <strong>Cart item {item.cart_item_id.slice(0, 8)}…</strong>
                    <span>Quantity: {Number(item.quantity ?? 0).toFixed(2)} · Bin item: {item.bin_item_id.slice(0, 8)}…</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No cart items yet">
              Open the cart, then add one stocked bin candidate. Checkout is enabled after at least one cart item exists.
            </EmptyState>
          )}
          <div className="cart-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!cart?.cart_id || !cartIsActive || !cartState.cartItems.length || !canUseCart || cartState.isCheckingOut}
              onClick={handleCheckout}
            >
              {cartState.isCheckingOut ? 'Checking Out…' : 'Checkout to Office'}
            </button>
          </div>
          {cartState.checkoutResult ? (
            <div className="cart-facts">
              <span>Checkout status: {cartState.checkoutResult.status}</span>
              <span>Transaction rows: {cartState.checkoutResult.transaction_item_count}</span>
              <span>Transaction ID: {cartState.checkoutResult.transaction_id.slice(0, 8)}…</span>
              <span>Destination: office</span>
            </div>
          ) : null}
          <p className="build-note">
            Current step: normal checkout only. Express checkout and manager override remain disabled.
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
          <p className="eyebrow">Inventory Step 1–4C</p>
          <h2>Read-only Inventory + Cart Checkout</h2>
          <p>
            This module reads from live v2 Supabase and supports controlled cart-open, add-to-cart, and normal checkout. Express checkout remains locked.
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
      {activeTab === 'cart' ? <CartScaffold permissions={permissions} cartCandidates={inventory.model.cartCandidates} /> : null}

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
            <p className="build-note">Inventory checkout build: 2026-06-10.2</p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <section className="app-main dashboard-grid">
        <article className="card">
          <LayoutDashboard className="card__icon" />
          <h2>Dashboard Shell</h2>
          <p>Base app shell is online. The inventory module supports read-only browsing, controlled cart-open, add-to-cart, and normal checkout.</p>
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
          <p className="muted">Cart opening, add-to-cart, and checkout are routed through server RPCs. Direct cart table mutation is blocked by RLS.</p>
        </article>

        <article className="card card--wide">
          <div className="card__header">
            <div>
              <p className="eyebrow">Cart Write Gate</p>
              <h2>Normal Checkout Is Controlled</h2>
              <p>
                The app can now finalize an active cart to an office destination through `finalize_inventory_cart`. Express checkout is still not built.
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
