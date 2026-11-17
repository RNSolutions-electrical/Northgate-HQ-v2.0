import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitWorkspace,mergeWorkspace} from './daybookModel.js';
test('personal events and unclassified notes never enter company document',()=>{
 const db={version:1,calendars:[{id:'personal'},{id:'northgate'}],events:[{id:'p',calendar:'personal'},{id:'n',calendar:'northgate'}],notes:[{id:'n1',body:'private'}],contacts:[{id:'c1'},{id:'c2'}],workers:[{id:'w',contactId:'c2'}],jobs:[{id:'j',calendar:'northgate'}],assignments:[{id:'a',job:'j'}],pto:[]};
 const s=splitWorkspace(db);assert.deepEqual(s.personal.events.map(x=>x.id),['p']);assert.deepEqual(s.northgate.events.map(x=>x.id),['n']);assert.equal(s.northgate.notes.length,0);assert.deepEqual(s.northgate.contacts.map(x=>x.id),['c2']);assert.equal(s.personal.workers.length,0);assert.equal(s.northgate.assignments.length,1);
 const m=mergeWorkspace({personal:{payload:s.personal},northgate:{payload:s.northgate}});for(const k of ['events','contacts','workers','jobs','assignments','notes'])assert.equal(m[k].length,db[k].length);
});
test('original planner is read-only input and transformed frame has no browser storage',()=>{
 const source=readFileSync(new URL('./daybook-source.html',import.meta.url),'utf8');
 let code=readFileSync(new URL('./daybookFrame.js',import.meta.url),'utf8').replace("import source from './daybook-source.html?raw';",'').replace('export function','function');
 const html=new Function('source',code+';return daybookFrame();')(source);
 assert.equal(html.includes('localStorage.'),false);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(match[0].includes('application/json'))continue;assert.doesNotThrow(()=>new Function(match[1]));}
 assert.match(html,/event.source!==parent/);assert.match(html,/type:'restore'/);assert.match(html,/type:'changed'/);
});
