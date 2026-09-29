// Isolated, sample-data visual review of the Inventory UI. No auth, API, or live writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClipboardList, Download, MapPinned, PackageSearch, Scale } from 'lucide-react';
import { PrimarySidebar } from '../../src/components/layout/PrimarySidebar.jsx';
import { WorkspaceHeader } from '../../src/components/ui/WorkspaceHeader.jsx';
import { InventoryStockBrowser } from '../../src/modules/inventory/InventoryStockBrowser.jsx';
import { INVENTORY_EXPORT_TYPES, inventoryExportCsv, inventoryExportRows } from '../../src/modules/inventory/inventoryExports.js';
import { buildBlankInventoryCountPdf } from '../../src/modules/inventory/inventoryCountPdf.js';
import CatalogueMaterialForm from '../../src/modules/estimates/workbench/CatalogueMaterialForm.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
import '../../src/modules/inventory/materialCatalogue.css';
import './inventory-ui-preview.css';

const locationRecords = [
  { id: 'unit-e', type: 'unit', code: 'E', label: 'Electrical storage', parentId: null },
  { id: 'shelf-e1', type: 'shelf', code: 'E1', label: 'Conduit and fittings', parentId: 'unit-e' },
  { id: 'shelf-e2', type: 'shelf', code: 'E2', label: 'Devices', parentId: 'unit-e' },
  { id: 'bay-e11', type: 'bay', code: 'E11', label: 'EMT fittings', parentId: 'shelf-e1' },
  { id: 'bay-e12', type: 'bay', code: 'E12', label: 'Straps', parentId: 'shelf-e1' },
  { id: 'bay-e21', type: 'bay', code: 'E21', label: 'Receptacles', parentId: 'shelf-e2' },
  { id: 'bin-e111', type: 'bin', code: 'E111', label: 'Couplings', parentId: 'bay-e11' },
  { id: 'bin-e112', type: 'bin', code: 'E112', label: 'Connectors', parentId: 'bay-e11' },
  { id: 'bin-e121', type: 'bin', code: 'E121', label: 'One-hole straps', parentId: 'bay-e12' },
  { id: 'bin-e211', type: 'bin', code: 'E211', label: '20A devices', parentId: 'bay-e21' },
];

const catalogue = [
  { id: 'item-1', material_code: 'EMT-075-COUPLING', name: '3/4" EMT Compression Coupling', description: 'Steel, rain-tight', size: '3/4"', broad_category: 'EMT', sub_category: 'Fittings', sub_category_2: 'Couplings', manufacturer: 'Sample Supply', unit_of_measure: 'EA', division: 'Electrical', price_per_unit: 2.85, price_confirmed: true, labor_rate_hrs: 0.03 },
  { id: 'item-2', material_code: 'EMT-075-CONNECTOR', name: '3/4" EMT Compression Connector', size: '3/4"', broad_category: 'EMT', sub_category: 'Fittings', sub_category_2: 'Connectors', manufacturer: 'Sample Supply', unit_of_measure: 'EA', division: 'Electrical', price_per_unit: 3.15, price_confirmed: true, labor_rate_hrs: 0.04 },
  { id: 'item-3', material_code: 'STRP-EMT-ONE-HOLE-075', name: '3/4" EMT One-Hole Strap', size: '3/4"', broad_category: 'EMT', sub_category: 'Supports', sub_category_2: 'Straps', unit_of_measure: 'EA', division: 'Electrical', price_per_unit: 0.79, price_confirmed: true, labor_rate_hrs: 0.02 },
  { id: 'item-4', material_code: 'REC-20A-DUPLEX-WHT', name: '20A Duplex Receptacle — White', size: '20A', broad_category: 'Devices', sub_category: 'Receptacles', sub_category_2: 'Duplex', unit_of_measure: 'EA', division: 'Electrical', price_per_unit: 5.4, price_confirmed: true, labor_rate_hrs: 0.18 },
  { id: 'item-5', material_code: 'EMT-100-COUPLING', name: '1" EMT Compression Coupling', size: '1"', broad_category: 'EMT', sub_category: 'Fittings', sub_category_2: 'Couplings', unit_of_measure: 'EA', division: 'Electrical', price_per_unit: 0, price_confirmed: false, labor_rate_hrs: null },
  { id: 'item-6', material_code: 'WIRE-12-THHN-BLK', name: '#12 THHN Black Wire', size: '#12', broad_category: 'Wire', sub_category: 'Building Wire', sub_category_2: 'THHN', unit_of_measure: 'FT', division: 'Electrical', price_per_unit: 0.38, price_confirmed: true, labor_rate_hrs: 0.005 },
];

