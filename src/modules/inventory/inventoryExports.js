const quote = value => {
  const raw = String(value ?? '');
  // Spreadsheet programs can execute formula-looking catalogue descriptions.
  const text = typeof value === 'string' && /^[\s]*[=+@-]/.test(raw) && !/^-\d+(\.\d+)?$/.test(raw.trim()) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const INVENTORY_EXPORT_TYPES = [
  { value: 'catalogue', label: 'Full material catalogue' },
  { value: 'blank', label: 'Blank inventory count sheet' },
  { value: 'current', label: 'Current inventory sheet' },
  { value: 'financial', label: 'Inventory valuation sheet' },
];

export function inventoryExportRows(type, catalogue, rows) {
  if (type === 'catalogue') return catalogue.map(item => ({
    code: item.material_code, item: item.name, description: item.description,
    manufacturer: item.manufacturer, size: item.size, category: item.broad_category,
    subCategory: item.sub_category, subCategory2: item.sub_category_2,
    unit: item.unit_of_measure, department: item.division,
    unitCost: item.price_confirmed === false ? '' : item.price_per_unit ?? '',
    laborHoursPerUnit: item.labor_rate_hrs ?? '',
  }));
  return rows.map(row => ({
    code: row.material_code, item: row.item_name,
    location: [row.storage_unit_code, row.shelf_code, row.bay_code, row.bin_code].filter(Boolean).join(' / '),
    unit: row.unit_of_measure,
    ...(type === 'blank' ? { countedQuantity: '' } : {
      systemQuantity: row.quantity_recorded === false ? '' : row.quantity_on_hand ?? row.system_quantity ?? '',
      ...(type === 'current' ? { countedQuantity: '' } : {
        unitCost: row.price_confirmed === false ? '' : row.price_per_unit ?? '',
        totalValue: row.quantity_recorded === false || row.price_confirmed === false || row.price_per_unit == null ? '' : Number(row.quantity_on_hand ?? row.system_quantity) * Number(row.price_per_unit),
      }),
    }),
  }));
}

export function inventoryExportCsv(type, catalogue, rows) {
  const headers = {
    catalogue: ['code', 'item', 'description', 'manufacturer', 'size', 'category', 'subCategory', 'subCategory2', 'unit', 'department', 'unitCost', 'laborHoursPerUnit'],
    blank: ['code', 'item', 'location', 'unit', 'countedQuantity'],
    current: ['code', 'item', 'location', 'unit', 'systemQuantity', 'countedQuantity'],
    financial: ['code', 'item', 'location', 'unit', 'systemQuantity', 'unitCost', 'totalValue'],
  }[type];
  if (!headers) throw new Error('Unknown inventory export type');
  const data = inventoryExportRows(type, catalogue, rows);
  const lines = [headers.map(quote).join(','), ...data.map(row => headers.map(key => quote(row[key])).join(','))];
  if (type === 'financial') {
    const knownTotal = data.reduce((sum, row) => sum + (Number(row.totalValue) || 0), 0);
    lines.push(headers.map(key => quote(key === 'item' ? 'Known inventory value total' : key === 'totalValue' ? knownTotal : '')).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
