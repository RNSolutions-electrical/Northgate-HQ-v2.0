// Local PostgreSQL rehearsal. Actual Staging table columns/checks; auth helpers are
// deliberate test doubles. This does NOT verify deployed RLS or real role defaults.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw Error('Set PGLITE_MODULE to an installed PGlite dist/index.js');
const { PGlite } = await import(pathToFileURL(modulePath));
const db = new PGlite();
const read = (file) => readFile(new URL('../' + file, import.meta.url), 'utf8');
const q = async (sql, params=[]) => (await db.query(sql, params)).rows;
const scalar = async (sql, params=[]) => Object.values((await q(sql, params))[0])[0];
let assertions=0;
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);assertions++;};
const fails=async(fn,pattern)=>{await assert.rejects(fn,pattern);assertions++;};
try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',current_setting('test.actor',true))$$;
 CREATE FUNCTION public.change_order_actor() RETURNS text LANGUAGE sql AS $$SELECT auth.jwt()->>'sub'$$;
 CREATE FUNCTION public.current_user_can_access_job(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT COALESCE(auth.jwt()->>'sub','') IN ('manager','supervisor')$$;
 CREATE FUNCTION public.current_user_can_edit_job(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT auth.jwt()->>'sub'='manager' OR (auth.jwt()->>'sub'='supervisor' AND $2 IN ('can_create_change_orders','can_submit_change_orders','can_verify_change_orders'))$$;
 CREATE FUNCTION public.current_user_can_edit_division(text,text) RETURNS boolean LANGUAGE sql AS $$SELECT auth.jwt()->>'sub'='manager'$$;
 CREATE FUNCTION public.current_user_can_read_project_change_order(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT public.current_user_can_access_job($1)$$;
 CREATE FUNCTION public.current_user_can_read_project_financial_line(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT public.current_user_can_access_job($1)$$;
 CREATE FUNCTION public.current_scoped_authorization_decision(text,jsonb) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('allowed',auth.jwt()->>'sub'='manager' OR (auth.jwt()->>'sub'='supervisor' AND $1 IN ('AUD-019','AUD-021','CFG-007','AUD-018')))$$;
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
 `);
 await db.exec(await read('tests/fixtures/contractAdjustmentSchema.sql'));
 await db.exec(`
 CREATE POLICY change_order_lines_read ON public.change_order_lines FOR SELECT TO authenticated USING(true);
 CREATE UNIQUE INDEX change_orders_active_number_unique ON change_orders(job_id,division,lower(co_number)) WHERE archived_at IS NULL;
 CREATE UNIQUE INDEX change_order_one_overall_markup_line ON change_order_lines(change_order_id) WHERE is_overall_markup;
 SELECT set_config('test.actor','manager',false);
 `);
 const rates = await read('supabase/migrations/20260923121000_change_order_line_markup_rates_demo.sql');
 const ratesStart=rates.indexOf('CREATE FUNCTION public.save_job_change_order_draft_with_rates');
 assert.ok(ratesStart>=0, 'Existing rate RPC source must be found');
 await db.exec(rates.slice(ratesStart));
 const job = await scalar("INSERT INTO jobs(name,division) VALUES('Contract adjustment fixture','Electrical') RETURNING id");
 const budget = await scalar("INSERT INTO job_budget_lines(job_id,division,category,description,cost_code,budget_amount) VALUES($1,'Electrical','other','Lighting','16.12',1000) RETURNING id",[job]);
 const creditBudget = await scalar("INSERT INTO job_budget_lines(job_id,division,category,description,cost_code,budget_amount) VALUES($1,'Electrical','other','Credit allocation','16.CO',0) RETURNING id",[job]);
 const historical=await scalar("INSERT INTO change_orders(job_id,division,co_number,title,status,price_amount,cost_amount) VALUES($1,'Electrical','CO-001','Historical','approved',115,100) RETURNING id",[job]);
 await q("INSERT INTO change_order_lines(change_order_id,division,description,job_budget_line_id,material_amount,markup_amount) VALUES($1,'Electrical','Legacy dollars',$2,100,15)",[historical,budget]);
 await db.exec(await read('supabase/migrations/20260925112213_contract_adjustment_state_model.sql'));
 await db.exec(`
 CREATE TRIGGER enforce_v5_change_order_action_trigger BEFORE INSERT OR UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION enforce_v5_change_order_action();
 CREATE TRIGGER change_order_line_coding_guard BEFORE INSERT OR UPDATE OF job_budget_line_id,change_order_id ON change_order_lines FOR EACH ROW EXECUTE FUNCTION guard_change_order_line_coding();
 `);
 check(Number(await scalar('SELECT line_total FROM change_order_lines WHERE change_order_id=$1',[historical])),115,'legacy dollars unchanged');
 const save=async(data)=>scalar('SELECT to_jsonb(save_contract_adjustment($1))',[{job_id:job,...data}]);
 const state=async(row,status)=>scalar('SELECT to_jsonb(set_contract_adjustment_status($1,$2,NULL,$3))',[row.id,status,row.updated_at]);
 let draft=await save({co_number:'CO-002',lines:[]});
 check(draft.price_amount,null,'number-only draft retains unknown pricing');
 await fails(()=>state(draft,'approved'),/description\/title/);
 draft=await save({...draft,expected_updated_at:draft.updated_at,title:'Mixed work',lines:[
 {job_budget_line_id:budget,description:'Additional work',material_amount:10000},
 {job_budget_line_id:creditBudget,description:'Scope credit',material_amount:-2500}
 ]});
 check(draft.price_amount,7500,'mixed lines net without losing allocations');
 await fails(()=>save({...draft,expected_updated_at:'2000-01-01',lines:[]}),/Another user/);
 let approved=await state(draft,'approved');
 check(approved.status,'approved','direct approval without submission or signed document');
 const postings=await q('SELECT job_budget_line_id,amount_delta::float8 FROM change_order_financial_postings WHERE change_order_id=$1 ORDER BY amount_delta',[draft.id]);
 check(postings.map(r=>r.amount_delta),[-2500,10000],'per-code signed postings');
 check(Number(await scalar('SELECT budget_amount FROM job_budget_lines WHERE id=$1',[creditBudget])),0,'original zero budget unchanged');
 check(Number(await scalar('SELECT sum(amount_delta) FROM change_order_financial_postings WHERE job_budget_line_id=$1',[creditBudget])),-2500,'zero original plus credit is negative revised budget');
 await state(approved,'approved');
 check(Number(await scalar('SELECT count(*) FROM change_order_financial_postings WHERE change_order_id=$1',[draft.id])),2,'duplicate approval does not repost');
 await fails(()=>save({...approved,status:'draft',expected_updated_at:approved.updated_at,lines:[]}),/Only editable/);
 await fails(()=>q("UPDATE jobs SET status='complete' WHERE id=$1",[job]),/Job closeout requires/);
 let credit=await save({record_type:'credit',title:'Standalone credit',lines:[{job_budget_line_id:creditBudget,description:'Credit',material_amount:-100}]});
 check(credit.co_number,'CR-001','independent credit sequence');
 credit=await state(credit,'approved');
 check(credit.price_amount,-100,'negative standalone credit approves');
 let next=await save({title:'No cost',lines:[{job_budget_line_id:budget,description:'No cost',material_amount:0}]});
 check(next.co_number,'CO-003','credit does not consume CO number');
 next=await state(next,'approved');
 check(next.price_amount,0,'explicit zero approves');
 const incomplete=await save({title:'Unpriced',lines:[{job_budget_line_id:budget,description:'Pending',material_amount:null}]});
 await fails(()=>state(incomplete,'approved'),/explicit amount/);
 const badCredit=await save({record_type:'credit',title:'Positive credit',lines:[{job_budget_line_id:budget,description:'Wrong sign',material_amount:50}]});
 await fails(()=>state(badCredit,'approved'),/zero or negative/);
 const rounded=await save({title:'Two markup levels',overall_markup_percent:7.5,overall_markup_budget_line_id:budget,lines:[
  {job_budget_line_id:budget,description:'Marked up',material_amount:100,markup_percent:15,markup_amount:15,sort_order:0},
  {job_budget_line_id:budget,description:'Unmarked',material_amount:50,sort_order:1}
 ]});
 check(rounded.price_amount,177.38,'independent line markup plus rounded overall fee');
 const roundRows=await q('SELECT description,line_total::float8 AS amount FROM change_order_lines WHERE change_order_id=$1 ORDER BY sort_order',[rounded.id]);
 check(roundRows.map(row=>row.amount),[115,50,12.38],'fee is not double counted');
 const postedBefore=Number(await scalar('SELECT count(*) FROM change_order_financial_postings'));
 await db.exec("CREATE FUNCTION fixture_fail_approval() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.status='approved' AND NEW.title='Two markup levels' THEN RAISE EXCEPTION 'Injected approval failure'; END IF; RETURN NEW; END$$; CREATE TRIGGER fixture_fail_approval BEFORE UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION fixture_fail_approval();");
 await fails(()=>state(rounded,'approved'),/Injected approval failure/);
 check(Number(await scalar('SELECT count(*) FROM change_order_financial_postings')),postedBefore,'failed final status update rolls back every posting');
 check(await scalar('SELECT status FROM change_orders WHERE id=$1',[rounded.id]),'draft','failed approval retains draft');
 await db.exec('DROP TRIGGER fixture_fail_approval ON change_orders; DROP FUNCTION fixture_fail_approval();');
 const revision=await scalar('SELECT to_jsonb(revise_job_change_order($1,$2))',[credit.id,'Correct credit']);
 check(revision.record_type,'credit','credit revision retains its independent record type');
 check(await scalar('SELECT status FROM change_orders WHERE id=$1',[credit.id]),'approved','revision leaves original finalized');
 await db.exec("SELECT set_config('test.actor','supervisor',false)");
 const prep=await save({title:'Supervisor draft',lines:[{job_budget_line_id:budget,description:'Preparation',material_amount:25}]});
 await fails(()=>state(prep,'approved'),/can_approve_change_orders/);
 await state(prep,'submitted');
 await db.exec("SELECT set_config('test.actor','manager',false)");
 let signedDraft=await save({title:'Authorized scope',lines:[{job_budget_line_id:budget,description:'Agreed work',material_amount:40}]});
 const signedDraftDocument=await scalar("INSERT INTO documents(division,owner_type,owner_id,change_order_id,document_type,storage_path,file_name) VALUES('Electrical','job',$1,$2,'change_orders','fixture/draft.pdf','draft.pdf') RETURNING id",[job,signedDraft.id]);
 await db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES('northgate-files','fixture/draft.pdf')");
 signedDraft=await scalar('SELECT to_jsonb(attach_signed_job_change_order_document($1,$2,NULL,false))',[signedDraft.id,signedDraftDocument]);
 const sameLines=[{job_budget_line_id:budget,description:'Agreed work',material_amount:40}];
 signedDraft=await save({...signedDraft,expected_updated_at:signedDraft.updated_at,lines:sameLines});
 check(signedDraft.signed_document_id,signedDraftDocument,'unchanged save preserves signed authorization');
 signedDraft=await save({...signedDraft,title:'Changed scope',expected_updated_at:signedDraft.updated_at,lines:sameLines});
 check(signedDraft.signed_document_id,null,'changed scope requires fresh authorization');
 check(await scalar('SELECT archived_at IS NULL FROM documents WHERE id=$1',[signedDraftDocument]),true,'superseded authorization is retained in Documents');
 const before=await scalar('SELECT job_contract_closeout_counts($1)',[job]);
 check(before.ready,false,'missing signed docs block closeout');
 for (const row of await q("SELECT id,co_number FROM change_orders WHERE job_id=$1 AND status='approved'",[job])) {
   const document=await scalar("INSERT INTO documents(division,owner_type,owner_id,change_order_id,document_type,storage_path,file_name) VALUES('Electrical','job',$1,$2,'change_orders',$3,'signed.pdf') RETURNING id",[job,row.id,'fixture/'+row.id+'.pdf']);
   await q("INSERT INTO storage.objects(bucket_id,name) VALUES('northgate-files',$1)",['fixture/'+row.id+'.pdf']);
   await q('SELECT attach_signed_job_change_order_document($1,$2,NULL,false)',[row.id,document]);
 }
 for (const row of await q("SELECT id,updated_at FROM change_orders WHERE job_id=$1 AND status='submitted'",[job])) await state(row,'waived');
 const after=await scalar('SELECT job_contract_closeout_counts($1)',[job]);
 check(after.ready,true,'attached docs and dispositions resolve closeout');
 await q("UPDATE jobs SET status='complete' WHERE id=$1",[job]);
 check(await scalar('SELECT status FROM jobs WHERE id=$1',[job]),'complete','closeout succeeds after requirements');
 await fails(()=>state(rounded,'submitted'),/Reopen the job/);
 check(Number(await scalar("SELECT count(*) FROM change_logs WHERE table_name='change_orders' AND user_id='manager'"))>0,true,'actor audit retained');
 console.log('PASS '+assertions+' local PostgreSQL assertions. Real RLS, role defaults, concurrent sessions and Billing regression remain separate gates.');
} catch(error) { console.error({message:error.message, detail:error.detail, where:error.where, assertions}); process.exitCode=1; }
finally { await db.close(); }
