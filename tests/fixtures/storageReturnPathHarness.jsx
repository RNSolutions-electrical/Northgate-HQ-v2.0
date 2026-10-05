import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StorageReturnPath } from '../../src/modules/inventory/StorageReturnPath.jsx';

export function renderPath(records, binId) {
  return renderToStaticMarkup(<MemoryRouter><StorageReturnPath records={records} binId={binId} /></MemoryRouter>);
}
