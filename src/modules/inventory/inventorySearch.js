export function matchesMaterial(row, search) {
  const text = Object.values(row).filter(value => typeof value === 'string').join(' ').toLowerCase();
  return search.toLowerCase().trim().split(/\s+/).every(term => text.includes(term));
}

export function buildStockMaterials(catalogue, stock, { search = '', location = '', fullCatalogue = false } = {}) {
  const byId = new Map(catalogue.map(item => [item.id, { ...item, locations: [] }]));
  for (const row of stock) {
    if (!byId.has(row.item_id)) byId.set(row.item_id, { id: row.item_id, name: row.item_name, ...row, locations: [] });
    byId.get(row.item_id).locations.push(row);
  }
  return [...byId.values()].map(item => {
    const locations = item.locations.filter(row => !location || row.bin_id === location);
    return { ...item, locations, quantity: locations.reduce((sum, row) => sum + Number(row.quantity_on_hand || 0), 0) };
  }).filter(item => (fullCatalogue && !location || item.locations.length > 0)
    && matchesMaterial({ ...item, locationText: item.locations.map(row => `${row.bin_code} ${row.bin_label || ''}`).join(' ') }, search))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
