import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { buildStockMaterials } from './inventorySearch.js';

const quantity = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = value => value == null || value === '' ? 'Not priced' : Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export function InventoryStockBrowser({ model, loading, error, fullCatalogue, onScopeChange, canTransact,
  busy, quantities, messages, onQuantityChange, onAdd, scanBinId = '', onClearScan }) {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(scanBinId);
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const stockRows = model.stockRows ?? model.cartCandidates;
  useEffect(() => setLocation(scanBinId), [scanBinId]);
  useEffect(() => setPage(0), [search, location, fullCatalogue, category, subcategory]);
  const categories = [...new Set(model.catalogPreview.map(row => row.broad_category).filter(Boolean))].sort();
  const subcategories = [...new Set(model.catalogPreview.filter(row => !category || row.broad_category === category).map(row => row.sub_category).filter(Boolean))].sort();
  const locations = useMemo(() => [...new Map(stockRows.map(row => [row.bin_id,
    { id: row.bin_id, label: [row.bin_code, row.bin_label].filter(Boolean).join(' - ') }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label)), [stockRows]);
  const materials = useMemo(() => buildStockMaterials(model.catalogPreview, stockRows,
    { search, location, fullCatalogue }).filter(item => (!category || item.broad_category === category) && (!subcategory || item.sub_category === subcategory)), [model, search, location, fullCatalogue, category, subcategory]);
  const lastPage = Math.max(0, Math.ceil(materials.length / 40) - 1);
  const currentPage = Math.min(page, lastPage);
  return <section className="inventory-stock-browser" aria-label="Material search">
    <div className="inventory-search-tools">
      <div className="inventory-search-scope" role="group" aria-label="Material scope">
        <button type="button" aria-pressed={!fullCatalogue} onClick={() => onScopeChange(false)}>Inventory</button>
        <button type="button" aria-pressed={fullCatalogue} onClick={() => onScopeChange(true)}>Full Catalogue</button>
      </div>
      <label className="inventory-search-input"><Search aria-hidden="true" />
        <span className="sr-only">Search materials</span>
        <input type="search" placeholder="Search material, code, size, manufacturer..." value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label><span className="sr-only">Stock location</span><select value={location} onChange={event => setLocation(event.target.value)}>
        <option value="">All stock locations</option>
        {scanBinId && !locations.some(row => row.id === scanBinId) ? <option value={scanBinId}>Scanned location</option> : null}
        {locations.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
      </select></label>
      <button type="button" className="icon-button" title="Clear search and location" aria-label="Clear search and location" disabled={!search && !location && !category && !subcategory}
        onClick={() => { setSearch(''); setLocation(''); setCategory(''); setSubcategory(''); if (scanBinId) onClearScan(); }}><X aria-hidden="true" /></button>
    </div>
    {categories.length > 0 ? <details className="inventory-category-filters"><summary>Categories{category || subcategory ? ' (filtered)' : ''}</summary>
      <select aria-label="Material category" value={category} onChange={event => { setCategory(event.target.value); setSubcategory(''); }}>
        <option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="Material subcategory" value={subcategory} onChange={event => setSubcategory(event.target.value)}>
        <option value="">All subcategories</option>{subcategories.map(value => <option key={value}>{value}</option>)}
      </select>
    </details> : null}
    {loading ? <StatePanel title="Loading inventory..." compact /> : error ? <StatePanel title="Inventory could not be loaded" description={error.message} tone="danger" /> : <>
      <div className="inventory-search-count">{materials.length} material{materials.length === 1 ? '' : 's'}</div>
      {!materials.length ? <StatePanel title="No matching materials" description={fullCatalogue ? 'No catalogue materials match your filters.' : 'No tracked stock matches your filters.'}
        actions={!fullCatalogue ? <button className="secondary-button" onClick={() => { setLocation(''); onScopeChange(true); }}>Search Full Catalogue</button> : null} /> : null}
      <div className="inventory-material-list">
        {materials.slice(currentPage * 40, currentPage * 40 + 40).map(item => <details className="inventory-material" key={item.id}>
          <summary><span className="inventory-material-name"><strong>{item.name}</strong><small>{[item.material_code, item.manufacturer, item.broad_category].filter(Boolean).join(' / ')}</small></span>
            <span className="inventory-material-quantity"><strong>{quantity(item.quantity)} {item.unit_of_measure}</strong><small>{item.locations.length ? `${item.locations.length} location${item.locations.length === 1 ? '' : 's'}` : 'Not stocked'}</small></span>
          </summary>
          <div className="inventory-material-detail">
            <p>Unit cost: <strong>{money(item.price_per_unit)}</strong></p>
            {item.locations.map(row => <div className="inventory-stock-location" key={row.bin_item_id}>
              <span><strong>{row.bin_code}</strong><small>{row.bin_label}</small></span>
              <span>{quantity(row.quantity_on_hand)} {row.unit_of_measure} on hand</span>
              {canTransact ? <div className="inventory-cart-action-cell"><label><span className="sr-only">Quantity for {item.name} at {row.bin_code}</span>
                <input type="number" min="0.01" step="0.01" max={row.quantity_on_hand} value={quantities[row.bin_item_id] ?? '1'}
                  disabled={busy || Number(row.quantity_on_hand) <= 0} onChange={event => onQuantityChange(row.bin_item_id, event.target.value)} /></label>
                <button type="button" className="secondary-button" disabled={busy || Number(row.quantity_on_hand) <= 0} onClick={() => onAdd(row)}><Plus aria-hidden="true" /> Add to Cart</button></div> : null}
              {messages[row.bin_item_id] ? <span role="status" className={`inventory-cart-row-message inventory-cart-row-message--${messages[row.bin_item_id].tone}`}>{messages[row.bin_item_id].text}</span> : null}
            </div>)}
          </div>
        </details>)}
      </div>
      {materials.length > 40 ? <nav className="inventory-search-pagination" aria-label="Material results pages">
        <button className="icon-button" aria-label="Previous materials" title="Previous materials" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></button>
        <span>Page {currentPage + 1} of {lastPage + 1}</span>
        <button className="icon-button" aria-label="Next materials" title="Next materials" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight /></button>
      </nav> : null}
    </>}
  </section>;
}
