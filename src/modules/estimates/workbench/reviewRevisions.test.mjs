import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attachReviewRevisions,loadReviewRevisions,reviewRevisionLabel} from './reviewRevisions.mjs';

test('only the committed submission count is shown, never draft concurrency version',async()=>{
 const rows=[{estimate_id:'estimate',revision:68},{estimate_id:'unsubmitted',revision:97}];
 let submitted=0;
 const client={rpc:async()=>({data:[{record_id:'estimate',review_revision:submitted},{record_id:'unsubmitted',review_revision:0}]})};
 const read=rows=>attachReviewRevisions(client,'official',rows,'estimate_id');
 assert.equal(reviewRevisionLabel((await read(rows))[0].reviewRevision),'Not yet submitted');
 rows[0].revision++;
 assert.equal(reviewRevisionLabel((await read(rows))[0].reviewRevision),'Not yet submitted');
 submitted++;
 assert.equal(reviewRevisionLabel((await read(rows))[0].reviewRevision),'Review rev. 1');
 rows[0].revision+=10;
 assert.equal(reviewRevisionLabel((await read(rows))[0].reviewRevision),'Review rev. 1');
 submitted++;
 const [latest,other]=await read(rows);
 assert.equal(reviewRevisionLabel(latest.reviewRevision),'Review rev. 2');
 assert.equal(latest.revision,79);
 assert.equal(other.reviewRevision,0);
});
test('supplemental metadata failure never fabricates a revision or fails the underlying action',async()=>{
 const [row]=await attachReviewRevisions({rpc:async()=>{throw Error('offline');}},'personal',[{personal_id:'test',revision:4}],'personal_id');
 assert.equal(reviewRevisionLabel(row.reviewRevision),'Review revision unavailable');
 assert.equal(row.revision,4);
});
test('batching is bounded and lookup honors unrelated return values',async()=>{
 const ids=Array.from({length:450},(_,i)=>String(i)), calls=[];
 const c={rpc:async(fn,args)=>{calls.push([fn,args]);return {data:args.p_ids.map(record_id=>({record_id,review_revision:2}))};}};
 const m=await loadReviewRevisions(c,'personal',ids.concat(ids[0]));
 assert.equal(m.size,450);
 assert.deepEqual(calls.map(([,x])=>x.p_ids.length),[200,200,50]);
 assert.ok(calls.every(([name,{p_scope}])=>name==='read_estimate_review_revisions'&&p_scope==='personal'));
});
test('existing RPC write protections remain untouched, metadata is read after submission',()=>{
 const route=readFileSync(new URL('./WorkbenchRoute.jsx',import.meta.url),'utf8');
 assert.match(route,/p_expected_revision:source.revision/);
 assert.match(route,/p_expected_version:submitted.revision/);
 assert.doesNotMatch(route,/p_expected_(revision|version):[^,]*(reviewRevision)/);
 assert.match(route,/submit_standalone_estimate_review[\s\S]*?if\(response.error\)throw response.error;\n\s+const \[next\]=await attachReviewRevisions\(db,'official'/);
 assert.match(route,/submit_v5_estimate_for_review[\s\S]*?if\(response.error\)throw response.error;\n\s+const \[next\]=await attachReviewRevisions\(db,'personal'/);
});
