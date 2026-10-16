import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Outlet,useNavigate,useLocation} from 'react-router-dom';
import {House} from 'lucide-react';
import {AppShell} from '../../src/components/layout/AppShell.jsx';
import {CalculatorProvider} from '../../src/components/calculator/Calculator.jsx';
import WorkbenchRoute from '../../src/modules/estimates/workbench/WorkbenchRoute.jsx';
import {ESTIMATES_WORKSPACE_SECTIONS} from '../../src/modules/estimates/estimatesNavigation.js';
import {seed} from '../../src/modules/estimates/workbench/model.mjs';
import {newLaborRates} from '../../src/modules/estimates/workbench/laborRates.mjs';
import {answerConsideration} from '../../src/modules/estimates/workbench/finalizationChecklist.mjs';
import {handoffPreview} from '../../src/modules/estimates/workbench/handoff.mjs';
import definitions from '../fixtures/estimateChecklistDefinitions.json';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
const settings={default_rate:95,division:'Electrical'},params=new URLSearchParams(location.search);
let doc={...newLaborRates(seed('Standalone fixture','Fixture customer'),settings),entries:[{id:'entry',number:1,name:'Install light',internalNotes:'PRIVATE entry',location:'Office',section:'Power',items:[{id:'item',number:1,name:'Light work',kind:'Assembly',qty:2,notes:'PRIVATE work',components:[{id:'component',name:'Light',internalNotes:'PRIVATE component'}],lines:[{id:'line',componentId:'component',name:'Fixture material',qty:1,unit:'EA',price:10.05,hours:0.15,stage:'Rough-in',notes:'PRIVATE resource'}]}]}]};
doc=definitions.filter(d=>!d.parent_key).reduce((value,d)=>answerConsideration(value,d,d.key==='available_fault_current'?'not_applicable':'excluded'),doc);
if(params.get('componentless')==='manual'){
 doc.entries[0].items[0].components=[];for(const line of doc.entries[0].items[0].lines)delete line.componentId;
}
if(params.get('componentless')==='quote'){
 doc.packages=[{id:'quote-package',name:'Fixture quoted scope',section:'Vendor quotes',awardedQuoteId:'quote'}];
 doc.quotes=[{id:'quote',packageId:'quote-package',name:'Fixture quote',vendor:'Fixture supplier',materialAmount:100,otherAmount:25}];
 doc.entries[0].packageId='quote-package';doc.entries[0].items[0]={...doc.entries[0].items[0],quoteId:'quote',components:[],lines:[]};
}
if(params.get('componentless')==='unpriced'){doc.entries[0].items[0].components=[];doc.entries[0].items[0].lines=[];}
window.standaloneFixture={definitions,settings,calls:[],mode:'success',request:null,pending:null,handoff:null,total:handoffPreview(doc).total,row:{estimate_id:'estimate-fixture',revision:1,document:doc,estimates:{division:'Electrical',status:'draft',version_number:1}}};
function Shell(){const [visible,setEstimatesNavVisible]=useState(true),navigate=useNavigate(),location=useLocation();return <CalculatorProvider userId="standalone-fixture" environment="staging"><AppShell title="Northgate" buildLabel="Local fixture" navItems={[{key:'estimates',label:'Estimates',icon:House}]} activeWorkspace="estimates" activeWorkspaceLabel="Estimates" estimatesNavigation={visible?ESTIMATES_WORKSPACE_SECTIONS:null} activeEstimatesSection={new URLSearchParams(location.search).get('view')||'official'} onEstimatesSectionSelect={value=>navigate('/estimates?view='+(typeof value==='string'?value:value.key))} onOpenWorkspace={()=>{}} onBack={()=>{}} onDashboard={()=>{}} onWorkspaceHome={()=>{}}><Outlet context={{setEstimatesNavVisible}}/></AppShell></CalculatorProvider>;}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[params.has('review')?'/estimates?view=review':'/estimates?view=official']}><Routes><Route element={<Shell/>}><Route path="/estimates" element={<WorkbenchRoute/>}/><Route path="/jobs" element={<p>Fixture destination</p>}/></Route></Routes></MemoryRouter>);
