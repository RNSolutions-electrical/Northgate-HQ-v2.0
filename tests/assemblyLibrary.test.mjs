import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblyLibrarySave} from '../src/modules/estimates/workbench/assemblyLibrary.mjs';
test('library copies exclude project identity, markup, quantities and notes',()=>{
 const item={name:'Room 112',qty:5,libraryId:'source',updatedAt:'old',notes:'Private project scope',materialMarkupOverride:50,lines:[{name:'Wire',qty:'2',price:'',hours:'0.2',libraryLineId:'source-line',notes:'Project route',stage:'Trim-out',fixed:false}]};
 const copy=assemblyLibrarySave(item,{name:'Wall outlet'});
 assert.equal(copy.id,null);assert.equal(copy.notes,'');assert.equal(copy.qty,undefined);assert.equal(copy.materialMarkupOverride,undefined);
 assert.equal(copy.lines[0].libraryLineId,null);assert.equal(copy.lines[0].price,null);assert.equal(copy.lines[0].notes,'');
 const edit=assemblyLibrarySave(item,{editingLibrary:true});
 assert.equal(edit.id,'source');assert.equal(edit.updatedAt,'old');assert.equal(edit.lines[0].libraryLineId,'source-line');
 assert.equal(edit.lines[0].stage,'Trim-out');assert.equal(edit.notes,item.notes);
 assert.throws(()=>assemblyLibrarySave({...item,name:''}),/name/);
});
