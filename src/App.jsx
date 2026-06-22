import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Database, Download, LayoutDashboard, MapPin, Printer, QrCode, ShieldCheck, ShoppingCart } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from './services/supabaseClient.js';
import { useBinItemRetirement } from './hooks/useBinItemRetirement.js';
import { useInventoryCountIntake } from './hooks/useInventoryCountIntake.js';
import { useInventoryCountSheet } from './hooks/useInventoryCountSheet.js';
import { useInventoryReadModel } from './hooks/useInventoryReadModel.js';
import { useInventoryCart } from './hooks/useInventoryCart.js';
import { useInventoryTransactionHistory } from './hooks/useInventoryTransactionHistory.js';
import { usePermissions } from './hooks/usePermissions.js';
import { buildLocationQrSvg, buildLocationQrUrl, getAppOrigin } from './lib/locationQr.js';

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

const COUNT_INTAKE_HELP_ITEMS = [
  'Choose Unit, Shelf, Bay, and Bin to narrow the physical area before recording counts.',
  'Search accepts location shortcuts: C, C1, C11, and C111 map to Unit, Shelf, Bay, and Bin.',
  'A recorded counted quantity becomes an official physical count correction. Zero is valid.',
  'Use Reason or Custom note to describe why the count is being recorded.',
  'Mistaken bin/material rows must be counted to zero first, then retired. Retire archives only and does not change quantity or write a ledger transaction.',
];

function getCartDestinationDraftKey(cartId) {
  return cartId ? `${CART_DESTINATION_DRAFT_PREFIX}${cartId}` : null;
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
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
    row.manufacturer,
    row.manufacturer_sub,
    row.manufacturer_part_number,
    row.vendor_part_number,
    row.description,
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

  return [
    record.typeLabel,
    record.code,
    record.label,
    record.path,
    record.parentLabel,
    record.division,
    record.id,
  ].some((value) => normalizeSearchText(value).includes(normalizedSearch));
}

function matchesCountRowSearch(row, searchText) {
  const normalizedSearch = normalizeSearchText(searchText);
  if (!normalizedSearch) return true;

  const compactSearch = normalizeLocationSegment(searchText);
  const compactLocationCode = buildCompactLocationCode(row);
  const isHierarchySearch = /^[a-z]\d{0,3}$/.test(compactSearch);
  const searchableValues = isHierarchySearch ? getLocationSearchValues(row) : getCountRowSearchValues(row);
  const plainMatch = searchableValues.some((value) => normalizeSearchText(value).includes(normalizedSearch));
  const compactLocationMatch = compactSearch ? compactLocationCode.startsWith(compactSearch) : false;

  return plainMatch || compactLocationMatch;
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
                  <small>{record.label || record.division || 'No display label'}</small>
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
          <button type="button" className="secondary-button" onClick={printCountSheet}>Print / Export</button>
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
    </div>
  );
}

function InventoryCountIntakePanel({ permissions }) {
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
          <button type="button" className="secondary-button" onClick={printCountSheet}>Print / Export</button>
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
            No active bin/material rows match the current search, path, category, and repeat filters.
          </EmptyState>
        )}
      </section>

      <CountHistoryForItem row={selectedHistoryRow} permissions={permissions} />
    </div>
  );
}

function CartScaffold({ permissions, cartCandidates, destinationReferences, onInventoryReload }) {
  const cartState = useInventoryCart();
  const [lineDestinations, setLineDestinations] = useState({});
  const [applyAllDestination, setApplyAllDestination] = useState({
    destination_type: 'unknown',
    destination_id: '',
    note: '',
  });
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateQuantities, setCandidateQuantities] = useState({});
  const [candidateQuantityMessage, setCandidateQuantityMessage] = useState('');
  const [candidateRowMessages, setCandidateRowMessages] = useState({});
  const [addAllProgress, setAddAllProgress] = useState(null);
  const [isAddingAllCandidates, setIsAddingAllCandidates] = useState(false);
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const cart = cartState.cart;
  const cartDraftKey = getCartDestinationDraftKey(cart?.cart_id);
  const cartIsActive = cart?.status === 'active';
  const cartIsCheckedOut = cart?.status === 'checked_out' || cartState.checkoutResult?.status === 'checked_out';
  const normalizedCandidateSearch = candidateSearch.trim().toLowerCase();
  const candidateItems = cartCandidates
    .filter((candidate) => Number(candidate.quantity_on_hand ?? 0) > DEFAULT_CANDIDATE_QUANTITY)
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
    return candidateQuantities[candidate.bin_item_id] ?? String(DEFAULT_CANDIDATE_QUANTITY);
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
            <EmptyState title="No stocked candidates">
              No stocked bin items match the current picker filters.
            </EmptyState>
          )}
          {candidateQuantityMessage ? <p className="muted">{candidateQuantityMessage}</p> : null}
        </section>

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
        <button className="module-tab" type="button" aria-selected={activeTab === 'locations'} onClick={() => setActiveTab('locations')}>
          Locations & QR
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

      {inventory.isLoading ? <p className="muted">Loading live inventory data…</p> : null}
      {activeTab === 'catalog' ? <CatalogPreview rows={inventory.model.catalogPreview} /> : null}
      {activeTab === 'storage' ? <StoragePreview storageUnits={inventory.model.storageUnitsPreview} bins={inventory.model.binsPreview} /> : null}
      {activeTab === 'locations' ? <LocationManagementPanel permissions={permissions} /> : null}
      {activeTab === 'cart' ? (
        <CartScaffold
          permissions={permissions}
          cartCandidates={inventory.model.cartCandidates}
          destinationReferences={inventory.model.destinationReferences}
          onInventoryReload={inventory.reload}
        />
      ) : null}
      {activeTab === 'count' ? (
        <InventoryCountIntakePanel permissions={permissions} />
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
