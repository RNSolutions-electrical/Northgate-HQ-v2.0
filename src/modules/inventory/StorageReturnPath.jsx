import { Link } from 'react-router-dom';
import { storageReturnLinks } from './storageReturnLinks.js';
import './storageWorkspace.css';

// Read the same authorized hierarchy as Storage; never infer parents from codes.
export function StorageReturnPath({ records, binId }) {
  if (!binId) return null;
  const links = storageReturnLinks(records, binId);
  return (
    <nav className="storage-breadcrumbs" aria-label="Return to storage location">
      {links.map((link) => (
        <Link key={link.id || 'storage'} className="secondary-button"
          to={link.to}
          aria-current={link.current ? 'location' : undefined}
          title={link.title}
        >
          {link.code}
        </Link>
      ))}
    </nav>
  );
}
