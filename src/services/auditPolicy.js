// This registry defines reason requirements, not authorization.
const ROUTINE_WORKFLOWS = new Set([
  'financial.routine', 'financial.current-budget', 'financial.actual-import',
  'employee.self-profile', 'vehicle.create', 'vehicle.assign', 'vehicle.release',
  'tool.create', 'tool.checkout', 'tool.return', 'schedule.progress',
  'estimate.pricing', 'document.upload', 'change-order.draft',
]);

export function requiresAuditReason({ action, workflow, protectedChange = false }) {
  if (protectedChange || ['archive', 'delete', 'retire', 'permission_change'].includes(action)) return true;
  if (ROUTINE_WORKFLOWS.has(workflow)) return false;
  return action !== 'create';
}

export function hasReasonCoverage(changes, sharedReason = '') {
  return changes.every((change) => !change.requiresReason
    || Boolean(String(change.reason || '').trim() || String(sharedReason || '').trim()));
}

export function combineAuditReasons(sharedReason, lineReason) {
  return [
    String(sharedReason || '').trim() ? `Batch: ${String(sharedReason).trim()}` : '',
    String(lineReason || '').trim() ? `Line: ${String(lineReason).trim()}` : '',
  ].filter(Boolean).join('\n');
}
