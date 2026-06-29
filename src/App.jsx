import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import jsQR from 'jsqr';
import { Archive, Camera, CameraOff, ClipboardCheck, Copy, Database, Download, LayoutDashboard, MapPin, Pencil, Plus, Printer, QrCode, RefreshCw, RotateCcw, ShieldCheck, ShoppingCart, SlidersHorizontal, Wrench } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseClient, supabase } from './services/supabaseClient.js';
import { useBinItemRetirement } from './hooks/useBinItemRetirement.js';
import { useInventoryCountIntake } from './hooks/useInventoryCountIntake.js';
import { useInventoryCountSheet } from './hooks/useInventoryCountSheet.js';
import { useInventoryReadModel } from './hooks/useInventoryReadModel.js';
import { useInventoryCart } from './hooks/useInventoryCart.js';
import { useInventoryTransactionHistory } from './hooks/useInventoryTransactionHistory.js';
import { usePermissions } from './hooks/usePermissions.js';
import { buildLocationQrSvg, buildLocationQrUrl, buildLocationScanPath, parseLocationScanPayload, getAppOrigin } from './lib/locationQr.js';

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
const INVENTORY_TABS = new Set([
  'grand-master',
  'accounting-export',
  'catalog',
  'storage',
  'locations',
  'scan',
  'labels',
  'tools',
  'cart',
  'count',
  'transactions',
]);
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
const DEVELOPMENT_STATUS = {
  mostRecentChange: 'Milestone 5J.1 - Tool Catalogue design preview',
  relatedHandoff: 'Entry 089',
  architectureVersion: 'v2.18',
  currentStep: 'UI design preview',
  buildMarker: '9693baa',
  deploymentNote: 'Browser verification is not claimed from Codex; this marker confirms the 5J.1 Tool Catalogue design preview code is present in the loaded build.',
};

const LAYOUT_TUNER_STORAGE_KEY = 'northgate.layoutTuner.v1';
const LAYOUT_TUNER_FIELDS = [
  { key: 'appContentMax', cssName: '--app-content-max', label: 'Content max', min: 1200, max: 2600, step: 20, unit: 'px', defaultValue: 1600 },
  { key: 'appContentVw', cssName: '--app-content-vw', label: 'Content viewport width', min: 88, max: 98, step: 1, unit: 'vw', defaultValue: 96 },
  { key: 'appPageGutter', cssName: '--app-page-gutter', label: 'Page gutter', min: 12, max: 56, step: 2, unit: 'px', defaultValue: 16 },
  { key: 'dashboardCardGap', cssName: '--dashboard-card-gap', label: 'Dashboard card gap', min: 8, max: 32, step: 1, unit: 'px', defaultValue: 16 },
  { key: 'dashboardCardPadding', cssName: '--dashboard-card-padding', label: 'Dashboard card padding', min: 12, max: 32, step: 1, unit: 'px', defaultValue: 18 },
  { key: 'denseTableFontSize', cssName: '--dense-table-font-size', label: 'Dense table font size', min: 0.78, max: 1, step: 0.01, unit: 'rem', defaultValue: 1 },
  { key: 'denseTableCellPaddingY', cssName: '--dense-table-cell-padding-y', label: 'Table cell padding Y', min: 4, max: 12, step: 1, unit: 'px', defaultValue: 12 },
  { key: 'denseTableCellPaddingX', cssName: '--dense-table-cell-padding-x', label: 'Table cell padding X', min: 6, max: 16, step: 1, unit: 'px', defaultValue: 12 },
];

const TOOL_CATALOGUE_HELPER_COPY = 'Catalogue-only foundation. Tool checkout, assignments, QR labels, vehicle storage, and tracking history are reserved for future milestones.';
const TOOL_CATALOGUE_EMPTY_NOTE = 'Add tools here as a catalogue only. Checkout, assignments, QR labels, and tracking history are reserved for future milestones.';
const TOOL_STATUS_OPTIONS = ['active', 'inactive', 'retired', 'missing'];
const TOOL_CONDITION_OPTIONS = ['', 'good', 'fair', 'poor', 'damaged', 'unknown'];
const TOOL_CATALOGUE_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by',
  'archive_reason',
  'tool_number',
  'name',
  'category',
  'brand',
  'model',
  'serial_number',
  'description',
  'condition',
  'status',
  'home_location',
  'current_location',
  'assigned_to',
  'purchase_date',
  'notes',
].join(',');
const TOOL_SEARCH_FIELDS = [
  'tool_number',
  'name',
  'category',
  'brand',
  'model',
  'serial_number',
  'description',
  'home_location',
  'current_location',
  'assigned_to',
  'notes',
];
const TOOL_TEXT_FORM_FIELDS = [
  { key: 'tool_number', label: 'Tool #' },
  { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'serial_number', label: 'Serial #' },
  { key: 'home_location', label: 'Home Location' },
  { key: 'current_location', label: 'Current Location' },
  { key: 'assigned_to', label: 'Assigned To' },
];
const TOOL_TEXTAREA_FORM_FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
];
const EMPTY_TOOL_DRAFT = Object.freeze({
  name: '',
  tool_number: '',
  category: '',
  brand: '',
  model: '',
  serial_number: '',
  description: '',
  condition: '',
  status: 'active',
  home_location: '',
  current_location: '',
  assigned_to: '',
  purchase_date: '',
  notes: '',
});

const COUNT_INTAKE_HELP_ITEMS = [
  'Choose Unit, Shelf, Bay, and Bin to narrow the physical area before recording counts.',
  'Search accepts location shortcuts: C, C1, C11, and C111 map to Unit, Shelf, Bay, and Bin.',
  'A recorded counted quantity becomes an official physical count correction. Zero is valid.',
  'Use Reason or Custom note to describe why the count is being recorded.',
  'Mistaken bin/material rows must be counted to zero first, then retired. Retire archives only and does not change quantity or write a ledger transaction.',
];
const AVERY_LABEL_TEMPLATES = {
  '5164': {
    key: '5164',
    displayName: 'Avery 5164 Placard',
    scopeHint: 'Unit, Shelf, Bay',
    sheet: { width: 8.5, height: 11, unit: 'in' },
    label: { width: 4, height: 3.33 },
    margins: { top: 0.5, left: 0.15625 },
    pitch: { horizontal: 4.1875, vertical: 3.33 },
    gutters: { row: 0, column: 0.1875 },
    rows: 3,
    columns: 2,
  },
  '8160': {
    key: '8160',
    displayName: 'Avery 8160 Bin Label',
    scopeHint: 'Bin',
    sheet: { width: 8.5, height: 11, unit: 'in' },
    label: { width: 2.625, height: 1 },
    margins: { top: 0.5, left: 0.1875 },
    pitch: { horizontal: 2.75, vertical: 1 },
    gutters: { row: 0, column: 0.125 },
    rows: 10,
    columns: 3,
  },
};
const LABEL_SCOPE_OPTIONS = [
  { value: '', label: 'Any location level' },
  { value: 'unit', label: 'Unit' },
  { value: 'shelf', label: 'Shelf' },
  { value: 'bay', label: 'Bay' },
  { value: 'bin', label: 'Bin' },
];
const LABEL_FIELD_OPTIONS = [
  { key: 'qr', label: 'QR code' },
  { key: 'code', label: 'Location code' },
  { key: 'path', label: 'Location path' },
  { key: 'label', label: 'Display label' },
  { key: 'summary', label: 'Contents summary' },
];
const DEFAULT_LABEL_FIELDS = {
  qr: {
    enabled: true,
    x: 6,
    y: 8,
    width: 28,
    height: 28,
    color: '#111827',
    align: 'center',
    bold: false,
    underline: false,
    opacity: 1,
  },
  code: {
    enabled: true,
    x: 38,
    y: 12,
    width: 56,
    height: 16,
    color: '#111827',
    align: 'left',
    bold: true,
    underline: false,
    opacity: 1,
  },
  path: {
    enabled: true,
    x: 38,
    y: 34,
    width: 56,
    height: 13,
    color: '#334155',
    align: 'left',
    bold: false,
    underline: false,
    opacity: 0.9,
  },
  label: {
    enabled: true,
    x: 38,
    y: 52,
    width: 56,
    height: 12,
    color: '#475569',
    align: 'left',
    bold: false,
    underline: false,
    opacity: 0.85,
  },
  summary: {
    enabled: true,
    x: 6,
    y: 74,
    width: 88,
    height: 14,
    color: '#0f766e',
    align: 'left',
    bold: true,
    underline: false,
    opacity: 1,
  },
};

function createDefaultLabelLayout(averyTemplate = '5164') {
  const geometry = AVERY_LABEL_TEMPLATES[averyTemplate] ?? AVERY_LABEL_TEMPLATES['5164'];
  return {
    version: 1,
    geometry,
    fields: JSON.parse(JSON.stringify(DEFAULT_LABEL_FIELDS)),
  };
}

function formatLabelMeasurement(value, unit = 'in') {
  const numericValue = Number(value ?? 0);
  const text = Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(/\.?0+$/, '');
  return `${text} ${unit}`;
}

function formatLabelSize(size, unit = 'in') {
  return `${formatLabelMeasurement(size?.width, unit)} x ${formatLabelMeasurement(size?.height, unit)}`;
}

function formatAveryTemplateLabel(template) {
  if (!template) return 'Unknown Avery template';
  return `${template.displayName} / ${formatLabelSize(template.label, template.sheet?.unit ?? 'in')}`;
}

function formatAveryGeometryDetails(template) {
  if (!template) return '';
  const unit = template.sheet?.unit ?? 'in';
  return `Sheet ${formatLabelSize(template.sheet, unit)} / Label ${formatLabelSize(template.label, unit)} / Pitch ${formatLabelSize({ width: template.pitch?.horizontal, height: template.pitch?.vertical }, unit)} / ${template.columns} x ${template.rows}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLabelValues(locationRecord, summary) {
  return {
    code: locationRecord?.code || 'C211',
    path: locationRecord?.path || 'Unit C / Shelf 2 / Bay 1 / Bin 1',
    label: locationRecord?.label || `${locationRecord?.typeLabel ?? 'Bin'} label preview`,
    summary: summary || '3 stocked items / 27 total pieces',
  };
}

function getLabelPrintFontSize(geometry, fieldKey) {
  if (geometry.key === '8160') {
    if (fieldKey === 'code') return '8pt';
    if (fieldKey === 'summary') return '6.5pt';
    return '6pt';
  }

  if (fieldKey === 'code') return '18pt';
  if (fieldKey === 'summary') return '11pt';
  return '10pt';
}

function getLabelFieldCss(field, geometry, fieldKey) {
  const justifyContent = field.align === 'right' ? 'flex-end' : field.align === 'center' ? 'center' : 'flex-start';
  return [
    'position:absolute',
    `left:${field.x ?? 0}%`,
    `top:${field.y ?? 0}%`,
    `width:${field.width ?? 20}%`,
    `height:${field.height ?? 12}%`,
    'display:flex',
    'align-items:center',
    `justify-content:${justifyContent}`,
    'overflow:hidden',
    'padding:0.03in',
    'line-height:1.12',
    'white-space:normal',
    'word-break:break-word',
    `color:${field.color ?? '#111827'}`,
    `text-align:${field.align ?? 'left'}`,
    `font-weight:${field.bold ? 800 : 500}`,
    `text-decoration:${field.underline ? 'underline' : 'none'}`,
    `opacity:${field.opacity ?? 1}`,
    `font-size:${getLabelPrintFontSize(geometry, fieldKey)}`,
  ].join(';');
}

function getLabelMarkup(draft, locationRecord, summary) {
  const geometry = AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'];
  const fields = draft.layout?.fields ?? DEFAULT_LABEL_FIELDS;
  const values = getLabelValues(locationRecord, summary);
  const qrSvg = locationRecord && draft.include_qr && fields.qr?.enabled
    ? buildLocationQrSvg(locationRecord.id)
    : '';
  const textMarkup = LABEL_FIELD_OPTIONS.filter((field) => field.key !== 'qr').map((fieldOption) => {
    const field = fields[fieldOption.key];
    if (!field?.enabled) return '';
    return `<div style="${getLabelFieldCss(field, geometry, fieldOption.key)}">${escapeHtml(values[fieldOption.key])}</div>`;
  }).join('');
  const qrMarkup = qrSvg
    ? `<div style="${getLabelFieldCss(fields.qr, geometry, 'qr')}">${qrSvg}</div>`
    : '';

  return `${qrMarkup}${textMarkup}`;
}

function getLabelPrintDocument({ draft, locations, locationSheet, title }) {
  const geometry = AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'];
  const perPage = geometry.rows * geometry.columns;
  const pages = [];
  for (let index = 0; index < locations.length; index += perPage) {
    pages.push(locations.slice(index, index + perPage));
  }

  const pageMarkup = pages.map((pageLocations) => {
    const labels = pageLocations.map((locationRecord, pageIndex) => {
      const row = Math.floor(pageIndex / geometry.columns);
      const column = pageIndex % geometry.columns;
      const horizontalPitch = geometry.pitch?.horizontal ?? geometry.label.width + (geometry.gutters?.column ?? 0);
      const verticalPitch = geometry.pitch?.vertical ?? geometry.label.height + (geometry.gutters?.row ?? 0);
      const left = geometry.margins.left + column * horizontalPitch;
      const top = geometry.margins.top + row * verticalPitch;
      const summary = locationRecord ? getHierarchySummary(locationRecord, locationSheet) : '';
      return `
        <div class="label-print-cell" style="left:${left}in;top:${top}in;width:${geometry.label.width}in;height:${geometry.label.height}in;">
          ${getLabelMarkup(draft, locationRecord, summary)}
        </div>
      `;
    }).join('');

    return `<section class="label-print-page">${labels}</section>`;
  }).join('');

  return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${geometry.sheet.width}in ${geometry.sheet.height}in; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      .label-print-page { position: relative; width: ${geometry.sheet.width}in; height: ${geometry.sheet.height}in; page-break-after: always; overflow: hidden; }
      .label-print-page:last-child { page-break-after: auto; }
      .label-print-cell { position: absolute; overflow: hidden; background: #fff; border: 0.01in solid rgba(148, 163, 184, 0.35); }
      .label-print-cell svg { width: 100%; height: 100%; display: block; }
      @media print {
        .label-print-cell { border-color: transparent; }
      }
    </style>
  </head>
  <body>
    ${pageMarkup || '<section class="label-print-page"></section>'}
    <script>
      window.addEventListener('load', () => {
        window.focus();
        window.print();
      });
    </script>
  </body>
</html>`;
}

function openLabelPrintWindow({ draft, locations, locationSheet, title }) {
  if (!locations.length) return false;
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return false;
  printWindow.document.write(getLabelPrintDocument({ draft, locations, locationSheet, title }));
  printWindow.document.close();
  return true;
}

function getScopeWarning(draft) {
  if (draft.avery_template === '8160' && draft.scope_level && draft.scope_level !== 'bin') {
    return 'Avery 8160 is intended for Bin labels.';
  }
  if (draft.avery_template === '5164' && draft.scope_level === 'bin') {
    return 'Avery 5164 is intended for Unit, Shelf, and Bay placards.';
  }
  return '';
}

