// Availability is independent of permissions. Never use it to grant access.
export const ALWAYS_AVAILABLE = new Set(['dashboard', 'developer']);
export function toolIsEnabled(key, rows) {
  return ALWAYS_AVAILABLE.has(key) || rows?.find(row => row.module_key === key)?.is_enabled === true;
}
export function toolForPath(pathname, modules) {
  try { pathname = decodeURIComponent(pathname).toLowerCase(); } catch { pathname = String(pathname).toLowerCase(); }
  if (/^\/scan\/location(?:\/|$)/.test(pathname)) return 'inventory';
  if (/^\/service-performance(?:\/|$)/.test(pathname)) return 'jobs';
  return modules.find(module => pathname === module.path || pathname.startsWith(module.path + '/'))?.key || null;
}
export function canPreviewDisabledTool(permissions, location, key) {
  return permissions?.permissionSource === 'server' && permissions?.canAccessDeveloper === true
    && location?.state?.developerToolPreview === key;
}

export function toolIsVisible(key,permissions) { return !permissions?.toolAvailability || toolIsEnabled(key,permissions.toolAvailability.rows); }
