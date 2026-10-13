import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateExpression as calculate,MAX_HISTORY,addHistory,clampPosition,readSession,storageKey} from '../src/components/calculator/calculatorModel.mjs';
test('restricted arithmetic supports precedence, parentheses, unary signs and exact decimal inputs',()=>{
 for(const [expression,value] of [['2+3*4','14'],['(2+3)*4','20'],['-2*-3','6'],['-(2+3)','-5'],['.1+.2','0.3'],['1/3','0.333333333333'],['-1/3','-0.333333333333'],['1/2000000000000','0.000000000001'],['-1/2000000000000','-0.000000000001'],['10−2×3','4'],['20÷5','4']])assert.equal(calculate(expression).value,value,expression);
 let nested='1';for(let index=0;index<15;index++)nested='1+('+nested+')%';assert.equal(calculate(nested).value,'1.010101010101');
});
test('handheld percentages use current left operand for additions/subtractions and fractions for products/quotients',()=>{
 for(const [expression,value,percentage] of [
  ['200+20%','240',{percent:'20',base:'200',amount:'40'}],['200-20%','160',{percent:'20',base:'200',amount:'40'}],
  ['200*20%','40',{percent:'20',base:'200',amount:'40'}],['200/20%','1000',{percent:'20',base:'200',amount:'40'}],
  ['200+10%+20%','264',{percent:'20',base:'220',amount:'44'}],['200+(10+10)%','240',{percent:'20',base:'200',amount:'40'}],
  ['200+(-20%)','160',{percent:'-20',base:'200',amount:'-40'}],['200+(-20)%','160',{percent:'-20',base:'200',amount:'-40'}],
  ['20%*200','40',{percent:'20',base:'200',amount:'40'}],['20%/200','0.001',null],
  ['0+20%','0',{percent:'20',base:'0',amount:'0'}],['-200+20%','-240',{percent:'20',base:'-200',amount:'-40'}],
  ['(100+20%)+(50-10%)','165',null],['200+10%*2','200.2',null],['(200+20%)*2','480',null],['20%','0.2',null],
 ])assert.deepEqual(calculate(expression),{value,percentage},expression);
});
test('percentage secondary screen and result use identical rounding, and edits cannot retain metadata',()=>{
 const percent=calculate('1+33.333333333333%');assert.equal(percent.value,'1.333333333333');assert.equal(percent.percentage.amount,'0.333333333333');
 assert.equal(calculate('200+20').percentage,null);assert.equal(calculate('2+3').percentage,null);
});
test('invalid/code inputs, zero division and excessive expression work are rejected',()=>{
 for(const expression of ['', '2+', '(2+3', '2(3)', '1..2', '200+10%%', '1/0', '200/0%', 'Infinity', 'NaN', '1e3', 'alert(1)', 'process.exit()', '2**3', '2;3', 'Math.PI', '1'.repeat(31),'('.repeat(17)+'1'+')'.repeat(17),'1+'.repeat(129)+'1'])assert.throws(()=>calculate(expression),undefined,expression);
});
test('history is bounded, deduplicated and corrupt persisted results cannot be trusted',()=>{
 let history=[];for(let index=0;index<MAX_HISTORY+5;index++)history=addHistory(history,String(index),calculate(String(index)));assert.equal(history.length,MAX_HISTORY);
 history=addHistory(history,history[0].expression,calculate(history[0].expression));assert.equal(history.length,MAX_HISTORY);
 const storage={getItem:()=>JSON.stringify({expression:'200+20%',open:true,history:[{expression:'200+20%',value:'999'},{expression:'1+2',value:'3'}],position:{x:Infinity,y:12}})};
 const session=readSession(storage,'key');assert.equal(session.history.length,1);assert.equal(session.history[0].value,'3');assert.equal(session.position,null);
 assert.equal(readSession({getItem:()=>'{bad'},'key').expression,'');assert.equal(readSession({getItem:()=>{throw Error('disabled');}},'key').expression,'');
 assert.notEqual(storageKey('staging','a'),storageKey('production','a'));assert.notEqual(storageKey('staging','a'),storageKey('staging','b'));
});
test('panel coordinates stay in bounds after movement and viewport resizing',()=>{
 assert.deepEqual(clampPosition({x:-20,y:999},310,400,1024,768),{x:12,y:356});
 assert.deepEqual(clampPosition({x:1500,y:-1},310,400,1024,768),{x:702,y:12});
});
