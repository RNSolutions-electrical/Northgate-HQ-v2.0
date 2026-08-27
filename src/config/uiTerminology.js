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
  { type: 'PAGE', name: 'Tool Inventory', location: '/tools', status: 'live' },
  { type: 'PAGE', name: 'Developer', location: '/developer', status: 'live' },
  { type: 'MODULE', name: 'Developer Display Controls', location: 'Developer Page', status: 'live' },
  { type: 'MODULE', name: 'Permission Console', location: 'Developer Page', status: 'live' },
  { type: 'MODULE', name: 'Service Scorecard', location: 'Add-On Tools', status: 'live' },
  { type: 'MODULE', name: 'Project Financials', location: 'Jobs Page', status: 'live' },
  { type: 'CARD', name: 'Project Financial Summary', location: 'Jobs › Financials', status: 'live' },
  { type: 'FUNCTION', name: 'Import Cost Report', location: 'Jobs › Financials', status: 'live' },
  { type: 'FUNCTION', name: 'Add Change Order', location: 'Jobs › Change Orders', status: 'live' },
]);

export function uiElementAttributes(type, name, { undefinedElement = false } = {}) {
  return {
    'data-ng-ui-type': type,
    'data-ng-ui-name': name,
    ...(undefinedElement ? { 'data-ng-ui-undefined': 'true' } : {}),
  };
}
