// Isolated regression: no production connection or real estimate cleanup.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));
const db=new PGlite();
const sql=await readFile(new URL('../supabase/migrations/20260921235409_workbench_estimate_archive_guard.sql',import.meta.url),'utf8');
const scalar=async query=>Object.values((await db.query(query)).rows[0])[0];
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',nullif(current_setting('test.actor',true),''))$$;
CREATE TABLE user_permissions(id uuid DEFAULT gen_random_uuid(),clerk_user_id text,display_name text,email text,is_active boolean,role text,division text,permission_overrides jsonb);
INSERT INTO user_permissions(clerk_user_id,is_active,role,division,permission_overrides) VALUES
('editor',true,'Manager','Electrical','{"can_archive_records":true}'),
('noarchive',true,'Manager','Electrical','{}'),('other',true,'Manager','Construction','{"can_archive_records":true}'),
('inactive',false,'Manager','Electrical','{"can_archive_records":true}');
CREATE FUNCTION effective_permissions_for_user(text,text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT $3$$;
CREATE FUNCTION current_user_can_edit_division(text,text) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND division=$1 AND is_active)$$;
CREATE TABLE estimates(customer_name text,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,division text,status text,editor_version int,archived_at timestamptz,archived_by text,archive_reason text,updated_at timestamptz DEFAULT now(),version_number int DEFAULT 1,revision_of uuid,approved_total numeric);
CREATE TABLE change_logs(user_id text,user_name text,table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text CHECK(note<>'reject audit'),created_at timestamptz DEFAULT now());
CREATE TABLE estimate_snapshots(estimate_id uuid,document jsonb);
CREATE TABLE estimate_workbenches(estimate_id uuid,document jsonb);
INSERT INTO estimates(id,title,division,status,editor_version,approved_total) VALUES
('00000000-0000-0000-0000-000000000001','Test draft','Electrical','draft',2,null),
('00000000-0000-0000-0000-000000000002','Test approved','Electrical','approved',2,123.45),
('00000000-0000-0000-0000-000000000003','Legacy','Electrical','draft',1,null),
('00000000-0000-0000-0000-000000000004','Audit rollback','Electrical','draft',2,null);
INSERT INTO estimate_snapshots VALUES('00000000-0000-0000-0000-000000000002','{"total":123.45}');
INSERT INTO estimate_workbenches SELECT id,'{"entries":[{"name":"Preserved"}]}'::jsonb FROM estimates;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
`);

await db.exec(sql);
await db.exec('CREATE TRIGGER guard_workbench_header BEFORE INSERT OR UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION guard_workbench_header()');
await db.exec(`
CREATE FUNCTION current_user_can_read_division(text,text) RETURNS boolean LANGUAGE sql AS $$SELECT current_user_can_edit_division($1,$2)$$;
CREATE FUNCTION current_scoped_authorization_decision(text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('allowed',EXISTS(SELECT 1 FROM user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active))$$;
CREATE TABLE v5_working_copies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_user_id text,module_key text DEFAULT 'estimating',work_type text DEFAULT 'estimate',version int DEFAULT 1,status text DEFAULT 'draft',payload jsonb DEFAULT '{"name":"Personal","entries":[]}',payload_hash text DEFAULT 'hash',scope_context jsonb DEFAULT '{"division":"Electrical"}',archived_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE v5_change_sets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),working_copy_id uuid);
CREATE TABLE v5_change_set_destinations(change_set_id uuid,destination_key text,status text,applied_record jsonb,applied_at timestamptz DEFAULT now());
INSERT INTO v5_working_copies(id,owner_user_id,status) VALUES
('10000000-0000-0000-0000-000000000001','editor','promoted'),
('10000000-0000-0000-0000-000000000002','editor','submitted'),
('10000000-0000-0000-0000-000000000003','editor','draft'),
('10000000-0000-0000-0000-000000000004','editor','promoted');
INSERT INTO v5_change_sets(id,working_copy_id) SELECT id,id FROM v5_working_copies WHERE status='promoted';
INSERT INTO v5_change_set_destinations(change_set_id,destination_key,status,applied_record) VALUES
('10000000-0000-0000-0000-000000000001','official_estimate','applied','{"estimate_id":"00000000-0000-0000-0000-000000000002"}'),
('10000000-0000-0000-0000-000000000004','official_estimate','applied','{"estimate_id":"00000000-0000-0000-0000-000000000099"}');
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261015171453_estimate_lifecycle_archive_restore.sql',import.meta.url),'utf8'));
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const personal=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const actor=async who=>db.query("SELECT set_config('test.actor',$1,false)",[who]);
const rpc=async(sql,args=[])=>{await db.exec('SET ROLE authenticated');try{return await db.query(sql,args);}finally{await db.exec('RESET ROLE');}};
const archivePersonal=async(n,state=true,version=1)=>rpc('SELECT set_personal_estimate_archived($1,$2,$3,$4)',[personal(n),version,await scalar(`SELECT updated_at FROM v5_working_copies WHERE id='${personal(n)}'`),state]);
const restore=async n=>rpc('SELECT restore_estimate($1,$2)',[id(n),await scalar(`SELECT updated_at FROM estimates WHERE id='${id(n)}'`)]);
for(const who of ['', 'other','inactive']){await actor(who);await assert.rejects(()=>archivePersonal(1));}
await actor('editor');
await assert.rejects(()=>archivePersonal(1,true,99),/changed/);
await assert.rejects(()=>archivePersonal(2),/pending review/);
const personalBefore=await scalar(`SELECT to_jsonb(c)-ARRAY['archived_at','updated_at'] FROM v5_working_copies c WHERE id='${personal(1)}'`);
const documents=await scalar('SELECT jsonb_agg(to_jsonb(w) ORDER BY estimate_id) FROM estimate_workbenches w');
const snapshots=await scalar('SELECT jsonb_agg(to_jsonb(s)) FROM estimate_snapshots s');
await archivePersonal(1);await archivePersonal(1);
assert.equal(await scalar("SELECT count(*)::int FROM change_logs WHERE table_name='v5_working_copies'"),1);
assert.equal((await rpc('SELECT * FROM read_personal_estimate_directory(true)')).rows.length,1);
assert.equal((await rpc('SELECT * FROM read_personal_estimate_directory(false)')).rows.length,3);
assert.deepEqual(await scalar(`SELECT to_jsonb(c)-ARRAY['archived_at','updated_at'] FROM v5_working_copies c WHERE id='${personal(1)}'`),personalBefore);
assert.equal(await scalar(`SELECT status FROM estimates WHERE id='${id(2)}'`),'approved');
await archivePersonal(1,false);
await archivePersonal(3);
await assert.rejects(()=>db.exec(`UPDATE v5_working_copies SET status='submitted' WHERE id='${personal(3)}'`),/Restore/);
await assert.rejects(()=>db.exec(`UPDATE v5_working_copies SET payload='{}',version=2 WHERE id='${personal(3)}'`),/Restore/);
await rpc('SELECT archive_estimate($1,NULL)',[id(2)]);
let rows=(await rpc('SELECT * FROM read_personal_estimate_directory(false)')).rows.map(row=>Object.values(row)[0]);
assert.equal(rows.find(row=>row.id===personal(1)).promotion.state,'archived');
assert.equal(rows.find(row=>row.id===personal(4)).promotion.state,'unavailable');
assert.equal((await rpc("SELECT * FROM read_archived_estimate_directory('Electrical')")).rows.length,1);
for(const who of ['', 'noarchive','other','inactive']){await actor(who);await assert.rejects(()=>restore(2));assert.equal((await rpc("SELECT * FROM read_archived_estimate_directory('Electrical')")).rows.length,0);}
await actor('editor');
await assert.rejects(()=>rpc('SELECT restore_estimate($1,$2)',[id(2),'2000-01-01']),/changed/);
await restore(2);await restore(2);
assert.equal(await scalar(`SELECT status FROM estimates WHERE id='${id(2)}'`),'approved');
assert.equal(await scalar(`SELECT archived_at FROM estimates WHERE id='${id(2)}'`),null);
assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(w) ORDER BY estimate_id) FROM estimate_workbenches w'),documents);
assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(s)) FROM estimate_snapshots s'),snapshots);
assert.equal(await scalar(`SELECT status FROM v5_working_copies WHERE id='${personal(1)}'`),'promoted');
for(const n of [1,3]){await rpc('SELECT archive_estimate($1,NULL)',[id(n)]);await restore(n);assert.equal(await scalar(`SELECT status FROM estimates WHERE id='${id(n)}'`),'draft');}
assert.equal(await scalar("SELECT has_function_privilege('anon','restore_estimate(uuid,timestamptz)','execute')"),false);
assert.equal(await scalar("SELECT has_function_privilege('anon','set_personal_estimate_archived(uuid,integer,timestamptz,boolean)','execute')"),false);
// Late requests must not override an intervening archive/restore cycle.
const stamp=await scalar(`SELECT updated_at::text FROM v5_working_copies WHERE id='${personal(1)}'`);
await archivePersonal(1);await archivePersonal(1,false);
await assert.rejects(()=>rpc('SELECT set_personal_estimate_archived($1,1,$2,true)',[personal(1),stamp]),/changed/);
await archivePersonal(4);await archivePersonal(4,false); // Missing official record never prevents personal cleanup.
await actor('other');
assert.equal((await rpc('SELECT * FROM read_personal_estimate_directory(false)')).rows.length,0);
await actor('editor');
const officialStamp=await scalar(`SELECT updated_at::text FROM estimates WHERE id='${id(1)}'`);
await rpc('SELECT set_official_estimate_archived($1,$2,true)',[id(1),officialStamp]);
const count=await scalar('SELECT count(*)::int FROM change_logs');
await rpc('SELECT set_official_estimate_archived($1,$2,true)',[id(1),officialStamp]);
assert.equal(await scalar('SELECT count(*)::int FROM change_logs'),count);
await rpc('SELECT set_official_estimate_archived($1,$2,false)',[id(1),await scalar(`SELECT updated_at::text FROM estimates WHERE id='${id(1)}'`)]);
await assert.rejects(()=>rpc('SELECT set_official_estimate_archived($1,$2,true)',[id(1),'2000-01-01']),/changed/);
await rpc('SELECT archive_estimate($1,NULL)',[id(4)]);
await db.query("SELECT set_config('northgate.workbench_restore',$1,false)",[id(4)]);
await assert.rejects(()=>db.exec(`UPDATE estimates SET title='Tampered',archived_at=NULL,archived_by=NULL,archive_reason=NULL,status='draft' WHERE id='${id(4)}'`),/authenticated Workbench/);
await db.exec("SELECT set_config('northgate.workbench_restore','',false)");
await db.exec(`INSERT INTO estimates(id,title,division,status,editor_version,archived_at) VALUES ('${id(5)}','No restore audit','Electrical','archived',1,now())`);
await assert.rejects(()=>restore(5),/Original estimate state unavailable/);
// Every archive/restore audit is atomic with the mutation.
await db.exec(`CREATE FUNCTION reject_lifecycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'audit unavailable'; END$$;
CREATE TRIGGER reject_lifecycle_audit BEFORE INSERT ON change_logs FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_audit();`);
await assert.rejects(()=>archivePersonal(1),/audit unavailable/);
assert.equal(await scalar(`SELECT archived_at FROM v5_working_copies WHERE id='${personal(1)}'`),null);
await assert.rejects(()=>rpc('SELECT archive_estimate($1,NULL)',[id(1)]),/audit unavailable/);
assert.equal(await scalar(`SELECT status FROM estimates WHERE id='${id(1)}'`),'draft');
await db.exec('DROP TRIGGER reject_lifecycle_audit ON change_logs');
await rpc('SELECT archive_estimate($1,NULL)',[id(1)]);
await db.exec('CREATE TRIGGER reject_lifecycle_audit BEFORE INSERT ON change_logs FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_audit()');
await assert.rejects(()=>restore(1),/audit unavailable/);
assert.equal(await scalar(`SELECT status FROM estimates WHERE id='${id(1)}'`),'archived');
console.log('PASS: independent personal/official archive and restore, exact approved/draft state, permissions, active/archive filtering, orphan reporting, stale/repeated requests, stale-browser write guard, historical documents/snapshots and lineage preservation.');
await db.close();
