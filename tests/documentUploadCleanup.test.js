import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveFailedDocument} from '../src/modules/documents/documentUploadCleanup.js';

function client(result, calls) {
  return {async rpc(name,args){calls.push({name,args});return result;}};
}
test('failed upload cleanup requires an acknowledged archive and preserves its reason', async()=>{
  const calls=[];
  await archiveFailedDocument(client({count:1,error:null},calls),'doc-1','Upload failed: network');
  assert.equal(calls[0].name,'archive_failed_document_upload');
  assert.deepEqual(calls[0].args,{p_document_id:'doc-1',p_reason:'Upload failed: network'});
});
test('missing-row or failed audit cleanup is surfaced rather than silently treated as success', async()=>{
  for(const result of [{error:{message:'Active document not found'}},{error:{message:'Audit unavailable'}}]){
    await assert.rejects(archiveFailedDocument(client(result,[]),'doc-1','Upload failed'),/cleanup could not be confirmed/);
  }
});
