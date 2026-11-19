import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblyOrigin,combinedAssemblyRows,loadAssemblyUsage,loadLegacyAssemblyOrigins} from './assemblyUsage.mjs';
import {filterAssemblies} from './assemblyCategories.mjs';
const id='11111111-1111-4111-8111-111111111111';
const matched=(estimate_id,title,version_number=1)=>({estimate_id,estimates:{title,version_number,status:'draft'}});
const mock=responses=>{const calls=[];return {calls,client:{from(table){
 const info={table,filters:[]};calls.push(info);
 const q={select:fields=>{info.fields=fields;return q;},eq:(...args)=>{info.filters.push(['eq',...args]);return q;},is:(...args)=>{info.filters.push(['is',...args]);return q;},contains:(...args)=>{info.filters.push(['contains',...args]);return q;},order:()=>q,range:async()=>responses(info)};
 return q;
}}};};
test('one sorted library can include same-name or same-id records from different sources, with evidence-based origins',()=>{
 const rows=combinedAssemblyRows([{id,name:'Alpha',lines:[{name:'Wire'}]}],[{id,name:'Alpha',resource_count:1,quote_count:2}],{[id]:'library'});
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(assemblyOrigin),['Built in library','From estimate']);
 assert.equal(assemblyOrigin(combinedAssemblyRows([{id,name:'Alpha'}],[])[0]),'Origin not recorded');
 assert.equal(assemblyOrigin(combinedAssemblyRows([{id,name:'Alpha'}],[],{[id]:'estimate'})[0]),'From estimate');
 assert.equal(filterAssemblies(rows,{query:'alpha'}).length,2);
 assert.equal(filterAssemblies(rows,{query:'wire'}).length,1);
});
test('usage projects only authorized metadata, matches exact included recipe provenance and deduplicates snapshots',async()=>{
 const {calls,client}=mock(({table})=>({data:table==='estimate_workbenches'?[matched('e1','First')]:[matched('e1','First'),matched('e2','Second',2)]}));
 const matches=await loadAssemblyUsage(client,'Electrical',{id,libraryKind:'estimate-copy'});
 assert.deepEqual(matches.map(m=>[m.id,m.version,m.approvedSnapshot]),[['e1',1,true],['e2',2,true]]);
 for(const {table,fields,filters} of calls){
  assert.match(fields,/estimate_id,estimates.*!inner\(title,estimate_number,status,version_number\)/);
  assert.ok(filters.some(f=>f[0]==='eq'&&f[1]==='estimates.division'&&f[2]==='Electrical'));
  assert.ok(filters.some(f=>f[0]==='is'&&f[1]==='estimates.archived_at'&&f[2]===null));
  assert.deepEqual(filters.find(f=>f[0]==='contains'),['contains', table==='estimate_workbenches'?'document':'workbench_document',{entries:[{items:[{recipeProvenance:{id}}]}]}]);
 }
});
test('legacy lookup matches recorded IDs only and fails visibly when the scope query fails',async()=>{
 const {calls,client}=mock(()=>({data:[matched('e1','First')]}));
 assert.equal((await loadAssemblyUsage(client,'Electrical',{id,libraryKind:'library-record'})).length,1);
 assert.deepEqual(calls.map(c=>Object.keys(c.filters.find(f=>f[0]==='contains')[2].entries[0].items[0])[0]),['sourceAssemblyId','sourceAssemblyId','libraryId','libraryId']);
 await assert.rejects(loadAssemblyUsage(mock(()=>({error:new Error('blocked')})).client,'Electrical',{id,libraryKind:'library-record'}),/blocked/);
 await assert.rejects(loadAssemblyUsage(client,'Electrical',{id:'x',libraryKind:'library-record'}),/unavailable/);
});
test('origins come from exact assigned library IDs, not names or missing source identifiers',async()=>{
 const db={rpc:async(name,args)=>{assert.equal(name,'read_legacy_assembly_origins');assert.deepEqual(args,{p_division:'Electrical',p_assembly_ids:[id]});return {data:[{id,origin:'built_in_library'}]};}};
 assert.deepEqual(await loadLegacyAssemblyOrigins(async()=>db,'Electrical',[id,id,'invalid']),{[id]:'library'});
});

test('a reused snapshot keeps its provenance through include and save/reload; a staged draft does not count',async()=>{
 const {blankDocument}=await import('./blankSlate.mjs');
 const {beginWorkEdit,includeWorkEdit,saveWorkDraft}=await import('./blankWorkEditing.mjs');
 const {prepareRecipe,reuseRecipe}=await import('./defaultAssemblyRecipe.mjs');
 const document=blankDocument('Test estimate');
 const source={name:'Test copy',qty:1,laborRateOverride:100,blankSlateHardRate:50,materialMarkupOverride:10,lines:[{name:'Resource',qty:1,price:10,hours:1}]};
 const recipe=prepareRecipe(source,document,{acknowledgeSharedReview:true});
 const item={...reuseRecipe(recipe),recipeProvenance:{id,createdAt:'2026-11-19'}};
 const edit=beginWorkEdit(null,item,document,'entry');
 const draft=saveWorkDraft(document,edit);
 assert.equal(draft.entries.length,0);
 const reloaded=JSON.parse(JSON.stringify(includeWorkEdit(draft,edit)));
 assert.equal(reloaded.entries[0].items[0].recipeProvenance.id,id);
 assert.equal(reloaded.blankWorkDrafts.length,0);
});

test('Postgres containment distinguishes included work, mixed items, and unincluded/embedded copies',{skip:!process.env.PGLITE_TEST_MODULE},async()=>{
 const {pathToFileURL}=await import('node:url');
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_TEST_MODULE).href);
 const db=new PGlite();
 const target={entries:[{items:[{recipeProvenance:{id}}]}]};
 try{
  const matches=async(doc)=>(await db.query('select $1::jsonb @> $2::jsonb as matched',[doc,target])).rows[0].matched;
  assert.equal(await matches({entries:[{id:'e1',items:[{recipeProvenance:{id:'other'}},{recipeProvenance:{id,createdAt:'today'}}]}]}),true);
  assert.equal(await matches({entries:[{id:'e1',items:[{id:'i1'}]}],library:[{recipeProvenance:{id}}],blankWorkDrafts:[{item:{recipeProvenance:{id}}}]}),false);
 }finally{await db.close();}
});
