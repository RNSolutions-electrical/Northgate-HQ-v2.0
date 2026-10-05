export const DASHBOARD_DEFAULT_SECTION = 'my-info';

export function dashboardSections(permissions) {
  const canSeeEstimates = permissions?.permissionSource === 'server'
    && (permissions.canEstimate === true || permissions.canApproveEstimates === true);

  return [
    { key: 'my-info', label: 'My Info' },
    { key: 'my-work', label: 'My Work', children: [
      { key: 'assigned-jobs', label: 'Assigned Jobs' },
      { key: 'buyout-attention', label: 'Buyout Attention' },
    ] },
    { key: 'my-vehicles', label: 'My Vehicles', children: [
      { key: 'assigned-vehicles', label: 'Assigned Vehicles' },
    ] },
    { key: 'my-tools', label: 'My Tools', children: [
      { key: 'company-tools', label: 'Company Tools' },
    ] },
    ...(canSeeEstimates ? [{ key: 'my-estimates', label: 'My Estimates', children: [
      { key: 'assigned-estimates', label: 'Assigned Estimates' },
      ...(permissions.canApproveEstimates === true ? [{ key: 'estimate-review', label: 'To Review' }] : []),
    ] }] : []),
  ];
}

export function dashboardSectionFromSearch(search, permissions) {
  const requested = new URLSearchParams(search).get('view');
  return dashboardSections(permissions).some((section) => section.key === requested)
    ? requested
    : DASHBOARD_DEFAULT_SECTION;
}

export function dashboardSectionUrl(sectionKey, childKey = '') {
  const base = `/dashboard?view=${encodeURIComponent(sectionKey)}`;
  return childKey ? `${base}#${encodeURIComponent(childKey)}` : base;
}
