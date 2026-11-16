import test from 'node:test';import assert from 'node:assert/strict';import {bindTokenToActor,currentFrameMessage} from './sessionSafety.js';
const token=sub=>'e30.'+Buffer.from(JSON.stringify({sub})).toString('base64url')+'.signature';
test('pending token cannot dispatch after session closes',async()=>{let resolve,active=true;const bound=bindTokenToActor(()=>new Promise(r=>resolve=r),'A',()=>active);const result=bound();active=false;resolve(token('A'));await assert.rejects(result,/session changed/);});
test('new actor token cannot carry old actors study',async()=>{const bound=bindTokenToActor(async()=>token('B'),'A',()=>true);await assert.rejects(bound(),/account changed/);});
test('matching actor permitted, malformed token denied',async()=>{assert.equal(await bindTokenToActor(async()=>token('A'),'A',()=>true)(),token('A'));await assert.rejects(bindTokenToActor(async()=>null,'A',()=>true)());});
test('late frame edit/import from prior study generation rejected',()=>{assert(!currentFrameMessage({generation:1},2));assert(!currentFrameMessage({},2));assert(currentFrameMessage({generation:2},2));});
