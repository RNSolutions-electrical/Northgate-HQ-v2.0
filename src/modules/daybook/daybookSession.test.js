import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindTokenToActor} from '../dwelling-load/sessionSafety.js';
const token=sub=>'x.'+btoa(JSON.stringify({sub}))+'.x';
test('Daybook binds all cloud requests to its captured authenticated owner',()=>{
 const source=readFileSync(new URL('./DaybookWorkspace.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/withSupabaseTokenRetry\(getToken/);
 assert.equal((source.match(/withSupabaseTokenRetry\(guardedToken/g)||[]).length,2);
 assert.match(source,/actor.current=clerkUserId/);assert.match(source,/mounted.current && actor.current===permissions.userId/);
});
test('Daybook token guard rejects account switch and unmount before request',async()=>{
 let active=true,resolve;const guarded=bindTokenToActor(()=>new Promise(r=>resolve=r),'old',()=>active);
 const pending=guarded({});active=false;resolve(token('new'));await assert.rejects(pending,/session changed/);
 await assert.rejects(bindTokenToActor(async()=>token('new'),'old',()=>true)({}),/account changed/);
});
