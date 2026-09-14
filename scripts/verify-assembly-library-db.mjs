import {PGlite} from '../.temp/assembly-db/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('sub',nullif(current_setting('test.actor',true),'')) $$;
 CREATE FUNCTION public.current_user_can_edit_division(d text,p text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.allowed',true),'')='yes' AND d='Electrical' $$;
 CREATE FUNCTION public.current_user_can_read_division(d text,p text) RETURNS boolean LANGUAGE sql AS $$ SELECT d='Electrical' $$;
 CREATE FUNCTION public.change_order_actor() RETURNS text LANGUAGE sql AS $$ SELECT 'Local test'::text $$;
 CREATE FUNCTION public.touch_user_permissions_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
 CREATE TABLE public.estimates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),division text,status text DEFAULT 'draft',archived_at timestamptz,editor_version int DEFAULT 2);
 CREATE TABLE public.items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),is_active boolean DEFAULT true,is_archived boolean DEFAULT false,estimating_enabled boolean DEFAULT true);
 CREATE TABLE public.change_logs(id bigint GENERATED ALWAYS AS IDENTITY,user_id text,user_name text,table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text);
 ALTER TABLE public.change_logs ADD CONSTRAINT change_logs_action_check CHECK(action IN ('create','update','delete','restore','archive','import','permission_change','physical_count_correction','certify','deny'));
 ALTER TABLE public.change_logs ENABLE ROW LEVEL SECURITY;
 CREATE TABLE public.estimate_workbenches(estimate_id uuid PRIMARY KEY,revision int,document jsonb,updated_at timestamptz DEFAULT now());
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT SELECT ON public.estimates,public.items TO authenticated;
 GRANT SELECT,INSERT,UPDATE ON public.estimate_workbenches TO authenticated;
 CREATE FUNCTION public.save_estimate_workbench(p_estimate_id uuid,p_division text,p_document jsonb,p_expected_revision int,p_catalogue_updates jsonb) RETURNS public.estimate_workbenches
 LANGUAGE plpgsql SECURITY INVOKER AS $$ DECLARE r public.estimate_workbenches; BEGIN
 IF p_document->>'fail'='yes' THEN RAISE EXCEPTION 'Forced draft failure';END IF;
 INSERT INTO public.estimate_workbenches VALUES(p_estimate_id,1,p_document,now())
 ON CONFLICT(estimate_id) DO UPDATE SET revision=estimate_workbenches.revision+1,document=p_document RETURNING * INTO r; RETURN r;END $$;
 `);
 const original=await readFile('supabase/migrations/20260823103000_estimating_catalog_assemblies_takeoffs.sql','utf8');
 await db.exec(original.slice(original.indexOf('CREATE TABLE IF NOT EXISTS public.assemblies ('),original.indexOf('GRANT SELECT, INSERT, UPDATE ON public.assembly_items TO authenticated;')+'GRANT SELECT, INSERT, UPDATE ON public.assembly_items TO authenticated;'.length));
 await db.exec(await readFile('supabase/migrations/20260914002830_workbench_assembly_library.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260914004020_fix_assembly_audit_actions.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260914010605_standalone_assembly_library.sql','utf8'));
 const estimate=(await db.query("insert into estimates(division) values('Electrical') returning id")).rows[0].id;
 await db.exec("set role authenticated;select set_config('test.actor','local-user',false),set_config('test.allowed','yes',false)");
 const line={name:'Custom wire',qty:2,price:1.5,hours:0.2,stage:'Trim-out',fixed:true,unit:'FT',notes:'Library detail'};
 const save=(assembly,doc={})=>db.query('select public.save_workbench_assembly($1,$2,$3,1,$4,$5)',[estimate,'Electrical',doc,[],assembly]);
 await save({name:'Reusable outlet',notes:'Library scope',lines:[line]});
 let a=(await db.query('select * from assemblies')).rows[0];
 let l=(await db.query('select * from assembly_items')).rows[0];
 assert.equal(l.stage,'Trim-out');assert.equal(l.fixed_quantity,true);
 const initialStamp=a.updated_at;
 await save({id:a.id,updatedAt:a.updated_at,name:'Revised outlet',notes:'Updated scope',lines:[{...line,libraryLineId:l.id,hours:0.5},{...line,name:'Additional labor',price:null,hours:null}]});
 await assert.rejects(save({id:a.id,updatedAt:initialStamp,name:'Stale',lines:[line]}),/Assembly changed/);
 a=(await db.query('select * from assemblies')).rows[0];
 await save({id:a.id,updatedAt:a.updated_at,name:'Revised outlet',lines:[{...line,libraryLineId:l.id}]});
 assert.equal((await db.query('select count(*)::int as n from assembly_items where archived_at is null')).rows[0].n,1);
 await db.exec("select set_config('test.allowed','no',false)");
 await assert.rejects(save({name:'Denied',lines:[line]}),/Assembly edit permission required/);
 await db.exec("select set_config('test.allowed','yes',false)");
 await assert.rejects(save({name:'Rollback',lines:[line]},{fail:'yes'}),/Forced draft failure/);
 assert.equal((await db.query('select count(*)::int as n from assemblies')).rows[0].n,1);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int as n from assembly_items where archived_at is not null')).rows[0].n,1);
 assert.ok((await db.query('select count(*)::int as n from change_logs')).rows[0].n>=5);
 await db.exec("create function fail_audit() returns trigger language plpgsql as $$ begin raise exception 'Forced audit failure';end $$;create trigger fail_audit before insert on change_logs for each row execute function fail_audit();set role authenticated");
 await assert.rejects(save({name:'Audit rollback',lines:[line]}),/Forced audit failure/);
 assert.equal((await db.query('select count(*)::int as n from assemblies')).rows[0].n,1);
 await db.exec('reset role;drop trigger fail_audit on change_logs;set role authenticated');
 await db.query('select public.save_assembly_library($1,$2)', ['Electrical',{name:'Standalone',lines:[line]}]);
 const standalone=(await db.query("select id,updated_at::text as stamp from assemblies where name='Standalone'")).rows[0];
 await assert.rejects(db.query('select public.archive_assembly_library($1,$2,$3)',[standalone.id,standalone.stamp,' ']),/reason required/);
 await db.query('select public.archive_assembly_library($1,$2,$3)',[standalone.id,standalone.stamp,'No longer used']);
 assert.equal((await db.query('select archive_reason from assemblies where id=$1',[standalone.id])).rows[0].archive_reason,'No longer used');
 console.log('PASS: local Postgres assembly creation, editing, standalone save/archive, stages, scaling, removal, permission denial, stale conflicts, draft and audit rollback.');
} finally {await db.close();}
