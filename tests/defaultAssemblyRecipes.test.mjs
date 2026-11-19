import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const sqlFile=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
function functionSource(sql,name){const at=sql.search(new RegExp('CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\('));assert.ok(at>=0);const end=sql.indexOf('$$;',sql.indexOf('AS $$',at));assert.ok(end>at);return sql.slice(at,end+3);}
test('Default shared recipes enforce scopes, validation, idempotency, immutable records and atomic audit',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_TEST_MODULE).href);const db=new PGlite();
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE TABLE public.user_permissions(clerk_user_id text PRIMARY KEY,is_active boolean,division text,can_estimate boolean,can_approve_estimates boolean);
 INSERT INTO public.user_permissions VALUES('editor',true,'Electrical',true,false),('second',true,'Electrical',true,false),('reviewer',true,'Electrical',false,true),('other',true,'Construction',true,false),('personal',true,'Electrical',false,false),('inactive',false,'Electrical',true,true),('auditfail',true,'Electrical',true,false);
 CREATE FUNCTION public.current_user_can_read_division(d text,k text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT coalesce((SELECT u.is_active AND u.division=d AND CASE k WHEN 'can_estimate' THEN u.can_estimate WHEN 'can_approve_estimates' THEN u.can_approve_estimates ELSE false END FROM public.user_permissions u WHERE u.clerk_user_id=auth.jwt()->>'sub'),false)$$;
 CREATE FUNCTION public.current_user_can_edit_division(d text,k text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT public.current_user_can_read_division(d,k)$$;
 CREATE TABLE public.change_logs(user_id text,user_name text,table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text);
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated,anon;`);
 const base=await sqlFile('20261116025827_blank_slate_discount_accounting.sql');
 for(const n of ['blank_slate_number','blank_slate_discount'])await db.exec(functionSource(base,n));
 await db.exec(functionSource(await sqlFile('20261118172105_blank_slate_quote_accounting.sql'),'blank_slate_pricing'));
 const adjustments=await sqlFile('20261119023000_blank_slate_resource_adjustments.sql');
 await db.exec(functionSource(adjustments,'blank_slate_resource_adjustment'));
 await db.exec(adjustments.slice(adjustments.indexOf('DO $patch$'),adjustments.indexOf('DO $guard$')));
 await db.exec(functionSource(adjustments,'blank_slate_accounting_version'));
 await db.exec(await sqlFile('20261119040000_default_assembly_recipes.sql'));
 assert.equal((await db.query('SELECT count(*)::int n FROM assembly_recipe_private.recipes')).rows[0].n,0);assert.equal((await db.query("SELECT to_regclass('hq_tool_private.resource_map') AS map")).rows[0].map,null);
 const login=async(user,extra={})=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,...extra})]);await db.exec('SET ROLE authenticated');};
 const owner=async(sql)=>{await db.exec('RESET ROLE');return db.exec(sql)};
 const recipe=()=>({schemaVersion:1,kind:'default_estimator_assembly',name:'Shared test assembly',defaultWorkQuantity:3,settings:{laborRateOverride:100,blankSlateHardRate:40,materialMarkupOverride:20},lines:[{name:'Test material',unit:'EA',qty:2,price:10,hours:'.5',fixed:false,notes:'Reviewed generic note',stage:'Rough-in',blankResourceKind:'material',materialAdjustment:{direction:'addition',type:'percent',value:10},laborDiscount:{type:'amount',value:25}}],quotes:[{name:'Reference',cost:'',markup:20,mode:'reference'}]});
 const create=async(p,req='11111111-1111-4111-8111-111111111111',division='Electrical')=>(await db.query('SELECT public.create_default_assembly_recipe($1,$2,$3) AS r',[division,p,req])).rows[0].r;
 const list=async(div='Electrical',after=null,limit=100)=>(await db.query('SELECT * FROM public.list_default_assembly_recipes($1,$2,$3)',[div,after,limit])).rows;
 const read=async(id)=>(await db.query('SELECT public.read_default_assembly_recipe($1) AS r',[id])).rows[0].r;
 // Real released SQL v3 numerical check, not a pricing stub.
 const pricingDoc=r=>({blankSlateVersion:1,rate:r.settings.laborRateOverride,blankSlateHardRate:r.settings.blankSlateHardRate,materialMarkup:r.settings.materialMarkupOverride,entries:[{id:'e',number:1,items:[{id:'i',number:1,name:r.name,qty:r.defaultWorkQuantity,...r.settings,lines:r.lines.map((l,i)=>({...l,id:'l'+i})),blankQuotes:r.quotes.map((q,i)=>({...q,id:'q'+i}))}]}]});
 const price=async(r)=>(await db.query('SELECT public.blank_slate_pricing($1) AS p',[pricingDoc(r)])).rows[0].p;
 assert.equal((await price(recipe())).subtotal,354.2);const fixed=recipe();fixed.lines[0].fixed=true;assert.equal((await price(fixed)).subtotal,101.4);
 const replacedPricing=recipe();replacedPricing.quotes=[{name:'Replace',mode:'replace',cost:100,markup:10}];assert.equal((await price(replacedPricing)).subtotal,330);
 await login('editor');const p=recipe(),saved=await create(p);assert.deepEqual(saved.recipe,p);assert.equal((await create(p)).id,saved.id);assert.equal((await list()).length,1);assert.equal((await list())[0].recipe,undefined);assert.equal((await list())[0].resource_count,1);assert.deepEqual((await read(saved.id)).recipe,p);
 await assert.rejects(create({...p,name:'Different'}),/already used/);
 await assert.rejects(create(p,'22222222-2222-4222-8222-222222222222','Construction'),/edit permission/);
 await assert.rejects(db.query('SELECT * FROM assembly_recipe_private.recipes'),/permission denied/);
 await assert.rejects(db.query("SELECT assembly_recipe_private.validate('{}')"),/permission denied/);
 await assert.rejects(list('Electrical',null,201),/1 to 200/);
 for(const mutation of [r=>r.jobId='private',r=>r.settings.secret='private',r=>r.lines[0].id='old',r=>r.lines[0].materialAdjustment.client='private',r=>r.quotes[0].vendorId='private',r=>r.defaultWorkQuantity=0,r=>r.lines[0].fixed='true',r=>r.lines[0].price=-1,r=>r.lines[0].hours='',r=>r.lines[0].notes='x'.repeat(20001),r=>r.lines[0].materialDiscount={type:'amount',value:1},r=>r.lines[0].laborDiscount={type:'percent',value:101},r=>r.lines[0].laborDiscount={type:'amount',value:301},r=>r.quotes=[{name:'One',cost:1,markup:1,mode:'replace'},{name:'Two',cost:1,markup:1,mode:'replace'}]]){const bad=recipe();mutation(bad);await assert.rejects(create(bad,'33333333-3333-4333-8333-333333333333'));}
 const replacement=recipe();replacement.quotes=[{name:'Replace',mode:'replace',cost:100,markup:10}];const replaced=await create(replacement,'44444444-4444-4444-8444-444444444444');assert.equal(replaced.recipe.quotes[0].mode,'replace');
 replacement.lines[0].laborDiscount.value=301;await assert.rejects(create(replacement,'55555555-5555-4555-8555-555555555555'),/exceed/);
 const quoteOnly=recipe();quoteOnly.lines=[];quoteOnly.quotes=[{name:'Allowance',mode:'add',cost:100,markup:10}];await create(quoteOnly,'66666666-6666-4666-8666-666666666666');
 const page=await list('Electrical',null,1);assert.equal(page.length,1);const next=await list('Electrical',page[0].id,1);assert.equal(next.length,1);assert.ok(next[0].id>page[0].id);
 await login('second');assert.notEqual((await create(recipe())).id,saved.id); // request keys belong to actor
 await login('reviewer');assert.ok((await list()).length);assert.deepEqual((await read(saved.id)).recipe,p);await assert.rejects(create(p),/edit permission/);
 await login('other');assert.equal((await list('Construction')).length,0);await assert.rejects(read(saved.id),/unavailable/);await assert.rejects(list(),/read permission/);
 for(const user of ['personal','inactive','missing','']){await login(user);await assert.rejects(create(p));await assert.rejects(list());await assert.rejects(read(saved.id));}
 await login('editor',{is_anonymous:true});await assert.rejects(create(p),/authenticated/);

 await owner("ALTER TABLE public.change_logs ADD CONSTRAINT test_audit CHECK(user_id<>'auditfail')");await login('auditfail');await assert.rejects(create(p),/test_audit/);await owner("ALTER TABLE public.change_logs DROP CONSTRAINT test_audit");assert.equal((await db.query("SELECT count(*)::int n FROM assembly_recipe_private.recipes WHERE created_by='auditfail'")).rows[0].n,0);
 await login('auditfail');await create(p);await owner('SELECT 1');assert.equal((await db.query('SELECT count(*)::int n FROM assembly_recipe_private.recipes')).rows[0].n,(await db.query('SELECT count(*)::int n FROM public.change_logs')).rows[0].n);
 await assert.rejects(db.exec("UPDATE assembly_recipe_private.recipes SET name='changed'"),/immutable/);await assert.rejects(db.exec('DELETE FROM assembly_recipe_private.recipes'),/immutable/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT public.default_assembly_recipe_version()'),/permission denied/);await assert.rejects(list(),/permission denied/);
 }finally{await db.close();}
});
