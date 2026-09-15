/**
 * Northgate HQ's human-facing architecture vocabulary.
 *
 * This is deliberately a small, version-controlled registry rather than a
 * database feature: names change with the application and should be reviewed
 * with the code that renders them.
 */
export const UI_ELEMENT_TYPES = Object.freeze({
  PAGE: 'PAGE',
  CARD: 'CARD',
  MODULE: 'MODULE',
  FUNCTION: 'FUNCTION',
});

export const UI_TERMINOLOGY = Object.freeze([
  { type: 'PAGE', name: 'Dashboard', location: '/dashboard', status: 'live' },
  { type: 'PAGE', name: 'Jobs', location: '/jobs', status: 'live' },
  { type: 'PAGE', name: 'Material Inventory', location: '/inventory', status: 'live' },
  { type: 'FUNCTION', name: 'Add Storage Location', location: 'Material Inventory', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Edit Storage Location', location: 'Material Inventory › Storage', status: 'ready for testing' },
  { type: 'MODULE', name: 'Storage Explorer', location: 'Material Inventory › Storage', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Export Storage QR Labels', location: 'Material Inventory › Storage', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Archive Storage Location', location: 'Material Inventory › Storage', status: 'ready for testing' },
  { type: 'MODULE', name: 'Material Aliases', location: 'Material Inventory › Full Catalogue', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Map Material to Location', location: 'Material Inventory › Count', status: 'ready for testing' },
  { type: 'PAGE', name: 'Tool Inventory', location: '/tools', status: 'live' },
  { type: 'PAGE', name: 'Developer', location: '/developer', status: 'live' },
  { type: 'MODULE', name: 'Developer Display Controls', location: 'Developer Page', status: 'live' },
  { type: 'MODULE', name: 'Permission Console', location: 'Developer Page', status: 'live' },
  { type: 'MODULE', name: 'Service Scorecard', location: 'Jobs › Service Calls › Financial scorecard', status: 'ready for testing' },
  { type: 'MODULE', name: 'Service Monthly Profit Report', location: 'Jobs › Service Calls › Financial scorecard', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Export Service Scorecard', location: 'Jobs › Service Calls › Financial scorecard', status: 'ready for testing' },
  { type: 'MODULE', name: 'Service Calls', location: 'Jobs › Service Calls', status: 'ready for testing' },
  { type: 'MODULE', name: 'Service Call Stages', location: 'Developer › Systems', status: 'ready for testing' },
  { type: 'MODULE', name: 'Service Call Profit Summary', location: 'Service Calls', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Service Call Import Preview', location: 'Service Calls', status: 'preview only' },
  { type: 'FUNCTION', name: 'Allocate Service Invoice', location: 'Service Calls › Costs & Billing', status: 'ready for testing' },
  { type: 'MODULE', name: 'Panel Directory', location: 'Add-On Tools', status: 'live' },
  { type: 'MODULE', name: 'Estimate Proposal Builder', location: 'Estimates › Proposal', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Create Editable Estimate Revision', location: 'Estimates', status: 'ready for testing' },
  { type: 'FUNCTION', name: 'Delete Draft Estimate Content', location: 'Estimates › Pricing', status: 'ready for testing' },
  { type: 'MODULE', name: 'Project Financials', location: 'Jobs Page', status: 'live' },
  { type: 'CARD', name: 'Project Financial Summary', location: 'Jobs › Financials', status: 'live' },
  { type: 'FUNCTION', name: 'Import Cost Report', location: 'Jobs › Financials', status: 'live' },
  { type: 'FUNCTION', name: 'Add Change Order', location: 'Jobs › Change Orders', status: 'live' },
  { type: 'FUNCTION', name: 'Save Panel Directory', location: 'Panel Directory', status: 'live' },
  { type: 'FUNCTION', name: 'Print Panel Directory', location: 'Panel Directory', status: 'live' },
]);

export function uiElementAttributes(type, name, { undefinedElement = false } = {}) {
  return {
    'data-ng-ui-type': type,
    'data-ng-ui-name': name,
    ...(undefinedElement ? { 'data-ng-ui-undefined': 'true' } : {}),
  };
}
