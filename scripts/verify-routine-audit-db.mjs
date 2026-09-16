import {PGlite} from '../.temp/inspection-checks/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
const q=(sql,args=[])=>db.query(sql,args);
const one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
const actor=async(name)=>{await db.exec('reset role');await q("select set_config('test.actor',$1,false)",[name]);await db.exec('set role authenticated');};
try{
 await db.exec(await readFile('tests/fixtures/inspectionPrerequisites.sql','utf8'));
 await db.exec('set check_function_bodies=off');
 await db.exec(await readFile('tests/fixtures/inspectionAuthFunctions.sql','utf8'));
 await db.exec("create table tools(id uuid primary key);create table employee_profiles(id uuid primary key default gen_random_uuid(),email text unique,display_name text,role text,division text,job_title text,phone text,notes text,created_by text,clerk_user_id text,archived_at timestamptz,updated_at timestamptz default now());");
 await db.exec(await readFile('tests/fixtures/routineAuditFunctions.sql','utf8'));
 const names=(await q("select oid::regprocedure::text signature from pg_proc where pronamespace='public'::regnamespace and (proname in ('hi_action','save_employee_profile','update_pending_employee_profile') or proname in ('archive_estimate','archive_estimate_document','archive_job','archive_job_document','archive_job_schedule_item','archive_pending_employee_profile','edit_inventory_location','hi_job_register_save','maintain_owner_document','map_material_to_inventory_bin','retire_bin_item','save_material_alias','save_tool_catalogue','set_inventory_location_archived','set_job_user_assignment','svc_archive_call','svc_save_stage'))")).rows;
 for(const {signature} of names)await db.exec('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION '+signature+' TO authenticated;');
 const before=(await q("select oid::regprocedure::text signature,prosecdef,proconfig,proacl from pg_proc where oid=any($1::regprocedure[])",[names.map(r=>r.signature)])).rows;
 await db.exec(await readFile('supabase/migrations/20260916125644_routine_audit_notes.sql','utf8'));
 const after=(await q("select oid::regprocedure::text signature,prosecdef,proconfig,proacl from pg_proc where oid=any($1::regprocedure[])",[names.map(r=>r.signature)])).rows;
 assert.deepEqual(after,before,'security, search paths and execute grants unchanged');
 for(const {signature} of names){
  assert.match(await one('select pg_get_functiondef($1::regprocedure)',[signature]),/Automatic audit:/);
  assert.equal(await one("select has_function_privilege('anon',$1,'execute')",[signature]),false);
 }
 await db.exec("set check_function_bodies=on;insert into user_permissions(clerk_user_id,role,division,display_name)values('manager','Manager','Electrical','Test Manager'),('field','User','Electrical','Field User');");
 await actor('manager');
 const create=(email,role='User',dept='Electrical',reason=null)=>one("select save_employee_profile($1,'New employee',$2,$3,'Technician','555','Note',$4)",[email,role,dept,reason]);
 const id=await create('synthetic@example.invalid');
 const update=(role='User',dept='Electrical',email='synthetic@example.invalid',reason=null)=>one("select update_pending_employee_profile($1,$2,'Updated name',$3,$4,'Technician','556','Updated',$5)",[id,email,role,dept,reason]);
 assert.equal(await update(),id);
 await assert.rejects(()=>update('Manager'),/reason.*role/i);
 await assert.rejects(()=>update('User','Construction'),/reason.*department/i);
 await assert.rejects(()=>update('User','Electrical','other@example.invalid'),/reason.*email/i);
 await assert.rejects(()=>create('leader@example.invalid','Manager'),/reason.*elevated/i);
 await assert.rejects(()=>create('synthetic@example.invalid','User','Construction'),/reason.*existing/i);
 assert.equal(await update('Manager','Electrical','synthetic@example.invalid','Approved management access'),id);
 assert.equal(await update('Manager','Electrical','synthetic@example.invalid'),id,'same access allows contact updates');
 await actor('field');await assert.rejects(()=>create('denied@example.invalid'),/permission/i);
 await db.exec('reset role');
 assert.equal(await one("select count(*)::int from employee_profiles"),1);
 const logs=(await q('select * from change_logs order by created_at')).rows;
 assert.ok(logs.every(l=>l.user_id==='manager'));
 assert.ok(logs.some(l=>l.note==='Automatic audit: employee profile details updated.'&&l.before_data&&l.after_data));
 assert.ok(logs.some(l=>l.note==='Approved management access'));
 console.log('PASS: all 20 reviewed RPC definitions load/transform; security/search paths/grants preserved; employee routine edits and new User creation; identity/department/elevated-role reasons and authorization retained. Other module runtime behavior is covered separately, not by definition loading.');
}catch(e){console.error(e.message,e.where||'',e.query?.slice(0,400)||'');process.exitCode=1;}finally{await db.close();}
