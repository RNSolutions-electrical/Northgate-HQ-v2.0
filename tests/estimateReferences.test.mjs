import test from 'node:test';
import assert from 'node:assert/strict';
import {entryReference,workItemReference,componentReference} from '../src/modules/estimates/workbench/references.mjs';

test('Estimate references follow entry, work item, component numeric hierarchy',()=>{
 const entry={number:1},item={number:1};
 assert.equal(entryReference(1),'001');
 assert.equal(workItemReference(entry,item),'001.1');
 assert.deepEqual([0,1,2,26].map(i=>componentReference(entry,item,i)),['001.1.1','001.1.2','001.1.3','001.1.27']);
 assert.equal(componentReference({number:1001},{number:12},99),'1001.12.100');
 assert.equal(componentReference(null,item,0),'Component 1');
});

test('Component references use full saved order across stage groups without mutating snapshots',()=>{
 const entry=Object.freeze({number:7}),item=Object.freeze({number:3,lines:Object.freeze([
  Object.freeze({id:'a',stage:'Trim-out'}),Object.freeze({id:'b',stage:'Rough-in'}),Object.freeze({id:'c',stage:'Trim-out'}),
 ])});
 const original=JSON.stringify(item);
 assert.deepEqual(item.lines.filter(l=>l.stage==='Trim-out').map(l=>componentReference(entry,item,item.lines.indexOf(l))),['007.3.1','007.3.3']);
 assert.equal(JSON.stringify(item),original);
});
