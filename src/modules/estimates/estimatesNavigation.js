export const ESTIMATES_WORKSPACE_SECTIONS = [
  { key: 'official', label: 'Official Estimates', description: 'Division estimates and approved versions.' },
  { key: 'personal', label: 'My Estimates', description: 'Private working estimates.' },
  { key: 'review', label: 'Review Submissions', description: 'Submitted estimates awaiting review.' },
  { key: 'assemblies', label: 'Assembly Library', description: 'Shared estimating assemblies.' },
];

export function visibleEstimatesSections(permissions) {
  const personalOnly = permissions?.canSavePersonalWork === true
    && permissions?.canEstimate !== true
    && permissions?.canApproveEstimates !== true;
  if (personalOnly) return ESTIMATES_WORKSPACE_SECTIONS.filter(({ key }) => key === 'personal');
  return ESTIMATES_WORKSPACE_SECTIONS.filter(({ key }) => key !== 'review' || permissions?.canApproveEstimates === true);
}

export function estimatesSectionFromLocation(pathname, search, permissions, navigationState) {
  if (pathname === '/estimates/assemblies') return 'assemblies';
  const requested = new URLSearchParams(search).get('view');
  const available = visibleEstimatesSections(permissions);
  if (available.some(({ key }) => key === requested)) return requested;
  if (navigationState?.reviewMode && available.some(({ key }) => key === 'review')) return 'review';
  return available.some(({ key }) => key === 'official') ? 'official' : 'personal';
}

export function estimatesSectionUrl(sectionKey) {
  return sectionKey === 'assemblies' ? '/estimates/assemblies' : `/estimates?view=${encodeURIComponent(sectionKey)}`;
}
