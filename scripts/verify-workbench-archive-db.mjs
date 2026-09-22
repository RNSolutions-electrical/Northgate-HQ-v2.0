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
CREATE TABLE estimates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,division text,status text,editor_version int,archived_at timestamptz,archived_by text,archive_reason text,updated_at timestamptz DEFAULT now(),version_number int DEFAULT 1,revision_of uuid,approved_total numeric);
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
const actor=async who=>db.query("SELECT set_config('test.actor',$1,false)",[who]);
const archive=async(id,reason='')=>{await db.exec('SET ROLE authenticated');try{return await db.query('SELECT archive_estimate($1,$2)',[id,reason]);}finally{await db.exec('RESET ROLE');}};
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
for(const who of ['', 'noarchive','other','inactive']) {await actor(who);await assert.rejects(()=>archive(id(1)));}
assert.equal(await scalar('SELECT count(*)::int FROM change_logs'),0);
await actor('editor');
await assert.rejects(()=>db.exec(`UPDATE estimates SET status='archived',archived_at=now(),archived_by='editor',archive_reason='bypass' WHERE id='${id(1)}'`),/authenticated Workbench/);
// Even the exact archive context cannot authorize content changes or approval.
await db.query("SELECT set_config('northgate.workbench_archive',$1,false)",[id(1)]);
await assert.rejects(()=>db.exec(`UPDATE estimates SET title='Tampered',status='archived',archived_at=now(),archived_by='editor',archive_reason='bypass' WHERE id='${id(1)}'`),/authenticated Workbench/);
await assert.rejects(()=>db.exec(`UPDATE estimates SET status='approved' WHERE id='${id(1)}'`),/authenticated Workbench/);
await db.exec("SELECT set_config('northgate.workbench_archive','',false)");
const before=await scalar('SELECT jsonb_agg(to_jsonb(s)) FROM estimate_snapshots s');
const documents=await scalar('SELECT jsonb_agg(to_jsonb(w) ORDER BY estimate_id) FROM estimate_workbenches w');
for(const n of [1,2,3])await archive(id(n));
assert.equal(await scalar("SELECT count(*)::int FROM estimates WHERE status='archived' AND archived_by='editor'"),3);
assert.equal(await scalar("SELECT count(*)::int FROM change_logs WHERE action='archive' AND note='Automatic audit: archive estimate.'"),3);
assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(s)) FROM estimate_snapshots s'),before);
assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(w) ORDER BY estimate_id) FROM estimate_workbenches w'),documents);
assert.equal(Number(await scalar(`SELECT approved_total FROM estimates WHERE id='${id(2)}'`)),123.45);
assert.equal(await scalar("SELECT coalesce(current_setting('northgate.workbench_archive',true),'')"),'');
await assert.rejects(()=>archive(id(1)),/already archived/);
await assert.rejects(()=>archive(id(4),'reject audit'),/check constraint/);
assert.equal(await scalar(`SELECT status FROM estimates WHERE id='${id(4)}'`),'draft');
assert.equal(await scalar('SELECT count(*)::int FROM change_logs'),3);
assert.equal(await scalar("SELECT has_function_privilege('anon','archive_estimate(uuid,text)','execute')"),false);
assert.equal(await scalar("SELECT has_function_privilege('authenticated','guard_workbench_header()','execute')"),false);
console.log('PASS: draft/approved/legacy archive; scoped/auth denial; exact archive-only guard; immutable snapshots/documents/totals; automatic audit; duplicate rejection; audit-failure rollback; context cleanup and ACLs.');
await db.close();
