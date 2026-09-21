import test from 'node:test';
import assert from 'node:assert/strict';
import {pasteEntry,pasteWorkItem,pasteComponent} from '../src/modules/estimates/workbench/estimateClipboard.mjs';

const ids=()=>{let value=0;return()=>`new-${++value}`;};
const item={id:'item-1',number:1,name:'Run conduit',status:'Complete',components:[{id:'component-1',name:'Conduit'}],lines:[{id:'line-1',componentId:'component-1',name:'EMT',qty:10,price:2}]};

test('pasting an entry creates fresh nested identifiers and the next entry number',()=>{
 const source={id:'entry-1',number:1,name:'Install receptacle',items:[item]};
 const pasted=pasteEntry(source,[source,{number:4}],ids());
 assert.equal(pasted.number,5);assert.notEqual(pasted.id,source.id);assert.notEqual(pasted.items[0].id,item.id);
 assert.notEqual(pasted.items[0].components[0].id,item.components[0].id);assert.equal(pasted.items[0].lines[0].componentId,pasted.items[0].components[0].id);
});

test('pasting a work item resets workflow state and sequences within the target entry',()=>{
 const pasted=pasteWorkItem(item,[item,{number:3}],ids());
 assert.equal(pasted.number,4);assert.equal(pasted.status,'Not started');assert.notEqual(pasted.lines[0].id,item.lines[0].id);
});

test('pasting a component appends fresh component and line identifiers',()=>{
 const pasted=pasteComponent({component:item.components[0],lines:item.lines}, {...item,components:[],lines:[]}, ids());
 assert.equal(pasted.components.length,1);assert.equal(pasted.lines.length,1);assert.equal(pasted.lines[0].componentId,pasted.components[0].id);
});
