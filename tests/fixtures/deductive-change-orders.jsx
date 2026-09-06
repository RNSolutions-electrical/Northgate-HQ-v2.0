import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChangeOrderWorkspace } from '../../src/modules/jobs/ChangeOrderWorkspace.jsx';
import { DiagnosticsProvider } from '../../src/components/ui/Diagnostics.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';

const readonly = location.search.includes('readonly');
const permissions = {canCreateChangeOrders:!readonly,canSubmitChangeOrders:!readonly};
document.documentElement.classList.add('ng-hide-development');
createRoot(document.getElementById('root')).render(<DiagnosticsProvider permissions={permissions} enabled={false}>
  <main style={{padding:12,minWidth:0}}><ChangeOrderWorkspace
    job={{id:'job-1',name:'Credit fixture',division:'Electrical'}}
    budgetLines={[{id:'budget-1',cost_code:'01.CO',description:'Lighting changes'}]}
    initialOrder={location.search.includes('reopen') ? JSON.parse(sessionStorage.getItem('credit-order')) : null}
    permissions={permissions} onClose={()=>{}} /></main>
</DiagnosticsProvider>);
