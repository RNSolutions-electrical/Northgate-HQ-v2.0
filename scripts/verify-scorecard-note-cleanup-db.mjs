import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../.temp/qa/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
try {
 const baseline=readFileSync('supabase/migrations/20261015145240_eos_scorecard_reviewed_production.sql','utf8');
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',current_setting('qa.actor',true))$$;
 SELECT set_config('qa.actor','qa',false);CREATE TABLE user_permissions(clerk_user_id text,display_name text,email text,is_active boolean);
 CREATE TABLE eos_access_grants(user_id text);INSERT INTO user_permissions VALUES('qa','QA','qa@example.invalid',true);INSERT INTO eos_access_grants VALUES('qa');`);
 await db.exec(baseline.slice(baseline.indexOf('CREATE SCHEMA IF NOT EXISTS eos_private;'),baseline.indexOf('-- Pursuit wrapper')));
 await db.exec('REVOKE ALL ON FUNCTION public.eos_scorecard_save_metric_v1(jsonb,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.eos_scorecard_save_metric_v1(jsonb,uuid) TO authenticated;');
 for(const file of ['20261020110919_eos_scorecard_category_validation.sql','20261020112324_eos_scorecard_historical_import.sql','20261020130811_eos_scorecard_bulk_edit.sql']) await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 const call=async(name,...args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const cat=randomUUID(),metric=randomUUID();
 await call('eos_scorecard_save_category_v1',{id:cat,name:'Synthetic',expected_revision:0},randomUUID());
 await call('eos_scorecard_save_metric_v1',{id:metric,expected_revision:0,definition:{name:'Synthetic',context:'Synthetic only',category_id:cat,owner_id:'',goal:'',unit:'number',carry:'none',window:'point-in-time',aggregation:'none',effective_from:'2026-01-05'}},randomUUID());
 await call('eos_scorecard_save_period_v1',{id:'2026-01-05',anchor:'2026-01-05',meeting_date:'2026-01-06',expected_revision:0},randomUUID());
 await call('eos_scorecard_save_observations_v1',[{metric_id:metric,period_id:'2026-01-05',period_revision:1,definition_id:metric+':v1',expected_revision:0,value:0,notes:'Original note and provenance',measurement_start:'2026-01-06',as_of:'2026-01-06'}],randomUUID());

 const edit=async(period,notes)=>{const o=(await db.query('select * from eos_scorecard_observations where metric_id=$1 and period_id=$2',[metric,period])).rows[0];await call('eos_scorecard_save_observations_v1',[{metric_id:metric,period_id:period,period_revision:1,definition_id:o.definition_id,expected_revision:o.revision,value:o.value_numeric,notes,measurement_start:o.measurement_start,as_of:o.as_of}],randomUUID());};
 const rows=Array.from({length:6},(_,i)=>({Metric:'Synthetic',Date:`2026-02-${String(2+i*7).padStart(2,'0')}`,Value:'0',Notes:i===0?'':`Original ${i}`,Format:'number',Review:'Needs review',Source:JSON.stringify({id:'synthetic',revision:'v1',cell:`Sheet!B${i}`,meeting_date:`2026-02-${String(2+i*7).padStart(2,'0')}`}), 'System reference':''}));
 // Valid dates spanning six separate Mondays.
 const dates=['2026-02-02','2026-02-09','2026-02-16','2026-02-23','2026-03-02','2026-03-09'];rows.forEach((r,i)=>{r.Date=dates[i];r.Source=JSON.stringify({...JSON.parse(r.Source),meeting_date:dates[i]});});
 const preview=await call('eos_scorecard_bulk_preview_v1',rows,randomUUID());assert.equal(preview.new,6);await call('eos_scorecard_bulk_apply_v1',preview.import_id);
 let obs=(await db.query("select * from eos_scorecard_observations where period_id<>'2026-01-05' order by period_id")).rows;
 await edit(dates[2],obs[2].notes+'\nManual appended');await edit(dates[4],obs[4].notes+obs[4].notes.slice(obs[4].notes.indexOf('\n[Bulk import')));await edit(dates[5],'');
 const migration=readFileSync('supabase/migrations/20261020184641_eos_scorecard_import_note_separation.sql','utf8');
 await db.exec('BEGIN');await db.exec(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await db.exec('ROLLBACK');assert.equal((await db.query("select to_regclass('eos_private.note_cleanup_records') t")).rows[0].t,null);await db.exec(migration);
 const id=randomUUID(),plan=await call('eos_scorecard_import_notes_preview_v1',id);assert.equal(plan.rows.filter(r=>r.status==='ready').length,4);
 await edit(dates[3],obs[3].notes+' concurrent');
 await db.exec('BEGIN');let rolled=await call('eos_scorecard_import_notes_apply_v1',id);assert.equal(rolled.cleaned,3);await db.exec('ROLLBACK');assert.equal((await call('eos_scorecard_import_notes_receipt_v1',id)).status,'preview');
 const result=await call('eos_scorecard_import_notes_apply_v1',id);assert.equal(result.cleaned,3);assert.equal(result.skipped,3);const count=(await db.query('select count(*)::int n from eos_scorecard_audit')).rows[0].n;assert.deepEqual(await call('eos_scorecard_import_notes_apply_v1',id),result);assert.equal((await db.query('select count(*)::int n from eos_scorecard_audit')).rows[0].n,count);
 obs=(await db.query("select * from eos_scorecard_observations where period_id<>'2026-01-05' order by period_id")).rows;assert.equal(obs[0].notes,'');assert.equal(obs[1].notes,'Original 1');assert.equal(obs[2].notes,'Original 2\nManual appended');assert.ok(obs[3].notes.endsWith(' concurrent'));assert.equal(obs[5].notes,'');assert.ok(obs.every(o=>Number(o.value_numeric)===0));
 const exported=await call('eos_scorecard_bulk_export_v1',dates.slice(0,3).map(period_id=>({metric_id:metric,period_id})),randomUUID());assert.deepEqual(exported.rows.map(r=>r.Notes),['','Original 1','Original 2\nManual appended']);const round=await call('eos_scorecard_bulk_preview_v1',exported.rows,randomUUID());assert.equal(round.unchanged,3);
 await edit(dates[1],'Later manual');const undoId=randomUUID(),undo=await call('eos_scorecard_import_notes_restore_v1',id,undoId);assert.equal(undo.restored,2);assert.equal(undo.skipped,1);assert.deepEqual(await call('eos_scorecard_import_notes_restore_v1',id,undoId),undo);assert.equal((await db.query('select notes from eos_scorecard_observations where metric_id=$1 and period_id=$2',[metric,dates[1]])).rows[0].notes,'Later manual');
 const fresh={...rows[0],Date:'2026-03-16',Notes:'Genuine [*] Bulk import words',Source:JSON.stringify({id:'synthetic',revision:'v1',cell:'C1',meeting_date:'2026-03-16'})};const next=await call('eos_scorecard_bulk_preview_v1',[fresh],randomUUID());assert.equal(next.new,1);await call('eos_scorecard_bulk_apply_v1',next.import_id);assert.equal((await db.query("select notes from eos_scorecard_observations where period_id='2026-03-16'")).rows[0].notes,fresh.Notes);assert.equal((await call('eos_scorecard_import_notes_preview_v1',randomUUID())).rows.find(r=>r.period_id==='2026-03-16').status,'skipped');
 await db.exec("SELECT set_config('qa.actor','outsider',false);SET ROLE authenticated");await assert.rejects(call('eos_scorecard_import_notes_preview_v1',randomUUID()),/membership/);await assert.rejects(call('eos_scorecard_import_notes_apply_v1',id),/membership/);await assert.rejects(db.query('select * from eos_private.note_cleanup_records'),/permission denied/);
 console.log('PASS exact audit proof; empty/original/appended notes; ambiguous/already blank/stale skips; rollback and exact retry; reversible concurrent-safe recovery; CSV round trip; future imports; permission denial.');
} finally {await db.close();}
