import { locationTrail, storageNames } from './storageHierarchy.js';

// Use the authorized Storage hierarchy, not location-code guesses.
export function storageReturnLinks(records, binId) {
  if (!binId) return [];
  return [
    { id: null, code: 'Storage', to: '/inventory?view=storage' },
    ...locationTrail(records, binId).map((row) => ({
      id: row.id,
      code: row.code,
      to: `/inventory?${new URLSearchParams({ view: 'storage', locationId: row.id })}`,
      current: row.id === binId,
      title: `${storageNames[row.type]} ${row.code} — ${row.label || row.code}`,
    })),
  ];
}
