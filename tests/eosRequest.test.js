import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedEosRequest, eosRpc } from '../src/modules/eos/eosRequest.js';
import { createRemoteScorecardStore } from '../src/modules/eos/scorecardStore.js';

test('409 conflicts settle once and preserve the server conflict code', async () => {
  let calls = 0;
  const client = { rpc() { calls++; return { abortSignal() { return Promise.resolve({ error: { code: 'PT409', message: 'Conflict: period changed' } }); } }; } };
  const call = (fn) => boundedEosRequest((signal) => fn(client, signal), 100);
  const store = createRemoteScorecardStore(call);
  await assert.rejects(store.savePeriod({ expected_revision: 0 }, 'unchanged-request-id'), { code: 'PT409' });
  assert.equal(calls, 1);
});

test('stalled RPC is aborted and deadline releases caller without automatic replay', async () => {
  let signal, calls = 0;
  const client = { rpc() { calls++; return { abortSignal(s) { signal = s; return new Promise(() => {}); } }; } };
  await assert.rejects(boundedEosRequest((s) => eosRpc(client, 'save', {}, s), 10), { code: 'EOS_TIMEOUT' });
  assert.equal(signal.aborted, true); assert.equal(calls, 1);
});

test('late authentication cannot initiate a save after timeout', async () => {
  let finishAuth, writes = 0;
  const auth = new Promise((resolve) => { finishAuth = resolve; });
  const waiting = boundedEosRequest(async (signal) => {
    await auth; signal.throwIfAborted(); writes++;
  }, 10);
  await assert.rejects(waiting, { code: 'EOS_TIMEOUT' });
  finishAuth(); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes, 0);
});

test('success cancels deadline and passes the same arguments and request identity', async () => {
  const args = { p_request_id: 'same-retry', p_input: { value: 0 } }; let got;
  const client = { rpc(name, input) { got = { name, input }; return { abortSignal() { return Promise.resolve({ data: 0 }); } }; } };
  assert.deepEqual(await boundedEosRequest((s) => eosRpc(client, 'save', args, s), 100), { data: 0 });
  assert.equal(got.input, args); assert.equal(got.name, 'save');
});

test('aborted request is rejected before constructing a network write', () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  assert.throws(() => eosRpc({ rpc() { calls++; } }, 'save', {}, controller.signal));
  assert.equal(calls, 0);
});