const rawStock = [
  { item_id: 'item-1', bin_id: 'bin-e111', bin_code: 'E111', bin_label: 'Couplings', bin_item_id: 'stock-1', quantity_on_hand: 48, quantity_recorded: true },
  { item_id: 'item-2', bin_id: 'bin-e112', bin_code: 'E112', bin_label: 'Connectors', bin_item_id: 'stock-2', quantity_on_hand: 26, quantity_recorded: true },
  { item_id: 'item-3', bin_id: 'bin-e121', bin_code: 'E121', bin_label: 'One-hole straps', bin_item_id: 'stock-3', quantity_on_hand: 85, quantity_recorded: true },
  { item_id: 'item-4', bin_id: 'bin-e211', bin_code: 'E211', bin_label: '20A devices', bin_item_id: 'stock-4', quantity_on_hand: 17, quantity_recorded: true },
  { item_id: 'item-6', bin_id: 'bin-e112', bin_code: 'E112', bin_label: 'Connectors', bin_item_id: 'stock-6', quantity_on_hand: null, quantity_recorded: false },
];
const stock = rawStock.map(row => {
  const item = catalogue.find(entry => entry.id === row.item_id);
  const bin = locationRecords.find(entry => entry.id === row.bin_id);
  const bay = locationRecords.find(entry => entry.id === bin.parentId);
  const shelf = locationRecords.find(entry => entry.id === bay.parentId);
  const unit = locationRecords.find(entry => entry.id === shelf.parentId);
  return { ...row, item_name: item.name, material_code: item.material_code, unit_of_measure: item.unit_of_measure,
    price_per_unit: item.price_per_unit, price_confirmed: item.price_confirmed, division: item.division,
    storage_unit_id: unit.id, storage_unit_code: unit.code, shelf_id: shelf.id, shelf_code: shelf.code,
    bay_id: bay.id, bay_code: bay.code, system_quantity: row.quantity_on_hand };
});
const model = { catalogPreview: catalogue, stockRows: stock, cartCandidates: stock.filter(row => row.quantity_on_hand > 0) };
const nav = [
  { key: 'stock', label: 'Inventory', icon: PackageSearch },
  { key: 'catalog', label: 'Full Catalogue', icon: PackageSearch },
  { key: 'stock_reviews', label: 'Stock Reviews', icon: ClipboardList, badge: 2 },
  { key: 'count', label: 'Inventory Management', icon: Scale },
  { key: 'accounting', label: 'Export', icon: Download },
  { key: 'storage', label: 'Storage', icon: MapPinned },
];

function locationChoices(type, selected) {
  const byId = new Map(locationRecords.map(row => [row.id, row]));
  return locationRecords.filter(row => row.type === type
    && (type !== 'shelf' || !selected.unit || row.parentId === selected.unit)
    && (type !== 'bay' || (!selected.shelf || row.parentId === selected.shelf) && (!selected.unit || byId.get(row.parentId)?.parentId === selected.unit))
    && (type !== 'bin' || (!selected.bay || row.parentId === selected.bay)
      && (!selected.shelf || byId.get(row.parentId)?.parentId === selected.shelf)
      && (!selected.unit || byId.get(byId.get(row.parentId)?.parentId)?.parentId === selected.unit)));
}

function LocationFilters({ selected, onChange }) {
  return <div className="inventory-location-filters">
    {[['unit', 'Shelving Unit', 'unit'], ['shelf', 'Shelf', 'shelf'], ['bay', 'Bay', 'bay'], ['bin', 'Bin', 'bin']].map(([key, label, type]) => <label key={key}>{label}
      <select value={selected[key]} onChange={event => {
        const next = { ...selected, [key]: event.target.value };
        if (key === 'unit') Object.assign(next, { shelf: '', bay: '', bin: '' });
        if (key === 'shelf') Object.assign(next, { bay: '', bin: '' });
        if (key === 'bay') next.bin = '';
        onChange(next);
      }}><option value="">All {key === 'unit' ? 'shelving units' : key === 'shelf' ? 'shelves' : `${label.toLowerCase()}s`}</option>{locationChoices(type, selected).map(row => <option key={row.id} value={row.id}>{row.code} — {row.label}</option>)}</select>
    </label>)}
  </div>;
}

