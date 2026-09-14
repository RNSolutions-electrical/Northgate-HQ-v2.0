import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceCallsWorkspace } from '../../src/modules/service-calls/ServiceCallsWorkspace.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
const readonly = new URLSearchParams(location.search).has('readonly');
createRoot(document.getElementById('root')).render(<ServiceCallsWorkspace permissions={{canCreateJobs:!readonly,canViewProjectFinancials:!readonly}}
 onJobs={()=>{window.serviceFixture.navigation='jobs';}} onReturnList={()=>{}} onResources={(call,tab)=>{window.serviceFixture.navigation=tab;}} />);

