// Actual editor with isolated callbacks. No credentials or live clients.
import React from 'react';
import {createRoot} from 'react-dom/client';
import WorkbenchEditor from '../../src/modules/estimates/workbench/app.jsx';
import {seed,setCatalogue} from '../../src/modules/estimates/workbench/model.mjs';
import {answerConsideration} from '../../src/modules/estimates/workbench/finalizationChecklist.mjs';
import definitions from '../fixtures/estimateChecklistDefinitions.json';
import '../../src/modules/estimates/workbench/style.css';
import '../../src/modules/estimates/workbench/workspace.css';
const line={id:'11111111-1111-4111-8111-111111111111',name:'Conduit',qty:1,unit:'FT',price:null,hours:0.1,stage:'Rough-in',fixed:false,notes:'INTERNAL PRIVATE NOTE'};
let document={...seed('Integration estimate','Fixture customer'),entries:[{id:'entry',number:1,name:'Install receptacle',description:'Office installation',location:'Office',section:'Power',drawing:'E1',items:[{id:'work',number:1,name:'Conduit run',kind:'Assembly',qty:2,status:'In progress',notes:'INTERNAL PRIVATE NOTE',lines:[line]}]}]};
document.library=[{...structuredClone(document.entries[0].items[0]),id:'assembly',libraryId:'assembly',name:'Library conduit',qty:1}];
document=definitions.filter(d=>!d.parent_key).reduce((d,definition)=>answerConsideration(d,definition,definition.key==='available_fault_current'?'not_applicable':'excluded'),document);
setCatalogue([{id:'22222222-2222-4222-8222-222222222222',name:'EMT connector',material_code:'EMT-001',unit:'EA',price:1.25,hours:0,updated_at:'stamp'}]);
const params=new URLSearchParams(location.search),viewer=params.has('viewer');
const saved=JSON.parse(sessionStorage.getItem('integration-draft')||'null');
document=saved||document;
window.integration={saves:[],catalogue:[],approved:[],document};
function save(next,updates,assembly){
 if(assembly)next={...next,library:[...next.library.filter(i=>i.libraryId!==assembly.id),{...assembly,id:assembly.id||'new-library',libraryId:assembly.id||'new-library',qty:1,kind:'Assembly',status:'Not started'}]};
 window.integration.saves.push(structuredClone(next));window.integration.document=structuredClone(next);
 sessionStorage.setItem('integration-draft',JSON.stringify(next));return {document:next};
}
createRoot(window.document.getElementById('root')).render(<WorkbenchEditor initialDocument={document} frameWindow={window} onDirty={()=>{}} onSave={save} onApprove={async next=>{const snapshot={approved_at:new Date().toISOString(),workbench_document:structuredClone(next),pricing_total:42};window.integration.approved.push(snapshot);return snapshot;}} canApprove={!viewer} readOnly={viewer} canEditCatalog={!viewer} onExit={()=>{}} onReloadLibrary={async()=>document.library} onArchiveAssembly={async()=>{}} onHandoff={async()=>{}} checklistConfig={definitions} onReloadChecklist={()=>{}} onCatalogueMaterial={async(line,material,values)=>{window.integration.catalogue.push(values);return {id:material?.id||line.catalogueCandidateId};}}/>);
