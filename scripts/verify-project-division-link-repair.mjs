import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

export async function verifyRepair({db,Client,definition,approved,migration}){
 const sql=await readFile('scripts/repair-project-division-links.sql','utf8');
 const q=async(s,p=[]) => (await db.query(s,p)).rows;
 const one=async(s,p=[]) => (await q(s,p))[0];
 const job='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333';
 const prefixes=['01','02','03','04','05','06','07','08','09','10','15','16'];
 // Same structural size as the reported legacy case, with synthetic labels,
 // values and a different per-prefix distribution. No customer data is used.
 const counts=Object.fromEntries(prefixes.map((p,i)=>[p,i<8?10:9]));
 const reason='Synthetic scoped relationship repair preserving original labels and every amount';
 const report=[];
 await db.exec("CREATE FUNCTION public.current_user_can_read_project_financial_line(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.allowed',true),'yes')='yes' $$");
 await db.exec(await definition('save_job_financial_batch',approved));
 await db.exec('BEGIN;'+migration+'COMMIT;');
 async function seed(){
  await db.exec('TRUNCATE public.jobs,public.job_budget_divisions,public.job_budget_lines,public.change_logs,public.job_financial_baselines,public.financial_line_catalogue,public.user_permissions CASCADE');
  await q("INSERT INTO public.jobs(id,name,division) VALUES($1,'Synthetic legacy job','Construction'),($2,'Unrelated synthetic job','Construction')",[job,other]);
  await db.exec("SELECT set_config('test.actor','synthetic-investigator',false),set_config('test.allowed','yes',false),set_config('northgate.financial_reason','Synthetic fixture setup',false),set_config('northgate.financial_workflow','financial.save',false)");
  await db.exec("INSERT INTO public.user_permissions VALUES('synthetic-investigator','Synthetic investigator',NULL,true)");
  let n=0;
  for(const prefix of prefixes){
   await q("INSERT INTO public.financial_line_catalogue(id,division_code,division_name,cost_code,description) VALUES(gen_random_uuid(),$1,$2,$3,'Synthetic catalogue item')",[prefix,`Catalogue Division ${prefix}`,`${prefix}.100`]);
   for(let i=0;i<counts[prefix];i++){
    n++;
    await q(`INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,note,category,is_protected_financial,
      budget_amount,budget_change_amount,actual_cost_amount,committed_cost_amount,forecast_to_complete_amount,forecast_final_amount,schedule_of_values_amount,current_budget_override_amount)
      VALUES($1,'Construction',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [job,i===0?`${prefix}.CO`:`${prefix}.${100+i}`,i===0?`Original CO label ${prefix}`:`Synthetic item ${n}`,
       `Original note ${n}`,i%2?'material':'other',i%3===0,n*10.11,n*1.23,n*2.34,n*3.45,n*4.56,n*5.67,n*6.78,n%2?n*7.89:null]);
   }
  }
  for(let i=1;i<=3;i++) await q("INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,budget_amount,actual_cost_amount) VALUES($1,'Construction',$2,$3,$4,$5)",[job,`GENERIC-${String.fromCharCode(64+i)}`,`Synthetic withheld ${i}`,i*10,i*2]);
  await q("INSERT INTO public.job_budget_lines(job_id,division,cost_code,description,budget_amount) VALUES($1,'Construction','UNRELATED','Untouched unrelated row',987.65)",[other]);
 }
 const snapshot=()=>one(`SELECT jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.job_budget_lines l),
  'divisions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.job_budget_divisions d),
  'logs',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.change_logs c),
  'baselines',(SELECT jsonb_agg(to_jsonb(b) ORDER BY job_id) FROM public.job_financial_baselines b)) AS state`);
 const hash=async()=> (await one("SELECT md5(coalesce(string_agg(md5(to_jsonb(l)::text),'' ORDER BY id),'')) AS hash FROM public.job_budget_lines l WHERE job_id=$1",[job])).hash;
 async function configure(client=db){
  const settings={'northgate.repair_job_id':job,'northgate.repair_expected_lines_hash':await hash(),
   'northgate.repair_expected_total':'119','northgate.repair_prefix_counts':JSON.stringify(counts),'northgate.repair_reason':reason};
  for(const [k,v] of Object.entries(settings)) await client.query('SELECT set_config($1,$2,false)',[k,v]);
  return settings;
 }
 async function assertFinal(before){
  const after=await snapshot();const old=before.state.lines,now=after.state.lines;
  assert.equal(now.length,120);assert.equal(after.state.divisions.length,12);
  for(const b of old){
   const a=now.find(l=>l.id===b.id);assert.ok(a);
   if(b.job_id===job && /^\d/.test(b.cost_code)){
    const {project_division_id:_,updated_at:__,...bf}=b;
    const {project_division_id,updated_at,...af}=a;
    assert.deepEqual(af,bf,'Every original field except link/timestamp must match exactly');assert.ok(project_division_id);
   }else assert.deepEqual(a,b,'Withheld/unrelated rows must match byte-for-byte');
  }
  for(const prefix of prefixes){const co=now.filter(l=>l.job_id===job&&l.cost_code===`${prefix}.CO`);assert.equal(co.length,1);assert.equal(co[0].description,`Original CO label ${prefix}`);}
  const links=after.state.logs.filter(l=>l.table_name==='job_budget_lines'&&l.before_data?.project_division_id===null&&l.after_data?.project_division_id);
  assert.equal(new Set(links.map(l=>l.record_id)).size,116,'All 116 link changes require explicit before/after audits');
  return after;
 }
 await seed();const beforeSync=await snapshot();
 await db.exec('BEGIN');
 for(const prefix of prefixes) await q("INSERT INTO public.job_budget_divisions(job_id,code,name,sort_order) VALUES($1,$2,$3,$4)",[job,prefix,`Catalogue Division ${prefix}`,Number(prefix)]);
 assert.equal((await one("SELECT count(*)::int AS count FROM public.job_budget_lines WHERE job_id=$1 AND description LIKE 'Catalogue Division%Change Orders'",[job])).count,12);
 await db.exec('ROLLBACK');assert.deepEqual(await snapshot(),beforeSync);
 report.push({scenario:'Reproduce all 12 trigger description/note rewrites, then rollback',passed:true});
 await configure();const before=await snapshot();await db.exec(sql);await assertFinal(before);
 report.push({scenario:'Exact repair SQL on 119 synthetic legacy rows',linked:116,divisions:12,withheld:3,allOriginalDescriptionsNotesAmountsAndOtherFieldsPreserved:true,allLinksAudited:true});
 await assert.rejects(()=>db.exec(sql),e=>e.message.includes('setup changed'));await db.exec('ROLLBACK');await assertFinal(before);
 report.push({scenario:'Repeated repair rejects stale plan without new changes',passed:true});
 await seed();await configure();const rollbackBefore=await snapshot();
 await db.exec(`CREATE FUNCTION public.reject_synthetic_co_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.description LIKE 'Catalogue Division%' AND NEW.description LIKE 'Original CO label%' THEN RAISE EXCEPTION 'Synthetic restore rejected'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER reject_synthetic_co_restore BEFORE UPDATE ON public.job_budget_lines FOR EACH ROW EXECUTE FUNCTION public.reject_synthetic_co_restore();`);
 await assert.rejects(()=>db.exec(sql),e=>e.message.includes('Synthetic restore rejected'));await db.exec('ROLLBACK');
 assert.deepEqual(await snapshot(),rollbackBefore,'Restore rejection must roll back all parent/link/label/note/audit/baseline changes');
 await db.exec('DROP TRIGGER reject_synthetic_co_restore ON public.job_budget_lines; DROP FUNCTION public.reject_synthetic_co_restore()');
 report.push({scenario:'Rejected description restoration rolls back entire transaction',passed:true});
 await seed();await q("UPDATE public.job_budget_lines SET description=' Noncanonical original ' WHERE id=(SELECT id FROM public.job_budget_lines WHERE job_id=$1 AND cost_code='01.101')",[job]);
 await configure();const noncanonical=await snapshot();await assert.rejects(()=>db.exec(sql),e=>e.message.includes('Noncanonical'));await db.exec('ROLLBACK');assert.deepEqual(await snapshot(),noncanonical);
 report.push({scenario:'Whitespace-sensitive source refuses implicit RPC normalization',passed:true});
 await seed();await configure();const deniedBefore=await snapshot();
 await db.exec("SELECT set_config('test.allowed','no',false)");
 await assert.rejects(()=>db.exec(sql),e=>e.code==='42501');await db.exec('ROLLBACK');assert.deepEqual(await snapshot(),deniedBefore);
 report.push({scenario:'Unauthorized actor cannot start the repair',passed:true});
 if(Client){
  await seed();const settings=await configure();const concurrentBefore=await snapshot();
  const second=new Client({connectionString:process.env.PG_TEST_URL});await second.connect();
  try{
   await second.query("SELECT set_config('test.actor','synthetic-investigator',false),set_config('test.allowed','yes',false)");
   for(const [k,v] of Object.entries(settings)) await second.query('SELECT set_config($1,$2,false)',[k,v]);
   const pid=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await db.exec(sql.replace(/COMMIT;\s*$/,''));
   const pending=second.query(sql).then(()=>({ok:true}),error=>({error}));let blocked=false;
   for(let i=0;i<40;i++){if((await one('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]))?.wait_event_type==='Lock'){blocked=true;break;}await new Promise(r=>setTimeout(r,50));}
   assert.equal(blocked,true);await db.exec('COMMIT');const result=await pending;
   assert.match(result.error?.message||'',/setup changed/);await second.query('ROLLBACK');await assertFinal(concurrentBefore);
   report.push({scenario:'Two real PostgreSQL repair transactions',secondWaitsOnJobLock:true,secondRejectsChangedPlan:true,noDuplicatesAndOriginalFieldsPreserved:true});
  }finally{await db.exec('ROLLBACK');await second.query('ROLLBACK');await second.end();}
 }
 await mkdir('.temp/project-division-co',{recursive:true});
 await writeFile('.temp/project-division-co/repair-evidence.json',JSON.stringify({syntheticOnly:true,report},null,2));console.log(JSON.stringify(report,null,2));
}
