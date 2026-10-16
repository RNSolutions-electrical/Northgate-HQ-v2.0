import React from 'react';
import {createRoot} from 'react-dom/client';
import WorkbenchEditor from '../../src/modules/estimates/workbench/app.jsx';
import {seed} from '../../src/modules/estimates/workbench/model.mjs';
import {newLaborRates,inheritAssemblyRate} from '../../src/modules/estimates/workbench/laborRates.mjs';
import '../../src/modules/estimates/workbench/style.css';
import '../../src/modules/estimates/workbench/workspace.css';
const libraryOnly=new URLSearchParams(location.search).has('library');
const initialAssembly={id:'assembly',libraryId:'assembly',name:'Test assembly',qty:1,kind:'Assembly',status:'Not started',lines:[{id:'line',name:'Labor',qty:1,unit:'HR',price:0,hours:2,stage:'Rough-in',fixed:false,notes:''}]};
let settings=JSON.parse(sessionStorage.getItem('rates-settings')||'null')||{default_rate:75,updated_at:'initial',division:'Electrical'};
let library=JSON.parse(sessionStorage.getItem('rates-library')||'null')||[initialAssembly];
let document=JSON.parse(sessionStorage.getItem('rates-document')||'null')||newLaborRates(seed('Rate fixture'),settings);
document.entries=document.entries.length?document.entries:[{id:'entry',number:1,name:'Install',section:'Power',location:'Office',items:[{...inheritAssemblyRate(structuredClone(initialAssembly),initialAssembly),id:'item',number:1}]}];
const initial=libraryOnly?{...newLaborRates(seed('Library'),settings),librarySettings:settings,library}: {...document,library};
window.rateFixture={document,settings,library,saves:0};
const load=async()=>({settings,library:structuredClone(library)});
const save=async(next,updates,assembly)=>{
 window.rateFixture.saves++;
 if(assembly){library=[{...assembly,id:'assembly',libraryId:'assembly',qty:1,kind:'Assembly',status:'Not started'}];sessionStorage.setItem('rates-library',JSON.stringify(library));next={...next,library};}
 else {document=structuredClone(next);sessionStorage.setItem('rates-document',JSON.stringify(document));window.rateFixture.document=document;}
 return {document:next};
};
createRoot(window.document.getElementById('root')).render(<WorkbenchEditor initialDocument={initial} approvedSnapshot={JSON.parse(sessionStorage.getItem('rates-approval')||'null')} libraryOnly={libraryOnly} frameWindow={window} onDirty={()=>{}} onExit={()=>{}} canEditCatalog onSave={save} onReloadLibrary={async()=>library} onLoadLibraryRates={load} onSaveLibrarySettings={async rate=>{settings={...settings,default_rate:rate,updated_at:String(Date.now())};sessionStorage.setItem('rates-settings',JSON.stringify(settings));window.rateFixture.settings=settings;return settings;}}/>);
