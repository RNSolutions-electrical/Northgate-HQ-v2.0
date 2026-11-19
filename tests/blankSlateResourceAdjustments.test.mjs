import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const migrationPath=new URL('../supabase/migrations/20261118172105_blank_slate_quote_accounting.sql',import.meta.url);
const migration=await fs.readFile(migrationPath,'utf8');
test('v3 fixture retains quote migration preflight and preserves ACL/audit and fails closed on definition drift',()=>{
 assert.match(migration,/md5\(existing\)/);assert.match(migration,/accounting_version\(\)<>1/);
 assert.match(migration,/SECURITY INVOKER SET search_path=''/);
 assert.doesNotMatch(migration,/CREATE.*SECURITY DEFINER|ALTER TABLE|UPDATE public\.|DELETE FROM|INSERT INTO/);
 assert.match(migration,/'other_amount',other/);assert.match(migration,/'other',\(r->>'other_amount'\)::numeric/);
 assert.match(migration,/IF replacement_count=0 THEN/);assert.match(migration,/replacement_count>1/);
});
test('resource adjustments execute against isolated in-memory PostgreSQL', {skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_TEST_MODULE).href);const db=new PGlite();
 try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 const base=await fs.readFile(new URL('../supabase/migrations/20261116025827_blank_slate_discount_accounting.sql',import.meta.url),'utf8');
 for(const name of ['blank_slate_number','blank_slate_discount','blank_slate_pricing','blank_slate_accounting_version']){
  const start=base.indexOf(`CREATE FUNCTION public.${name}(`),end=base.indexOf('$$;',base.indexOf('AS $$',start))+3;
  assert.ok(start>=0&&end>start);await db.exec(base.slice(start,end));
 }
 // Build only the reviewed validation/wrapper dependencies in memory. No real records.
 const validateSource=await fs.readFile(new URL('../supabase/migrations/20261016173353_componentless_priced_work_item_approval.sql',import.meta.url),'utf8');
 const vs=validateSource.indexOf('CREATE OR REPLACE FUNCTION public.validate_workbench_structure'),ve=validateSource.indexOf('END $$;',vs)+7;
 let validator=validateSource.slice(vs,ve).replace('BEGIN',"BEGIN\n IF doc->>'blankSlateVersion'='1' THEN PERFORM public.blank_slate_pricing(doc);ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(doc->'entries','[]')) scope_entry CROSS JOIN LATERAL jsonb_array_elements(coalesce(scope_entry->'items','[]')) scope_item CROSS JOIN LATERAL jsonb_array_elements(coalesce(scope_item->'lines','[]')) scope_resource WHERE scope_resource ? 'materialDiscount' OR scope_resource ? 'laborDiscount') THEN RAISE EXCEPTION 'Discounts require the blank-slate pricing schema';END IF;");
 await db.exec(validator);
 await db.exec(`CREATE FUNCTION public.assembly_rate_number(text) RETURNS numeric LANGUAGE sql AS $$SELECT public.blank_slate_number($1,'rate')$$;
 CREATE FUNCTION public.workbench_handoff_number(text,text) RETURNS numeric LANGUAGE sql AS $$SELECT public.blank_slate_number($1,$2)$$;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{"sub":"synthetic-test"}'::jsonb$$;
 CREATE TABLE public.estimate_workbenches(estimate_id uuid,document jsonb);
 CREATE FUNCTION public.approve_workbench_estimate_internal(uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE d jsonb; BEGIN SELECT document INTO d FROM public.estimate_workbenches WHERE estimate_id=$1;PERFORM public.validate_workbench_structure(d,true);RETURN $1;END$$;`);
 const wrapperSource=await fs.readFile(new URL('../supabase/migrations/20260914110000_validate_workbench_approval_components.sql',import.meta.url),'utf8');
 let wrapper=wrapperSource.slice(wrapperSource.indexOf('CREATE FUNCTION'),wrapperSource.indexOf('REVOKE ALL')).replace("OR jsonb_array_length(item_value.value -> 'lines') = 0","OR (jsonb_array_length(item_value.value -> 'lines') = 0 AND nullif(item_value.value ->> 'quoteId', '') IS NULL)");
 await db.exec(wrapper);
 await db.exec(migration);
 await db.exec(await fs.readFile(new URL('./blankSlateQuoteAccounting.sql',import.meta.url),'utf8'));
 const quoteOnly={blankSlateVersion:1,rate:60,blankSlateHardRate:35,materialMarkup:20,entries:[{id:'e',number:1,items:[{id:'i',number:1,name:'Quoted work',qty:2,lines:[],blankQuotes:[{id:'q',mode:'replace',cost:100,markup:15}]}]}]};
 await db.query('SELECT public.validate_workbench_structure($1::jsonb,true)',[JSON.stringify(quoteOnly)]);
 await db.query('INSERT INTO public.estimate_workbenches VALUES ($1::uuid,$2::jsonb)',['11111111-1111-4111-8111-111111111111',JSON.stringify(quoteOnly)]);
 const approved=await db.query("SELECT public.approve_workbench_estimate('11111111-1111-4111-8111-111111111111','Synthetic only') AS id");assert.equal(approved.rows[0].id,'11111111-1111-4111-8111-111111111111');
 const missingName=structuredClone(quoteOnly);missingName.entries[0].items[0].name='';
 await assert.rejects(()=>db.query('SELECT public.validate_workbench_structure($1::jsonb,true)',[JSON.stringify(missingName)]),/name is required/);
 const legacy=structuredClone(quoteOnly);delete legacy.blankSlateVersion;
 await assert.rejects(()=>db.query('SELECT public.validate_workbench_structure($1::jsonb,true)',[JSON.stringify(legacy)]),/priced material/);
 const {blankSumPricing}=await import('../src/modules/estimates/workbench/blankSlate.mjs');
 const legacyBefore=(await db.query('SELECT public.blank_slate_pricing($1::jsonb) AS p',[JSON.stringify(quoteOnly)])).rows[0].p;
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261119023000_blank_slate_resource_adjustments.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('SELECT public.blank_slate_pricing($1::jsonb) AS p',[JSON.stringify(quoteOnly)])).rows[0].p,legacyBefore);
 await assert.rejects(db.query(`SELECT public.blank_slate_resource_adjustment(100,'{"direction":"addition","type":"amount","value":1}','{"type":"amount","value":0}')`),/Conflicting/);
 await assert.rejects(db.query(`SELECT public.blank_slate_resource_adjustment(100,'{"type":"amount","value":1}',null)`),/Invalid/);
 for(let n=1;n<=40;n++){
  const d=structuredClone(quoteOnly),i=d.entries[0].items[0];i.qty=String(n/8);i.blankQuotes[0]={id:'q',mode:n%2?'add':'replace',cost:String(n/7),markup:String(n%21)};
  i.lines=[{id:'l',qty:'1.25',price:'12.335',hours:'.2',materialDiscount:{type:'percent',value:7},laborDiscount:{type:'percent',value:3}}];
  if(n%3){delete i.lines[0].materialDiscount;i.lines[0].materialAdjustment={direction:'addition',type:n%2?'amount':'percent',value:'0.335'};i.lines[0].laborAdjustment={direction:'discount',type:'percent',value:3};delete i.lines[0].laborDiscount;}
  i.blankQuotes.push({id:'a',mode:'add',cost:'0.335',markup:5},{id:'r',mode:'reference',cost:null});
  d.feePercent=3;d.estimateDiscount={type:'percent',value:9};d.proposal={salesTaxPercent:7.25,creditCardPercent:3};
  const second=structuredClone(i);second.id='i2';second.qty='0.75';d.entries[0].items.push(second);
  const js=blankSumPricing([i,second],d),sql=(await db.query('SELECT public.blank_slate_pricing($1::jsonb) AS result',[JSON.stringify(d)])).rows[0].result;
  for(const key of ['subtotal','fee','price','preTaxTotal','salesTax','creditCardFee','resourceDiscount','estimateDiscount','totalDiscount','grossPreDiscount'])assert.equal(Number(sql[key]),js[key],key+' vector '+n);
  assert.equal(sql.resourceAddition??0,js.resourceAddition??0);
  assert.equal(Math.round(sql.lines.reduce((sum,l)=>sum+l.line_total,0)*100),Math.round(js.preTaxTotal*100));
 }
 const quantityDoc=structuredClone(quoteOnly);const qi=quantityDoc.entries[0].items[0];qi.qty=3;qi.blankQuotes=[];qi.lines=[{id:'l',qty:10,price:2,hours:1,fixed:true}];
 for(const fixed of [true,false]){qi.lines[0].fixed=fixed;const sql=(await db.query('SELECT public.blank_slate_pricing($1::jsonb) AS p',[JSON.stringify(quantityDoc)])).rows[0].p;assert.equal(sql.lines[0].material_amount,fixed?20:60);assert.equal(sql.lines[0].hours,fixed?10:30);}
 const badLegacy=structuredClone(quoteOnly);delete badLegacy.blankSlateVersion;badLegacy.entries[0].items[0].lines=[{id:'x',qty:1,price:1,hours:0,materialAdjustment:{direction:'addition',type:'amount',value:2}}];
 await assert.rejects(db.query('SELECT public.validate_workbench_structure($1::jsonb,false)',[JSON.stringify(badLegacy)]),/blank-slate pricing schema/);
 const r=await db.query('SELECT public.blank_slate_accounting_version() AS version');assert.equal(r.rows[0].version,3);
 }finally{await db.close();}
});
