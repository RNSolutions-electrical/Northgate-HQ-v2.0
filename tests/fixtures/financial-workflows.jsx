import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { JobsWorkspace } from '../../src/modules/jobs/JobsWorkspace.jsx';
import { DiagnosticsProvider } from '../../src/components/ui/Diagnostics.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
const permissions = { permissionSource:'server', role:'Manager', division:'Electrical', canViewProjectFinancials:!location.search.includes('no-financial-access'),
  canViewFinancials:true, canApproveBudget:!location.search.includes('readonly'), canManageJobs:true };
document.documentElement.classList.add('ng-hide-development');
createRoot(document.getElementById('root')).render(<MemoryRouter><Routes><Route element={<Outlet context={{setJobsNavState:()=>{}}} />}><Route path="*" element={<DiagnosticsProvider permissions={permissions} enabled={false}>
  <main style={{padding:12,minWidth:0}}><JobsWorkspace permissions={permissions} /></main>
</DiagnosticsProvider>} /></Route></Routes></MemoryRouter>);
