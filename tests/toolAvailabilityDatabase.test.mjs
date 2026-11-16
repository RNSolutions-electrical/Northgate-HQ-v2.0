import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const runtime=await import('../.tmp/daybook-sql/node_modules/@electric-sql/pglite/dist/index.js').catch(()=>null);
test('Tool availability database: developer control, atomic versions, hook, restrictive RLS and recovery', {skip:!runtime&&'Install pinned local PGlite fixture'},async()=>{
 const db=new runtime.PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE TABLE public.user_permissions(clerk_user_id text PRIMARY KEY,is_active boolean,developer boolean);
 INSERT INTO public.user_permissions VALUES('dev',true,true),('ordinary',true,false),('inactive',false,true);
 CREATE FUNCTION public.current_user_has_developer_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT coalesce((SELECT developer FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub'),false)$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated,anon;
 CREATE TABLE public.items(id int PRIMARY KEY,label text);INSERT INTO items VALUES(1,'preserve me');ALTER TABLE items ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,UPDATE ON public.items TO authenticated;CREATE POLICY existing_inventory_access ON items FOR ALL TO authenticated USING(true) WITH CHECK(true);
 CREATE TABLE public.jobs(id int PRIMARY KEY,label text);INSERT INTO jobs VALUES(1,'job preserved');ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
 GRANT SELECT ON jobs TO authenticated;CREATE POLICY existing_job_access ON jobs FOR SELECT TO authenticated USING(true);
 CREATE VIEW inventory_destination_users_view AS SELECT clerk_user_id FROM user_permissions WHERE is_active;
 GRANT SELECT ON inventory_destination_users_view TO authenticated;
 CREATE SCHEMA storage;GRANT USAGE ON SCHEMA storage TO authenticated;
 CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated;
 CREATE POLICY original_storage_policy ON storage.objects TO authenticated USING(true) WITH CHECK(true);
 INSERT INTO storage.objects VALUES('northgate-files','afc/study/report.pdf'),('northgate-files','documents/estimate/1/proposal.pdf'),('northgate-files','documents/job/1/report.pdf'),('northgate-files','health/inspection.pdf'),('assets','logo.png');
 CREATE FUNCTION public.hi_managed_path(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 LIKE 'health/%'$$;
 `);
 await db.exec((await readFile(new URL('../supabase/migrations/20261116112903_tool_availability_controls.sql',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const login=async user=>{await db.exec('RESET ROLE');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:'authenticated'})]);await db.exec('SET ROLE authenticated');};
 const rows=async()=> (await db.query('select * from public.read_tool_availability()')).rows;
 const set=async(key,on,version)=>(await db.query('select * from public.set_tool_availability($1,$2,$3)',[key,on,version])).rows[0];
 const hook=async path=>{await db.query("select set_config('request.path',$1,false)",[path]);return db.query('select public.hq_tool_pre_request()');};
 await login('ordinary');assert.equal((await db.query('select * from inventory_destination_users_view')).rows.length,2);assert.equal((await db.query('select * from storage.objects')).rows.length,5);assert.equal((await rows()).length,17);assert.ok((await rows()).every(r=>r.is_enabled&&!r.enforcement_ready));
 await assert.rejects(set('inventory',false,1),/Developer access required/);assert.equal((await db.query('select * from items')).rows.length,1);
 await login('dev');await assert.rejects(set('inventory',false,1),/not activated/);await assert.rejects(set('developer',false,1),/protected tool/);
 await assert.rejects(set('inventory',null,1),/required/);await assert.rejects(db.query('update hq_tool_private.tools set is_enabled=false'),/permission denied/);
 await db.exec("RESET ROLE; UPDATE hq_tool_private.enforcement SET reviewed=true; SELECT set_config('pgrst.db_pre_request','public.hq_tool_pre_request',false); SET ROLE authenticated;");
 const disabled=await set('inventory',false,1);assert.equal(disabled.version,2);assert.equal(disabled.is_enabled,false);
 await assert.rejects(set('inventory',true,1),/another session/);assert.equal((await set('inventory',false,2)).version,2);
 assert.equal((await db.query('select * from items')).rows.length,1);await hook('/rpc/read_inventory_cart_items');
 await login('ordinary');await assert.rejects(db.query("select require_tool_available('inventory')"),/unavailable/);assert.equal((await db.query('select * from items')).rows.length,0);assert.equal((await db.query('select * from jobs')).rows.length,1);
 assert.equal((await db.query('select * from inventory_destination_users_view')).rows.length,0);await assert.rejects(hook('/items'),/unavailable/);await assert.rejects(hook('/rpc/read_inventory_cart_items'),/unavailable/);
 await assert.rejects(hook('/rpc/unmapped_business_function'),/unavailable/);await assert.rejects(hook('/rpc/graphql'),/unavailable/);
 await hook('/rpc/get_or_create_user_permissions');await hook('/jobs');await hook('/rpc/read_tool_availability');
 await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-hq-tool':'jobs','x-developer':'true'})]);await assert.rejects(hook('/items'),/unavailable/);
 await login('inactive');await assert.rejects(set('inventory',true,2),/Developer access required/);await assert.rejects(hook('/items'),/unavailable/);
 await login('missing');await assert.rejects(rows,/Sign in required/);
 await login('dev');await db.exec("RESET ROLE;UPDATE hq_tool_private.enforcement SET reviewed=false;SET ROLE authenticated;");
 assert.equal((await set('inventory',true,2)).version,3); // Recovery remains possible if enforcement is unhealthy.
 await login('ordinary');assert.equal((await db.query('select * from items')).rows[0].label,'preserve me');await hook('/items');
 await db.exec('RESET ROLE');assert.equal((await db.query('select count(*)::int n from hq_tool_private.history')).rows[0].n,2);
 await db.exec("UPDATE hq_tool_private.enforcement SET reviewed=true");await login('dev');await set('afc',false,1);await set('electrical-inspections',false,1);await set('documents',false,1);
 await login('ordinary');assert.deepEqual((await db.query('select name from storage.objects order by name')).rows.map(r=>r.name),['logo.png']);
 await assert.rejects(db.query("insert into storage.objects values('northgate-files','afc/new/report.pdf')"),/row-level security/);
 await login('dev');assert.equal((await db.query('select * from storage.objects')).rows.length,5);
 await set('afc',true,2);await set('electrical-inspections',true,2);await set('documents',true,2);
 await login('ordinary');assert.equal((await db.query('select * from storage.objects')).rows.length,5);
 await db.exec('RESET ROLE');
 await assert.rejects(db.exec('delete from hq_tool_private.history'),/immutable/);
 await db.exec('SET ROLE anon');await assert.rejects(rows,/permission denied/);await assert.rejects(set('inventory',false,3),/permission denied/);

// Cross-module SECURITY DEFINER chain must inherit Jobs, not only Estimates.
await db.exec(`RESET ROLE;
CREATE FUNCTION public.fixture_job_leaf() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$SELECT count(*)::int FROM public.jobs$$;
CREATE FUNCTION public.fixture_estimate_bridge() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$SELECT public.fixture_job_leaf()$$;
CREATE FUNCTION public.fixture_estimate_entry() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$SELECT public.fixture_estimate_bridge()$$;
INSERT INTO hq_tool_private.resource_map VALUES ('rpc','fixture_estimate_entry','estimates');
`);
await db.exec((await readFile(new URL('../supabase/migrations/20261116115651_tool_availability_dependency_closure.sql',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
assert.equal((await db.query("select count(*)::int n from hq_tool_private.resource_map where resource_name='fixture_estimate_entry' and module_key='jobs'")).rows[0].n,1);
await db.exec("UPDATE hq_tool_private.enforcement SET reviewed=true");
await login('dev');await set('jobs',false,1);
await login('ordinary');await assert.rejects(hook('/rpc/fixture_estimate_entry'),/unavailable/);
assert.equal((await rows()).find(r=>r.module_key==='estimates').is_enabled,true);
await login('dev');await hook('/rpc/fixture_estimate_entry');await set('jobs',true,2);
await login('ordinary');await hook('/rpc/fixture_estimate_entry');

 }finally{await db.close();}
});
