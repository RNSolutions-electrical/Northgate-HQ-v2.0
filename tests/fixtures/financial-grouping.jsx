import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Outlet} from 'react-router-dom';
import {JobsWorkspace} from '../../src/modules/jobs/JobsWorkspace.jsx';
import {DiagnosticsProvider} from '../../src/components/ui/Diagnostics.jsx';
import '../../src/styles/tokens.css';import '../../src/styles/base.css';import '../../src/styles/primitives.css';
const permissions={permissionSource:'server',role:'Developer',division:'Construction',canManageJobs:true,
 canViewProjectFinancials:true,canViewFinancials:true,canViewProtectedProjectFinancials:!location.search.includes('restricted'),
 canApproveBudget:!location.search.includes('contributor')};
document.documentElement.classList.add('ng-hide-development');
createRoot(document.getElementById('root')).render(<MemoryRouter><Routes><Route element={<Outlet context={{setJobsNavState:()=>{}}}/>}><Route path="*" element={<DiagnosticsProvider permissions={permissions} enabled={false}><div className="ng-shell"><header className="ng-shell__header"><div className="ng-shell__header-inner">Local financial verification</div></header><div className="ng-environment-banner">LOCAL FIXTURE - no live saves</div><main className="ng-shell__content"><JobsWorkspace permissions={permissions}/></main></div></DiagnosticsProvider>}/></Route></Routes></MemoryRouter>);
