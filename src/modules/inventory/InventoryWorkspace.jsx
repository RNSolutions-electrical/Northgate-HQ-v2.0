import {
  Boxes,
  ClipboardList,
  History,
  MapPinned,
  PackageSearch,
  RefreshCw,
  Scale,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { useInventoryReadModel } from '../../hooks/useInventoryReadModel.js';
import { useInventoryTransactionHistory } from '../../hooks/useInventoryTransactionHistory.js';

const INVENTORY_VIEWS = [
  { key: 'catalog', label: 'Catalogue', icon: PackageSearch, description: 'Active material catalogue preview.' },
  { key: 'storage', label: 'Storage', icon: MapPinned, description: 'Storage units and bin previews.' },
  { key: 'checkout', label: 'Checkout Candidates', icon: ShoppingCart, description: 'Rows currently available to add to cart.' },
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

export function InventoryWorkspace({ permissions }) {
  const canLoadInventory = permissions.permissionSource === 'server';
  const readModel = useInventoryReadModel({ enabled: canLoadInventory });
  const [activeView, setActiveView] = useState('catalog');
  const [search, setSearch] = useState('');
  const [historyType, setHistoryType] = useState('');
  const [historySearch, setHistorySearch] = useState('');
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

  const views = INVENTORY_VIEWS.map((view) => {
    const badge = {
      catalog: counts.activeItems,
      storage: counts.bins,
      checkout: model.cartCandidates.length,
      destinations: model.destinationReferences.users.length + model.destinationReferences.vehicles.length,
      history: history.rows.length,
      controls: null,
    }[view.key];
    return { ...view, badge };
  });

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

    if (activeView === 'checkout') {
      return (
        <article className="card workspace-card">
          <Toolbar
            eyebrow="Checkout"
            title="Checkout Candidates"
            description="Read-only list of rows currently available to add to a cart. Cart open/add/remove/finalize is deferred in this v3 slice."
            dense
          />
          <DataTable
            columns={CANDIDATE_COLUMNS}
            rows={visibleCandidates}
            getRowKey={(row) => row.bin_item_id}
            permissions={permissions}
            isLoading={readModel.isLoading}
            error={readModel.error}
            dense
            minWidth="860px"
            emptyTitle="No checkout candidates in preview"
            emptyDescription="Only positive on-hand rows from the preserved read model appear here."
          />
        </article>
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
            title="Cart mutations stay deferred"
            description="The preserved cart hook and RPCs remain untouched. This pass does not open carts, add/remove items, finalize checkout, or change destination handling."
            tone="warning"
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
        description="Read-first v3 Inventory surface using preserved inventory hooks. Cart, checkout, counts, and archive actions remain deferred until their controls can be ported deliberately."
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
        <SummaryCard label="Cart candidates" value={model.cartCandidates.length} detail="Positive on-hand preview rows" />
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
              <p>Cart, checkout, count correction, and retirement flows are preserved but not reintroduced in this first v3 slice.</p>
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
              description="This v3 pass reads the existing model and transaction history only; it does not write `inventory_balances` or reimplement ledger derivation."
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
