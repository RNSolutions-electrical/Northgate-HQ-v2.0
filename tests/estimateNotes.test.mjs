import test from 'node:test';
import assert from 'node:assert/strict';
import {copyWorkItem} from '../src/modules/estimates/workbench/componentStructure.mjs';
import {pasteEntry,pasteComponent} from '../src/modules/estimates/workbench/estimateClipboard.mjs';
import {assemblyLibrarySave} from '../src/modules/estimates/workbench/assemblyLibrary.mjs';
import {makeTemplate,refreshed} from '../src/modules/estimates/workbench/model.mjs';
import {suggestedScope} from '../src/modules/estimates/workbench/proposal.mjs';
import {makeReport} from '../src/modules/estimates/workbench/reports.mjs';
const item={id:'i',name:'Work',qty:1,notes:'PRIVATE work',components:[{id:'c',name:'Component',internalNotes:'PRIVATE component'}],lines:[{id:'l',componentId:'c',name:'Material',notes:'PRIVATE resource',qty:1,price:1,hours:1}]};
const entry={id:'e',number:1,name:'Entry',internalNotes:'PRIVATE entry',items:[item]};
test('JSON reload and estimate copies preserve every annotation with renewed IDs',()=>{
 const reload=JSON.parse(JSON.stringify(entry));assert.deepEqual(reload,entry);
 const copied=pasteEntry(reload,[]);assert.equal(copied.internalNotes,entry.internalNotes);assert.notEqual(copied.id,entry.id);
 const work=copyWorkItem(item);assert.equal(work.notes,item.notes);assert.equal(work.components[0].internalNotes,item.components[0].internalNotes);assert.equal(work.lines[0].notes,item.lines[0].notes);assert.equal(work.lines[0].componentId,work.components[0].id);
 const pasted=pasteComponent({component:item.components[0],lines:item.lines},item);assert.equal(pasted.components[1].internalNotes,'PRIVATE component');assert.equal(pasted.lines[1].notes,'PRIVATE resource');
});
test('estimate annotations cannot leak to reusable assemblies or templates',()=>{
 const shared=assemblyLibrarySave(item);assert.equal(shared.notes,'');assert.equal(shared.lines[0].notes,'');assert.equal(shared.components[0].internalNotes,undefined);
 const libraryEdit=assemblyLibrarySave(item,{editingLibrary:true});assert.equal(libraryEdit.notes,item.notes);assert.equal(libraryEdit.lines[0].notes,item.lines[0].notes);assert.equal(libraryEdit.components[0].internalNotes,undefined);
 const template=makeTemplate({rate:75,sections:[],entries:[entry]},'Template',true);assert.equal(template.entries[0].internalNotes,undefined);assert.equal(template.entries[0].items[0].notes,'');assert.equal(template.entries[0].items[0].components[0].internalNotes,undefined);assert.equal(template.entries[0].items[0].lines[0].notes,'');
 assert.equal(refreshed(item).components[0].internalNotes,undefined);assert.match(item.components[0].internalNotes,/PRIVATE/);
 assert.doesNotMatch(suggestedScope({entries:[entry]}),/PRIVATE/);
 for(const kind of ['proposal','field','rfq','takeoff','summary'])assert.doesNotMatch(JSON.stringify(makeReport({name:'Test',rate:75,materialMarkup:30,feePercent:30,entries:[entry],quotes:[],proposal:{}},kind)),/PRIVATE/);
});
