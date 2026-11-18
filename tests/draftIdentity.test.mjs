import test from 'node:test';
import assert from 'node:assert/strict';
import {draftName,withDraftIdentity} from '../src/modules/estimates/workbench/draftIdentity.mjs';
import {blankDocument} from '../src/modules/estimates/workbench/blankSlate.mjs';
const at=new Date('2026-11-16T14:15:30Z');
test('unnamed draft gets a persistent timestamp and no required customer',()=>{const d=withDraftIdentity(blankDocument(),at);assert.equal(d.name,draftName(at));assert.match(d.name,/09:15:30/);assert.equal(d.customer,'');assert.equal(d.template,'Default');assert.equal(d.draftCreatedAt,at.toISOString());assert.deepEqual(withDraftIdentity(d,new Date('2027-01-01')),d);});
test('explicit project name takes precedence and records are not mutated',()=>{const d=blankDocument('Real project','Client');assert.equal(withDraftIdentity(d,at),d);assert.equal(d.draftCreatedAt,undefined);});
test('cleared draft name restores original timestamp; user rename persists',()=>{const d=withDraftIdentity(blankDocument(),at);assert.equal(withDraftIdentity({...d,name:'  '},new Date('2027-01-01')).name,d.name);assert.equal(withDraftIdentity({...d,name:'Job chosen'}).name,'Job chosen');});
import {readFileSync} from 'node:fs';
test('creation form accepts optional identity and selects Default in staging',()=>{const source=readFileSync(new URL('../src/modules/estimates/workbench/WorkbenchRoute.jsx',import.meta.url),'utf8');assert.match(source,/Project name \(optional for drafts\)/);assert.doesNotMatch(source,/<input[^>]*name="name"[^>]*required/);assert.doesNotMatch(source,/<input[^>]*name="customer"[^>]*required/);assert.match(source,/<option value="Default">Default<\/option>/);assert.match(source,/\?'Default':Object.keys\(sections\)\[0\]/);assert.match(source,/document=withDraftIdentity\(document\)/);});

