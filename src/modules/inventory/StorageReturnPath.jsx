import { Link } from 'react-router-dom';
import { locationTrail, storageNames } from './storageHierarchy.js';
import './storageWorkspace.css';

// Read the same authorized hierarchy as Storage; never infer parents from codes.
export function StorageReturnPath({ records, binId }) {
  if (!binId) return null;
  const trail = locationTrail(records, binId);
  return (
    <nav className="storage-breadcrumbs" aria-label="Return to storage location">
      <Link className="secondary-button" to="/inventory?view=storage">Storage</Link>
      {trail.map(row => (
        <Link key={row.id} className="secondary-button"
          to={`/inventory?${new URLSearchParams({ view: 'storage', locationId: row.id })}`}
          title={`${storageNames[row.type]} ${row.code} — ${row.label || row.code}`}
        >
          {storageNames[row.type]} {row.code}
        </Link>
      ))}
    </nav>
  );
}
