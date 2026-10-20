import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteScorecardStore, validateMetricCategory} from '../src/modules/eos/scorecardStore.js';
const category = '11111111-1111-4111-8111-111111111111';
test('required category rejects blank/missing, malformed and deleted selections before remote write', async () => {
  const calls = [];
  const store = createRemoteScorecardStore(async operation => operation({rpc(name, args) {
    calls.push({name,args}); return Promise.resolve({data:name.includes('read') ? {categories:[{id:category}],snapshot:1} : {revision:1}});
  }}));
  await store.read();
  for (const id of ['', ' ', null, undefined, 'garbage', '22222222-2222-4222-8222-222222222222']) {
    await assert.rejects(store.saveMetric({definition:{category_id:id}},'request'), /[Cc]ategory/);
  }
  assert.deepEqual(calls.map(c=>c.name),['eos_scorecard_read_v1','eos_scorecard_quarters_read_v1']);
  const input = {definition:{category_id:category,owner_id:'',goal:''}};
  await store.saveMetric(input,'same-request'); await store.saveMetric(input,'same-request');
  assert.deepEqual(calls[2].args,{p_input:input,p_request_id:'same-request'});
  assert.deepEqual(calls[3],calls[2]); assert.equal(input.definition.owner_id,''); assert.equal(input.definition.goal,'');
});
test('remote validation works before initial read and does not alter retained draft',async()=>{
  let writes=0; const store=createRemoteScorecardStore(async operation=>operation({rpc(){writes++;return Promise.resolve({data:{revision:1}});}}));
  const input={definition:{category_id:'malformed',owner_id:'',goal:null}}; const before=structuredClone(input);
  await assert.rejects(store.saveMetric(input,'retry'),/valid category/);assert.deepEqual(input,before);assert.equal(writes,0);
  validateMetricCategory('fixture-category',[{id:'fixture-category'}]);
});
