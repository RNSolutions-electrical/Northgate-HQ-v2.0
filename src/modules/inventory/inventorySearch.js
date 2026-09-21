import {searchMaterials} from '../../lib/materialResolver.js';
export const matchesMaterial=(row, search)=>searchMaterials([row],search).length>0;

export function buildStockMaterials(catalogue, stock, { search = '', location = '', fullCatalogue = false } = {}) {
  const byId = new Map(catalogue.map(item => [item.id, { ...item, locations: [] }]));
  for (const row of stock) {
    if (!byId.has(row.item_id)) byId.set(row.item_id, { id: row.item_id, name: row.item_name, ...row, locations: [] });
    byId.get(row.item_id).locations.push(row);
  }
  const materials = [...byId.values()].map(item => {
    const locations = item.locations.filter(row => !location || row.bin_id === location);
    return { ...item, locations, uncountedLocations:locations.filter(row=>row.quantity_recorded===false).length,
      quantity: locations.reduce((sum, row) => sum + Number(row.quantity_on_hand || 0), 0),
      locationText:locations.map(row => `${row.bin_code} ${row.bin_label || ''}`).join(' ') };
  }).filter(item => (fullCatalogue && !location || item.locations.length > 0));
  return searchMaterials(materials,search);
}

// Explicit zero is supplied data; an unconfirmed legacy zero is a placeholder.
// Stock quantities and location fields deliberately do not participate.
export function missingMaterialInformation(item) {
  const supplied = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  const priced = supplied(item.inventory_price_per_unit) || supplied(item.estimating_price_per_unit)
    || (supplied(item.price_per_unit) && (item.price_confirmed === true || Number(item.price_per_unit) > 0));
  return [...(!priced ? ['pricing'] : []), ...(!supplied(item.labor_rate_hrs) ? ['labor'] : [])];
}
