import test from 'node:test';
import assert from 'node:assert/strict';
import {issues} from '../src/modules/estimates/workbench/workspaceModel.mjs';
import {componentGroups,ensureComponents} from '../src/modules/estimates/workbench/componentStructure.mjs';
import {itemPricing} from '../src/modules/estimates/workbench/pricing.mjs';
const line={id:'line',name:'Quoted scope',qty:1,price:100,hours:0};
const manual=()=>({id:'work',name:'Quoted work',qty:1,components:[],lines:[{...line}]});
test('valid flat manually priced work does not require component-group breakdown',()=>{
 const item=manual(),doc={rate:75,materialMarkup:0,quotes:[]},before=itemPricing(item,doc);
 assert.deepEqual(issues(item,doc),[]);assert.equal(componentGroups(item).length,1);
 ensureComponents(item);assert.equal(item.components.length,1);assert.deepEqual(itemPricing(item,doc),before);
 item.components.push({id:'placeholder',name:''});assert.deepEqual(issues(item,doc),[]);
});
test('componentless quote requires a real active quote and explicit valid costs',()=>{
 const item={...manual(),quoteId:'q',lines:[]},doc={quotes:[{id:'q',materialAmount:100,otherAmount:0}]};
 assert.deepEqual(issues(item,doc),[]);
 for(const quotes of [[],[{id:'q',materialAmount:'',otherAmount:0}],[{id:'q',materialAmount:100,otherAmount:0,archivedAt:'date'}],[...doc.quotes,...doc.quotes]])assert.ok(issues(item,{quotes}).length);
});
test('unpriced, unnamed, invalid quantity and invalid resource values remain incomplete',()=>{
 for(const change of [{name:''},{qty:''},{qty:-1},{lines:[]},{lines:[{...line,price:''}]},{lines:[{...line,hours:-1}]},{lines:[{...line,name:''}]}])assert.ok(issues({...manual(),...change}).length);
 assert.deepEqual(issues({...manual(),lines:[{...line,price:0,hours:0}]}),[]);
});
