import test from 'node:test';import assert from 'node:assert/strict';
import {bulkCsv,parseBulkCsv,BULK_COLUMNS} from '../src/modules/eos/scorecardBulkCsv.js';
test('simple bulk CSV preserves original date, full numeric text, blanks, zero and multiline notes',()=>{
 const row={Metric:'Synthetic',Date:'2026-01-06',Value:'0',Notes:'original, comment\n"quoted"',Format:'percent',Review:'Needs review',Source:JSON.stringify({id:'fixture',revision:'v1',cell:'Sheet!B2'}),'System reference':''};
 assert.deepEqual(parseBulkCsv(bulkCsv([row])),[row]);
 assert.deepEqual(parseBulkCsv(bulkCsv([{...row,Value:'12.34567890123456789%'}]))[0].Value,'12.34567890123456789%');
 assert.equal(parseBulkCsv(bulkCsv([{...row,Value:'',Notes:'=formula-looking source comment'}]))[0].Notes,'=formula-looking source comment');
 assert.equal(BULK_COLUMNS.length,8);assert.throws(()=>parseBulkCsv('Metric,Value\nSynthetic,0'),/columns/);
});
