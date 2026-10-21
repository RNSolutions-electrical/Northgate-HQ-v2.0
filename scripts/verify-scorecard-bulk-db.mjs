import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseMatrix,planMatrix} from '../src/modules/eos/scorecardMatrix.js';
import {PGlite} from '../.temp/qa/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
try {
const baseline=readFileSync('supabase/migrations/20261015145240_eos_scorecard_reviewed_production.sql','utf8');
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',current_setting('qa.actor',true))$$;
SELECT set_config('qa.actor','qa',false);CREATE TABLE user_permissions(clerk_user_id text,display_name text,email text,is_active boolean);
CREATE TABLE eos_access_grants(user_id text);INSERT INTO user_permissions VALUES('qa','QA','qa@example.invalid',true),('other','Other','other@example.invalid',true);INSERT INTO eos_access_grants VALUES('qa'),('other');`);
await db.exec(baseline.slice(baseline.indexOf('CREATE SCHEMA IF NOT EXISTS eos_private;'),baseline.indexOf('-- Pursuit wrapper')));
await db.exec('REVOKE ALL ON FUNCTION public.eos_scorecard_save_metric_v1(jsonb,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.eos_scorecard_save_metric_v1(jsonb,uuid) TO authenticated;');
await db.exec(readFileSync('supabase/migrations/20261020110919_eos_scorecard_category_validation.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261020112324_eos_scorecard_historical_import.sql','utf8'));
const migration=readFileSync('supabase/migrations/20261020130811_eos_scorecard_bulk_edit.sql','utf8');
await db.exec('BEGIN');await db.exec(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await db.exec('ROLLBACK');
assert.equal((await db.query("select to_regclass('eos_private.bulk_exports') t")).rows[0].t,null);await db.exec(migration);
const metric='22222222-2222-4222-8222-222222222222',cat='11111111-1111-4111-8111-111111111111';
const call=async(name,...args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
await call('eos_scorecard_save_category_v1',{id:cat,name:'Synthetic',expected_revision:0},randomUUID());
await call('eos_scorecard_save_metric_v1',{id:metric,expected_revision:0,definition:{name:'Synthetic percent',context:'Synthetic only',category_id:cat,owner_id:'',goal:'',unit:'percent',carry:'none',window:'point-in-time',aggregation:'none',effective_from:'2026-01-05'}},randomUUID());
const source=(date,cell)=>JSON.stringify({id:'synthetic-bulk',revision:'v1',cell,meeting_date:date,measurement_start:date,as_of:date});
const fresh=(date,value='0',cell=date)=>({Metric:'Synthetic percent',Date:date,Value:value,Notes:'Synthetic comment',Format:'percent',Review:'review-needed',Source:source(date,cell),'System reference':''});
const preview=(rows,id=randomUUID())=>call('eos_scorecard_bulk_preview_v1',rows,id);
const apply=id=>call('eos_scorecard_bulk_apply_v1',id);
const exportRows=()=>call('eos_scorecard_bulk_export_v1',[{metric_id:metric,period_id:'2026-01-05'}],randomUUID());
const count=async(table)=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
let p=await preview([fresh('2026-01-06')]);assert.equal(p.new,1,JSON.stringify(p));
await db.exec('BEGIN');await apply(p.import_id);await db.exec('ROLLBACK');assert.equal(await count('eos_scorecard_observations'),0);
const first=await apply(p.import_id);assert.equal(first.saved,1);assert.deepEqual(await apply(p.import_id),first);
const initial=(await db.query('select * from eos_scorecard_observations')).rows[0];assert.equal(Number(initial.value_numeric),0);
const exported=await exportRows();p=await preview(exported.rows);assert.equal(p.unchanged,1,JSON.stringify(p));assert.equal((await apply(p.import_id)).saved,0);assert.equal(await count('eos_scorecard_audit'),5,'category metric period observation + bulk audit');
const changed={...exported.rows[0],Value:'12.5%',Notes:'Edited comment'};p=await preview([changed]);assert.equal(p.changed,1,JSON.stringify(p));
const updated=await apply(p.import_id);assert.equal(updated.saved,1);assert.deepEqual(await apply(p.import_id),updated);
const after=(await db.query('select * from eos_scorecard_observations')).rows[0];assert.equal(after.revision,2);assert.equal(Number(after.value_numeric),12.5);assert.equal(after.measurement_start.toISOString(),initial.measurement_start.toISOString());assert.match(after.notes,/Edited comment\n\[Bulk import/);
p=await preview(exported.rows);assert.equal(p.needs_review,1,'stale export rejected');await assert.rejects(apply(p.import_id),/Needs review/);
const current=await exportRows();p=await preview([{...current.rows[0],Value:'',Notes:''}]);assert.equal(p.unchanged,1,'blank preserves old value and notes');
for(const patch of [{'System reference':'garbage'},{Metric:'unknown'},{Format:'currency'},{Source:'{}'},{Review:'reviewed'}]){p=await preview([{...current.rows[0],...patch}]);assert.equal(p.needs_review,1,JSON.stringify(p));}
p=await preview([current.rows[0],current.rows[0]]);assert.equal(p.needs_review,1,'duplicate rejects whole apply');
p=await preview([fresh('2026-01-06')]);assert.equal(p.needs_review,1,'unreferenced row cannot overwrite by name/date');
for(const row of [fresh('2026-01-13','101'),{...fresh('2026-01-13'),Source:'{}'},{...fresh('2026-01-13'),Metric:'Unknown'},{...fresh('2026-01-13'),Date:'2026-02-30'}]) {p=await preview([row]);assert.equal(p.needs_review,1,JSON.stringify(p));}
p=await preview([fresh('2026-01-13','25%')]);assert.equal(p.new,1);const stale=p;
await call('eos_scorecard_save_category_v1',{id:cat,name:'Renamed',expected_revision:1},randomUUID());await assert.rejects(apply(stale.import_id),/Scorecard changed/);
p=await preview([fresh('2026-01-13','25%')]);assert.equal((await apply(p.import_id)).saved,1);
// Normal exported blank snapshot cells can be filled without constructing any
// source metadata; the server supplies their configured snapshot date.
await call('eos_scorecard_save_period_v1',{id:'2026-01-19',anchor:'2026-01-19',meeting_date:'2026-01-20',expected_revision:0},randomUUID());
const blankExport=await call('eos_scorecard_bulk_export_v1',[{metric_id:metric,period_id:'2026-01-19'}],randomUUID());
p=await preview([{...blankExport.rows[0],Value:'0',Notes:'New exported snapshot'}]);assert.equal(p.new,1,JSON.stringify(p));assert.equal((await apply(p.import_id)).saved,1);
// Provisional source review is data, not a validation conflict; minimal source
// facts are sufficient only for a configured point-in-time definition.
p=await preview([{...fresh('2026-01-27','1%'),Review:'Needs review',Source:JSON.stringify({id:'fixture',revision:'v1',cell:'Sheet!B5',url:'https://example.invalid/source'})}]);assert.equal(p.new,1,JSON.stringify(p));
const mixedExport=await call('eos_scorecard_bulk_export_v1',[{metric_id:metric,period_id:'2026-01-05'},{metric_id:metric,period_id:'2026-01-12'}],randomUUID());
p=await preview(mixedExport.rows.map((r,i)=>i?{...r,Notes:'Only one edited row'}:r));assert.equal(p.unchanged,1);assert.equal(p.changed,1);assert.equal((await apply(p.import_id)).saved,1);
await db.exec("select set_config('qa.actor','other',false)");p=await preview(current.rows);assert.equal(p.needs_review,1,'export actor bound');
await assert.rejects(call('eos_scorecard_bulk_receipt_v1',first.import_id),/No saved review/);
await db.exec("select set_config('qa.actor','outsider',false);SET ROLE authenticated");await assert.rejects(preview([fresh('2026-01-20')]),/membership/);await assert.rejects(apply(first.import_id),/membership/);await assert.rejects(db.query('select * from eos_private.bulk_exports'),/permission denied/);
await db.exec("RESET ROLE;select set_config('qa.actor','qa',false)");
const weekly='33333333-3333-4333-8333-333333333333';
await call('eos_scorecard_save_metric_v1',{id:weekly,expected_revision:0,definition:{name:'Synthetic uncertain weekly',context:'Start requires source evidence',category_id:cat,owner_id:'',goal:'',unit:'count',carry:'none',window:'period',aggregation:'none',effective_from:'2026-01-05'}},randomUUID());
p=await preview([{...fresh('2026-01-27','2'),Metric:'Synthetic uncertain weekly',Format:'count',Review:'Needs review',Source:JSON.stringify({id:'weekly-source',revision:'v1',cell:'Sheet!A1'})}]);assert.equal(p.needs_review,1,'uncertain weekly dates not fabricated');
const matrixRows=planMatrix(parseMatrix('Who,Measurable,Goal,2026-01-27\n,Synthetic uncertain weekly,,0'),{metrics:[{id:weekly}],definitions:[{id:weekly+':v1',metric_id:weekly,name:'Synthetic uncertain weekly',effective_from:'2026-01-05',revision:1,unit:'count',window:'period'}],periods:[],observations:[]},{mappings:{2:weekly},weekly:true,sourceId:'matrix-csv:synthetic.csv',sourceRevision:'synthetic-sha256'}).entries;
p=await preview(matrixRows);assert.equal(p.needs_review,0,JSON.stringify(p));assert.equal(p.new,1);const matrixReceipt=await apply(p.import_id);assert.equal(matrixReceipt.saved,1);assert.deepEqual(await apply(p.import_id),matrixReceipt,'matrix uncertain retry exact receipt');const matrixStored=(await db.query('select value_numeric,measurement_start::text,as_of::text from eos_scorecard_observations where metric_id=$1',[weekly])).rows;assert.equal(matrixStored.length,1);assert.equal(Number(matrixStored[0].value_numeric),0);assert.equal(matrixStored[0].measurement_start,'2026-01-19');assert.equal(matrixStored[0].as_of,'2026-01-25');assert.equal((await preview(matrixRows)).needs_review,1,'repeated matrix cannot double count or overwrite');
await db.exec(readFileSync('docs/releases/sql/eos_bulk_edit_disable.sql','utf8'));await db.exec('SET ROLE authenticated');await assert.rejects(apply(first.import_id),/permission denied/);assert.deepEqual(await call('eos_scorecard_bulk_receipt_v1',first.import_id),first);await db.exec('RESET ROLE');
await db.exec('GRANT EXECUTE ON FUNCTION public.eos_scorecard_bulk_export_v1(jsonb,uuid),public.eos_scorecard_bulk_preview_v1(jsonb,uuid),public.eos_scorecard_bulk_apply_v1(uuid) TO authenticated');assert.deepEqual(await apply(first.import_id),first);
console.log('PASS bulk CSV PostgreSQL: baseline-backed no-op/edit/new, blank/zero/notes/percent, preserved metadata, duplicate/tamper/stale/actor/auth denial, atomic rollback and exact retry.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
