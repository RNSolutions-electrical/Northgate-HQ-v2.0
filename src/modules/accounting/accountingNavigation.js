export const ACCOUNTING_WORKSPACE_SECTIONS = [
  { key: 'budget-review', label: 'Budget Review', description: 'Read-only budget foundation rows.' },
  { key: 'category-totals', label: 'Category Totals', description: 'Budget totals grouped by locked categories.' },
  { key: 'exports', label: 'Export Readiness', description: 'Approved export boundaries.' },
  { key: 'controls', label: 'Reserved Controls', description: 'Pricing, invoice, PO, and posting boundaries.' },
];

export function accountingSectionFromSearch(search) {
  const requested = new URLSearchParams(search).get('view');
  return ACCOUNTING_WORKSPACE_SECTIONS.some(({ key }) => key === requested) ? requested : 'budget-review';
}

export function accountingSectionUrl(sectionKey) {
  const key = ACCOUNTING_WORKSPACE_SECTIONS.some((section) => section.key === sectionKey) ? sectionKey : 'budget-review';
  return `/accounting?view=${encodeURIComponent(key)}`;
}
