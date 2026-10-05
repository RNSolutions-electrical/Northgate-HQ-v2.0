export const JOB_DIRECTORY_SECTIONS = [
  { key: 'active', label: 'Active Jobs', description: 'Currently active.' },
  { key: 'on_hold', label: 'On Hold', description: 'Paused jobs.' },
  { key: 'complete', label: 'Completed', description: 'Completed jobs.' },
  { key: 'cancelled', label: 'Cancelled', description: 'Cancelled jobs.' },
  { key: 'all', label: 'All Jobs', description: 'All available jobs.' },
];

export function jobDirectorySectionFromSearch(search) {
  const requested = new URLSearchParams(search).get('view');
  return JOB_DIRECTORY_SECTIONS.some(({ key }) => key === requested) ? requested : 'active';
}

export function jobDirectorySectionUrl(sectionKey) {
  return `/jobs?view=${encodeURIComponent(sectionKey)}`;
}
