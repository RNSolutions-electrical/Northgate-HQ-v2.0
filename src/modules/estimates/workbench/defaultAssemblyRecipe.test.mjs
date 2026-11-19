import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {prepareRecipe,reuseRecipe} from './defaultAssemblyRecipe.mjs';
import {blankItemPricing} from './blankSlate.mjs';
import {listDefaultRecipes,createDefaultRecipe,readDefaultRecipe} from './defaultRecipeService.mjs';
const doc={rate:100,blankSlateHardRate:40,materialMarkup:20,customer:'Secret customer',jobId:'job'};
const item=()=>({id:'source-item',name:'Reusable wire',qty:3,notes:'Private work note',quoteId:undefined,lines:[{id:'a',catalogueId:'cat',name:'#6 THHN',unit:'FT',qty:10,price:2,hours:.1,fixed:true,notes:'Phase A',materialAdjustment:{direction:'addition',type:'percent',value:10}},{id:'b',catalogueId:'cat',name:'#6 THHN',unit:'FT',qty:10,price:2,hours:.1,fixed:false,notes:'Phase B',laborDiscount:{type:'percent',value:5}}],blankQuotes:[{id:'q',name:'Review quote description',cost:10,markup:5,mode:'add'},{id:'r',name:'Reference quote',cost:null,mode:'reference'}]});
const make=i=>prepareRecipe(i,doc,{acknowledgeSharedReview:true});
test('lossless prices, fixed quantities, independent notes and quote modes round trip with new IDs',()=>{
 const source=item(),before=structuredClone(source),recipe=make(source),one=reuseRecipe(recipe),two=reuseRecipe(recipe);
 assert.deepEqual(blankItemPricing(one,doc),blankItemPricing(source,doc));assert.equal(one.lines[0].fixed,true);assert.equal(one.lines[1].notes,'Phase B');assert.equal(one.blankQuotes[1].mode,'reference');assert.equal(one.laborRateOverride,100);
 const ids=x=>[x.id,...x.lines.map(l=>l.id),...x.blankQuotes.map(q=>q.id)];assert.equal(ids(one).some(id=>ids(two).includes(id)),false);assert.deepEqual(source,before);
 assert.equal(one.notes,'');assert.ok(!JSON.stringify(recipe).includes('source-item'));assert.ok(!JSON.stringify(recipe).includes('Private work note'));assert.equal(one.lines[0].catalogueId,undefined);assert.equal(recipe.customer,undefined);
 assert.deepEqual(make({...one,recipeProvenance:{id:'saved',createdAt:'now'}}),recipe);
});
test('replacement quote retains ignored resources and snapshot values without flattening',()=>{const i=item();i.blankQuotes[0].mode='replace';const reused=reuseRecipe(make(i));assert.deepEqual(blankItemPricing(reused,doc),blankItemPricing(i,doc));assert.equal(reused.lines.length,2);assert.equal(reused.lines[0].materialAdjustment.direction,'addition');});
test('shared review required; incomplete recipes and conflicting adjustment schemas fail',()=>{assert.throws(()=>prepareRecipe(item(),doc),/Review/);const i=item();i.lines[0].price=null;assert.throws(()=>make(i));i.lines[0].price=0;i.lines[0].materialDiscount={type:'amount',value:0};assert.throws(()=>make(i),/Ambiguous/);});
test('adapter gates capability, pages summaries and retains idempotency request ID',async()=>{
 const calls=[];let page=0;const client={rpc:async(name,args)=>{calls.push([name,args]);if(name==='default_assembly_recipe_version')return {data:1};if(name==='blank_slate_accounting_version')return {data:3};if(name==='list_default_assembly_recipes')return {data:page++===0?[{id:'a',name:'A'}]:[]};return {data:{id:'r',recipe:make(item())}};}};
 assert.equal((await listDefaultRecipes(client,'Electrical')).length,1);assert.equal(calls.findLast(([n])=>n==='list_default_assembly_recipes')[1].p_after,'a');
 await createDefaultRecipe(client,'Electrical',make(item()),'same-id');await createDefaultRecipe(client,'Electrical',make(item()),'same-id');assert.deepEqual(calls.filter(([n])=>n==='create_default_assembly_recipe').map(([,a])=>a.p_request_id),['same-id','same-id']);assert.equal((await readDefaultRecipe(client,'r')).id,'r');
 await assert.rejects(listDefaultRecipes({rpc:async()=>({data:0})},'Electrical'),/unavailable/);
});
test('UI keeps personal/locked paths gated, explicitly reviews all retained free text and never edits legacy library rows',()=>{
 const route=readFileSync(new URL('./WorkbenchRoute.jsx',import.meta.url),'utf8'),ui=readFileSync(new URL('./BlankSlateEditor.jsx',import.meta.url),'utf8'),review=readFileSync(new URL('./DefaultRecipeLibrary.jsx',import.meta.url),'utf8');
 assert.match(route,/recipeClient=\{!personalMode&&permissions.canEstimate&&!officialPending&&!officialApproved\?recipeSessionClient:undefined\}/);assert.match(ui,/recipeDialog==='save'&&recipeClient&&!locked/);assert.match(ui,/Save work item to estimate/);assert.match(review,/setAck\(false\)/);assert.match(review,/Internal resource notes to share/);assert.match(review,/Quote \{index\+1\} description to share/);assert.match(review,/Save shared assembly copy/);assert.doesNotMatch(review,/save_assembly|assembly_items/);
});

test('review projection rejects oversized names and incomplete excluded resources',()=>{
 const i=item();i.name='x'.repeat(301);assert.throws(()=>make(i),/300/);i.name='Copy';i.blankQuotes[0].mode='replace';i.lines[0].hours='';assert.throws(()=>make(i),/number/);i.lines[0].hours=1;i.lines[0].notes='x'.repeat(20001);assert.throws(()=>make(i),/text/);
});

test('library review and reuse use human labels instead of raw JSON previews',()=>{const ui=readFileSync(new URL('./DefaultRecipeLibrary.jsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/JSONView|<pre/);assert.match(ui,/Sales labor rate \/ hour/);assert.match(ui,/Internal resource notes:/);assert.match(ui,/Replace materials and labor/);});
