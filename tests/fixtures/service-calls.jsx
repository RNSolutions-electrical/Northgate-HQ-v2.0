import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceCallsWorkspace } from '../../src/modules/service-calls/ServiceCallsWorkspace.jsx';
import { MemoryRouter,Routes,Route,useLocation } from 'react-router-dom';
import { LegacyServiceScorecardRedirect } from '../../src/modules/service-calls/LegacyServiceScorecardRedirect.jsx';
import { AddOnToolsWorkspace } from '../../src/modules/addons/AddOnToolsWorkspace.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
const readonly = new URLSearchParams(location.search).has('readonly');
function Workspace() {
 const location=useLocation();window.serviceFixture.route={pathname:location.pathname,state:location.state};
 return <ServiceCallsWorkspace initialDirectoryView={location.state?.serviceCallView} permissions={{canCreateJobs:!readonly,canViewProjectFinancials:!readonly}}
 onJobs={()=>{window.serviceFixture.navigation='jobs';}} onReturnList={()=>{}} onResources={(call,tab)=>{window.serviceFixture.navigation=tab;}} />;
}
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[params.has('legacy')?'/service-performance/reports':params.has('addons')?'/add-on-tools':'/jobs']}>
 <Routes><Route path="/service-performance/*" element={<LegacyServiceScorecardRedirect/>}/><Route path="/jobs" element={<Workspace/>}/>
 <Route path="/add-on-tools" element={<AddOnToolsWorkspace permissions={{canAccessAddon:()=>true}}/>}/></Routes>
</MemoryRouter>);