function Preview() {
  const [view, setView] = useState('stock');
  const [browserState, setBrowserState] = useState({ search: '', location: '', unit: '', shelf: '', bay: '', size: '', category: '', subcategory: '', subcategory2: '', page: 0, highlightMissing: false, categoriesOpen: false, expandedIds: [] });
  const [exportType, setExportType] = useState('current');
  const [exportLocation, setExportLocation] = useState({ unit: '', shelf: '', bay: '', bin: '' });
  const [countLocation, setCountLocation] = useState({ unit: '', shelf: '', bay: '', bin: '' });
  const [notice, setNotice] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [messages, setMessages] = useState({});
  const scoped = selected => stock.filter(row => (!selected.unit || row.storage_unit_id === selected.unit)
    && (!selected.shelf || row.shelf_id === selected.shelf) && (!selected.bay || row.bay_id === selected.bay)
    && (!selected.bin || row.bin_id === selected.bin));
  const shown = scoped(exportLocation);
  const exportCount = exportType === 'catalogue' ? catalogue.length : shown.length;
  const previewColumns = exportType === 'catalogue'
    ? [['code', 'Code'], ['item', 'Material'], ['size', 'Size'], ['category', 'Category'], ['unit', 'Unit']]
    : exportType === 'blank'
      ? [['code', 'Code'], ['item', 'Material'], ['location', 'Location'], ['unit', 'Unit'], ['countedQuantity', 'Counted Qty']]
      : exportType === 'financial'
        ? [['code', 'Code'], ['item', 'Material'], ['location', 'Location'], ['systemQuantity', 'System Qty'], ['unitCost', 'Unit Cost'], ['totalValue', 'Total Value']]
        : [['code', 'Code'], ['item', 'Material'], ['location', 'Location'], ['unit', 'Unit'], ['systemQuantity', 'System Qty'], ['countedQuantity', 'Counted Qty']];
  const previewExportRows = inventoryExportRows(exportType, catalogue, shown);
  function selectView(next) {
    setNotice('');
    setView(next);
    if (next === 'catalog') setBrowserState(current => ({ ...current, location: '', unit: '', shelf: '', bay: '' }));
  }
  function download() {
    const csv = inventoryExportCsv(exportType, catalogue, shown);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `northgate-sample-${exportType}.csv`; anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Sample CSV downloaded. No live records were accessed.');
  }
  async function downloadPdf() {
    const location = Object.values(exportLocation).filter(Boolean)
      .map(id => locationRecords.find(row => row.id === id)?.code).filter(Boolean).join(' / ') || 'All storage locations';
    const bytes = await buildBlankInventoryCountPdf(shown, { location });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'northgate-sample-blank-count.pdf'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Sample printable PDF downloaded. No live records were accessed.');
  }
  return <>
    <div className="inventory-preview-top"><div className="inventory-preview-brand"><span className="inventory-preview-diamond">N</span><strong>NORTHGATE<small>HEADQUARTERS</small></strong></div><span>Inventory UI preview</span></div>
    <div className="inventory-preview-layout"><aside className="inventory-preview-rail"><strong>WORKSPACE<br/>Inventory</strong><span>Dashboard</span><span className="selected">Inventory</span><span>Jobs</span><span>Estimates</span><span>Documents</span></aside>
      <main><div className="inventory-preview-banner"><strong>LOCAL UI PREVIEW</strong> · Sample materials and locations only · No Production connection or writes</div>
        <WorkspaceHeader eyebrow="Workspace" title="Inventory" description="Browse materials, manage stock, and export inventory sheets." descriptionIsDiagnostic={false}
          actions={<><button className="secondary-button" onClick={() => selectView('new')}>Add Catalogue Material</button><button className="secondary-button" onClick={() => selectView('count')}>Inventory Management</button><button className="secondary-button" onClick={() => setMobileMenuOpen(true)}>Page Menu</button></>} />
        <div className={`workspace-split inventory-workspace${collapsed ? ' is-primary-collapsed' : ''}`}>
          <PrimarySidebar eyebrow="Inventory Views" title="Inventory" items={nav} activeKey={view} onSelect={selectView} collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(value => !value)} mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />
          <div className="workspace-surface">
            {notice && <p className="inventory-preview-notice" role="status">{notice}</p>}
            {(view === 'stock' || view === 'catalog') && <article className="card workspace-card"><InventoryStockBrowser model={model} loading={false} error={null} fullCatalogue={view === 'catalog'}
              onScopeChange={full => selectView(full ? 'catalog' : 'stock')} locationRecords={locationRecords}
              browserState={browserState} onBrowserStateChange={setBrowserState} canTransact busy={false} quantities={quantities} messages={messages}
              onQuantityChange={(id, value) => setQuantities(current => ({ ...current, [id]: value }))}
              onAdd={row => setMessages(current => ({ ...current, [row.bin_item_id]: { tone: 'success', text: 'Preview only — not added to a live cart.' } }))}
              onAliases={() => selectView('new')} /></article>}
            {view === 'accounting' && <article className="card workspace-card inventory-preview-panel"><p className="eyebrow">Export</p><h2>Build an inventory sheet</h2><p>Choose the sheet and location. Download a sample CSV for Excel or a printable PDF for manual counts.</p>
              <div className="inventory-export-controls"><label>Sheet type<select value={exportType} onChange={event => setExportType(event.target.value)}>{INVENTORY_EXPORT_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                {exportType !== 'catalogue' && <LocationFilters selected={exportLocation} onChange={setExportLocation} />}
                <div className="inventory-export-actions"><span>{exportCount} rows in this export</span><div className="inventory-export-buttons"><button className="primary-button" onClick={download}><Download aria-hidden="true"/> Download sample CSV</button>{exportType === 'blank' && <button className="secondary-button" onClick={downloadPdf}><Download aria-hidden="true"/> Download sample PDF</button>}</div></div>
                {exportType === 'blank' && <small>The PDF leaves counts and notes blank for handwriting. It does not show system quantities or prices.</small>}
                {exportType === 'financial' && <small>Uncounted or unpriced rows remain blank; totals include known values only.</small>}
              </div><div className="inventory-preview-table-wrap"><table><thead><tr>{previewColumns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{previewExportRows.map((row, index) => <tr key={`${row.code}-${index}`}>{previewColumns.map(([key]) => <td key={key}>{row[key] ?? ''}</td>)}</tr>)}</tbody></table></div>
            </article>}
            {view === 'count' && <article className="card workspace-card inventory-preview-panel"><p className="eyebrow">Count</p><h2>Inventory Management</h2><p>The location selectors and current count rows are shown here. Bulk-edit/save and permission changes are planned for the later backend pass.</p>
              <label className="inventory-preview-search">Search code, item, bin, location… <input type="search" placeholder="Search current view" /></label>
              <LocationFilters selected={countLocation} onChange={setCountLocation} />
              <div className="inventory-preview-table-wrap"><table><thead><tr><th>Code</th><th>Item</th><th>Location</th><th>System Qty</th><th>Unit</th><th>Counted Qty</th></tr></thead><tbody>{scoped(countLocation).map(row => <tr key={row.bin_item_id}><td>{row.material_code}</td><td>{row.item_name}</td><td>{[row.storage_unit_code, row.shelf_code, row.bay_code, row.bin_code].join(' / ')}</td><td>{row.quantity_recorded === false ? 'Not counted' : row.quantity_on_hand}</td><td>{row.unit_of_measure}</td><td>—</td></tr>)}</tbody></table></div>
            </article>}
            {view === 'stock_reviews' && <article className="card workspace-card inventory-preview-panel"><p className="eyebrow">Review queue</p><h2>Stock Reviews <span className="inventory-preview-count">2</span></h2><p>Sample pending requests, illustrating the sidebar badge.</p><div className="inventory-preview-review">3/4" EMT Compression Coupling <small>Pending · Electrical</small></div><div className="inventory-preview-review">20A Duplex Receptacle <small>Pending · Electrical</small></div></article>}
            {view === 'new' && <article className="card workspace-card inventory-preview-panel"><p className="eyebrow">Full material catalogue</p><h2>Add material</h2><p>Try the Suggested Catalogue Number or Help Me Build It controls. Save is disabled from reaching Production.</p>
              <CatalogueMaterialForm line={{ unit: 'EA', price: '' }} material={null} catalogueItems={catalogue} busy={false} onSave={async () => setNotice('Preview only — no material was saved.')} />
            </article>}
            {view === 'storage' && <article className="card workspace-card inventory-preview-panel"><h2>Storage</h2><p>Storage navigation is unchanged in this UI pass. Select Inventory to try the new location filters.</p></article>}
          </div>
        </div>
      </main>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<Preview />);
