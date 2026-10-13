// Actual shared shell and utility; synthetic identities, no credentials or database clients.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalculatorProvider} from '../../src/components/calculator/Calculator.jsx';
import {AppShell} from '../../src/components/layout/AppShell.jsx';
import {House,Code} from 'lucide-react';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
function Fixture(){
 const [user,setUser]=useState('fixture-a'),[route,setRoute]=useState('dashboard');
 return <CalculatorProvider userId={user} environment="staging"><AppShell title="Northgate" buildLabel="v3.0" navItems={[{key:'dashboard',label:'Dashboard',icon:House},...(user==='fixture-a'?[{key:'developer',label:'Developer',icon:Code}]:[])]} activeWorkspace={route} activeWorkspaceLabel={route} workspaceResetKey={route} onOpenWorkspace={value=>setRoute(typeof value==='string'?value:value.key)} onBack={()=>setRoute('dashboard')} onDashboard={()=>setRoute('dashboard')} onWorkspaceHome={()=>setRoute(route)} profileControl={<button type="button" onClick={()=>setUser(current=>current==='fixture-a'?'fixture-b':'fixture-a')}>Switch fixture user</button>}>
  <section style={{padding:24}}><h2>Background {route}</h2><label>Background input<input/></label><button type="button" onClick={()=>document.getElementById('fixture-modal').showModal()}>Open parent modal</button><dialog id="fixture-modal"><h2>Fixture modal</h2><label>Modal input<input/></label><button type="button" onClick={()=>document.getElementById('fixture-modal').close()}>Close parent modal</button></dialog><button type="button" onClick={()=>setUser(null)}>Fixture sign out</button><iframe title="Notes fixture" src="./estimating-workspace.html" style={{width:'100%',height:700,border:0}}/></section>
 </AppShell></CalculatorProvider>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