function getBrowserPath() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function useBrowserPath() {
  const [path, setPath] = useState(getBrowserPath);

  useEffect(() => {
    function syncPath() {
      setPath(getBrowserPath());
    }

    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  function navigateTo(nextPath) {
    if (typeof window === 'undefined' || !nextPath) return;
    window.history.pushState({}, '', nextPath);
    setPath(getBrowserPath());
  }

  return [path, navigateTo];
}

function getDashboardInventoryRouteContext(path) {
  try {
    const url = new URL(path || '/', 'https://northgate.local');
    const requestedTab = url.searchParams.get('inventoryTab') ?? '';
    const binId = url.searchParams.get('scanBinId') ?? '';
    const binCode = url.searchParams.get('scanBinCode') ?? '';
    const scanBinContext = binId
      ? {
        binId,
        binCode,
      }
      : null;

    return {
      requestedInventoryTab: INVENTORY_TABS.has(requestedTab) ? requestedTab : '',
      scanCartContext: requestedTab === 'cart' ? scanBinContext : null,
      scanCountContext: requestedTab === 'count' ? scanBinContext : null,
    };
  } catch {
    return {
      requestedInventoryTab: '',
      scanCartContext: null,
      scanCountContext: null,
    };
  }
}

function hasLayoutTunerFlag(path) {
  try {
    const url = new URL(path || '/', 'https://northgate.local');
    return url.searchParams.get('layoutTuner') === '1';
  } catch {
    return false;
  }
}

function hasDesignPreviewFlag(path) {
  try {
    const url = new URL(path || '/', 'https://northgate.local');
    return url.searchParams.get('designPreview') === '1';
  } catch {
    return false;
  }
}

function getLayoutTunerDefaults() {
  return Object.fromEntries(LAYOUT_TUNER_FIELDS.map((field) => [field.key, field.defaultValue]));
}

function normalizeLayoutTunerValues(values) {
  const defaults = getLayoutTunerDefaults();
  return LAYOUT_TUNER_FIELDS.reduce((next, field) => {
    const numericValue = Number(values?.[field.key]);
    const fallback = defaults[field.key];
    const boundedValue = Number.isFinite(numericValue)
      ? Math.min(field.max, Math.max(field.min, numericValue))
      : fallback;
    next[field.key] = boundedValue;
    return next;
  }, {});
}

function readLayoutTunerValues() {
  if (typeof window === 'undefined') return getLayoutTunerDefaults();
  try {
    const stored = window.localStorage.getItem(LAYOUT_TUNER_STORAGE_KEY);
    return normalizeLayoutTunerValues(stored ? JSON.parse(stored) : null);
  } catch {
    return getLayoutTunerDefaults();
  }
}

function applyLayoutTunerValues(values) {
  if (typeof document === 'undefined') return;
  LAYOUT_TUNER_FIELDS.forEach((field) => {
    document.documentElement.style.setProperty(field.cssName, `${values[field.key]}${field.unit}`);
  });
}

function clearLayoutTunerInlineValues() {
  if (typeof document === 'undefined') return;
  LAYOUT_TUNER_FIELDS.forEach((field) => {
    document.documentElement.style.removeProperty(field.cssName);
  });
}

function buildLayoutTunerCss(values) {
  const lines = LAYOUT_TUNER_FIELDS.map((field) => `  ${field.cssName}: ${values[field.key]}${field.unit};`);
  return [':root {', ...lines, '}'].join('\n');
}

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

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/["'`´′″]/g, '')
    .replace(/[‐‑‒–—_]+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[^a-z0-9/.\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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

function getSimpleSingularSearchToken(token) {
  if (token.length > 4 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && /(ches|shes|xes|zes|ses)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenizeSearchText(value) {
  const normalizedText = normalizeSearchText(value);
  if (!normalizedText) return [];

  return normalizedText
    .split(/\s+/)
    .flatMap((token) => {
      if (token.includes('/') && !/^\d+\/\d+$/.test(token)) {
        return [token, ...token.split('/').filter(Boolean)];
      }
      return [token];
    })
    .map((token) => token.trim())
    .filter(Boolean);
}

function getSearchTokenVariants(token) {
  const singularToken = getSimpleSingularSearchToken(token);
  return Array.from(new Set([token, singularToken].filter(Boolean)));
}

function buildSearchableTokenSet(values) {
  const tokens = tokenizeSearchText(values.filter(Boolean).join(' '));
  const tokenSet = new Set();
  tokens.forEach((token) => {
    getSearchTokenVariants(token).forEach((variant) => tokenSet.add(variant));
  });
  return tokenSet;
}

function matchesTokenizedSearch(values, searchText) {
  const queryTokens = tokenizeSearchText(searchText);
  if (!queryTokens.length) return true;

  const rowTokenSet = buildSearchableTokenSet(values);
  return queryTokens.every((token) =>
    getSearchTokenVariants(token).some((variant) => rowTokenSet.has(variant)),
  );
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
    row.unit_of_measure,
    getCategoryLabel(row),
    row.broad_category,
    row.sub_category,
    row.sub_category_2,
    row.sub_category_3,
    row.sub_category_4,
    row.manufacturer,
    row.manufacturer_sub,
    row.manufacturer_part_number,
    row.vendor_part_number,
    row.description,
    row.division,
    row.storage_unit_division,
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

  return matchesTokenizedSearch([
    record.typeLabel,
    record.code,
    record.label,
    record.path,
    record.parentLabel,
    record.division,
    record.id,
  ], searchText);
}

function getRowsForLocation(record, rows) {
  if (!record) return [];

  const keyByType = {
    unit: 'storage_unit_id',
    shelf: 'shelf_id',
    bay: 'bay_id',
    bin: 'bin_id',
  };
  const rowKey = keyByType[record.type];

  if (!rowKey) return [];
  return rows.filter((row) => row[rowKey] === record.id);
}

function getLocationDisplayCode(record) {
  if (!record) return '';
  return record.code || record.label || record.id;
}

function getLocationRecordTitle(record) {
  if (!record) return 'Unknown location';
  const displayCode = getLocationDisplayCode(record);
  return `${record.typeLabel}: ${displayCode}`;
}

function buildScanCartPath(record) {
  const params = new URLSearchParams({ inventoryTab: 'cart' });
  if (record?.id) params.set('scanBinId', record.id);
  const displayCode = getLocationDisplayCode(record);
  if (displayCode) params.set('scanBinCode', displayCode);
  return `/?${params.toString()}`;
}

function buildScanCountPath(record) {
  const params = new URLSearchParams({ inventoryTab: 'count' });
  if (record?.id) params.set('scanBinId', record.id);
  const displayCode = getLocationDisplayCode(record);
  if (displayCode) params.set('scanBinCode', displayCode);
  return `/?${params.toString()}`;
}

function sortByPositionThenCode(first, second, codeKey) {
  return Number(first.position ?? 0) - Number(second.position ?? 0)
    || String(first[codeKey] ?? '').localeCompare(String(second[codeKey] ?? ''));
}

function buildScanDestinationModel(locationId, locationSheet) {
  const unitById = new Map(locationSheet.storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(locationSheet.shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(locationSheet.bays.map((bay) => [bay.id, bay]));
  const binById = new Map(locationSheet.bins.map((bin) => [bin.id, bin]));

  const shelvesByUnitId = new Map();
  locationSheet.shelves.forEach((shelf) => {
    const shelves = shelvesByUnitId.get(shelf.unit_id) ?? [];
    shelves.push(shelf);
    shelvesByUnitId.set(shelf.unit_id, shelves);
  });

  const baysByShelfId = new Map();
  locationSheet.bays.forEach((bay) => {
    const bays = baysByShelfId.get(bay.shelf_id) ?? [];
    bays.push(bay);
    baysByShelfId.set(bay.shelf_id, bays);
  });

  const binsByBayId = new Map();
  locationSheet.bins.forEach((bin) => {
    const bins = binsByBayId.get(bin.bay_id) ?? [];
    bins.push(bin);
    binsByBayId.set(bin.bay_id, bins);
  });

  const getSortedShelves = (unitId) =>
    [...(shelvesByUnitId.get(unitId) ?? [])].sort((first, second) => sortByPositionThenCode(first, second, 'shelf_code'));
  const getSortedBays = (shelfId) =>
    [...(baysByShelfId.get(shelfId) ?? [])].sort((first, second) => sortByPositionThenCode(first, second, 'bay_code'));
  const getSortedBins = (bayId) =>
    [...(binsByBayId.get(bayId) ?? [])].sort((first, second) => sortByPositionThenCode(first, second, 'bin_code'));

  let scopeType = '';
  let unit = null;
  let shelf = null;
  let bay = null;
  let bin = null;

  if (unitById.has(locationId)) {
    scopeType = 'unit';
    unit = unitById.get(locationId);
  } else if (shelfById.has(locationId)) {
    scopeType = 'shelf';
    shelf = shelfById.get(locationId);
    unit = unitById.get(shelf.unit_id) ?? null;
  } else if (bayById.has(locationId)) {
    scopeType = 'bay';
    bay = bayById.get(locationId);
    shelf = shelfById.get(bay.shelf_id) ?? null;
    unit = shelf ? unitById.get(shelf.unit_id) ?? null : null;
  } else if (binById.has(locationId)) {
    scopeType = 'bin';
    bin = binById.get(locationId);
    bay = bayById.get(bin.bay_id) ?? null;
    shelf = bay ? shelfById.get(bay.shelf_id) ?? null : null;
    unit = shelf ? unitById.get(shelf.unit_id) ?? null : null;
  }

  if (!scopeType) return null;

  const locationRecord = buildLocationRecords(
    unit ? [unit] : [],
    shelf ? [shelf] : [],
    bay ? [bay] : [],
    bin ? [bin] : [],
  ).find((record) => record.id === locationId) ?? null;

  const shelves = scopeType === 'unit'
    ? getSortedShelves(unit.id)
    : shelf
      ? [shelf]
      : [];

  const bays = scopeType === 'unit' || scopeType === 'shelf'
    ? shelves.flatMap((shelfRecord) => getSortedBays(shelfRecord.id))
    : bay
      ? [bay]
      : [];

  const bins = scopeType === 'unit' || scopeType === 'shelf' || scopeType === 'bay'
    ? bays.flatMap((bayRecord) => getSortedBins(bayRecord.id))
    : bin
      ? [bin]
      : [];

  const ancestors = [
    unit ? {
      id: unit.id,
      type: 'unit',
      typeLabel: 'Unit',
      code: unit.unit_code,
      label: unit.name,
      path: unit.unit_code,
    } : null,
    shelf ? {
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
      path: [unit?.unit_code, shelf.shelf_code].filter(Boolean).join(' / '),
    } : null,
    bay ? {
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
      path: [unit?.unit_code, shelf?.shelf_code, bay.bay_code].filter(Boolean).join(' / '),
    } : null,
    bin ? {
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
      path: [unit?.unit_code, shelf?.shelf_code, bay?.bay_code, bin.bin_code].filter(Boolean).join(' / '),
    } : null,
  ].filter(Boolean);

  return {
    scopeType,
    locationRecord,
    unit,
    shelf,
    bay,
    bin,
    shelves,
    bays,
    bins,
    ancestors,
  };
}

function getScanRowsForBin(bin, rows) {
  if (!bin) return [];
  return rows.filter((row) => row.bin_id === bin.id);
}

function getRowsForScanScope(model, rows) {
  if (!model?.locationRecord) return [];
  return getRowsForLocation(model.locationRecord, rows);
}

function getCountPathFiltersForBin(binId, countSheet) {
  const bin = countSheet.bins.find((record) => record.id === binId);
  if (!bin) return null;

  const bay = countSheet.bays.find((record) => record.id === bin.bay_id) ?? null;
  const shelf = bay ? countSheet.shelves.find((record) => record.id === bay.shelf_id) ?? null : null;
  const storageUnit = shelf ? countSheet.storageUnits.find((record) => record.id === shelf.unit_id) ?? null : null;

  return {
    storage_unit_id: storageUnit?.id ?? '',
    shelf_id: shelf?.id ?? '',
    bay_id: bay?.id ?? '',
    bin_id: bin.id,
  };
}

function formatQuantitySummary(value) {
  const numericValue = Number(value ?? 0);
  if (Number.isInteger(numericValue)) return String(numericValue);
  return numericValue.toFixed(2).replace(/\.?0+$/, '');
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getMaterialDisplayName(row) {
  return String(row?.item_name || row?.material_name || row?.description || row?.material_code || '').trim().replace(/\s+/g, ' ');
}

function joinMaterialNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function getMaterialContentsSummary(rows, recordType) {
  const namesByKey = new Map();

  rows.forEach((row) => {
    const name = getMaterialDisplayName(row);
    if (!name) return;
    const key = normalizeSearchText(name);
    const existing = namesByKey.get(key) ?? {
      name,
      quantity: 0,
      rows: 0,
    };
    existing.quantity += Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
    existing.rows += 1;
    namesByKey.set(key, existing);
  });

  const materials = Array.from(namesByKey.values())
    .sort((first, second) => second.quantity - first.quantity || first.name.localeCompare(second.name));

  if (!materials.length) return '';

  if (recordType === 'bin') {
    if (materials.length === 1) return materials[0].name;
    if (materials.length <= 3) return joinMaterialNames(materials.map((material) => material.name));
    return `${materials.slice(0, 2).map((material) => material.name).join(', ')} + ${materials.length - 2} more`;
  }

  if (materials.length <= 2) return joinMaterialNames(materials.map((material) => material.name));
  return `${materials.slice(0, 2).map((material) => material.name).join(', ')} + ${materials.length - 2} more`;
}

function getHierarchySummary(record, locationSheet) {
  if (!record) return '';

  const rows = getRowsForLocation(record, locationSheet.rows);
  const rowCount = rows.length;
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? row.system_quantity ?? 0), 0);
  const stockedItemCount = new Set(rows.map((row) => row.item_id ?? row.material_code ?? row.bin_item_id)).size;
  const piecesText = `${formatQuantitySummary(totalQuantity)} total pieces`;
  const materialSummary = getMaterialContentsSummary(rows, record.type);

  const parts = [];

  if (record.type === 'unit') {
    const shelves = locationSheet.shelves.filter((shelf) => shelf.unit_id === record.id);
    const shelfIds = new Set(shelves.map((shelf) => shelf.id));
    const bays = locationSheet.bays.filter((bay) => shelfIds.has(bay.shelf_id));
    const bayIds = new Set(bays.map((bay) => bay.id));
    const bins = locationSheet.bins.filter((bin) => bayIds.has(bin.bay_id));
    parts.push(pluralize(shelves.length, 'shelf', 'shelves'));
    parts.push(pluralize(bins.length, 'bin'));
  } else if (record.type === 'shelf') {
    const bays = locationSheet.bays.filter((bay) => bay.shelf_id === record.id);
    const bayIds = new Set(bays.map((bay) => bay.id));
    const bins = locationSheet.bins.filter((bin) => bayIds.has(bin.bay_id));
    parts.push(pluralize(bays.length, 'bay', 'bays'));
    parts.push(pluralize(bins.length, 'bin'));
  } else if (record.type === 'bay') {
    const bins = locationSheet.bins.filter((bin) => bin.bay_id === record.id);
    parts.push(pluralize(bins.length, 'bin'));
  }

  if (rowCount) {
    if (materialSummary) parts.push(materialSummary);
    parts.push(pluralize(stockedItemCount || rowCount, 'stocked item'));
    parts.push(piecesText);
  } else {
    parts.push(record.type === 'bin' ? 'Empty' : 'No stocked material');
  }

  return parts.join(' / ');
}

function buildManualLocationLookupRecords(storageUnits, shelves, bays, bins) {
  const unitById = new Map(storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(bays.map((bay) => [bay.id, bay]));

  const unitRecords = storageUnits.map((unit) => {
    const compactCode = getLocationSegment(unit.unit_code);
    return {
      id: unit.id,
      type: 'unit',
      typeLabel: 'Unit',
      code: unit.unit_code,
      label: unit.name,
      path: unit.unit_code,
      lookupCodes: [unit.unit_code, compactCode],
    };
  });

  const shelfRecords = shelves.map((shelf) => {
    const unit = unitById.get(shelf.unit_id) ?? {};
    const unitCode = getLocationSegment(unit.unit_code);
    const shelfCode = getLocationSegment(shelf.shelf_code, unitCode);
    const compactCode = `${unitCode}${shelfCode}`;
    return {
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
      path: [unit.unit_code, shelf.shelf_code].filter(Boolean).join(' / '),
      lookupCodes: [shelf.shelf_code, compactCode],
    };
  });

  const bayRecords = bays.map((bay) => {
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};
    const unitCode = getLocationSegment(unit.unit_code);
    const shelfCode = getLocationSegment(shelf.shelf_code, unitCode);
    const bayCode = getLocationSegment(bay.bay_code, `${unitCode}${shelfCode}`);
    const compactCode = `${unitCode}${shelfCode}${bayCode}`;
    return {
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
      path: [unit.unit_code, shelf.shelf_code, bay.bay_code].filter(Boolean).join(' / '),
      lookupCodes: [bay.bay_code, compactCode],
    };
  });

  const binRecords = bins.map((bin) => {
    const bay = bayById.get(bin.bay_id) ?? {};
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};
    const unitCode = getLocationSegment(unit.unit_code);
    const shelfCode = getLocationSegment(shelf.shelf_code, unitCode);
    const bayCode = getLocationSegment(bay.bay_code, `${unitCode}${shelfCode}`);
    const binCode = getLocationSegment(bin.bin_code, `${unitCode}${shelfCode}${bayCode}`);
    const compactCode = `${unitCode}${shelfCode}${bayCode}${binCode}`;
    return {
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
      path: [unit.unit_code, shelf.shelf_code, bay.bay_code, bin.bin_code].filter(Boolean).join(' / '),
      lookupCodes: [bin.bin_code, compactCode],
    };
  });

  return [...unitRecords, ...shelfRecords, ...bayRecords, ...binRecords];
}

function isManualLocationCodeInput(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue || /[/:?#]/.test(rawValue) || /\s/.test(rawValue)) return false;
  return /^[a-z0-9-]+$/i.test(rawValue);
}

function getManualLocationCodeMatches(value, locationSheet) {
  if (!isManualLocationCodeInput(value)) return [];

  const normalizedValue = normalizeLocationSegment(value);
  if (!normalizedValue) return [];

  const records = buildManualLocationLookupRecords(
    locationSheet.storageUnits,
    locationSheet.shelves,
    locationSheet.bays,
    locationSheet.bins,
  );
  const matches = records.filter((record) =>
    record.lookupCodes.some((code) => normalizeLocationSegment(code) === normalizedValue),
  );
  const uniqueMatches = new Map();
  matches.forEach((match) => uniqueMatches.set(match.id, match));

  const typeOrder = { unit: 1, shelf: 2, bay: 3, bin: 4 };
  return Array.from(uniqueMatches.values())
    .sort((first, second) =>
      (typeOrder[first.type] ?? 99) - (typeOrder[second.type] ?? 99)
      || String(first.path ?? '').localeCompare(String(second.path ?? '')),
    );
}

function matchesCountRowSearch(row, searchText) {
  const queryTokens = tokenizeSearchText(searchText);
  if (!queryTokens.length) return true;

  const compactSearch = normalizeLocationSegment(searchText);
  const compactLocationCode = buildCompactLocationCode(row);
  const tokenMatch = matchesTokenizedSearch([...getCountRowSearchValues(row), compactLocationCode], searchText);
  const compactLocationMatch = compactSearch ? compactLocationCode.startsWith(compactSearch) : false;

  return tokenMatch || compactLocationMatch;
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

function GrandMasterOverviewPanel({ permissions }) {
  const canReadOverview = permissions.permissionSource === 'server';
  const countSheet = useInventoryCountSheet({ enabled: canReadOverview });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    storage_unit_id: '',
    shelf_id: '',
    bay_id: '',
    bin_id: '',
    category: '',
    division: '',
    stockStatus: '',
  });
  const grandMaster = useMemo(() => buildGrandMasterRows(countSheet), [countSheet]);
  const rows = grandMaster.rows;
  const categoryOptions = rows
    .reduce((options, row) => {
      if (!row.categoryLabel || options.some((option) => option.value === row.categoryLabel)) return options;
      return [...options, { value: row.categoryLabel, label: row.categoryLabel }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const divisionOptions = rows
    .reduce((options, row) => {
      const value = row.division || 'Unassigned';
      if (options.some((option) => option.value === value)) return options;
      return [...options, { value, label: value }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const storageUnitOptions = countSheet.storageUnits
    .map((unit) => ({
      value: unit.id,
      label: `${unit.unit_code}${unit.name ? ` / ${unit.name}` : ''}`,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const shelfOptions = countSheet.shelves
    .map((shelf) => ({ value: shelf.id, label: shelf.shelf_code || shelf.label || shelf.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const bayOptions = countSheet.bays
    .map((bay) => ({ value: bay.id, label: bay.bay_code || bay.label || bay.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const binOptions = countSheet.bins
    .map((bin) => ({ value: bin.id, label: bin.bin_code || bin.label || bin.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const filteredRows = rows.filter((row) => {
    if (filters.storage_unit_id && row.storage_unit_id !== filters.storage_unit_id) return false;
    if (filters.shelf_id && row.shelf_id !== filters.shelf_id) return false;
    if (filters.bay_id && row.bay_id !== filters.bay_id) return false;
    if (filters.bin_id && row.bin_id !== filters.bin_id) return false;
    if (filters.category && row.categoryLabel !== filters.category) return false;
    if (filters.division && (row.division || 'Unassigned') !== filters.division) return false;
    if (filters.stockStatus && row.stockStatus !== filters.stockStatus) return false;
    return matchesGrandMasterSearch(row, search);
  });
  const totalQuantity = rows
    .filter((row) => row.rowType === 'item' && row.quantity > 0)
    .reduce((sum, row) => sum + row.quantity, 0);
  const knownStoredValue = rows
    .filter((row) => row.rowType === 'item' && row.extendedValue !== null && row.quantity > 0)
    .reduce((sum, row) => sum + row.extendedValue, 0);
  const knownValueRows = rows.filter((row) => row.rowType === 'item' && row.extendedValue !== null).length;
  const stockedRows = rows.filter((row) => row.rowType === 'item' && row.quantity > 0).length;
  const emptyLocations = Math.max(countSheet.bins.length - grandMaster.positiveBinIds.size, 0);

  function clearFilters() {
    setSearch('');
    setFilters({
      storage_unit_id: '',
      shelf_id: '',
      bay_id: '',
      bin_id: '',
      category: '',
      division: '',
      stockStatus: '',
    });
  }

  if (!canReadOverview) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Grand Master</p>
            <h3>Inventory Overview</h3>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
        <p>Grand Master inventory uses the existing server-authorized inventory read path.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel grand-master-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Grand Master</p>
          <h3>Inventory Overview</h3>
          <p>
            Read-only operational view from the existing inventory count/read path. Search and filters only change this display.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
          {countSheet.isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {countSheet.error ? (
        <div className="alert">Grand Master inventory failed to load through the existing authorized read path.</div>
      ) : null}
      {countSheet.isLoading ? <p className="muted">Loading Grand Master inventory...</p> : null}

      <div className="count-grid grand-master-summary">
        <CountCard label="Stocked locations" value={grandMaster.positiveBinIds.size} />
        <CountCard label="Empty locations" value={emptyLocations} />
        <CountCard label="Total stocked rows" value={stockedRows} />
        <CountCard label="Total quantity" value={formatQuantitySummary(totalQuantity)} />
        <CountCard label="Known stored value" value={formatMoney(knownValueRows ? knownStoredValue : null)} />
        <CountCard label="Visible rows" value={filteredRows.length} />
      </div>

      <div className="count-toolbar grand-master-toolbar">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, code, C111, bin, path, part number, or description"
          />
        </label>
        <label>
          Unit
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
        <label>
          Division
          <select value={filters.division} onChange={(event) => setFilters((current) => ({ ...current, division: event.target.value }))}>
            <option value="">All visible divisions</option>
            {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Stock status
          <select value={filters.stockStatus} onChange={(event) => setFilters((current) => ({ ...current, stockStatus: event.target.value }))}>
            <option value="">Stocked and empty</option>
            <option value="stocked">Stocked only</option>
            <option value="empty">Empty / zero only</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="cart-facts count-summary">
        <span>Loaded bin/material rows: {countSheet.rows.length}</span>
        <span>Loaded bins: {countSheet.bins.length}</span>
        <span>Last updated: {countSheet.lastLoadedAt ? new Date(countSheet.lastLoadedAt).toLocaleString() : 'not loaded yet'}</span>
        <span>Sync health: client last-loaded only</span>
        <span>Cost visibility: authorized inventory row scope</span>
        <span>Writes from this view: none</span>
      </div>

      {filteredRows.length ? (
        <>
          <div className="table-wrap grand-master-table-wrap">
            <table className="data-table grand-master-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Location</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Ext. Value</th>
                  <th>Division</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.item_name}</strong>
                      <span>{row.material_code || 'No material code'}</span>
                      {row.description ? <span>{row.description}</span> : null}
                    </td>
                    <td>
                      <strong>{row.bin_code || 'No bin code'}</strong>
                      <span>{row.locationPath || buildStoragePath(row) || 'No location path'}</span>
                      <span>{[row.storage_unit_name, row.shelf_label, row.bay_label, row.bin_label].filter(Boolean).join(' / ') || 'No location label'}</span>
                    </td>
                    <td>{row.categoryLabel || '-'}</td>
                    <td>{row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '-'}</td>
                    <td>{formatMoney(row.unitCost)}</td>
                    <td>{formatMoney(row.extendedValue)}</td>
                    <td>{row.division || 'Unassigned'}</td>
                    <td>
                      <span className={row.stockStatus === 'stocked' ? 'status-pill status-pill--good' : 'status-pill'}>
                        {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-list grand-master-mobile-list">
            {filteredRows.map((row) => (
              <article className="mobile-item" key={row.id}>
                <strong>{row.item_name}</strong>
                <span>{row.material_code || 'No material code'} / {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}</span>
                <div className="meta-grid">
                  <span>Path: {row.locationPath || buildStoragePath(row) || 'No location path'}</span>
                  <span>Qty: {row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '-'}</span>
                  <span>Unit cost: {formatMoney(row.unitCost)}</span>
                  <span>Value: {formatMoney(row.extendedValue)}</span>
                  <span>Category: {row.categoryLabel || '-'}</span>
                  <span>Division: {row.division || 'Unassigned'}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title="No Grand Master rows match">
          No authorized inventory rows or empty bins match the current overview filters.
        </EmptyState>
      )}
    </section>
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
                  <small>{record.label || record.division || 'No display label'} / {getHierarchySummary(record, locationSheet)}</small>
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

function getLabelDraftFromTemplate(template) {
  const averyTemplate = template?.avery_template || '5164';
  return {
    id: template?.id ?? '',
    name: template?.name ?? 'New Location Label Template',
    avery_template: averyTemplate,
    scope_level: template?.scope_level ?? '',
    include_qr: template?.include_qr ?? true,
    layout: {
      ...createDefaultLabelLayout(averyTemplate),
      ...(template?.layout ?? {}),
      geometry: AVERY_LABEL_TEMPLATES[averyTemplate] ?? AVERY_LABEL_TEMPLATES['5164'],
      fields: {
        ...createDefaultLabelLayout(averyTemplate).fields,
        ...(template?.layout?.fields ?? {}),
      },
    },
  };
}

function LabelPreview({ draft, locationRecord, summary }) {
  const geometry = AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'];
  const fields = draft.layout?.fields ?? DEFAULT_LABEL_FIELDS;
  const qrSvg = locationRecord && draft.include_qr && fields.qr?.enabled
    ? buildLocationQrSvg(locationRecord.id)
    : '';
  const values = getLabelValues(locationRecord, summary);

  function fieldStyle(field) {
    return {
      left: `${field.x ?? 0}%`,
      top: `${field.y ?? 0}%`,
      width: `${field.width ?? 20}%`,
      height: `${field.height ?? 12}%`,
      color: field.color ?? '#111827',
      textAlign: field.align ?? 'left',
      fontWeight: field.bold ? 800 : 500,
      textDecoration: field.underline ? 'underline' : 'none',
      opacity: field.opacity ?? 1,
    };
  }

  return (
    <div className="label-preview-shell">
      <div
        className="label-preview-surface"
        style={{ aspectRatio: `${geometry.label.width} / ${geometry.label.height}` }}
      >
        {qrSvg ? (
          <div
            className="label-preview-qr"
            style={fieldStyle(fields.qr)}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : null}
        {LABEL_FIELD_OPTIONS.filter((field) => field.key !== 'qr').map((fieldOption) => {
          const field = fields[fieldOption.key];
          if (!field?.enabled) return null;
          return (
            <div className="label-preview-field" key={fieldOption.key} style={fieldStyle(field)}>
              {values[fieldOption.key]}
            </div>
          );
        })}
      </div>
      <div className="label-preview-meta">
        <span>{geometry.label.width}in x {geometry.label.height}in / {geometry.rows} rows / {geometry.columns} columns</span>
        <span>{formatAveryGeometryDetails(geometry)}</span>
        <span>QR payload: {locationRecord ? buildLocationQrUrl(locationRecord.id) : '/scan/location/<uuid>'}</span>
      </div>
    </div>
  );
}

function createToolDraft(row = null) {
  if (!row) return { ...EMPTY_TOOL_DRAFT };
  return {
    name: row.name ?? '',
    tool_number: row.tool_number ?? '',
    category: row.category ?? '',
    brand: row.brand ?? '',
    model: row.model ?? '',
    serial_number: row.serial_number ?? '',
    description: row.description ?? '',
    condition: row.condition ?? '',
    status: row.status ?? 'active',
    home_location: row.home_location ?? '',
    current_location: row.current_location ?? '',
    assigned_to: row.assigned_to ?? '',
    purchase_date: row.purchase_date ?? '',
    notes: row.notes ?? '',
  };
}

function cleanToolText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function buildToolMutationPayload(draft) {
  return {
    name: String(draft.name ?? '').trim(),
    tool_number: cleanToolText(draft.tool_number),
    category: cleanToolText(draft.category),
    brand: cleanToolText(draft.brand),
    model: cleanToolText(draft.model),
    serial_number: cleanToolText(draft.serial_number),
    description: cleanToolText(draft.description),
    condition: draft.condition || null,
    status: TOOL_STATUS_OPTIONS.includes(draft.status) ? draft.status : 'active',
    home_location: cleanToolText(draft.home_location),
    current_location: cleanToolText(draft.current_location),
    assigned_to: cleanToolText(draft.assigned_to),
    purchase_date: draft.purchase_date || null,
    notes: cleanToolText(draft.notes),
  };
}

function formatToolValue(value) {
  return value || '-';
}

function formatToolDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getToolBadgeClass(value) {
  const toneByValue = {
    active: 'ok',
    good: 'ok',
    inactive: 'info',
    unknown: 'info',
    fair: 'warn',
    poor: 'warn',
    retired: 'warn',
    damaged: 'err',
    missing: 'err',
  };
  const tone = toneByValue[String(value ?? '').toLowerCase()] ?? 'info';
  return `status-pill tool-catalogue__badge tool-catalogue__badge--${tone}`;
}

function filterToolRows(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.category && (row.category || '') !== filters.category) return false;
    if (filters.status && (row.status || '') !== filters.status) return false;
    if (filters.condition && (row.condition || '') !== filters.condition) return false;
    if (!search) return true;
    return TOOL_SEARCH_FIELDS.some((field) => String(row[field] ?? '').toLowerCase().includes(search));
  });
}

function getToolFilterOptions(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))]
    .sort((first, second) => String(first).localeCompare(String(second)));
}

function ToolCataloguePanel({ permissions, designPreviewEnabled = false }) {
  const { getToken } = useAuth();
  const canReadTools = permissions.permissionSource === 'server';
  const canWriteTools = canReadTools && permissions.canManageInventory;
  const hasWritableDivision = Boolean(permissions.division);
  const [tools, setTools] = useState([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [isSavingTool, setIsSavingTool] = useState(false);
  const [toolsError, setToolsError] = useState(null);
  const [toolMessage, setToolMessage] = useState('');
  const [showArchivedTools, setShowArchivedTools] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState('');
  const [draft, setDraft] = useState(() => createToolDraft());
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    status: '',
    condition: '',
  });
  const selectedTool = tools.find((row) => row.id === selectedToolId) ?? null;
  const categoryOptions = useMemo(() => getToolFilterOptions(tools, 'category'), [tools]);
  const filteredTools = useMemo(() => filterToolRows(tools, filters), [tools, filters]);
  const toolCatalogueClassName = designPreviewEnabled
    ? 'cart-panel tool-catalogue tool-catalogue-skin'
    : 'cart-panel tool-catalogue';

  async function loadTools({ preserveMessage = false } = {}) {
    if (!canReadTools) return;

    setIsLoadingTools(true);
    setToolsError(null);
    if (!preserveMessage) setToolMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      let query = client
        .from('tools')
        .select(TOOL_CATALOGUE_SELECT_FIELDS)
        .order('name', { ascending: true });
      if (!showArchivedTools) query = query.is('archived_at', null);
      const { data, error } = await query;
      if (error) throw error;
      setTools(data ?? []);
    } catch (error) {
      console.error('Tool Catalogue load failed', error);
      setTools([]);
      setToolsError(error);
    } finally {
      setIsLoadingTools(false);
    }
  }

  useEffect(() => {
    loadTools();
  }, [canReadTools, getToken, showArchivedTools]);

  useEffect(() => {
    if (selectedToolId && !tools.some((row) => row.id === selectedToolId)) {
      setSelectedToolId('');
      setDraft(createToolDraft());
    }
  }, [selectedToolId, tools]);

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function startNewTool() {
    setSelectedToolId('');
    setDraft(createToolDraft());
    setToolMessage('');
  }

  function startEditTool(row) {
    if (!canWriteTools || row.division !== permissions.division) {
      setToolMessage('Tool edit is limited to the current user division.');
      return;
    }
    setSelectedToolId(row.id);
    setDraft(createToolDraft(row));
    setToolMessage('');
  }

  async function saveTool(event) {
    event.preventDefault();
    if (!canWriteTools || isSavingTool) return;
    if (!hasWritableDivision) {
      setToolMessage('Tool save blocked because the current user division could not be determined from server permissions.');
      return;
    }
    if (selectedTool && selectedTool.division !== permissions.division) {
      setToolMessage('Tool save blocked because this row is outside the current user division.');
      return;
    }

    const payload = buildToolMutationPayload(draft);
    if (!payload.name) {
      setToolMessage('Tool name is required.');
      return;
    }

    setIsSavingTool(true);
    setToolMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);

      if (selectedToolId) {
        const { error } = await client
          .from('tools')
          .update(payload)
          .eq('id', selectedToolId);
        if (error) throw error;
        await loadTools({ preserveMessage: true });
        setToolMessage('Tool saved.');
      } else {
        const { data, error } = await client
          .from('tools')
          .insert({ division: permissions.division, ...payload })
          .select('id')
          .single();
        if (error) throw error;
        setSelectedToolId(data?.id ?? '');
        setDraft(createToolDraft());
        await loadTools({ preserveMessage: true });
        setToolMessage('Tool added.');
      }
    } catch (error) {
      console.error('Tool Catalogue save failed', error);
      setToolMessage('Tool save failed. Confirm permissions, division scope, and the Tool Catalogue migration.');
    } finally {
      setIsSavingTool(false);
    }
  }

  async function archiveTool(row) {
    if (!canWriteTools || isSavingTool || !row?.id || row.archived_at) return;
    if (row.division !== permissions.division) {
      setToolMessage('Tool archive is limited to the current user division.');
      return;
    }
    const reason = window.prompt('Archive reason (optional)') ?? '';

    setIsSavingTool(true);
    setToolMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('tools')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: permissions.userId,
          archive_reason: cleanToolText(reason),
          status: 'retired',
        })
        .eq('id', row.id);
      if (error) throw error;

      if (selectedToolId === row.id) startNewTool();
      await loadTools({ preserveMessage: true });
      setToolMessage('Tool archived.');
    } catch (error) {
      console.error('Tool Catalogue archive failed', error);
      setToolMessage('Tool archive failed. Confirm permissions and division scope.');
    } finally {
      setIsSavingTool(false);
    }
  }

  if (!canReadTools) {
    return (
      <section className={`${toolCatalogueClassName} cart-panel--locked`}>
        <div className="card__header">
          <div>
            <p className="eyebrow">Tool Catalogue</p>
            <h3>Tool Catalogue</h3>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
        <p>{TOOL_CATALOGUE_HELPER_COPY}</p>
      </section>
    );
  }

  return (
    <section className={toolCatalogueClassName}>
      <div className="card__header">
        <div>
          <p className="eyebrow">Tool Catalogue</p>
          <h3>Tool Catalogue</h3>
          <p>{TOOL_CATALOGUE_HELPER_COPY}</p>
        </div>
        <Wrench className="card__icon" aria-hidden="true" />
      </div>

      <div className="location-note tool-catalogue__note">
        <Wrench aria-hidden="true" />
        <span>{TOOL_CATALOGUE_HELPER_COPY}</span>
      </div>

      {toolsError ? <div className="alert">Tool Catalogue failed to load. Confirm server permissions and the `public.tools` migration.</div> : null}
      {!hasWritableDivision ? <div className="alert">Tool create/edit is blocked because the current user division could not be determined from server permissions.</div> : null}
      {toolMessage ? <div className="alert">{toolMessage}</div> : null}

      <div className="tool-catalogue__layout">
        <section className="tool-catalogue__list-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Catalogue</p>
              <h3>{showArchivedTools ? 'Visible tools' : 'Active tools'}</h3>
            </div>
            <span>{filteredTools.length} row{filteredTools.length === 1 ? '' : 's'}</span>
          </div>

          <div className="tool-toolbar">
            <label>
              Search
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </label>
            <label>
              Category
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                <option value="">All categories</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">All statuses</option>
                {TOOL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Condition
              <select value={filters.condition} onChange={(event) => setFilters((current) => ({ ...current, condition: event.target.value }))}>
                <option value="">All conditions</option>
                {TOOL_CONDITION_OPTIONS.filter(Boolean).map((condition) => <option key={condition} value={condition}>{condition}</option>)}
              </select>
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={showArchivedTools} onChange={(event) => setShowArchivedTools(event.target.checked)} />
              Show archived
            </label>
            <button type="button" className="secondary-button" onClick={() => loadTools()} disabled={isLoadingTools}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </div>

          {isLoadingTools ? <p className="muted">Loading Tool Catalogue...</p> : null}
          {!isLoadingTools && !filteredTools.length ? (
            <div className="empty-state">
              <strong>No tools have been added yet.</strong>
              <p>{TOOL_CATALOGUE_EMPTY_NOTE}</p>
            </div>
          ) : null}

          {filteredTools.length ? (
            <>
              <div className="table-wrap">
                <table className="data-table tool-table">
                  <thead>
                    <tr>
                      <th>Tool #</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Brand</th>
                      <th>Model</th>
                      <th>Serial #</th>
                      <th>Condition</th>
                      <th>Status</th>
                      <th>Home Location</th>
                      <th>Current Location</th>
                      <th>Assigned To</th>
                      <th>Purchase Date</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTools.map((row) => (
                      <tr key={row.id} className={row.archived_at ? 'tool-row--archived' : ''}>
                        <td>{formatToolValue(row.tool_number)}</td>
                        <td>
                          <strong>{row.name}</strong>
                          {row.description ? <span>{row.description}</span> : null}
                        </td>
                        <td>{formatToolValue(row.category)}</td>
                        <td>{formatToolValue(row.brand)}</td>
                        <td>{formatToolValue(row.model)}</td>
                        <td>{formatToolValue(row.serial_number)}</td>
                        <td>{designPreviewEnabled && row.condition ? <span className={getToolBadgeClass(row.condition)}>{row.condition}</span> : formatToolValue(row.condition)}</td>
                        <td><span className={designPreviewEnabled ? getToolBadgeClass(row.status) : 'status-pill'}>{row.status}</span></td>
                        <td>{formatToolValue(row.home_location)}</td>
                        <td>{formatToolValue(row.current_location)}</td>
                        <td>{formatToolValue(row.assigned_to)}</td>
                        <td>{formatToolDate(row.purchase_date)}</td>
                        <td>{formatToolValue(row.notes)}</td>
                        <td>
                          <div className="count-action-stack">
                            <button type="button" className="secondary-button" onClick={() => startEditTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division}>
                              <Pencil aria-hidden="true" /> Edit
                            </button>
                            <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division || Boolean(row.archived_at)}>
                              <Archive aria-hidden="true" /> Archive
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-list tool-mobile-list">
                {filteredTools.map((row) => (
                  <article className="mobile-item" key={row.id}>
                    <strong>{row.name}</strong>
                    <div className="meta-grid">
                      <span>Tool #: {formatToolValue(row.tool_number)}</span>
                      <span>Category: {formatToolValue(row.category)}</span>
                      <span>Brand: {formatToolValue(row.brand)}</span>
                      <span>Model: {formatToolValue(row.model)}</span>
                      <span>Serial #: {formatToolValue(row.serial_number)}</span>
                      <span>Condition: {designPreviewEnabled && row.condition ? <span className={getToolBadgeClass(row.condition)}>{row.condition}</span> : formatToolValue(row.condition)}</span>
                      <span>Status: {designPreviewEnabled ? <span className={getToolBadgeClass(row.status)}>{formatToolValue(row.status)}</span> : formatToolValue(row.status)}</span>
                      <span>Home: {formatToolValue(row.home_location)}</span>
                      <span>Current: {formatToolValue(row.current_location)}</span>
                      <span>Assigned: {formatToolValue(row.assigned_to)}</span>
                      <span>Purchase: {formatToolDate(row.purchase_date)}</span>
                      <span>Notes: {formatToolValue(row.notes)}</span>
                    </div>
                    <div className="cart-actions">
                      <button type="button" className="secondary-button" onClick={() => startEditTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division}>
                        <Pencil aria-hidden="true" /> Edit
                      </button>
                      <button type="button" className="secondary-button secondary-button--danger" onClick={() => archiveTool(row)} disabled={!canWriteTools || isSavingTool || row.division !== permissions.division || Boolean(row.archived_at)}>
                        <Archive aria-hidden="true" /> Archive
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="tool-catalogue__form-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">{selectedTool ? 'Edit Tool' : 'Add Tool'}</p>
              <h3>{selectedTool ? selectedTool.name : 'Add tool'}</h3>
            </div>
            <span>{canWriteTools ? `Division: ${permissions.division ?? 'Unassigned'}` : 'can_manage_inventory required'}</span>
          </div>

          <form className="tool-form" onSubmit={saveTool}>
            <label className="tool-form__wide">
              Name
              <input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} disabled={!canWriteTools || isSavingTool} />
            </label>
            {TOOL_TEXT_FORM_FIELDS.map((field) => (
              <label key={field.key}>
                {field.label}
                <input value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!canWriteTools || isSavingTool} />
              </label>
            ))}
            <label>
              Condition
              <select value={draft.condition} onChange={(event) => updateDraft('condition', event.target.value)} disabled={!canWriteTools || isSavingTool}>
                {TOOL_CONDITION_OPTIONS.map((condition) => (
                  <option key={condition || 'blank'} value={condition}>{condition || 'blank'}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)} disabled={!canWriteTools || isSavingTool}>
                {TOOL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Purchase Date
              <input type="date" value={draft.purchase_date} onChange={(event) => updateDraft('purchase_date', event.target.value)} disabled={!canWriteTools || isSavingTool} />
            </label>
            {TOOL_TEXTAREA_FORM_FIELDS.map((field) => (
              <label className="tool-form__wide" key={field.key}>
                {field.label}
                <textarea value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} disabled={!canWriteTools || isSavingTool} />
              </label>
            ))}
            <div className="cart-actions tool-form__wide">
              <button type="submit" className="secondary-button" disabled={!canWriteTools || !hasWritableDivision || isSavingTool}>
                <Plus aria-hidden="true" /> {isSavingTool ? 'Saving...' : selectedTool ? 'Save Tool' : 'Add Tool'}
              </button>
              <button type="button" className="secondary-button" onClick={startNewTool} disabled={isSavingTool}>
                New Tool
              </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}

function LabelTemplateDesignerPanel({ permissions }) {
  const canReadLabels = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const canManageTemplates = canReadLabels && isDeveloperOrAdminRole(permissions.role);
  const { getToken } = useAuth();
  const locationSheet = useInventoryCountSheet({ enabled: canReadLabels });
  const [templates, setTemplates] = useState([]);
  const [templatesError, setTemplatesError] = useState(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedFieldKey, setSelectedFieldKey] = useState('code');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [draft, setDraft] = useState(() => getLabelDraftFromTemplate(null));
  const locationRecords = useMemo(
    () => buildLocationRecords(
      locationSheet.storageUnits,
      locationSheet.shelves,
      locationSheet.bays,
      locationSheet.bins,
    ),
    [locationSheet.storageUnits, locationSheet.shelves, locationSheet.bays, locationSheet.bins],
  );
  const scopedLocationRecords = locationRecords.filter((record) => !draft.scope_level || record.type === draft.scope_level);
  const selectedLocation =
    scopedLocationRecords.find((record) => record.id === selectedLocationId) ??
    scopedLocationRecords[0] ??
    null;
  const selectedTemplate = templates.find((row) => row.id === selectedTemplateId) ?? null;
  const selectedTemplateIsArchived = Boolean(selectedTemplate?.archived_at);
  const selectedField = draft.layout.fields[selectedFieldKey] ?? draft.layout.fields.code;
  const selectedSummary = selectedLocation ? getHierarchySummary(selectedLocation, locationSheet) : '';
  const scopeWarning = getScopeWarning(draft);

  async function loadTemplates({ preserveMessage = false, archived = showArchivedTemplates } = {}) {
    if (!canReadLabels) return;

    setIsLoadingTemplates(true);
    setTemplatesError(null);
    if (!preserveMessage) setTemplateMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      let query = client
        .from('label_templates')
        .select('id,name,avery_template,scope_level,include_qr,layout,created_by,created_at,archived_at')
        .order('name', { ascending: true });
      query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
      const { data, error } = await query;

      if (error) throw error;
      setTemplates(data ?? []);
    } catch (error) {
      console.warn('Label templates unavailable', error);
      setTemplates([]);
      setTemplatesError(error);
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, [canReadLabels, getToken, showArchivedTemplates]);

  useEffect(() => {
    if (!scopedLocationRecords.length) {
      if (selectedLocationId) setSelectedLocationId('');
      return;
    }

    if (!selectedLocationId || !scopedLocationRecords.some((record) => record.id === selectedLocationId)) {
      setSelectedLocationId(scopedLocationRecords[0].id);
    }
  }, [scopedLocationRecords, selectedLocationId]);

  function updateDraft(updates) {
    setDraft((current) => ({
      ...current,
      ...updates,
      layout: updates.avery_template
        ? {
            ...current.layout,
            geometry: AVERY_LABEL_TEMPLATES[updates.avery_template] ?? current.layout.geometry,
          }
        : current.layout,
    }));
  }

  function updateField(fieldKey, updates) {
    setDraft((current) => ({
      ...current,
      layout: {
        ...current.layout,
        fields: {
          ...current.layout.fields,
          [fieldKey]: {
            ...current.layout.fields[fieldKey],
            ...updates,
          },
        },
      },
    }));
  }

  function selectTemplate(templateId) {
    setSelectedTemplateId(templateId);
    const template = templates.find((row) => row.id === templateId);
    setDraft(getLabelDraftFromTemplate(template));
    setTemplateMessage('');
  }

  function startNewTemplate() {
    setShowArchivedTemplates(false);
    setSelectedTemplateId('');
    setDraft(getLabelDraftFromTemplate(null));
    setTemplateMessage('');
  }

  function updateAveryTemplate(averyTemplate) {
    setDraft((current) => {
      const nextScope =
        averyTemplate === '8160'
          ? 'bin'
          : current.scope_level === 'bin'
            ? ''
            : current.scope_level;
      return {
        ...current,
        avery_template: averyTemplate,
        scope_level: nextScope,
        layout: {
          ...current.layout,
          geometry: AVERY_LABEL_TEMPLATES[averyTemplate] ?? current.layout.geometry,
        },
      };
    });
  }

  async function saveTemplate() {
    if (!canManageTemplates) return;
    const name = draft.name.trim();
    if (!name) {
      setTemplateMessage('Template name is required.');
      return;
    }

    setIsSavingTemplate(true);
    setTemplateMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const payload = {
        name,
        avery_template: draft.avery_template,
        scope_level: draft.scope_level || null,
        include_qr: draft.include_qr,
        layout: {
          ...draft.layout,
          geometry: AVERY_LABEL_TEMPLATES[draft.avery_template] ?? AVERY_LABEL_TEMPLATES['5164'],
        },
      };

      if (selectedTemplateId) {
        const { error } = await client
          .from('label_templates')
          .update(payload)
          .eq('id', selectedTemplateId);
        if (error) throw error;
        await loadTemplates({ preserveMessage: true, archived: showArchivedTemplates });
        setTemplateMessage('Template saved.');
      } else {
        const { data, error } = await client
          .from('label_templates')
          .insert({ ...payload, created_by: permissions.userId })
          .select('id')
          .single();
        if (error) throw error;
        setSelectedTemplateId(data?.id ?? '');
        setShowArchivedTemplates(false);
        await loadTemplates({ preserveMessage: true, archived: false });
        setTemplateMessage('Template created.');
      }
    } catch (error) {
      console.error('Failed to save label template', error);
      setTemplateMessage('Template save failed. Confirm the label_templates migration is applied and permissions allow template management.');
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function archiveTemplate() {
    if (!canManageTemplates || !selectedTemplateId) return;

    setIsSavingTemplate(true);
    setTemplateMessage('');

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client
        .from('label_templates')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', selectedTemplateId);
      if (error) throw error;

      startNewTemplate();
      await loadTemplates({ preserveMessage: true, archived: false });
      setTemplateMessage('Template archived.');
    } catch (error) {
      console.error('Failed to archive label template', error);
      setTemplateMessage('Template archive failed. Confirm permissions and migration status.');
    } finally {
      setIsSavingTemplate(false);
    }
  }

  function printSelectedLabel() {
    if (!selectedLocation) return;
    const ok = openLabelPrintWindow({
      draft,
      locations: [selectedLocation],
      locationSheet,
      title: `${draft.name || 'Location Label'} - ${selectedLocation.code}`,
    });
    setTemplateMessage(ok ? 'Print window opened for the selected label.' : 'Print window was blocked by the browser.');
  }

  function printScopedLabels() {
    const records = scopedLocationRecords;
    if (!records.length) return;
    const ok = openLabelPrintWindow({
      draft,
      locations: records,
      locationSheet,
      title: `${draft.name || 'Location Labels'} - ${draft.scope_level || 'all locations'}`,
    });
    setTemplateMessage(ok ? `Print window opened for ${records.length} label${records.length === 1 ? '' : 's'}.` : 'Print window was blocked by the browser.');
  }

  if (!canReadLabels) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Label Templates</p>
            <h3>Label Template Designer</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>Label preview and template controls use the existing inventory read permission gate.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel label-designer">
      <div className="card__header">
        <div>
          <p className="eyebrow">Label Templates</p>
          <h3>Label Template Designer</h3>
          <p>
            Foundation for reusable Unit, Shelf, Bay, and Bin label templates. QR content stays on the Section 10 `/scan/location/&lt;uuid&gt;` payload.
          </p>
        </div>
        <span className="status-pill status-pill--good">Preview + save foundation</span>
      </div>

      <div className="location-note">
        <QrCode aria-hidden="true" />
        <span>
          Avery 5164 supports Unit/Shelf/Bay placards. Avery 8160 supports Bin labels. Browser print uses the saved, data-driven template geometry; exact react-pdf output remains deferred.
        </span>
      </div>

      {templatesError ? (
        <div className="alert">Saved templates are unavailable until the `label_templates` migration is applied. Preview controls still work.</div>
      ) : null}
      {locationSheet.error ? <div className="alert">Location data failed to load. Label preview cannot resolve live QR payloads.</div> : null}

      <div className="label-designer-layout">
        <section className="label-control-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Template</p>
              <h3>Reusable layout</h3>
            </div>
            <span>{showArchivedTemplates ? 'Archived view' : canManageTemplates ? 'Developer/Admin' : 'Preview only'}</span>
          </div>

          <div className="label-form-grid">
            <label>
              {showArchivedTemplates ? 'Archived templates' : 'Active templates'}
              <select value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)} disabled={isLoadingTemplates || !templates.length}>
                <option value="">New unsaved template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}{template.archived_at ? ' (archived)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="count-toggle">
              <input
                type="checkbox"
                checked={showArchivedTemplates}
                onChange={(event) => {
                  setShowArchivedTemplates(event.target.checked);
                  setSelectedTemplateId('');
                  setDraft(getLabelDraftFromTemplate(null));
                  setTemplateMessage('');
                }}
              />
              Show archived
            </label>
            <label>
              Template name
              <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
            </label>
            <label>
              Avery sheet
              <select value={draft.avery_template} onChange={(event) => updateAveryTemplate(event.target.value)}>
                {Object.values(AVERY_LABEL_TEMPLATES).map((template) => (
                  <option key={template.key} value={template.key}>{formatAveryTemplateLabel(template)}</option>
                ))}
              </select>
            </label>
            <label>
              Scope level
              <select value={draft.scope_level} onChange={(event) => updateDraft({ scope_level: event.target.value })}>
                {LABEL_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Preview location
              <select value={selectedLocation?.id ?? ''} onChange={(event) => setSelectedLocationId(event.target.value)} disabled={!scopedLocationRecords.length}>
                {scopedLocationRecords.map((record) => (
                  <option key={record.id} value={record.id}>{record.typeLabel}: {record.path || record.code}</option>
                ))}
              </select>
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={draft.include_qr} onChange={(event) => updateDraft({ include_qr: event.target.checked })} />
              QR enabled
            </label>
          </div>
          <div className="label-template-status">
            <span>{templates.length} {showArchivedTemplates ? 'archived' : 'active'} template{templates.length === 1 ? '' : 's'}</span>
            <span>{AVERY_LABEL_TEMPLATES[draft.avery_template]?.scopeHint}</span>
            {scopeWarning ? <span className="status-pill status-pill--warn">{scopeWarning}</span> : null}
            {selectedTemplateIsArchived ? <span className="status-pill status-pill--warn">Archived templates are preview-only.</span> : null}
          </div>

          <div className="label-fields-panel">
            <strong>Fields</strong>
            <div className="label-field-toggles">
              {LABEL_FIELD_OPTIONS.map((field) => (
                <label className="count-toggle" key={field.key}>
                  <input
                    type="checkbox"
                    checked={draft.layout.fields[field.key]?.enabled ?? false}
                    onChange={(event) => updateField(field.key, { enabled: event.target.checked })}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>

          <div className="label-style-panel">
            <label>
              Style field
              <select value={selectedFieldKey} onChange={(event) => setSelectedFieldKey(event.target.value)}>
                {LABEL_FIELD_OPTIONS.map((field) => (
                  <option key={field.key} value={field.key}>{field.label}</option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input type="color" value={selectedField.color ?? '#111827'} onChange={(event) => updateField(selectedFieldKey, { color: event.target.value })} />
            </label>
            <label>
              Alignment
              <select value={selectedField.align ?? 'left'} onChange={(event) => updateField(selectedFieldKey, { align: event.target.value })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              Opacity
              <input type="range" min="0.2" max="1" step="0.05" value={selectedField.opacity ?? 1} onChange={(event) => updateField(selectedFieldKey, { opacity: Number(event.target.value) })} />
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={Boolean(selectedField.bold)} onChange={(event) => updateField(selectedFieldKey, { bold: event.target.checked })} />
              Bold
            </label>
            <label className="count-toggle">
              <input type="checkbox" checked={Boolean(selectedField.underline)} onChange={(event) => updateField(selectedFieldKey, { underline: event.target.checked })} />
              Underline
            </label>
          </div>

          <div className="label-layout-panel">
            <div>
              <strong>QR layout</strong>
              <p className="muted">Position and size are saved in the template layout. Values are percentages of the label.</p>
            </div>
            <label>
              X
              <input type="number" min="0" max="100" step="1" value={draft.layout.fields.qr?.x ?? 6} onChange={(event) => updateField('qr', { x: Number(event.target.value) })} />
            </label>
            <label>
              Y
              <input type="number" min="0" max="100" step="1" value={draft.layout.fields.qr?.y ?? 8} onChange={(event) => updateField('qr', { y: Number(event.target.value) })} />
            </label>
            <label>
              Width
              <input type="number" min="8" max="90" step="1" value={draft.layout.fields.qr?.width ?? 28} onChange={(event) => updateField('qr', { width: Number(event.target.value) })} />
            </label>
            <label>
              Height
              <input type="number" min="8" max="90" step="1" value={draft.layout.fields.qr?.height ?? 28} onChange={(event) => updateField('qr', { height: Number(event.target.value) })} />
            </label>
          </div>

          {canManageTemplates ? (
            <div className="cart-actions">
              <button type="button" className="secondary-button" onClick={startNewTemplate} disabled={isSavingTemplate}>New Template</button>
              <button type="button" className="secondary-button" onClick={saveTemplate} disabled={isSavingTemplate || Boolean(templatesError) || selectedTemplateIsArchived}>
                {isSavingTemplate ? 'Saving...' : 'Save Template'}
              </button>
              <button type="button" className="secondary-button secondary-button--danger" onClick={archiveTemplate} disabled={isSavingTemplate || !selectedTemplateId || selectedTemplateIsArchived}>
                Archive Template
              </button>
            </div>
          ) : (
            <p className="muted">Template create/update/archive controls require Developer/Admin role with can_manage_inventory.</p>
          )}
          {templateMessage ? <div className="alert">{templateMessage}</div> : null}
        </section>

        <section className="label-preview-panel">
          <div className="count-section-header">
            <div>
              <p className="eyebrow">Live Preview</p>
              <h3>{selectedLocation ? `${selectedLocation.typeLabel}: ${selectedLocation.code}` : 'Preview location'}</h3>
            </div>
            <span>{AVERY_LABEL_TEMPLATES[draft.avery_template]?.scopeHint}</span>
          </div>
          <LabelPreview draft={draft} locationRecord={selectedLocation} summary={selectedSummary} />
          <div className="cart-facts">
            <span>Sheet: {formatAveryTemplateLabel(AVERY_LABEL_TEMPLATES[draft.avery_template])}</span>
            <span>Scope: {draft.scope_level || 'Any level'}</span>
            <span>Printable labels: {scopedLocationRecords.length}</span>
            <span>Fields: {LABEL_FIELD_OPTIONS.filter((field) => draft.layout.fields[field.key]?.enabled).length}</span>
            <span>QR identity: location UUID</span>
          </div>
          <div className="cart-actions label-print-actions">
            <button type="button" className="secondary-button" onClick={printSelectedLabel} disabled={!selectedLocation}>
              <Printer aria-hidden="true" /> Print Selected Label
            </button>
            <button type="button" className="secondary-button" onClick={printScopedLabels} disabled={!scopedLocationRecords.length}>
              <Printer aria-hidden="true" /> Print Scoped Sheet
            </button>
          </div>
          <p className="muted">Browser print output uses Avery sheet, margin, label, and pitch geometry from the template data. Use 100% scale, no fit-to-page, and the printer margin setting that preserves actual Avery stock alignment.</p>
        </section>
      </div>
    </section>
  );
}

function ScanNavigationButton({ record, navigateTo, children }) {
  if (!record?.id) return null;

  return (
    <button type="button" className="scan-nav-button" onClick={() => navigateTo(buildLocationScanPath(record.id))}>
      <span>{record.typeLabel}</span>
      <strong>{getLocationDisplayCode(record)}</strong>
      {children ? <small>{children}</small> : null}
    </button>
  );
}

function ScanMaterialRows({ rows, emptyTitle, emptyText }) {
  if (!rows.length) {
    return (
      <EmptyState title={emptyTitle}>
        {emptyText}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data-table scan-contents-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Location</th>
              <th>Quantity</th>
              <th>Division</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bin_item_id}>
                <td>
                  <strong>{row.item_name}</strong>
                  <span>{row.material_code}</span>
                </td>
                <td>
                  <strong>{row.bin_code}</strong>
                  <span>{buildStoragePath(row)}</span>
                </td>
                <td>{Number(row.quantity_on_hand ?? row.system_quantity ?? 0).toFixed(2)} {row.unit_of_measure ?? ''}</td>
                <td>{row.division ?? row.storage_unit_division ?? 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-list scan-mobile-list">
        {rows.map((row) => (
          <article className="mobile-item" key={row.bin_item_id}>
            <strong>{row.item_name}</strong>
            <div className="meta-grid">
              <span>Code: {row.material_code}</span>
              <span>Bin: {row.bin_code}</span>
              <span>Path: {buildStoragePath(row)}</span>
              <span>Qty: {Number(row.quantity_on_hand ?? row.system_quantity ?? 0).toFixed(2)} {row.unit_of_measure ?? ''}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ScanBinCartEntry({ model, rows, permissions, navigateTo }) {
  if (model?.scopeType !== 'bin') return null;

  const binRows = getScanRowsForBin(model.bin, rows)
    .filter((row) => Number(row.quantity_on_hand ?? row.system_quantity ?? 0) > DEFAULT_CANDIDATE_QUANTITY);
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const scannedBinLabel = model.locationRecord?.path || getLocationDisplayCode(model.locationRecord);

  return (
    <section className="cart-panel scan-cart-entry-panel">
      <div className="scan-cart-entry-copy">
        <p className="eyebrow">Bin action</p>
        <h3>{scannedBinLabel || 'Scanned bin'}</h3>
        <p>Uses the existing cart checkout flow. Inventory is not changed until checkout is completed.</p>
      </div>

      {binRows.length ? (
        <div className="scan-cart-entry-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canUseCart}
            onClick={() => navigateTo(buildScanCartPath(model.locationRecord))}
          >
            <ShoppingCart aria-hidden="true" />
            Add material from this bin to cart
          </button>
          {!canUseCart ? <span className="muted">can_inventory_transactions is required for cart staging.</span> : null}
        </div>
      ) : (
        <EmptyState title="No stocked material">
          No authorized stocked material was found for this scanned bin.
        </EmptyState>
      )}
    </section>
  );
}

function ScanBinCountEntry({ model, rows, permissions, navigateTo }) {
  if (model?.scopeType !== 'bin') return null;

  const binRows = getScanRowsForBin(model.bin, rows);
  const canUseCountCorrection = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const scannedBinLabel = model.locationRecord?.path || getLocationDisplayCode(model.locationRecord);

  return (
    <section className="cart-panel scan-count-entry-panel">
      <div className="scan-cart-entry-copy">
        <p className="eyebrow">Count action</p>
        <h3>{scannedBinLabel || 'Scanned bin'}</h3>
        <p>Uses the existing Inventory Count & Correction flow. Inventory is not changed until the count correction is submitted through the approved path.</p>
      </div>

      {binRows.length ? (
        <div className="scan-cart-entry-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canUseCountCorrection}
            onClick={() => navigateTo(buildScanCountPath(model.locationRecord))}
          >
            <ClipboardCheck aria-hidden="true" />
            Correct count for this bin
          </button>
          {!canUseCountCorrection ? <span className="muted">can_manage_inventory is required for count correction.</span> : null}
        </div>
      ) : (
        <EmptyState title="No material rows">
          No authorized material rows were found for this scanned bin.
        </EmptyState>
      )}
    </section>
  );
}

function ScanBinGroup({ bin, rows, navigateTo }) {
  const binRecord = {
    id: bin.id,
    type: 'bin',
    typeLabel: 'Bin',
    code: bin.bin_code,
    label: bin.label,
  };

  return (
    <section className="scan-hierarchy-group">
      <div className="scan-group-header">
        <div>
          <p className="eyebrow">Bin</p>
          <h4>{bin.bin_code || bin.id}</h4>
          <span>{bin.label || 'No bin label'}</span>
        </div>
        <ScanNavigationButton record={binRecord} navigateTo={navigateTo}>
          Open bin
        </ScanNavigationButton>
      </div>
      <ScanMaterialRows
        rows={rows}
        emptyTitle="No contents in this bin"
        emptyText="This bin is available in the scanned scope, but the existing read path returned no active material rows for it."
      />
    </section>
  );
}

function ScanBayGroup({ bay, bins, rows, navigateTo }) {
  const bayRecord = {
    id: bay.id,
    type: 'bay',
    typeLabel: 'Bay',
    code: bay.bay_code,
    label: bay.label,
  };

  return (
    <section className="scan-hierarchy-group scan-hierarchy-group--bay">
      <div className="scan-group-header">
        <div>
          <p className="eyebrow">Bay</p>
          <h4>{bay.bay_code || bay.id}</h4>
          <span>{bay.label || 'No bay label'}</span>
        </div>
        <ScanNavigationButton record={bayRecord} navigateTo={navigateTo}>
          Open bay
        </ScanNavigationButton>
      </div>

      {bins.length ? (
        <div className="scan-bin-groups">
          {bins.map((bin) => (
            <ScanBinGroup
              key={bin.id}
              bin={bin}
              rows={rows.filter((row) => row.bin_id === bin.id)}
              navigateTo={navigateTo}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No bins under this bay">
          The scanned bay resolved, but the existing hierarchy read returned no bins under it.
        </EmptyState>
      )}
    </section>
  );
}

function ScanShelfGroup({ shelf, bays, bins, rows, navigateTo }) {
  const shelfRecord = {
    id: shelf.id,
    type: 'shelf',
    typeLabel: 'Shelf',
    code: shelf.shelf_code,
    label: shelf.label,
  };

  return (
    <section className="scan-hierarchy-group scan-hierarchy-group--shelf">
      <div className="scan-group-header">
        <div>
          <p className="eyebrow">Shelf</p>
          <h4>{shelf.shelf_code || shelf.id}</h4>
          <span>{shelf.label || 'No shelf label'}</span>
        </div>
        <ScanNavigationButton record={shelfRecord} navigateTo={navigateTo}>
          Open shelf
        </ScanNavigationButton>
      </div>

      {bays.length ? (
        <div className="scan-bay-groups">
          {bays.map((bay) => (
            <ScanBayGroup
              key={bay.id}
              bay={bay}
              bins={bins.filter((bin) => bin.bay_id === bay.id)}
              rows={rows.filter((row) => row.bay_id === bay.id)}
              navigateTo={navigateTo}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No bays under this shelf">
          The scanned shelf resolved, but the existing hierarchy read returned no bays under it.
        </EmptyState>
      )}
    </section>
  );
}

function ScanHierarchyNavigation({ model, locationSheet, navigateTo }) {
  const upRecords = model.ancestors.filter((record) => record.id !== model.locationRecord?.id);
  const downRecords = [
    ...(model.scopeType === 'unit' ? model.shelves.map((shelf) => ({
      id: shelf.id,
      type: 'shelf',
      typeLabel: 'Shelf',
      code: shelf.shelf_code,
      label: shelf.label,
    })) : []),
    ...(['unit', 'shelf'].includes(model.scopeType) ? model.bays.map((bay) => ({
      id: bay.id,
      type: 'bay',
      typeLabel: 'Bay',
      code: bay.bay_code,
      label: bay.label,
    })) : []),
    ...(['unit', 'shelf', 'bay'].includes(model.scopeType) ? model.bins.map((bin) => ({
      id: bin.id,
      type: 'bin',
      typeLabel: 'Bin',
      code: bin.bin_code,
      label: bin.label,
    })) : []),
  ];

  return (
    <section className="cart-panel scan-navigation-panel">
      <div className="count-section-header">
        <div>
          <p className="eyebrow">Hierarchy Navigation</p>
          <h3>Move within scanned location scope</h3>
        </div>
        <span>Read + navigation</span>
      </div>

      <div className="scan-nav-section">
        <strong>Up</strong>
        {upRecords.length ? (
          <div className="scan-nav-grid">
            {upRecords.map((record) => (
              <ScanNavigationButton key={record.id} record={record} navigateTo={navigateTo}>
                {getHierarchySummary(record, locationSheet)}
              </ScanNavigationButton>
            ))}
          </div>
        ) : (
          <p className="muted">This is the top level for the scanned scope.</p>
        )}
      </div>

      <div className="scan-nav-section">
        <strong>Down</strong>
        {downRecords.length ? (
          <div className="scan-nav-grid">
            {downRecords.map((record) => (
              <ScanNavigationButton key={`${record.type}:${record.id}`} record={record} navigateTo={navigateTo}>
                {getHierarchySummary(record, locationSheet)}
              </ScanNavigationButton>
            ))}
          </div>
        ) : (
          <p className="muted">Bin pages are the action level; no lower location level is available.</p>
        )}
      </div>
    </section>
  );
}

function ScanScopedContents({ model, rows, navigateTo }) {
  if (model.scopeType === 'bin') {
    const binRows = getScanRowsForBin(model.bin, rows);
    return (
      <ScanMaterialRows
        rows={binRows}
        emptyTitle="No contents in this bin"
        emptyText="No authorized stocked material was found for this scanned bin."
      />
    );
  }

  if (model.scopeType === 'bay') {
    return (
      <ScanBayGroup
        bay={model.bay}
        bins={model.bins}
        rows={rows}
        navigateTo={navigateTo}
      />
    );
  }

  if (model.scopeType === 'shelf') {
    return (
      <ScanShelfGroup
        shelf={model.shelf}
        bays={model.bays}
        bins={model.bins}
        rows={rows}
        navigateTo={navigateTo}
      />
    );
  }

  return (
    <div className="scan-shelf-groups">
      {model.shelves.length ? (
        model.shelves.map((shelf) => (
          <ScanShelfGroup
            key={shelf.id}
            shelf={shelf}
            bays={model.bays.filter((bay) => bay.shelf_id === shelf.id)}
            bins={model.bins}
            rows={rows.filter((row) => row.shelf_id === shelf.id)}
            navigateTo={navigateTo}
          />
        ))
      ) : (
        <EmptyState title="No shelves under this unit">
          The scanned unit resolved, but the existing hierarchy read returned no shelves under it.
        </EmptyState>
      )}
    </div>
  );
}

function LocationScanResult({ permissions, locationId, navigateTo }) {
  const canReadLocations = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const locationSheet = useInventoryCountSheet({ enabled: canReadLocations });
  const scanModel = useMemo(
    () => buildScanDestinationModel(locationId, locationSheet),
    [
      locationId,
      locationSheet.storageUnits,
      locationSheet.shelves,
      locationSheet.bays,
      locationSheet.bins,
    ],
  );
  const locationRows = getRowsForScanScope(scanModel, locationSheet.rows);
  const totalQuantity = locationRows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? row.system_quantity ?? 0), 0);

  if (!canReadLocations) {
    return (
      <article className="card card--wide scan-result">
        <div className="card__header">
          <div>
            <p className="eyebrow">Scan Result</p>
            <h2>Location unavailable</h2>
          </div>
          <span className="status-pill status-pill--warn">Access unavailable</span>
        </div>
        <p>Scanning a QR code does not grant access. Sign in with server permissions that can read inventory locations.</p>
      </article>
    );
  }

  return (
    <article className="card card--wide scan-result">
      <div className="card__header">
        <div>
          <p className="eyebrow">Scan Result</p>
          <h2>{scanModel?.locationRecord ? scanModel.locationRecord.path || scanModel.locationRecord.code : 'Resolving location'}</h2>
          <p>Read-first location page from the scanned UUID. Human-readable codes are display text only.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => navigateTo('/')}>
          Back to Dashboard
        </button>
      </div>

      <div className="location-note">
        <MapPin aria-hidden="true" />
        <span>
          Scan pages dispatch into existing inventory workflows. Bin cart staging and count correction use the existing approved flows and do not change inventory until those workflows are completed.
        </span>
      </div>

      {locationSheet.error ? (
        <div className="alert">Location unavailable. The scan target could not be resolved through the current server read path.</div>
      ) : null}
      {locationSheet.isLoading ? <p className="muted">Resolving scanned location...</p> : null}

      {!locationSheet.isLoading && !locationSheet.error && !scanModel?.locationRecord ? (
        <EmptyState title="Location not found or unavailable">
          This scan target is not available through the current server read path.
        </EmptyState>
      ) : null}

      {scanModel?.locationRecord ? (
        <>
          <div className="scan-location-summary">
            <span>Level: {scanModel.locationRecord.typeLabel}</span>
            <span>Code: {scanModel.locationRecord.code || 'No display code'}</span>
            <span>Path: {scanModel.locationRecord.path || 'No path available'}</span>
            <span>UUID: {scanModel.locationRecord.id}</span>
            <span>Material rows in scope: {locationRows.length}</span>
            <span>Total quantity in scope: {totalQuantity.toFixed(2)}</span>
          </div>

          <ScanBinCartEntry
            model={scanModel}
            rows={locationRows}
            permissions={permissions}
            navigateTo={navigateTo}
          />

          <ScanBinCountEntry
            model={scanModel}
            rows={locationRows}
            permissions={permissions}
            navigateTo={navigateTo}
          />

          <ScanHierarchyNavigation model={scanModel} locationSheet={locationSheet} navigateTo={navigateTo} />

          <section className="cart-panel scan-contents-panel">
            <div className="count-section-header">
              <div>
                <p className="eyebrow">Current Contents</p>
                <h3>{getLocationRecordTitle(scanModel.locationRecord)}</h3>
              </div>
              <span>Read only</span>
            </div>

            {!locationRows.length && scanModel.scopeType !== 'bin' ? (
              <EmptyState title="No material rows under this scope">
                The scanned location resolved, but the existing read path returned no active material rows under this scope.
              </EmptyState>
            ) : null}

            <ScanScopedContents model={scanModel} rows={locationRows} navigateTo={navigateTo} />
          </section>
        </>
      ) : null}
    </article>
  );
}

async function createNativeQrDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return null;
  }

  const BarcodeDetector = window.BarcodeDetector;

  if (typeof BarcodeDetector.getSupportedFormats === 'function') {
    try {
      const supportedFormats = await BarcodeDetector.getSupportedFormats();
      if (Array.isArray(supportedFormats) && !supportedFormats.includes('qr_code')) {
        return null;
      }
    } catch {
      return null;
    }
  }

  try {
    return new BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function decodeQrFromVideoFrame(video, canvasRef) {
  if (!video?.videoWidth || !video?.videoHeight) {
    return '';
  }

  const canvas = canvasRef.current ?? document.createElement('canvas');
  canvasRef.current = canvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? '';
}

function LocationScannerPanel({ permissions, navigateTo }) {
  const canReadLocations = permissions.permissionSource === 'server' && permissions.canManageInventory;
  const locationSheet = useInventoryCountSheet({ enabled: canReadLocations });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const [manualPayload, setManualPayload] = useState('');
  const [manualLocationMatches, setManualLocationMatches] = useState([]);
  const [scannerMessage, setScannerMessage] = useState('');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [scannerMode, setScannerMode] = useState('idle');
  const [lastPayload, setLastPayload] = useState('');

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
  }, []);

  function openMatchedLocation(record) {
    if (!record?.id) return;
    setManualLocationMatches([]);
    setScannerMessage('');
    navigateTo(buildLocationScanPath(record.id));
  }

  function handlePayload(payload, { allowCodeLookup = false } = {}) {
    setLastPayload(payload);
    setManualLocationMatches([]);
    const parsed = parseLocationScanPayload(payload);
    if (!parsed.ok) {
      if (allowCodeLookup && isManualLocationCodeInput(payload)) {
        if (locationSheet.isLoading || !locationSheet.lastLoadedAt) {
          setScannerMessage('Location hierarchy is still loading. Try again in a moment.');
          return false;
        }

        if (locationSheet.error) {
          setScannerMessage('Location unavailable. The scan target could not be resolved through the current server read path.');
          return false;
        }

        const matches = getManualLocationCodeMatches(payload, locationSheet);
        if (matches.length === 1) {
          openMatchedLocation(matches[0]);
          return true;
        }

        if (matches.length > 1) {
          setManualLocationMatches(matches);
          setScannerMessage('Multiple matching locations found. Choose the correct location.');
          return false;
        }

        setScannerMessage('No matching location found.');
        return false;
      }

      setScannerMessage(parsed.error);
      return false;
    }

    setScannerMessage('');
    navigateTo(parsed.path);
    return true;
  }

  function stopCamera() {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStatus('idle');
    setScannerMode('idle');
  }

  async function startCamera() {
    if (!canReadLocations) {
      setScannerMessage('Server inventory read access is required before scanning.');
      return;
    }

    if (typeof window === 'undefined' || !window.isSecureContext) {
      setScannerMessage('Camera scanning requires HTTPS. Use manual entry in this context.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('This browser does not expose camera access. Use manual entry.');
      return;
    }

    try {
      setScannerMessage('');
      setCameraStatus('starting');
      let detector = await createNativeQrDetector();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      if (!videoRef.current) {
        throw new Error('Scanner video element is unavailable.');
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const initialMode = detector ? 'native' : 'compatibility';
      setScannerMode(initialMode);
      if (initialMode === 'compatibility') {
        setScannerMessage('Native QR scanning is unavailable in this browser. Using the compatibility camera scanner.');
      }
      setCameraStatus('scanning');

      async function detectFrame() {
        if (!videoRef.current || !streamRef.current) return;

        try {
          let rawValue = '';
          if (detector) {
            try {
              const codes = await detector.detect(videoRef.current);
              rawValue = codes.find((code) => code.rawValue)?.rawValue ?? '';
            } catch {
              detector = null;
              setScannerMode('compatibility');
              setScannerMessage('Native QR scanning stopped responding. Using the compatibility camera scanner.');
            }
          }

          if (!rawValue) {
            rawValue = decodeQrFromVideoFrame(videoRef.current, canvasRef);
          }

          if (rawValue && handlePayload(rawValue)) {
            stopCamera();
            return;
          }
        } catch {
          setScannerMessage('Camera frame could not be decoded. Manual entry is still available.');
        }

        frameRef.current = requestAnimationFrame(detectFrame);
      }

      frameRef.current = requestAnimationFrame(detectFrame);
    } catch (error) {
      console.error('QR scanner camera failed', error);
      stopCamera();
      setScannerMessage('Camera permission was denied or the camera is unavailable. Use manual entry.');
    }
  }

  function submitManualPayload(event) {
    event.preventDefault();
    handlePayload(manualPayload, { allowCodeLookup: true });
  }

  if (!canReadLocations) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Location Scanner</p>
            <h3>Scan Location QR</h3>
          </div>
          <span className="status-pill status-pill--warn">can_manage_inventory required</span>
        </div>
        <p>Scanner access uses the existing inventory read permission gate. QR codes do not bypass server permissions.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel scanner-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Location Scanner</p>
          <h3>Scan Location QR</h3>
          <p>Use Northgate HQ location QR codes only. Unsupported QR codes are ignored, and scanning never creates or modifies inventory.</p>
        </div>
        <span className="status-pill status-pill--good">Read only</span>
      </div>

      <div className="location-note">
        <QrCode aria-hidden="true" />
        <span>
          Scan a Northgate HQ location QR, paste a QR link, or enter a location code like <strong>C211</strong>.
        </span>
      </div>
      {cameraStatus === 'scanning' ? (
        <div className="cart-facts">
          <span>Camera mode: {scannerMode === 'native' ? 'Native scanner' : 'Compatibility scanner'}</span>
          <span>Manual entry: available</span>
          <span>Scan route: /scan/location/&lt;uuid&gt;</span>
        </div>
      ) : null}

      <div className="scanner-layout">
        <section className="scanner-camera">
          <div className="scanner-video-frame">
            <video ref={videoRef} muted playsInline />
            {cameraStatus !== 'scanning' ? (
              <div className="scanner-placeholder">
                <Camera aria-hidden="true" />
                <span>Camera scanner starts on request.</span>
              </div>
            ) : null}
          </div>
          <div className="cart-actions">
            <button type="button" className="secondary-button" onClick={startCamera} disabled={cameraStatus === 'starting' || cameraStatus === 'scanning'}>
              <Camera aria-hidden="true" /> {cameraStatus === 'starting' ? 'Starting...' : 'Start Camera'}
            </button>
            <button type="button" className="secondary-button" onClick={stopCamera} disabled={cameraStatus !== 'scanning'}>
              <CameraOff aria-hidden="true" /> Stop Camera
            </button>
          </div>
        </section>

        <section className="scanner-manual">
          <form className="scanner-manual-form" onSubmit={submitManualPayload}>
            <label>
              Manual scan payload
              <textarea
                value={manualPayload}
                onChange={(event) => {
                  setManualPayload(event.target.value);
                  setManualLocationMatches([]);
                }}
                placeholder="Paste /scan/location/<uuid>, a full QR URL, or enter C211"
                rows={5}
              />
            </label>
            <button type="submit" className="primary-button">Open Scan Result</button>
          </form>
          {manualLocationMatches.length ? (
            <div className="scan-disambiguation">
              <strong>Choose a matching location</strong>
              <div className="scan-nav-grid">
                {manualLocationMatches.map((match) => (
                  <button type="button" className="scan-nav-button" key={match.id} onClick={() => openMatchedLocation(match)}>
                    <span>{match.typeLabel}</span>
                    <strong>{getLocationDisplayCode(match)}</strong>
                    <small>{match.path || match.label || 'Matching location'}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {scannerMessage ? <div className="alert">{scannerMessage}</div> : null}
          {lastPayload ? (
            <p className="muted">Last scanned payload: {lastPayload}</p>
          ) : null}
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

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  return `$${numericValue.toFixed(2)}`;
}

function formatAccountingCell(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function formatExportQuantity(row) {
  return row.rowType === 'item' ? row.quantity.toFixed(2) : '0.00';
}

function formatCsvCell(value) {
  const rawValue = String(value ?? '');
  const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename, columns, rows) {
  if (typeof window === 'undefined') return false;

  const csvRows = [
    columns.map((column) => formatCsvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => formatCsvCell(column.getValue(row))).join(',')),
  ];
  const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const csvUrl = window.URL.createObjectURL(csvBlob);
  const link = window.document.createElement('a');
  link.href = csvUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(csvUrl);
  return true;
}

function buildGrandMasterLocationContext(countSheet) {
  const unitById = new Map(countSheet.storageUnits.map((unit) => [unit.id, unit]));
  const shelfById = new Map(countSheet.shelves.map((shelf) => [shelf.id, shelf]));
  const bayById = new Map(countSheet.bays.map((bay) => [bay.id, bay]));

  return new Map(countSheet.bins.map((bin) => {
    const bay = bayById.get(bin.bay_id) ?? {};
    const shelf = shelfById.get(bay.shelf_id) ?? {};
    const unit = unitById.get(shelf.unit_id) ?? {};

    return [bin.id, {
      bin_id: bin.id,
      bin_code: bin.bin_code ?? '',
      bin_label: bin.label ?? '',
      bay_id: bay.id ?? '',
      bay_code: bay.bay_code ?? '',
      bay_label: bay.label ?? '',
      shelf_id: shelf.id ?? '',
      shelf_code: shelf.shelf_code ?? '',
      shelf_label: shelf.label ?? '',
      storage_unit_id: unit.id ?? '',
      storage_unit_code: unit.unit_code ?? '',
      storage_unit_name: unit.name ?? '',
      division: unit.division ?? '',
      locationPath: [unit.unit_code, shelf.shelf_code, bay.bay_code, bin.bin_code].filter(Boolean).join(' / '),
    }];
  }));
}

function buildGrandMasterRows(countSheet) {
  const locationByBinId = buildGrandMasterLocationContext(countSheet);
  const rowCountByBinId = new Map();
  const positiveQuantityByBinId = new Map();

  countSheet.rows.forEach((row) => {
    const quantity = Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
    rowCountByBinId.set(row.bin_id, (rowCountByBinId.get(row.bin_id) ?? 0) + 1);
    if (quantity > 0) {
      positiveQuantityByBinId.set(row.bin_id, (positiveQuantityByBinId.get(row.bin_id) ?? 0) + quantity);
    }
  });

  const itemRows = countSheet.rows.map((row) => {
    const quantity = Number(row.quantity_on_hand ?? row.system_quantity ?? 0);
    const unitCost = row.price_per_unit === null || row.price_per_unit === undefined || row.price_per_unit === ''
      ? null
      : Number(row.price_per_unit);
    const location = locationByBinId.get(row.bin_id) ?? {};
    const effectiveUnitCost = Number.isFinite(unitCost) ? unitCost : null;

    return {
      id: row.bin_item_id,
      rowType: 'item',
      stockStatus: quantity > 0 ? 'stocked' : 'empty',
      material_code: row.material_code ?? '',
      item_name: row.item_name ?? '',
      unit_of_measure: row.unit_of_measure ?? '',
      size: row.size ?? row.sub_category_4 ?? '',
      categoryLabel: getCategoryLabel(row),
      broad_category: row.broad_category ?? '',
      description: row.description ?? '',
      manufacturer_part_number: row.manufacturer_part_number ?? '',
      vendor_part_number: row.vendor_part_number ?? '',
      quantity,
      unitCost: effectiveUnitCost,
      extendedValue: effectiveUnitCost === null ? null : effectiveUnitCost * quantity,
      division: row.division ?? row.storage_unit_division ?? location.division ?? '',
      ...location,
    };
  });

  const emptyLocationRows = Array.from(locationByBinId.values())
    .filter((location) => !rowCountByBinId.has(location.bin_id))
    .map((location) => ({
      id: `empty-${location.bin_id}`,
      rowType: 'empty-location',
      stockStatus: 'empty',
      material_code: '',
      item_name: 'No stocked material',
      unit_of_measure: '',
      categoryLabel: '',
      broad_category: '',
      description: '',
      manufacturer_part_number: '',
      vendor_part_number: '',
      quantity: 0,
      unitCost: null,
      extendedValue: null,
      division: location.division ?? '',
      ...location,
    }));

  return {
    rows: [...itemRows, ...emptyLocationRows],
    positiveBinIds: new Set(positiveQuantityByBinId.keys()),
  };
}

function matchesGrandMasterSearch(row, searchText) {
  const queryTokens = tokenizeSearchText(searchText);
  if (!queryTokens.length) return true;

  const compactSearch = normalizeLocationSegment(searchText);
  const compactLocationCode = buildCompactLocationCode(row);
  const searchableValues = [
    row.material_code,
    row.item_name,
    row.categoryLabel,
    row.description,
    row.manufacturer_part_number,
    row.vendor_part_number,
    row.unit_of_measure,
    row.size,
    row.division,
    compactLocationCode,
    ...getLocationSearchValues(row),
  ];
  const tokenMatch = matchesTokenizedSearch(searchableValues, searchText);
  const compactLocationMatch = compactSearch ? compactLocationCode.startsWith(compactSearch) : false;

  return tokenMatch || compactLocationMatch;
}

function getAccountingExportColumns() {
  return [
    { label: 'Material code', getValue: (row) => row.material_code },
    { label: 'Material name', getValue: (row) => row.item_name },
    { label: 'Category', getValue: (row) => row.categoryLabel },
    { label: 'Quantity on hand', getValue: (row) => formatExportQuantity(row) },
    { label: 'Unit of measure', getValue: (row) => row.unit_of_measure },
    { label: 'Unit cost', getValue: (row) => row.unitCost === null ? '' : row.unitCost.toFixed(2) },
    { label: 'Extended value', getValue: (row) => row.extendedValue === null ? '' : row.extendedValue.toFixed(2) },
    { label: 'Division', getValue: (row) => row.division || 'Unassigned' },
    { label: 'Unit', getValue: (row) => row.storage_unit_code },
    { label: 'Shelf', getValue: (row) => row.shelf_code },
    { label: 'Bay', getValue: (row) => row.bay_code },
    { label: 'Bin', getValue: (row) => row.bin_code },
    { label: 'Compact location code', getValue: (row) => buildCompactLocationCode(row) },
    { label: 'Storage path', getValue: (row) => row.locationPath || buildStoragePath(row) },
    { label: 'Stock status', getValue: (row) => row.stockStatus },
  ];
}

const ACCOUNTING_EXPORT_VIEW_OPTIONS = [
  { value: 'detail', label: 'Detail rows', fileToken: 'detail' },
  { value: 'category', label: 'By category', fileToken: 'by-category' },
  { value: 'location', label: 'By location', fileToken: 'by-location' },
  { value: 'stockStatus', label: 'By stocked status', fileToken: 'by-stocked-status' },
  { value: 'division', label: 'By division', fileToken: 'by-division' },
];

function getAccountingExportViewOption(viewMode) {
  return ACCOUNTING_EXPORT_VIEW_OPTIONS.find((option) => option.value === viewMode) ?? ACCOUNTING_EXPORT_VIEW_OPTIONS[0];
}

function getAccountingExportGroupLabel(row, viewMode) {
  if (viewMode === 'category') return row.categoryLabel || 'Uncategorized';
  if (viewMode === 'stockStatus') return row.stockStatus === 'stocked' ? 'Stocked' : 'Empty / zero quantity';
  if (viewMode === 'division') return row.division || 'Unassigned';
  if (viewMode === 'location') {
    const compactLocation = buildCompactLocationCode(row);
    const storagePath = row.locationPath || buildStoragePath(row);
    if (compactLocation && storagePath && compactLocation !== storagePath) return `${compactLocation} / ${storagePath}`;
    return compactLocation || storagePath || 'Unassigned location';
  }
  return 'Detail rows';
}

function buildAccountingExportGroups(rows, viewMode) {
  if (viewMode === 'detail') return [];

  const groupMap = new Map();
  rows.forEach((row) => {
    const groupLabel = getAccountingExportGroupLabel(row, viewMode);
    if (!groupMap.has(groupLabel)) {
      groupMap.set(groupLabel, {
        id: `${viewMode}-${groupLabel}`,
        groupLabel,
        rowCount: 0,
        stockedRowCount: 0,
        emptyZeroRowCount: 0,
        totalQuantity: 0,
        knownInventoryValue: 0,
        valueRowCount: 0,
        rowsMissingCost: 0,
      });
    }

    const group = groupMap.get(groupLabel);
    const isItem = row.rowType === 'item';
    const quantity = isItem ? Number(row.quantity ?? 0) : 0;
    const isStocked = isItem && quantity > 0;

    group.rowCount += 1;
    if (isStocked) {
      group.stockedRowCount += 1;
      group.totalQuantity += quantity;
    } else {
      group.emptyZeroRowCount += 1;
    }

    if (isItem && row.unitCost === null) group.rowsMissingCost += 1;
    if (isItem && row.extendedValue !== null) {
      group.knownInventoryValue += Number(row.extendedValue ?? 0);
      group.valueRowCount += 1;
    }
  });

  return Array.from(groupMap.values())
    .sort((first, second) => first.groupLabel.localeCompare(second.groupLabel, undefined, { numeric: true, sensitivity: 'base' }));
}

function getAccountingExportGroupColumns() {
  return [
    { label: 'Group label', getValue: (group) => group.groupLabel },
    { label: 'Row count', getValue: (group) => group.rowCount },
    { label: 'Stocked row count', getValue: (group) => group.stockedRowCount },
    { label: 'Empty / zero row count', getValue: (group) => group.emptyZeroRowCount },
    { label: 'Total quantity', getValue: (group) => group.totalQuantity.toFixed(2) },
    { label: 'Known inventory value', getValue: (group) => group.valueRowCount ? group.knownInventoryValue.toFixed(2) : '' },
    { label: 'Rows missing cost', getValue: (group) => group.rowsMissingCost },
  ];
}

function AccountingExportPreviewPanel({ permissions }) {
  const canReadExportPreview = permissions.permissionSource === 'server';
  const countSheet = useInventoryCountSheet({ enabled: canReadExportPreview });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('detail');
  const [filters, setFilters] = useState({
    storage_unit_id: '',
    shelf_id: '',
    bay_id: '',
    bin_id: '',
    category: '',
    division: '',
    stockStatus: '',
  });
  const [csvMessage, setCsvMessage] = useState('');
  const exportModel = useMemo(() => buildGrandMasterRows(countSheet), [countSheet]);
  const rows = exportModel.rows;
  const categoryOptions = rows
    .reduce((options, row) => {
      if (!row.categoryLabel || options.some((option) => option.value === row.categoryLabel)) return options;
      return [...options, { value: row.categoryLabel, label: row.categoryLabel }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const divisionOptions = rows
    .reduce((options, row) => {
      const value = row.division || 'Unassigned';
      if (options.some((option) => option.value === value)) return options;
      return [...options, { value, label: value }];
    }, [])
    .sort((first, second) => first.label.localeCompare(second.label));
  const storageUnitOptions = countSheet.storageUnits
    .map((unit) => ({
      value: unit.id,
      label: `${unit.unit_code}${unit.name ? ` / ${unit.name}` : ''}`,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const shelfOptions = countSheet.shelves
    .map((shelf) => ({ value: shelf.id, label: shelf.shelf_code || shelf.label || shelf.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const bayOptions = countSheet.bays
    .map((bay) => ({ value: bay.id, label: bay.bay_code || bay.label || bay.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const binOptions = countSheet.bins
    .map((bin) => ({ value: bin.id, label: bin.bin_code || bin.label || bin.id }))
    .sort((first, second) => first.label.localeCompare(second.label));
  const filteredRows = rows.filter((row) => {
    if (filters.storage_unit_id && row.storage_unit_id !== filters.storage_unit_id) return false;
    if (filters.shelf_id && row.shelf_id !== filters.shelf_id) return false;
    if (filters.bay_id && row.bay_id !== filters.bay_id) return false;
    if (filters.bin_id && row.bin_id !== filters.bin_id) return false;
    if (filters.category && row.categoryLabel !== filters.category) return false;
    if (filters.division && (row.division || 'Unassigned') !== filters.division) return false;
    if (filters.stockStatus && row.stockStatus !== filters.stockStatus) return false;
    return matchesGrandMasterSearch(row, search);
  });
  const visibleStockedRows = filteredRows.filter((row) => row.rowType === 'item' && row.quantity > 0).length;
  const visibleEmptyOrZeroRows = filteredRows.filter((row) => row.rowType === 'empty-location' || (row.rowType === 'item' && row.quantity <= 0)).length;
  const visibleQuantity = filteredRows
    .filter((row) => row.rowType === 'item' && row.quantity > 0)
    .reduce((sum, row) => sum + row.quantity, 0);
  const visibleValueRows = filteredRows.filter((row) => row.rowType === 'item' && row.extendedValue !== null).length;
  const visibleMissingCostRows = filteredRows.filter((row) => row.rowType === 'item' && row.unitCost === null).length;
  const visibleKnownValue = filteredRows
    .filter((row) => row.rowType === 'item' && row.extendedValue !== null)
    .reduce((sum, row) => sum + row.extendedValue, 0);
  const groupedRows = buildAccountingExportGroups(filteredRows, viewMode);
  const activeView = getAccountingExportViewOption(viewMode);
  const exportColumns = getAccountingExportColumns();
  const groupColumns = getAccountingExportGroupColumns();
  const currentCsvRows = viewMode === 'detail' ? filteredRows : groupedRows;
  const currentCsvColumns = viewMode === 'detail' ? exportColumns : groupColumns;
  const currentCsvUnitLabel = viewMode === 'detail' ? 'row' : 'group';

  function clearFilters() {
    setSearch('');
    setFilters({
      storage_unit_id: '',
      shelf_id: '',
      bay_id: '',
      bin_id: '',
      category: '',
      division: '',
      stockStatus: '',
    });
    setCsvMessage('');
  }

  function downloadVisibleCsv() {
    if (!currentCsvRows.length) {
      setCsvMessage(`No visible authorized preview ${currentCsvUnitLabel}s are available to download.`);
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const didDownload = downloadCsvFile(`northgate-inventory-accounting-${activeView.fileToken}-${dateStamp}.csv`, currentCsvColumns, currentCsvRows);
    setCsvMessage(didDownload
      ? `Downloaded ${currentCsvRows.length} visible authorized preview ${currentCsvUnitLabel}${currentCsvRows.length === 1 ? '' : 's'} from ${activeView.label}.`
      : 'CSV download is unavailable in this browser context.');
  }

  function printExportPreview() {
    window.print();
  }

  if (!canReadExportPreview) {
    return (
      <section className="cart-panel cart-panel--locked">
        <div className="card__header">
          <div>
            <p className="eyebrow">Accounting Export</p>
            <h3>Accounting Export Preview</h3>
          </div>
          <span className="status-pill status-pill--warn">Server permissions required</span>
        </div>
        <p>Accounting export preview uses the existing server-authorized inventory read path.</p>
      </section>
    );
  }

  return (
    <section className="cart-panel accounting-export-panel">
      <div className="card__header">
        <div>
          <p className="eyebrow">Accounting Export</p>
          <h3>Accounting Export Preview</h3>
          <p>
            Development preview — generated from currently authorized inventory rows. Not a finalized accounting integration.
          </p>
        </div>
        <div className="accounting-export-actions">
          <button type="button" className="secondary-button" onClick={countSheet.reload} disabled={countSheet.isLoading}>
            {countSheet.isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="secondary-button" onClick={printExportPreview} disabled={!currentCsvRows.length}>
            Print Export Preview
          </button>
          <button type="button" className="secondary-button" onClick={downloadVisibleCsv} disabled={!currentCsvRows.length}>
            Download Current View CSV
          </button>
        </div>
      </div>

      {countSheet.error ? (
        <div className="alert">Accounting export preview failed to load through the existing authorized read path.</div>
      ) : null}
      {countSheet.isLoading ? <p className="muted">Loading accounting export preview...</p> : null}
      {csvMessage ? <p className="muted">{csvMessage}</p> : null}

      <div className="location-note">
        <span>
          Export Preview is a client-side review surface. It filters and downloads only the rows already returned to this signed-in user; it does not create backend export jobs, storage files, ledger entries, accounting approvals, or backend print exports.
        </span>
        <span>
          Grouping and totals are calculated client-side from the currently authorized inventory rows.
        </span>
      </div>

      <div className="count-grid grand-master-summary">
        <CountCard label="Visible rows" value={filteredRows.length} />
        <CountCard label="Stocked rows" value={visibleStockedRows} />
        <CountCard label="Empty / zero rows" value={visibleEmptyOrZeroRows} />
        <CountCard label="Total quantity" value={formatQuantitySummary(visibleQuantity)} />
        <CountCard label="Known inventory value" value={formatMoney(visibleValueRows ? visibleKnownValue : null)} />
        <CountCard label="Rows missing cost" value={visibleMissingCostRows} />
      </div>

      <div className="count-toolbar grand-master-toolbar">
        <label>
          Review mode
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
            {ACCOUNTING_EXPORT_VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, code, C211, bin, category, or description"
          />
        </label>
        <label>
          Unit
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
        <label>
          Division
          <select value={filters.division} onChange={(event) => setFilters((current) => ({ ...current, division: event.target.value }))}>
            <option value="">All visible divisions</option>
            {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Stock status
          <select value={filters.stockStatus} onChange={(event) => setFilters((current) => ({ ...current, stockStatus: event.target.value }))}>
            <option value="">Stocked and empty</option>
            <option value="stocked">Stocked only</option>
            <option value="empty">Empty / zero only</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={clearFilters}>Clear Filters</button>
      </div>

      <div className="cart-facts count-summary">
        <span>Authorized source rows: {countSheet.rows.length}</span>
        <span>Preview rows: {rows.length}</span>
        <span>Current view: {activeView.label}</span>
        <span>{viewMode === 'detail' ? 'Visible detail rows' : 'Visible groups'}: {currentCsvRows.length}</span>
        <span>Last updated: {countSheet.lastLoadedAt ? new Date(countSheet.lastLoadedAt).toLocaleString() : 'not loaded yet'}</span>
        <span>CSV source: current visible {viewMode === 'detail' ? 'preview rows' : 'grouped summary rows'} only</span>
        <span>Build marker: {DEVELOPMENT_STATUS.buildMarker}</span>
        <span>Print export: current Accounting Export view only</span>
        <span>Cost visibility: authorized inventory row scope</span>
        <span>Backend export jobs: none</span>
      </div>

      {currentCsvRows.length ? (
        viewMode === 'detail' ? (
          <>
          <div className="table-wrap accounting-export-table-wrap">
            <table className="data-table accounting-export-table">
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Ext. Value</th>
                  <th>Division</th>
                  <th>Unit</th>
                  <th>Shelf</th>
                  <th>Bay</th>
                  <th>Bin</th>
                  <th>Storage Path / Compact Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatAccountingCell(row.material_code)}</td>
                    <td>{formatAccountingCell(row.item_name)}</td>
                    <td>{formatAccountingCell(row.categoryLabel)}</td>
                    <td>{row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '0.00'}</td>
                    <td>{formatMoney(row.unitCost)}</td>
                    <td>{formatMoney(row.extendedValue)}</td>
                    <td>{row.division || 'Unassigned'}</td>
                    <td>{formatAccountingCell(row.storage_unit_code)}</td>
                    <td>{formatAccountingCell(row.shelf_code)}</td>
                    <td>{formatAccountingCell(row.bay_code)}</td>
                    <td>{formatAccountingCell(row.bin_code)}</td>
                    <td>
                      <strong>{buildCompactLocationCode(row) || '-'}</strong>
                      <span>{row.locationPath || buildStoragePath(row) || '-'}</span>
                    </td>
                    <td>
                      <span className={row.stockStatus === 'stocked' ? 'status-pill status-pill--good' : 'status-pill'}>
                        {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-list accounting-export-mobile-list">
            {filteredRows.map((row) => (
              <article className="mobile-item" key={row.id}>
                <strong>{row.item_name}</strong>
                <span>{row.material_code || 'No material code'} / {row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}</span>
                <div className="meta-grid">
                  <span>Category: {row.categoryLabel || '-'}</span>
                  <span>Qty: {row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '0.00'}</span>
                  <span>Unit cost: {formatMoney(row.unitCost)}</span>
                  <span>Value: {formatMoney(row.extendedValue)}</span>
                  <span>Division: {row.division || 'Unassigned'}</span>
                  <span>Unit: {formatAccountingCell(row.storage_unit_code)}</span>
                  <span>Shelf: {formatAccountingCell(row.shelf_code)}</span>
                  <span>Bay: {formatAccountingCell(row.bay_code)}</span>
                  <span>Bin: {formatAccountingCell(row.bin_code)}</span>
                  <span>Location: {buildCompactLocationCode(row) || row.locationPath || '-'}</span>
                </div>
              </article>
            ))}
          </div>
          </>
        ) : (
          <>
            <div className="table-wrap accounting-export-table-wrap">
              <table className="data-table accounting-export-group-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Rows</th>
                    <th>Stocked Rows</th>
                    <th>Empty / Zero Rows</th>
                    <th>Total Quantity</th>
                    <th>Known Inventory Value</th>
                    <th>Rows Missing Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((group) => (
                    <tr key={group.id}>
                      <td>{group.groupLabel}</td>
                      <td>{group.rowCount}</td>
                      <td>{group.stockedRowCount}</td>
                      <td>{group.emptyZeroRowCount}</td>
                      <td>{formatQuantitySummary(group.totalQuantity)}</td>
                      <td>{formatMoney(group.valueRowCount ? group.knownInventoryValue : null)}</td>
                      <td>{group.rowsMissingCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-list accounting-export-mobile-list">
              {groupedRows.map((group) => (
                <article className="mobile-item" key={group.id}>
                  <strong>{group.groupLabel}</strong>
                  <span>{group.rowCount} row{group.rowCount === 1 ? '' : 's'} / {group.stockedRowCount} stocked</span>
                  <div className="meta-grid">
                    <span>Empty / zero: {group.emptyZeroRowCount}</span>
                    <span>Total quantity: {formatQuantitySummary(group.totalQuantity)}</span>
                    <span>Known value: {formatMoney(group.valueRowCount ? group.knownInventoryValue : null)}</span>
                    <span>Missing cost: {group.rowsMissingCost}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )
      ) : (
        <EmptyState title="No export preview rows match">
          No authorized inventory rows, empty locations, or grouped summary rows match the current export preview filters.
        </EmptyState>
      )}
      <AccountingExportPrintSheet
        viewLabel={activeView.label}
        viewMode={viewMode}
        detailRows={filteredRows}
        groupedRows={groupedRows}
      />
    </section>
  );
}

function AccountingExportPrintSheet({ viewLabel, viewMode, detailRows, groupedRows }) {
  const rows = viewMode === 'detail' ? detailRows : groupedRows;
  const unitLabel = viewMode === 'detail' ? 'detail row' : 'group';

  return (
    <section className="accounting-export-print-sheet" aria-label="Printable accounting export preview">
      <div className="accounting-export-print-header">
        <h1>Northgate HQ - Accounting Export Preview</h1>
        <div>
          <span>Printed: {new Date().toLocaleString()}</span>
          <span>Current view: {viewLabel}</span>
          <span>{rows.length} {unitLabel}{rows.length === 1 ? '' : 's'}</span>
        </div>
        <p>Development preview - generated from currently authorized inventory rows. Not a finalized accounting integration.</p>
      </div>

      {viewMode === 'detail' ? (
        <table className="accounting-export-print-table">
          <thead>
            <tr>
              <th>Material Code</th>
              <th>Material Name</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Ext. Value</th>
              <th>Division</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row) => (
              <tr key={row.id}>
                <td>{formatAccountingCell(row.material_code)}</td>
                <td>{formatAccountingCell(row.item_name)}</td>
                <td>{formatAccountingCell(row.categoryLabel)}</td>
                <td>{row.rowType === 'item' ? `${row.quantity.toFixed(2)} ${row.unit_of_measure ?? ''}` : '0.00'}</td>
                <td>{formatMoney(row.unitCost)}</td>
                <td>{formatMoney(row.extendedValue)}</td>
                <td>{row.division || 'Unassigned'}</td>
                <td>
                  <strong>{buildCompactLocationCode(row) || '-'}</strong>
                  <span>{row.locationPath || buildStoragePath(row) || '-'}</span>
                </td>
                <td>{row.stockStatus === 'stocked' ? 'Stocked' : 'Empty'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="accounting-export-print-table accounting-export-print-table--grouped">
          <thead>
            <tr>
              <th>Group</th>
              <th>Rows</th>
              <th>Stocked Rows</th>
              <th>Empty / Zero Rows</th>
              <th>Total Qty</th>
              <th>Known Value</th>
              <th>Rows Missing Cost</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((group) => (
              <tr key={group.id}>
                <td>{group.groupLabel}</td>
                <td>{group.rowCount}</td>
                <td>{group.stockedRowCount}</td>
                <td>{group.emptyZeroRowCount}</td>
                <td>{formatQuantitySummary(group.totalQuantity)}</td>
                <td>{formatMoney(group.valueRowCount ? group.knownInventoryValue : null)}</td>
                <td>{group.rowsMissingCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CountPrintSheet({ rows, countDrafts, filterSummary = [] }) {
  return (
    <section className="count-print-sheet" aria-label="Printable inventory count sheet">
      <div className="count-print-header">
        <h1>Northgate HQ - Inventory Count Sheet</h1>
        <div>
          <span>Printed: {new Date().toLocaleString()}</span>
          <span>Rows: {rows.length}</span>
        </div>
        {filterSummary.length ? (
          <p>{filterSummary.join(' | ')}</p>
        ) : (
          <p>Filters: All visible count rows</p>
        )}
      </div>

      <table className="count-print-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Shelf</th>
            <th>Bay</th>
            <th>Bin</th>
            <th>Material Code</th>
            <th>Material Name / Description</th>
            <th>System Qty</th>
            <th>Counted Qty</th>
            <th>Variance</th>
            <th>Notes / Initials</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const draft = countDrafts[row.bin_item_id] ?? { countedQuantity: '' };
            const countedQuantity = Number(draft.countedQuantity);
            const hasCount = draft.countedQuantity !== '' && Number.isFinite(countedQuantity);
            const systemQuantity = Number(row.system_quantity ?? 0);
            const variance = hasCount ? countedQuantity - systemQuantity : null;

            return (
              <tr key={row.bin_item_id}>
                <td>{row.storage_unit_code || '-'}</td>
                <td>{row.shelf_code || '-'}</td>
                <td>{row.bay_code || '-'}</td>
                <td>{row.bin_code || '-'}</td>
                <td>{row.material_code || '-'}</td>
                <td>
                  <strong>{row.item_name || '-'}</strong>
                  <span>{getCategoryLabel(row)}</span>
                </td>
                <td>{systemQuantity.toFixed(2)} {row.unit_of_measure ?? ''}</td>
                <td>{hasCount ? countedQuantity.toFixed(2) : ''}</td>
                <td>{variance === null ? '' : variance.toFixed(2)}</td>
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
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
  const countPrintFilterSummary = [
    search.trim() ? `Search: ${search.trim()}` : null,
    filters.storage_unit_id ? `Unit: ${storageUnitOptions.find((option) => option.value === filters.storage_unit_id)?.label ?? filters.storage_unit_id}` : null,
    filters.shelf_id ? `Shelf: ${shelfOptions.find((option) => option.value === filters.shelf_id)?.label ?? filters.shelf_id}` : null,
    filters.bay_id ? `Bay: ${bayOptions.find((option) => option.value === filters.bay_id)?.label ?? filters.bay_id}` : null,
    filters.bin_id ? `Bin: ${binOptions.find((option) => option.value === filters.bin_id)?.label ?? filters.bin_id}` : null,
    filters.category ? `Category: ${filters.category}` : null,
    reviewRepeats ? 'Review Repeats: on' : null,
  ].filter(Boolean);

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
          <button type="button" className="secondary-button" onClick={printCountSheet}>Print Count Sheet</button>
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
      <CountPrintSheet rows={filteredRows} countDrafts={countDrafts} filterSummary={countPrintFilterSummary} />
    </div>
  );
}

function InventoryCountIntakePanel({ permissions, scanCountContext = null }) {
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
  const [scanBinFilter, setScanBinFilter] = useState(scanCountContext?.binId ? scanCountContext : null);
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
    if (scanBinFilter?.binId && row.bin_id !== scanBinFilter.binId) return false;
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
  const countPrintFilterSummary = [
    scanBinFilter ? `Scanned bin: ${scanBinFilter.binCode || scanBinFilter.binId}` : null,
    selectedPathLabel ? `Selected path: ${selectedPathLabel}` : null,
    search.trim() ? `Search: ${search.trim()}` : null,
    filters.category ? `Category: ${filters.category}` : null,
    reviewRepeats ? 'Review Repeats: on' : null,
  ].filter(Boolean);
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

  useEffect(() => {
    if (scanCountContext?.binId) {
      setScanBinFilter(scanCountContext);
      setSearch('');
      setNewItemSearch('');
    }
  }, [scanCountContext?.binId, scanCountContext?.binCode]);

  useEffect(() => {
    if (!scanBinFilter?.binId) {
      return;
    }

    const nextPath = getCountPathFiltersForBin(scanBinFilter.binId, countSheet);
    if (!nextPath) {
      return;
    }

    setFilters((current) => ({
      ...current,
      ...nextPath,
      category: '',
    }));
  }, [scanBinFilter?.binId, countSheet.bins, countSheet.bays, countSheet.shelves, countSheet.storageUnits]);

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

  function clearScanBinFilter() {
    setScanBinFilter(null);
    clearFilters();
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

        {scanBinFilter ? (
          <div className="scan-count-context-panel">
            <div>
              <p className="eyebrow">Scanned bin</p>
              <h3>{selectedPathLabel || scanBinFilter.binCode || scanBinFilter.binId}</h3>
              <p>Uses the existing Inventory Count & Correction flow. Inventory is not changed until the count correction is submitted through the approved path.</p>
            </div>
            <button type="button" className="secondary-button" onClick={clearScanBinFilter}>
              Show all count rows
            </button>
          </div>
        ) : null}

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
          <button type="button" className="secondary-button" onClick={printCountSheet}>Print Count Sheet</button>
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
            {scanBinFilter && !countSheet.rows.some((row) => row.bin_id === scanBinFilter.binId)
              ? 'No authorized material rows were found for this scanned bin.'
              : 'No active bin/material rows match the current search, path, category, and repeat filters.'}
          </EmptyState>
        )}
      </section>

      <CountHistoryForItem row={selectedHistoryRow} permissions={permissions} />
      <CountPrintSheet rows={filteredRows} countDrafts={countDrafts} filterSummary={countPrintFilterSummary} />
    </div>
  );
}

function CartScaffold({ permissions, cartCandidates, destinationReferences, onInventoryReload, scanCartContext = null }) {
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
  const [scanBinFilter, setScanBinFilter] = useState(scanCartContext?.binId ? scanCartContext : null);
  const canUseCart = permissions.permissionSource === 'server' && permissions.canInventoryTransactions;
  const cart = cartState.cart;
  const cartDraftKey = getCartDestinationDraftKey(cart?.cart_id);
  const cartIsActive = cart?.status === 'active';
  const cartIsCheckedOut = cart?.status === 'checked_out' || cartState.checkoutResult?.status === 'checked_out';
  const normalizedCandidateSearch = candidateSearch.trim().toLowerCase();
  const hasScanBinFilter = Boolean(scanBinFilter?.binId);
  const stockedCandidateItems = cartCandidates
    .filter((candidate) => Number(candidate.quantity_on_hand ?? 0) > DEFAULT_CANDIDATE_QUANTITY);
  const scanFilteredCandidateItems = hasScanBinFilter
    ? stockedCandidateItems.filter((candidate) => candidate.bin_id === scanBinFilter.binId)
    : stockedCandidateItems;
  const candidateItems = scanFilteredCandidateItems
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
    if (scanCartContext?.binId) {
      setScanBinFilter(scanCartContext);
      setCandidateSearch('');
    }
  }, [scanCartContext?.binId, scanCartContext?.binCode]);

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

  function clearScanBinFilter() {
    setScanBinFilter(null);
    setCandidateQuantityMessage('Showing all stocked bin candidates.');
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
            <h3>{hasScanBinFilter ? 'Scanned Bin Candidates' : 'Stocked Bin Candidates'}</h3>
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
          {hasScanBinFilter ? (
            <div className="scan-cart-context-panel">
              <div>
                <p className="eyebrow">Scanned bin</p>
                <h3>{scanBinFilter.binCode || scanBinFilter.binId}</h3>
                <p>Uses the existing cart checkout flow. Inventory is not changed until checkout is completed.</p>
              </div>
              <button type="button" className="secondary-button" onClick={clearScanBinFilter}>
                Show all stocked bins
              </button>
            </div>
          ) : null}
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
            <EmptyState title={hasScanBinFilter && !scanFilteredCandidateItems.length ? 'No stocked material' : 'No stocked candidates'}>
              {hasScanBinFilter && !scanFilteredCandidateItems.length
                ? 'No authorized stocked material was found for this scanned bin.'
                : 'No stocked bin items match the current picker filters.'}
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

function InventoryReadOnlyPanel({ permissions, navigateTo, requestedTab = '', scanCartContext = null, scanCountContext = null, designPreviewEnabled = false }) {
  const [activeTab, setActiveTab] = useState(INVENTORY_TABS.has(requestedTab) ? requestedTab : 'grand-master');
  const inventory = useInventoryReadModel({ enabled: permissions.permissionSource === 'server' });
  const counts = inventory.model.counts;

  useEffect(() => {
    if (INVENTORY_TABS.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

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
        <button className="module-tab" type="button" aria-selected={activeTab === 'grand-master'} onClick={() => setActiveTab('grand-master')}>
          Grand Master
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'accounting-export'} onClick={() => setActiveTab('accounting-export')}>
          Accounting Export
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')}>
          Catalog Preview
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'storage'} onClick={() => setActiveTab('storage')}>
          Storage Browser
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'locations'} onClick={() => setActiveTab('locations')}>
          Locations & QR
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'scan'} onClick={() => setActiveTab('scan')}>
          Scan QR
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'labels'} onClick={() => setActiveTab('labels')}>
          Label Designer
        </button>
        <button className="module-tab" type="button" aria-selected={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
          Tool Catalogue
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
      {activeTab === 'grand-master' ? <GrandMasterOverviewPanel permissions={permissions} /> : null}
      {activeTab === 'accounting-export' ? <AccountingExportPreviewPanel permissions={permissions} /> : null}
      {activeTab === 'catalog' ? <CatalogPreview rows={inventory.model.catalogPreview} /> : null}
      {activeTab === 'storage' ? <StoragePreview storageUnits={inventory.model.storageUnitsPreview} bins={inventory.model.binsPreview} /> : null}
      {activeTab === 'locations' ? <LocationManagementPanel permissions={permissions} /> : null}
      {activeTab === 'scan' ? <LocationScannerPanel permissions={permissions} navigateTo={navigateTo} /> : null}
      {activeTab === 'labels' ? <LabelTemplateDesignerPanel permissions={permissions} /> : null}
      {activeTab === 'tools' ? <ToolCataloguePanel permissions={permissions} designPreviewEnabled={designPreviewEnabled} /> : null}
      {activeTab === 'cart' ? (
        <CartScaffold
          permissions={permissions}
          cartCandidates={inventory.model.cartCandidates}
          destinationReferences={inventory.model.destinationReferences}
          onInventoryReload={inventory.reload}
          scanCartContext={scanCartContext}
        />
      ) : null}
      {activeTab === 'count' ? (
        <InventoryCountIntakePanel permissions={permissions} scanCountContext={scanCountContext} />
      ) : null}
      {activeTab === 'transactions' ? <TransactionHistoryPanel permissions={permissions} /> : null}

      <p className="build-note">
        Last loaded: {inventory.lastLoadedAt ? new Date(inventory.lastLoadedAt).toLocaleString() : 'not loaded yet'}
      </p>
    </article>
  );
}

function DevelopmentStatusCard() {
  return (
    <article className="card development-status-card">
      <p className="eyebrow">Development Status</p>
      <h2>Latest Build Marker</h2>
      <div className="development-status-grid">
        <span>Most recent change: {DEVELOPMENT_STATUS.mostRecentChange}</span>
        <span>Related HANDOFF: {DEVELOPMENT_STATUS.relatedHandoff}</span>
        <span>Architecture: {DEVELOPMENT_STATUS.architectureVersion}</span>
        <span>Current step: {DEVELOPMENT_STATUS.currentStep}</span>
        <span>Build marker: {DEVELOPMENT_STATUS.buildMarker}</span>
        <span>Deployment note: {DEVELOPMENT_STATUS.deploymentNote}</span>
      </div>
    </article>
  );
}

function LayoutTuner() {
  const [values, setValues] = useState(() => readLayoutTunerValues());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    applyLayoutTunerValues(values);

    if (typeof window !== 'undefined') {
      try {
        const defaults = getLayoutTunerDefaults();
        const isDefault = LAYOUT_TUNER_FIELDS.every((field) => Number(values[field.key]) === Number(defaults[field.key]));
        if (isDefault) {
          window.localStorage.removeItem(LAYOUT_TUNER_STORAGE_KEY);
        } else {
          window.localStorage.setItem(LAYOUT_TUNER_STORAGE_KEY, JSON.stringify(values));
        }
      } catch (error) {
        console.warn('Layout tuner storage unavailable', error);
      }
    }

    return () => {
      clearLayoutTunerInlineValues();
    };
  }, [values]);

  function updateValue(field, value) {
    const numericValue = Number(value);
    const nextValue = Number.isFinite(numericValue)
      ? Math.min(field.max, Math.max(field.min, numericValue))
      : field.defaultValue;
    setValues((current) => ({ ...current, [field.key]: nextValue }));
    setCopyMessage('');
  }

  function resetValues() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LAYOUT_TUNER_STORAGE_KEY);
    }
    setValues(getLayoutTunerDefaults());
    setIsCollapsed(false);
    setCopyMessage('Defaults restored.');
  }

  async function copyCss() {
    const cssSnippet = buildLayoutTunerCss(values);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(cssSnippet);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = cssSnippet;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopyMessage('CSS copied.');
    } catch (error) {
      console.warn('Layout tuner copy failed', error);
      setCopyMessage('Copy failed. Select the CSS preview manually.');
    }
  }

  return (
    <aside className={`layout-tuner${isCollapsed ? ' layout-tuner--collapsed' : ''}`} aria-label="Layout Tuner">
      <div className="layout-tuner__header">
        <div>
          <p className="eyebrow">Dev Tool</p>
          <h2>Layout Tuner</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => setIsCollapsed((current) => !current)}>
          <SlidersHorizontal aria-hidden="true" /> {isCollapsed ? 'Open' : 'Collapse'}
        </button>
      </div>

      {!isCollapsed ? (
        <>
          <p className="layout-tuner__note">
            Local preview only. Values are saved in this browser and do not change production defaults until committed.
          </p>

          <div className="layout-tuner__controls">
            {LAYOUT_TUNER_FIELDS.map((field) => (
              <label className="layout-tuner__field" key={field.key}>
                <span>
                  {field.label}
                  <strong>{values[field.key]}{field.unit}</strong>
                </span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field, event.target.value)}
                />
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field, event.target.value)}
                />
              </label>
            ))}
          </div>

          <pre className="layout-tuner__css">{buildLayoutTunerCss(values)}</pre>

          <div className="layout-tuner__actions">
            <button type="button" className="secondary-button" onClick={copyCss}>
              <Copy aria-hidden="true" /> Copy CSS
            </button>
            <button type="button" className="secondary-button" onClick={resetValues}>
              <RotateCcw aria-hidden="true" /> Reset
            </button>
          </div>
          {copyMessage ? <p className="layout-tuner__message">{copyMessage}</p> : null}
        </>
      ) : null}
    </aside>
  );
}

function Dashboard() {
  const { user } = useUser();
  const permissions = usePermissions();
  const [browserPath, navigateTo] = useBrowserPath();
  const scanRoute = parseLocationScanPayload(browserPath);
  const dashboardRouteContext = useMemo(
    () => getDashboardInventoryRouteContext(browserPath),
    [browserPath],
  );
  const layoutTunerEnabled = hasLayoutTunerFlag(browserPath);
  const designPreviewEnabled = hasDesignPreviewFlag(browserPath);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="eyebrow">Northgate HQ v2.0</p>
            <h1 className="app-title">Operations Dashboard</h1>
            <p className="build-note">{DEVELOPMENT_STATUS.buildMarker}</p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {scanRoute.ok ? (
        <section className="app-main">
          <LocationScanResult
            permissions={permissions}
            locationId={scanRoute.locationId}
            navigateTo={navigateTo}
          />
        </section>
      ) : (
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

        <DevelopmentStatusCard />

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

        <InventoryReadOnlyPanel
          permissions={permissions}
          navigateTo={navigateTo}
          requestedTab={dashboardRouteContext.requestedInventoryTab}
          scanCartContext={dashboardRouteContext.scanCartContext}
          scanCountContext={dashboardRouteContext.scanCountContext}
          designPreviewEnabled={designPreviewEnabled}
        />
      </section>
      )}
      {layoutTunerEnabled ? <LayoutTuner /> : null}
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
