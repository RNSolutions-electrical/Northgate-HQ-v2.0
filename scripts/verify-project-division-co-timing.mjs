import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
let db,Client;
if(process.env.PG_TEST_URL){
 const target=new URL(process.env.PG_TEST_URL);
 assert.equal(target.hostname,'127.0.0.1','Synthetic tests require a local database');
 assert.equal(target.username,'synthetic_co_test','Use a dedicated synthetic test cluster');
 const pg=await import(pathToFileURL(process.env.PG_MODULE));Client=pg.Client||pg.default.Client;
 const client=new Client({connectionString:process.env.PG_TEST_URL});await client.connect();
 db={exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
}else{
 if(!process.env.PGLITE_MODULE) throw Error('Set PGLITE_MODULE, or isolated PG_TEST_URL and PG_MODULE');
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));db=new PGlite();
}
const migrationPath='supabase/migrations/20261016204812_fix_project_division_co_attachment_timing.sql';
const migration=await readFile(migrationPath,'utf8');
const sources={};
async function source(file){return sources[file]??=await readFile(`supabase/migrations/${file}.sql`,'utf8');}
async function definition(name,file){
 const match=(await source(file)).match(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\bAS\\s+(\\$[A-Za-z_]*\\$)[\\s\\S]*?\\1\\s*;`,'i'));
 assert.ok(match,`Function source missing: ${name}`);return match[0];
}
async function trigger(name,file){const match=(await source(file)).match(new RegExp(`CREATE TRIGGER ${name}\\b[\\s\\S]*?;`,'i'));assert.ok(match,`Trigger source missing: ${name}`);return match[0];}
const inferred='20260827002730_ensure_inferred_financial_division_change_order_lines';
const co='20260827000145_ensure_project_division_change_order_lines';
const approved='20260906191944_approved_financial_workflows';
const foundation='20260922162009_v5_jobs_financials_foundation';
const metadata={triggers:[],functions:[]};
for(const [name,fn,file,triggerFile=file] of [
 ['attach_existing_change_order_line_to_project_division_trigger','attach_existing_change_order_line_to_project_division',inferred],
 ['ensure_project_division_change_order_line_trigger','ensure_project_division_change_order_line',co],
 ['ensure_inferred_financial_division_change_order_line_trigger','ensure_inferred_financial_division_change_order_line',inferred],
 ['enforce_protected_budget_financial_write_trigger','enforce_protected_financial_write','20260827130340_normalize_departments_roles_and_protected_project_financials'],
 ['guard_financial_budget_changes','guard_financial_budget_changes','20260921134103_fix_financial_template_and_estimate_budget_mapping',approved],
 ['touch_job_budget_financial_baseline','touch_job_financial_baseline',foundation],
]) metadata.triggers.push({name,function:await definition(fn,file),trigger:await trigger(name,triggerFile)});
metadata.functions.push({definition:await definition('apply_financial_catalogue_to_job',approved)});
const report=[];
const job='11111111-1111-4111-8111-111111111111';
const cat01='22222222-2222-4222-8222-222222222201';
const cat16='22222222-2222-4222-8222-222222222216';
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const one=async(sql,args=[]) => (await q(sql,args))[0];
try{
 await db.exec(`
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('sub',nullif(current_setting('test.actor',true),'')) $$;
 CREATE FUNCTION public.current_user_can_edit_job(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.allowed',true),'yes')='yes' $$;
 CREATE FUNCTION public.current_user_can_access_job(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.allowed',true),'yes')='yes' $$;
 CREATE TABLE public.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,division text,archived_at timestamptz);
 CREATE TABLE public.user_permissions(clerk_user_id text,display_name text,email text,is_active boolean);
 CREATE TABLE public.job_budget_divisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid REFERENCES public.jobs(id),code text,name text,sort_order int DEFAULT 0,archived_at timestamptz,created_at timestamptz DEFAULT now());
 ALTER TABLE public.job_budget_divisions ADD UNIQUE(job_id,name);
 CREATE TABLE public.job_budget_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid REFERENCES public.jobs(id),division text,project_division_id uuid,
 category text DEFAULT 'other',is_protected_financial boolean DEFAULT false,cost_code text,description text,
 budget_amount numeric DEFAULT 0,budget_change_amount numeric DEFAULT 0,actual_cost_amount numeric DEFAULT 0,committed_cost_amount numeric DEFAULT 0,
 forecast_to_complete_amount numeric DEFAULT 0,forecast_final_amount numeric DEFAULT 0,schedule_of_values_amount numeric DEFAULT 0,current_budget_override_amount numeric,
 note text,sort_order int DEFAULT 0,created_by text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),archived_at timestamptz,
 CONSTRAINT job_budget_lines_project_division_id_fkey FOREIGN KEY(project_division_id) REFERENCES public.job_budget_divisions(id));
 CREATE UNIQUE INDEX job_budget_lines_active_job_co_code_idx ON public.job_budget_lines(job_id,upper(btrim(cost_code))) WHERE archived_at IS NULL AND upper(btrim(coalesce(cost_code,''))) ~ '^[0-9]+[.]CO$';
 CREATE TABLE public.financial_line_catalogue(id uuid PRIMARY KEY,division_code text,division_name text,cost_code text,description text,category text DEFAULT 'material',is_protected_financial boolean DEFAULT false,sort_order int DEFAULT 0,notes text,is_active boolean DEFAULT true);
 CREATE TABLE public.change_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text,user_name text,table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text);
 CREATE TABLE public.job_financial_baselines(job_id uuid PRIMARY KEY REFERENCES public.jobs(id),version int,established_by text,updated_by text,source text,updated_at timestamptz DEFAULT now());
 SELECT set_config('test.actor','synthetic-investigator',false),set_config('test.allowed','yes',false);
 `);
 for(const trigger of metadata.triggers) await db.exec(trigger.function);
 for(const trigger of metadata.triggers) await db.exec(trigger.trigger);
 for(const f of metadata.functions) await db.exec(f.definition);
 async function seed(){
  await db.exec('TRUNCATE public.jobs,public.job_budget_divisions,public.job_budget_lines,public.change_logs,public.job_financial_baselines,public.financial_line_catalogue,public.user_permissions CASCADE');
  await q('INSERT INTO public.jobs(id,name,division) VALUES($1,\'Synthetic job\',\'Construction\')',[job]);
  await db.exec("INSERT INTO public.user_permissions VALUES('synthetic-investigator','Synthetic investigator',NULL,true)");
  await q("INSERT INTO public.financial_line_catalogue(id,division_code,division_name,cost_code,description) VALUES($1,'01','General','01.100','Synthetic general'),($2,'16','Electrical','16.100','Synthetic electrical')",[cat01,cat16]);
 }
 async function snapshot(){return await one(`SELECT jsonb_build_object('divisions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.job_budget_divisions t),'lines',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.job_budget_lines t),'logs',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.change_logs t),'baselines',(SELECT jsonb_agg(to_jsonb(t) ORDER BY job_id) FROM public.job_financial_baselines t)) AS state`);}
 const apply=ids=>one('SELECT public.apply_financial_catalogue_to_job($1,$2::uuid[],$3) AS result',[job,ids,'Synthetic alignment reason']);
 const legacy=async()=>{
  await q("INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,budget_amount,actual_cost_amount,note) VALUES($1,'Construction','16.CO','Legacy CO',75,12,'System-managed change-order allocation line.')",[job]);
  await q("INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,budget_amount,actual_cost_amount,committed_cost_amount,forecast_final_amount) VALUES($1,'Construction','16.100','Legacy electrical',1000,200,300,1100)",[job]);
 };
 if(process.env.CO_REPAIR_TEST==='1'){
  const {verifyRepair}=await import('./verify-project-division-link-repair.mjs');
  await verifyRepair({db,Client,definition,approved,migration});
 }else{
 await seed();
 const empty=await apply([cat16]);
 assert.equal(empty.result.divisions_added,1);assert.equal(empty.result.lines_added,1);
 report.push({scenario:'Current Production definitions, empty job/no existing CO',result:empty.result});
 await seed();await legacy();
 const before=await snapshot();
 let failure;
 try{await apply([cat01,cat16]);assert.fail('Expected FK failure');}catch(error){assert.equal(error.code,'23503');assert.match(error.message,/job_budget_lines_project_division_id_fkey/);failure={code:error.code,message:error.message,detail:error.detail,where:error.where};}
 assert.deepEqual(await snapshot(),before,'Failed RPC must roll back earlier division, financial, audit and baseline writes');
 report.push({scenario:'Current definitions, earlier successful division then legacy unassigned CO',failure,allFinancialDivisionAuditBaselineWritesRolledBack:true});
 await seed();
 await q("INSERT INTO public.job_budget_divisions(job_id,code,name) VALUES($1,'16','Electrical')",[job]);
 const working=await apply([cat16]);assert.equal(working.result.divisions_added,0);
 report.push({scenario:'Current definitions, already-linked working job',result:working.result});
 // Apply the exact migration in an explicit transaction, then reapply it to
 // check idempotence. No remote connections or business records are used.
 const attach=metadata.triggers.find(t=>t.name==='attach_existing_change_order_line_to_project_division_trigger');
 const functionState=()=>q("SELECT proname,pg_get_userbyid(proowner) AS owner,proacl::text AS acl,md5(pg_get_functiondef(oid)) AS hash FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname");
 const functionsBefore=await functionState();
 await db.exec('BEGIN');
 await db.exec(`ALTER TABLE public.job_budget_divisions DISABLE TRIGGER ${attach.name}`);
 await assert.rejects(()=>db.exec(migration),e=>e.code==='P0001');
 await db.exec('ROLLBACK');
 const unchangedTrigger=await one("SELECT tgtype::int AS type,tgenabled FROM pg_trigger WHERE tgrelid='public.job_budget_divisions'::regclass AND tgname=$1",[attach.name]);
 assert.equal(unchangedTrigger.type,7);assert.equal(unchangedTrigger.tgenabled,'O');
 await db.exec('BEGIN;'+migration+'COMMIT;');
 await db.exec('BEGIN;'+migration+'COMMIT;');
 assert.deepEqual(await functionState(),functionsBefore,'Timing migration must preserve every function definition, owner and ACL');
 report.push({scenario:'Exact migration preflight failure/rollback and repeated application',preflightFailureLeftOriginalTriggerIntact:true,reapplicationPassed:true,allFunctionDefinitionsOwnersAclsUnchanged:true});
 const order=await q("SELECT tgname FROM pg_trigger WHERE tgrelid='public.job_budget_divisions'::regclass AND NOT tgisinternal ORDER BY tgname");
 assert.deepEqual(order.map(t=>t.tgname),['attach_existing_change_order_line_to_project_division_trigger','ensure_project_division_change_order_line_trigger']);
 await seed();await legacy();
 const rejectedAlignment=await snapshot();
 await assert.rejects(()=>one('SELECT public.apply_financial_catalogue_to_job($1,$2::uuid[],NULL)',[job,[cat01,cat16]]),e=>e.code==='22023');
 assert.deepEqual(await snapshot(),rejectedAlignment,'Protected alignment failure must roll back new divisions, CO attachment, audit and baseline writes after the fix');
 report.push({scenario:'Fixed timing with rejected protected alignment',reasonGatePreserved:true,entireTransactionRolledBack:true});
 await seed();await legacy();
 const amountColumns='id,budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,current_budget_override_amount';
 const amountsBefore=await q(`SELECT ${amountColumns} FROM public.job_budget_lines ORDER BY id`);
 const fixed=await apply([cat01,cat16]);assert.equal(fixed.result.divisions_added,2);assert.equal(fixed.result.lines_aligned,1);
 const originalIds=amountsBefore.map(row=>row.id);
 assert.deepEqual(await q(`SELECT ${amountColumns} FROM public.job_budget_lines WHERE id=ANY($1::uuid[]) ORDER BY id`,[originalIds]),amountsBefore);
 const co=await q("SELECT l.id,l.project_division_id,d.code FROM public.job_budget_lines l LEFT JOIN public.job_budget_divisions d ON d.id=l.project_division_id WHERE l.cost_code='16.CO'");
 assert.equal(co.length,1);assert.equal(co[0].code,'16');
 const repeat=await apply([cat01,cat16]);assert.deepEqual(repeat.result,{divisions_added:0,lines_added:0,lines_aligned:0});
 report.push({scenario:'Proposed AFTER timing, legacy rows and repeat',result:fixed.result,repeat:repeat.result,existingAmountsUnchanged:true,originalCoReusedWithoutDuplicate:true,triggerOrder:order});
 await seed();
 const afterEmpty=await apply([cat16]);assert.equal(afterEmpty.result.divisions_added,1);
 const afterEmptyCo=await one("SELECT count(*)::int AS count FROM public.job_budget_lines WHERE cost_code='16.CO'");assert.equal(afterEmptyCo.count,1);
 report.push({scenario:'Proposed AFTER timing, empty budget',result:afterEmpty.result,exactlyOneAutoCo:true});
 await seed();await legacy();
 // Simulate an inactive division left from historical setup: archived parent IDs are real,
 // but template lookup must create a distinct active project instance and attach null-link CO.
 await q("INSERT INTO public.job_budget_divisions(job_id,code,name,archived_at) VALUES($1,'16','Archived Electrical',now())",[job]);
 const archived=await apply([cat16]);assert.equal(archived.result.divisions_added,1);
 const archivedCo=await one("SELECT d.archived_at FROM public.job_budget_lines l JOIN public.job_budget_divisions d ON d.id=l.project_division_id WHERE l.cost_code='16.CO'");assert.equal(archivedCo.archived_at,null);
 report.push({scenario:'Proposed AFTER timing, archived division instance',result:archived.result,coLinkedToActiveInstance:true});
 if(Client){
  await seed();await legacy();const amounts=await q(`SELECT ${amountColumns} FROM public.job_budget_lines ORDER BY id`);
  const second=new Client({connectionString:process.env.PG_TEST_URL});await second.connect();
  try{
   await second.query("SELECT set_config('test.actor','synthetic-investigator',false),set_config('test.allowed','yes',false)");
   await db.exec('BEGIN');const first=await apply([cat16]);
   await second.query('BEGIN');const pid=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   const pending=second.query('SELECT public.apply_financial_catalogue_to_job($1,$2::uuid[],$3) AS result',[job,[cat16],'Synthetic concurrent retry']);
   let blocked=false;
   for(let attempt=0;attempt<40;attempt++){
    const state=await one("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid]);
    if(state?.wait_event_type==='Lock'){blocked=true;break;}
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   assert.equal(blocked,true,'Second real connection must wait on the existing job lock');
   await db.exec('COMMIT');const retry=(await pending).rows[0];await second.query('COMMIT');
   assert.equal(first.result.divisions_added,1);assert.deepEqual(retry.result,{divisions_added:0,lines_added:0,lines_aligned:0});
   assert.equal((await one('SELECT count(*)::int AS count FROM public.job_budget_divisions WHERE archived_at IS NULL')).count,1);
   assert.equal((await one("SELECT count(*)::int AS count FROM public.job_budget_lines WHERE cost_code='16.CO'")).count,1);
   assert.deepEqual(await q(`SELECT ${amountColumns} FROM public.job_budget_lines ORDER BY id`),amounts);
   report.push({scenario:'Two real PostgreSQL connections applying the same legacy template',secondConnectionWaitedOnJobLock:true,secondResult:retry.result,noDuplicateCoOrDivision:true,amountsUnchanged:true});
  }finally{await db.exec('ROLLBACK');await second.query('ROLLBACK');await second.end();}
 }
 const deniedBefore=await snapshot();await db.exec("SELECT set_config('test.allowed','no',false)");
 await assert.rejects(()=>apply([cat16]),e=>e.code==='42501');assert.deepEqual(await snapshot(),deniedBefore);
 report.push({scenario:'Permission-denied helper result',permissionGateStillRejects:true,noWrites:true});
 await mkdir('.temp/project-division-co',{recursive:true});
 await writeFile(`.temp/project-division-co/evidence-${Client?'postgres':'pglite'}.json`,JSON.stringify({migrationPath,authHelpers:'synthetic stubs; live evaluator/ACL tests recorded separately',report},null,2));
 console.log(JSON.stringify(report,null,2));
 }
}finally{await db.close();}
