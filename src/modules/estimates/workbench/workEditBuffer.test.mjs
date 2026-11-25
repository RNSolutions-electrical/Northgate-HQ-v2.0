import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkEditBuffer} from './workEditBuffer.mjs';
test('cancel dirtiness compares to original across buffered, committed, restored, and reopened edits',()=>{
 const edit={entryId:'id',isNew:false,item:{name:'Original',lines:[{id:'a'}]}};
 const b=createWorkEditBuffer();
 b.begin(edit);assert.equal(b.hasChanges(),false);
 b.stage('name',item=>{item.name='Unsaved';});assert.equal(b.hasChanges(),true);
 b.reset(b.resolve());assert.equal(b.hasChanges(),true);
 b.stage('name',item=>{item.name='Original';});assert.equal(b.hasChanges(),false);
 b.stage('review',item=>{item.lines[0].internalReview=false;});assert.equal(b.hasChanges(),false);
 b.stage('review',item=>{item.lines[0].internalReview=true;});assert.equal(b.hasChanges(),true);
 b.begin(b.resolve());assert.equal(b.hasChanges(),false);
 b.reset(null);assert.equal(b.hasChanges(),false);
});
