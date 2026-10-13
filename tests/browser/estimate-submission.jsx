import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Outlet,useNavigate} from 'react-router-dom';
import WorkbenchRoute from '../../src/modules/estimates/workbench/WorkbenchRoute.jsx';
import {AppShell} from '../../src/components/layout/AppShell.jsx';
import {CalculatorProvider} from '../../src/components/calculator/Calculator.jsx';
import {House} from 'lucide-react';
import {seed} from '../../src/modules/estimates/workbench/model.mjs';
import '../../src/styles/base.css';
import '../../src/styles/tokens.css';
import '../../src/styles/primitives.css';
const params=new URLSearchParams(location.search);
const doc={...seed('Submission fixture','Test customer'),entries:[]};
window.submissionFixture={calls:[],mode:'failure',pending:null,rows:[{id:'fixture-1',version:1,work_type:'estimate',status:params.has('locked')?'submitted':'draft',scope_context:{division:'Electrical'},payload:doc}]};
const setEstimatesNavVisible=()=>{};
function Shell(){const navigate=useNavigate();return <CalculatorProvider userId="submission-fixture" environment="staging"><AppShell title="Northgate" buildLabel="Local fixture" navItems={[{key:'estimates',label:'Estimates',icon:House}]} activeWorkspace="estimates" activeWorkspaceLabel="Estimates" onOpenWorkspace={()=>{}} onBack={()=>{}} onDashboard={()=>{}} onWorkspaceHome={()=>{}} profileControl={<><button onClick={()=>navigate('/estimates?view=personal&next=1')}>Change route</button><button onClick={()=>navigate('/away')}>Leave route</button></>}><Outlet context={{setEstimatesNavVisible}}/></AppShell></CalculatorProvider>;}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/estimates?view=personal']}><Routes><Route element={<Shell/>}><Route path="/estimates" element={<WorkbenchRoute/>}/><Route path="/away" element={<p>Away</p>}/></Route></Routes></MemoryRouter>);
