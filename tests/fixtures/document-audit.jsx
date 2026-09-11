import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {JobsWorkspace} from '../../src/modules/jobs/JobsWorkspace.jsx';
import {EstimatesWorkspace} from '../../src/modules/estimates/EstimatesWorkspace.jsx';
import {DiagnosticsProvider} from '../../src/components/ui/Diagnostics.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
const permissions={permissionSource:'server',role:'Developer',division:'Electrical',userId:'fixture',
  canManageJobs:true,canEstimate:true,canViewFinancials:true,canViewProjectFinancials:true};
document.documentElement.classList.add('ng-hide-development');
createRoot(document.getElementById('root')).render(<MemoryRouter><DiagnosticsProvider permissions={permissions} enabled={false}>
<main style={{padding:12,minWidth:0}}>{location.search.includes('estimate')?<EstimatesWorkspace permissions={permissions}/>:<JobsWorkspace permissions={permissions}/>}</main>
</DiagnosticsProvider></MemoryRouter>);
