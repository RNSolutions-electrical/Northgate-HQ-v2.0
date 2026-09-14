import test from 'node:test';
import assert from 'node:assert/strict';
import {exportApprovedProposalPdf} from '../src/modules/estimates/workbench/exports.mjs';

test('approved proposal exports only from an immutable Workbench snapshot',async()=>{
 const bytes=await exportApprovedProposalPdf({
  title:'Test proposal',customer_name:'Test customer',pricing_total:1250,
  approved_at:'2026-09-14T12:00:00.000Z',
  workbench_document:{name:'Test proposal',entries:[{section:'Power',location:'Room 101',name:'Receptacles'}]},
 });
 assert.ok(bytes instanceof Uint8Array);
 assert.ok(bytes.byteLength>500);
 await assert.rejects(()=>exportApprovedProposalPdf({}),/snapshot is unavailable/);
});
