export const DOCUMENT_WORKSPACE_SECTIONS = [
  { key: 'index', label: 'Document Index', description: 'Live job-owned documents visible to the current user.' },
  { key: 'checklist', label: 'Job Checklist', description: 'Visual category coverage across visible job documents.' },
  { key: 'owners', label: 'Owner Scopes', description: 'Approved and reserved document owner types.' },
  { key: 'controls', label: 'Controls', description: 'Storage, archive, and access boundaries.' },
];

export function documentsSectionFromSearch(search) {
  const requested = new URLSearchParams(search).get('view');
  return DOCUMENT_WORKSPACE_SECTIONS.some(({ key }) => key === requested) ? requested : 'index';
}

export function documentsSectionUrl(sectionKey) {
  return `/documents?view=${encodeURIComponent(DOCUMENT_WORKSPACE_SECTIONS.some(({ key }) => key === sectionKey) ? sectionKey : 'index')}`;
}
