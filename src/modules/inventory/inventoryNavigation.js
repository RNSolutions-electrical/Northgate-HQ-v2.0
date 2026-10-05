export const INVENTORY_SECTIONS = [
  { key: 'stock', label: 'Inventory' },
  { key: 'catalog', label: 'Full Catalogue', description: 'All active material catalogue entries.' },
  { key: 'stock_reviews', label: 'Stock Reviews' },
  { key: 'overview', label: 'Overview', description: 'Live stock summary and valuation export preview.' },
  { key: 'storage', label: 'Storage', description: 'Storage units, shelves, bays, bins and QR labels.' },
  { key: 'scan', label: 'Scan', description: 'Resolve location QR codes and dispatch to cart or count.' },
  { key: 'accounting', label: 'Export', description: 'Catalogue, count, and valuation sheets.' },
  { key: 'cart', label: 'Cart', description: 'Open cart, add candidates, and remove staged lines.' },
  { key: 'count', label: 'Inventory Management', description: 'Existing count correction and new bin/material intake.' },
  { key: 'destinations', label: 'Destinations', description: 'Approved user and vehicle destination references.' },
  { key: 'history', label: 'Transaction History', description: 'Read-only ledger history through the preserved RPC.' },
  { key: 'controls', label: 'Reserved Controls', description: 'Cart, checkout, count, and archive boundaries.' },
];

export function visibleInventorySections(permissions, { mobile = false, diagnostics = false } = {}) {
  const canManage = permissions?.canManageInventory === true;
  const canScan = permissions?.permissionSource === 'server'
    && (canManage || permissions?.canInventoryTransactions === true);
  return INVENTORY_SECTIONS.filter(({ key }) => {
    if (key === 'scan') return mobile && canScan;
    if (key === 'cart') return false;
    if (key === 'controls' || key === 'destinations') return diagnostics;
    if (key === 'overview' || key === 'accounting' || key === 'count') return canManage;
    return true;
  });
}

export function inventorySectionFromSearch(search, permissions, options) {
  const requested = new URLSearchParams(search).get('view');
  const normalized = requested === 'locations' ? 'storage' : requested;
  if (normalized) {
    return visibleInventorySections(permissions, options).some(({ key }) => key === normalized)
      ? normalized
      : null;
  }
  return permissions?.canManageInventory || permissions?.canInventoryTransactions
    ? 'stock'
    : permissions?.canEditCatalog ? 'catalog' : 'stock_reviews';
}

export function inventorySectionUrl(sectionKey) {
  return `/inventory?view=${encodeURIComponent(sectionKey)}`;
}
