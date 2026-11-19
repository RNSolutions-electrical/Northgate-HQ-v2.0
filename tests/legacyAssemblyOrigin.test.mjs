import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
test('legacy origin projection is scoped, conservative and read-only',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_TEST_MODULE));const db=new PGlite();try{
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE TABLE public.user_permissions(clerk_user_id text,is_active boolean);
INSERT INTO public.user_permissions VALUES('editor',true),('reviewer',true),('inactive',false),('personal',true);
CREATE FUNCTION public.current_user_can_read_division(d text,k text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT d='Electrical' AND ((auth.jwt()->>'sub'='editor' AND k='can_estimate') OR (auth.jwt()->>'sub'='reviewer' AND k='can_approve_estimates'))$$;
CREATE TABLE public.assemblies(id uuid,division text,source_estimate_id uuid,is_library_item boolean,archived_at timestamptz);
CREATE TABLE public.change_logs(table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text);
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
`);
const ids=Array.from({length:8},(_,n)=>`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`);
for(let n=0;n<8;n++)await db.query('INSERT INTO assemblies VALUES($1,$2,$3,$4,$5)',[ids[n],n===6?'Construction':'Electrical',n===0?ids[0]:null,n!==7,n===5?new Date().toISOString():null]);
const log=async(n,source,malformed=false,action='create')=>db.query('INSERT INTO change_logs VALUES($1,$2,$3,NULL,$4,$5)',['assemblies',ids[n],action,{id:ids[n],division:'Electrical',source_estimate_id:source==='estimate'?ids[0]:null},malformed?'not json':JSON.stringify({workflow:'assembly_library',source,estimate_id:source==='estimate'?ids[0]:null})]);
await log(1,'assembly_library');await log(2,'estimate',false,'insert');await log(3,'assembly_library');await log(3,'estimate');await log(4,'assembly_library',true);
const before=(await db.query('SELECT (SELECT count(*) FROM assemblies) a,(SELECT count(*) FROM change_logs) c')).rows;
await db.exec(await readFile(new URL('../supabase/migrations/20261119174500_legacy_assembly_origin.sql',import.meta.url),'utf8'));
const login=async(sub,extra={})=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,...extra})]);await db.exec('SET ROLE authenticated');};
const read=()=>db.query('SELECT * FROM public.read_legacy_assembly_origins($1,$2)',['Electrical',ids]);
await login('editor');assert.deepEqual((await read()).rows.map(x=>x.origin),['from_estimate','built_in_library','from_estimate','unknown','unknown']);
assert.deepEqual(Object.keys((await read()).rows[0]),['id','origin']);
await assert.rejects(db.query('SELECT * FROM change_logs'),/permission denied/);
await assert.rejects(db.query('SELECT * FROM public.read_legacy_assembly_origins($1,$2)',['Construction',ids]),/permission/);
await assert.rejects(db.query('SELECT * FROM public.read_legacy_assembly_origins($1,$2)',['Electrical',Array(501).fill(ids[0])]),/500/);
await login('reviewer');assert.equal((await read()).rows.length,5);
for(const user of ['inactive','missing','personal','']){await login(user);await assert.rejects(read());}
await login('editor',{is_anonymous:true});await assert.rejects(read());
await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(read(),/permission denied/);
await db.exec('RESET ROLE');assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM assemblies) a,(SELECT count(*) FROM change_logs) c')).rows,before);
await db.exec(`CREATE FUNCTION public.require_tool_available(text) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Tool unavailable';END$$;`);
await login('editor');await assert.rejects(read(),/Tool unavailable/);
}finally{await db.close();}});
