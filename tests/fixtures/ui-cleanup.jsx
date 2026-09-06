import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { EmployeesWorkspace } from '../../src/modules/employees/EmployeesWorkspace.jsx';
import { DiagnosticsProvider } from '../../src/components/ui/Diagnostics.jsx';
import { SummaryCard } from '../../src/components/ui/SummaryCard.jsx';
import { StatePanel } from '../../src/components/ui/StatePanel.jsx';
import { useDevelopmentDisplayPreferences } from '../../src/hooks/useIncompleteHighlight.js';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';

const mode = new URLSearchParams(location.search).get('mode') || 'user';
const permissions = { permissionSource: 'server', canAccessDeveloper: mode === 'developer', canManageEmployees: mode !== 'user', userId: 'fixture-user', department: 'Electrical' };
function Fixture() {
  const { showDiagnostics, setShowDiagnostics } = useDevelopmentDisplayPreferences();
  useEffect(() => {
    document.documentElement.classList.toggle('ng-hide-development', !(permissions.canAccessDeveloper && showDiagnostics));
  }, [showDiagnostics]);
  return <MemoryRouter initialEntries={[{ pathname: '/employees', state: { employeeView: 'mine' } }]}>
    <label><input aria-label="Fixture diagnostics preference" type="checkbox" checked={showDiagnostics} onChange={(e) => setShowDiagnostics(e.target.checked)} />Diagnostics preference</label>
    <DiagnosticsProvider permissions={permissions} enabled={showDiagnostics}>
      <main style={{ padding: '16px', maxWidth: '1300px', margin: 'auto' }}>
        <EmployeesWorkspace permissions={permissions} />
        <section aria-label="Operational regression checks">
          <SummaryCard label="Budget" value="$10,000" detail="Original budget plus approved change orders" />
          <StatePanel tone="danger" eyebrow="Boundary" title="Save failed" description="Your changes were not saved. Retry." />
          <StatePanel title="No documents" description="Upload a document to get started." />
          <button className="primary-button" disabled>Saving record...</button>
        </section>
      </main>
    </DiagnosticsProvider>
  </MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
