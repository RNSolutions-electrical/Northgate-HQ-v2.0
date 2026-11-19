import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkEditBuffer} from '../src/modules/estimates/workbench/workEditBuffer.mjs';
import {includeWorkEdit,saveWorkDraft} from '../src/modules/estimates/workbench/blankWorkEditing.mjs';
import {saveWorkToEstimate} from '../src/modules/estimates/workbench/blankWorkSave.mjs';
const fixture=()=>({blankSlateVersion:1,rate:100,blankSlateHardRate:40,materialMarkup:20,feePercent:0,proposal:{},entries:[]});
const edit=()=>({entryId:'e',isNew:true,item:{id:'w',name:'Work',qty:1,lines:[{id:'r',name:'Part',unit:'EA',qty:1,price:10,hours:1}]}});
test('all final digits survive include/save without blur; exact draft strings retained',async()=>{
 const b=createWorkEditBuffer(),original=edit();b.reset(original);
 for(const value of ['1','12','12.','12.34'])b.stage('price',i=>{i.lines[0].price=value;i.lines[0].priceOverride=true;});
 b.stage('hours',i=>{i.lines[0].hours='0.125';i.lines[0].laborOverride=true;});
 assert.equal(original.item.lines[0].price,10);assert.equal(b.resolve().item.lines[0].price,'12.34');
 assert.equal(includeWorkEdit(fixture(),b.resolve()).entries[0].items[0].lines[0].price,'12.34');
 let saved;await saveWorkToEstimate(fixture(),b.resolve(),async d=>{saved=d;return {document:d};});
 assert.equal(saved.entries[0].items[0].lines[0].hours,'0.125');assert.equal(saved.entries[0].items[0].lines[0].laborOverride,true);
});
test('failed save and invalid numeric draft preserve input and previous included estimate',async()=>{
 const b=createWorkEditBuffer(),doc=fixture(),before=structuredClone(doc);b.reset(edit());b.stage('price',i=>{i.lines[0].price='17.00';});
 await assert.rejects(()=>saveWorkToEstimate(doc,b.resolve(),async()=>{throw Error('CAS conflict');}),/CAS/);
 assert.deepEqual(doc,before);assert.equal(b.resolve().item.lines[0].price,'17.00');
 b.stage('price',i=>{i.lines[0].price='.';});assert.throws(()=>includeWorkEdit(doc,b.resolve()));
 assert.equal(saveWorkDraft(doc,b.resolve()).blankWorkDrafts[0].item.lines[0].price,'.');
});
test('cancel/new item clears pending; resolving repeatedly is non-destructive',()=>{
 const b=createWorkEditBuffer();b.reset(edit());b.stage('notes',i=>{i.notes='latest unblurred note';});
 assert.equal(b.resolve().item.notes,'latest unblurred note');assert.equal(b.resolve().item.notes,'latest unblurred note');
 b.reset(null);assert.equal(b.resolve(),null);b.reset(edit());assert.equal(b.resolve().item.notes,undefined);
});
test('explicit control resolves pending before overriding it; stale text never overrides selection',()=>{
 const b=createWorkEditBuffer();b.reset(edit());b.stage('name',i=>{i.lines[0].name='typed';i.lines[0].catalogueId='';});
 const selected=b.resolve();Object.assign(selected.item.lines[0],{name:'Catalogue selection',catalogueId:'new',price:25});b.reset(selected);
 assert.equal(b.resolve().item.lines[0].catalogueId,'new');assert.equal(b.resolve().item.lines[0].name,'Catalogue selection');
 b.stage('qty',i=>{i.lines[0].qty='2.5';});const next=b.resolve();next.item.lines[0].fixed=true;b.reset(next);
 assert.equal(b.resolve().item.lines[0].qty,'2.5');assert.equal(b.resolve().item.lines[0].fixed,true);
});
test('large work item typing stages without executing any full-item edits until commit',()=>{
 const b=createWorkEditBuffer(),large=edit();large.item.lines=Array.from({length:5500},(_,n)=>({...large.item.lines[0],id:'r'+n}));
 b.reset(large);let applied=0;for(let n=0;n<500;n++)b.stage('price',i=>{applied++;i.lines[5499].price=String(n);});
 assert.equal(applied,0);assert.equal(b.resolve().item.lines[5499].price,'499');assert.equal(applied,1);assert.equal(large.item.lines[5499].price,10);
});
test('pending notes for repeated material rows survive include independently',()=>{
 const b=createWorkEditBuffer(),source=edit();
 source.item.lines[0].catalogueId='same-part';
 source.item.lines.push({...source.item.lines[0],id:'r2'});
 b.reset(source);
 b.stage('line:r:notes',i=>{i.lines.find(l=>l.id==='r').notes='Phase A';});
 b.stage('line:r2:notes',i=>{i.lines.find(l=>l.id==='r2').notes='Phase B';});
 assert.deepEqual(includeWorkEdit(fixture(),b.resolve()).entries[0].items[0].lines.map(l=>[l.catalogueId,l.notes]),[['same-part','Phase A'],['same-part','Phase B']]);
});
