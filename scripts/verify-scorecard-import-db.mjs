const readSql=(...args)=>readFileSync(...args).replace(/\r\n/g,'\n');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../.temp/qa/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const baseline = readSql('supabase/migrations/20261015145240_eos_scorecard_reviewed_production.sql','utf8');
const migration = readSql('supabase/migrations/20261020112324_eos_scorecard_historical_import.sql','utf8');
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('sub',current_setting('qa.actor',true)) $$;
 SELECT set_config('qa.actor','qa',false);
 CREATE TABLE user_permissions(clerk_user_id text,display_name text,email text,is_active boolean);
 CREATE TABLE eos_access_grants(user_id text); INSERT INTO user_permissions VALUES('qa','QA','qa@example.invalid',true),('other','Other','other@example.invalid',true);
 INSERT INTO eos_access_grants VALUES('qa'),('other');`);
await db.exec(baseline.slice(baseline.indexOf('CREATE SCHEMA IF NOT EXISTS eos_private;'),baseline.indexOf('-- Pursuit wrapper')));
await db.exec('REVOKE ALL ON FUNCTION public.eos_scorecard_save_metric_v1(jsonb,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.eos_scorecard_save_metric_v1(jsonb,uuid) TO authenticated;');
await db.exec(readSql('supabase/migrations/20261020110919_eos_scorecard_category_validation.sql','utf8'));
await db.exec(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eos_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA eos_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;`);
const hashes = async () => (await db.query(`select proname,md5(pg_get_functiondef(oid)) hash from pg_proc where proname in ('eos_scorecard_save_observations_v1','eos_scorecard_save_metric_v1') order by 1`)).rows;
const before = await hashes();
await db.exec('BEGIN');
await db.exec(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
await db.exec('ROLLBACK');
assert.equal((await db.query("select to_regclass('eos_private.imports') as name")).rows[0].name,null);
assert.deepEqual(await hashes(),before,'interrupted migration restores original functions');
await db.exec(migration);
const after = await hashes(); assert.equal(after.find(x=>x.proname.endsWith('metric_v1')).hash,before.find(x=>x.proname.endsWith('metric_v1')).hash);
assert.deepEqual(after,before,'all pre-existing functions unchanged');
const cat='11111111-1111-4111-8111-111111111111', metric='22222222-2222-4222-8222-222222222222';
const definition={name:'Synthetic percent',context:'Synthetic historical ratio',category_id:cat,owner_id:'',goal:'',unit:'percent',carry:'none',window:'point-in-time',aggregation:'none',effective_from:'2026-01-05'};
await db.query('select eos_scorecard_save_category_v1($1,$2)',[{id:cat,name:'Synthetic',expected_revision:0},randomUUID()]);
await db.query('select eos_scorecard_save_metric_v1($1,$2)',[{id:metric,expected_revision:0,definition},randomUUID()]);
const row=(cell='A1',week='2026-01-05',v='0.125')=>({source_id:'synthetic-only',source_revision:'fixture-v1',source_cell:cell,metric_id:metric,definition_id:metric+':v1',category_id:cat,unit:'percent',percent_scale:'fraction',reporting_anchor:week,source_meeting_date:week==='2026-01-05'?'2026-01-06':'2026-01-14',measurement_start:week,as_of:week,actual_value:v,comments:'Synthetic comment',review_status:'review-needed'});
const preview=async (rows,id=randomUUID())=>(await db.query('select eos_scorecard_import_preview_v1($1,$2) result',[rows,id])).rows[0].result;
const apply=async id=>(await db.query('select eos_scorecard_import_apply_v1($1) result',[id])).rows[0].result;
const receipt=async id=>(await db.query('select eos_scorecard_import_receipt_v1($1) result',[id])).rows[0].result;
const count=async table=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
const p=await preview([row(),row('B1','2026-01-12','0'),row('C1','2026-01-12','')]);
// Duplicate metric/week is an error even if blank: ambiguous rows must be fixed.
assert.equal(p.errors,1); await assert.rejects(apply(p.import_id),/Resolve errors/); assert.equal(await count('eos_scorecard_observations'),0);
const good=await preview([row(),row('B1','2026-01-12','0')]); assert.equal(good.ready,2); assert.equal(await count('eos_scorecard_periods'),0);
assert.deepEqual(await preview([row(),row('B1','2026-01-12','0')],good.import_id),good);
await assert.rejects(preview([row('changed')],good.import_id),/identity reused/);
// Simulate an interrupted transaction after server execution but before commit.
await db.exec('BEGIN'); await apply(good.import_id); await db.exec('ROLLBACK');
assert.equal(await count('eos_scorecard_observations'),0); assert.equal((await receipt(good.import_id)).status,'preview');
const applied=await apply(good.import_id); assert.equal(applied.success,2); assert.deepEqual(await apply(good.import_id),applied,'lost response retry returns exact receipt');
assert.deepEqual(await receipt(good.import_id),applied); assert.equal(await count('eos_scorecard_observations'),2);
const values=(await db.query('select value_numeric,notes from eos_scorecard_observations order by period_id')).rows;
assert.equal(Number(values[0].value_numeric),12.5); assert.equal(Number(values[1].value_numeric),0); assert.match(values[0].notes,/Synthetic comment.*\n.*review-needed.*meeting 2026-01-06/);
assert.equal((await db.query('select count(*)::int n from eos_scorecard_audit where entity=\'historical_import\'')).rows[0].n,1);
const repeat=await preview([row(),row('B1','2026-01-12','0')]); assert.equal(repeat.held,2); await assert.rejects(apply(repeat.import_id),/at least one/);
assert.equal((await preview([row('new-cell')])).held,1,'existing manual observation held regardless of source');
for (const bad of [{category_id:'bad'},{category_id:''},{metric_id:''},{definition_id:''},{metric_id:randomUUID()},{definition_id:'missing'},
 {reporting_anchor:'2026-01-06'},{measurement_start:'2026-02-30'},{unit:'currency'},{percent_scale:''},{actual_value:'1.1'},{actual_value:'NaN'},{review_status:''},{extra:'not permitted'}]) {
 const item=await preview([{...row(),...bad}]); assert.equal(item.errors,1,JSON.stringify(bad));
 assert.doesNotMatch(item.rows[0].message,/invalid input syntax for type uuid/);
}
const old=await preview([{...row(),reporting_anchor:'2025-12-29',source_meeting_date:'2025-12-30'}]); assert.equal(old.errors,1);
const blank=await preview([{...row('blank'),actual_value:''}]); assert.equal(blank.held,1);assert.equal(blank.rows[0].value,null);
// Concurrent writes invalidate every unapplied preview, including a partial file.
const newRow={...row('D1'),reporting_anchor:'2026-01-19',source_meeting_date:'2026-01-20',measurement_start:'2026-01-20',as_of:'2026-01-20'};
const stale=await preview([newRow,row()]); assert.equal(stale.ready,1);assert.equal(stale.held,1);
await db.query('select eos_scorecard_save_category_v1($1,$2)',[{id:cat,name:'Changed',expected_revision:1},randomUUID()]);
await assert.rejects(apply(stale.import_id),/Stale preview/); assert.equal(await count('eos_scorecard_observations'),2);
await db.query('select eos_scorecard_save_period_v1($1,$2)',[{id:'2026-01-19',anchor:'2026-01-19',meeting_date:'2026-01-21',expected_revision:0},randomUUID()]);
const fresh=await preview([newRow,row()]); const mixed=await apply(fresh.import_id); assert.equal(mixed.success,1);assert.equal(mixed.held,1);
assert.equal((await db.query("select meeting_date::text d from eos_scorecard_periods where id='2026-01-19'")).rows[0].d,'2026-01-21','canonical meeting date never overwritten by source date');
assert.equal(mixed.rows[0].source.source_meeting_date,'2026-01-20');
const expired=await preview([{...newRow,source_cell:'E1',reporting_anchor:'2026-01-26',source_meeting_date:'2026-01-27'}]);
await db.query("update eos_private.imports set expires_at=now()-interval '1 second' where id=$1",[expired.import_id]);
await assert.rejects(apply(expired.import_id),/Stale preview/);
await db.exec("select set_config('qa.actor','other',false)"); await assert.rejects(receipt(good.import_id),/not found/);
await db.exec("select set_config('qa.actor','outsider',false); SET ROLE authenticated");
await assert.rejects(preview([row()]),/membership/); await assert.rejects(apply(good.import_id),/membership/);
await assert.rejects(db.query('select * from eos_private.imports'),/permission denied/);
await db.exec("RESET ROLE; select set_config('qa.actor','qa',false)");
// Permission revoked after preview must block apply and receipt, even completed.
await db.exec("update user_permissions set is_active=false where clerk_user_id='qa'");
await assert.rejects(apply(good.import_id),/membership/);await assert.rejects(receipt(good.import_id),/membership/);
await db.exec("update user_permissions set is_active=true where clerk_user_id='qa'");
assert.deepEqual(await apply(good.import_id),applied);
// Forward recovery retains exact receipts/audit and disables only new writers.
await db.exec(readSql('docs/releases/sql/eos_historical_import_disable.sql','utf8'));
await db.exec('SET ROLE authenticated');
await assert.rejects(preview([row()]),/permission denied/);await assert.rejects(apply(good.import_id),/permission denied/);
assert.deepEqual(await receipt(good.import_id),applied);
await db.exec('RESET ROLE');
await db.exec('GRANT EXECUTE ON FUNCTION public.eos_scorecard_import_preview_v1(jsonb,uuid),public.eos_scorecard_import_apply_v1(uuid) TO authenticated');
assert.deepEqual(await apply(good.import_id),applied,'re-enable returns same receipt without duplicate');
// Representative full-history volume; synthetic values only.
await db.query('select eos_scorecard_save_metric_v1($1,$2)',[{id:metric,expected_revision:1,definition:{...definition,effective_from:'1990-01-01'}},randomUUID()]);
const bulk=Array.from({length:1051},(_,i)=>{
 const date=new Date(Date.UTC(2000,0,3+i*7)).toISOString().slice(0,10);
 return {...row(`bulk-${i}`),definition_id:metric+':v2',reporting_anchor:date,source_meeting_date:date,measurement_start:date,as_of:date};
});
const bulkPreview=await preview(bulk);assert.equal(bulkPreview.ready,1051);
const bulkReceipt=await apply(bulkPreview.import_id);assert.equal(bulkReceipt.success,1051);
assert.deepEqual(await apply(bulkPreview.import_id),bulkReceipt);assert.equal((await preview(bulk)).held,1051);
mkdirSync('.temp/import-qa',{recursive:true});writeFileSync('.temp/import-qa/db-result.json',JSON.stringify({before,after,checks:'validation, blank/zero, explicit scales, historical mapping, atomic interruption, lost response replay, existing/source dedupe, partial held, stale/expiry, permission denial, audit',observations:await count('eos_scorecard_observations')},null,2));
console.log('PASS historical import PostgreSQL validation, atomic rollback, receipt replay, dedupe, stale, permissions and audit');
await db.close();
