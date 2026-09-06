import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { InventoryWorkspace, InventoryScanRoute } from '../../src/modules/inventory/InventoryWorkspace.jsx';
import { DiagnosticsProvider } from '../../src/components/ui/Diagnostics.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
const params = new URLSearchParams(location.search);
const permissions = { permissionSource: 'server', canInventoryTransactions: !params.has('readonly'), canManageInventory: false, role: 'Employee' };
document.documentElement.classList.add('ng-hide-development');
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[params.has('scan') ? '/inventory?view=stock&scanBinId=b1' : '/inventory']}>
  <DiagnosticsProvider permissions={permissions} enabled={false}><main style={{ padding: 16, maxWidth: 1400, margin: 'auto' }}>
    <Routes><Route path="/inventory" element={<InventoryWorkspace permissions={permissions} />} /><Route path="/scan/location/:locationId" element={<InventoryScanRoute />} /></Routes>
  </main></DiagnosticsProvider>
</MemoryRouter>);
