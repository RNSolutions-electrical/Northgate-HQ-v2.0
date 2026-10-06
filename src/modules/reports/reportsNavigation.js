export const REPORT_WORKSPACE_SECTIONS = [
  { key: 'library', label: 'Report Library', description: 'Live read-only reports and reserved report surfaces.' },
  { key: 'access', label: 'Access Snapshot', description: 'Current permission context in report form.' },
  { key: 'operations', label: 'Operational Sources', description: 'Read-model status for report sources.' },
];

export function reportsSectionFromSearch(search) {
  const requested = new URLSearchParams(search).get('view');
  return REPORT_WORKSPACE_SECTIONS.some(({ key }) => key === requested) ? requested : 'library';
}

export function reportsSectionUrl(sectionKey) {
  const key = REPORT_WORKSPACE_SECTIONS.some((section) => section.key === sectionKey) ? sectionKey : 'library';
  return `/reports?view=${encodeURIComponent(key)}`;
}
