import React from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Outlet} from 'react-router-dom';
import {JobsWorkspace} from '../../src/modules/jobs/JobsWorkspace.jsx';import {DiagnosticsProvider} from '../../src/components/ui/Diagnostics.jsx';
import '../../src/styles/tokens.css';import '../../src/styles/base.css';import '../../src/styles/primitives.css';
const query=location.search,permissions={permissionSource:query.includes('unverified')?'fallback':'server',role:'Manager',division:'Electrical',
 canManageJobs:!query.includes('names-only')&&!query.includes('no-edit'),canViewProjectFinancials:!query.includes('details-only')&&!query.includes('no-edit'),canViewFinancials:true,canApproveBudget:!query.includes('names-only')};
document.documentElement.classList.add('ng-hide-development');
createRoot(document.getElementById('root')).render(<MemoryRouter><Routes><Route element={<Outlet context={{setJobsNavState:()=>{}}}/>}><Route path="*" element={<DiagnosticsProvider permissions={permissions} enabled={false}><div className="ng-shell"><header className="ng-shell__header"><div className="ng-shell__header-inner">Northgate fixture navigation</div></header><div className="ng-environment-banner">STAGING · Test data only</div><main className="ng-shell__content"><JobsWorkspace permissions={permissions}/></main></div></DiagnosticsProvider>}/></Route></Routes></MemoryRouter>);
