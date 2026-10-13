// Restricted arithmetic grammar. Decimal inputs stay exact until display/copy rounding.
export const MAX_EXPRESSION=256,MAX_HISTORY=20,DISPLAY_PLACES=12;
const abs=n=>n<0n?-n:n;
function gcd(a,b){a=abs(a);b=abs(b);while(b){const next=a%b;a=b;b=next;}return a||1n;}
function rational(n,d=1n){if(!d)throw new Error('Cannot divide by zero.');if(d<0n){n=-n;d=-d;}const divisor=gcd(n,d);n/=divisor;d/=divisor;if(abs(n).toString().length>512||d.toString().length>512)throw new Error('Calculation is too large.');return {n,d};}
const add=(a,b)=>rational(a.n*b.d+b.n*a.d,a.d*b.d);
const multiply=(a,b)=>rational(a.n*b.n,a.d*b.d);
const divide=(a,b)=>rational(a.n*b.d,a.d*b.n);
const negate=a=>({...a,n:-a.n});
const hundred=rational(100n);
export function formatNumber(a){
 const scale=10n**BigInt(DISPLAY_PLACES),scaled=abs(a.n)*scale,whole=scaled/a.d,remainder=scaled%a.d;
 const rounded=whole+(remainder*2n>=a.d?1n:0n),integer=rounded/scale;
 const decimal=(rounded%scale).toString().padStart(DISPLAY_PLACES,'0').replace(/0+$/,'');
 return (a.n<0n&&rounded?'-':'')+integer+(decimal?'.'+decimal:'');
}
function parse(source){
 if(typeof source!=='string'||source.length>MAX_EXPRESSION)throw new Error('Use an expression of 256 characters or fewer.');
 const text=source.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-');let position=0,tokens=0;
 const space=()=>{while(/\s/.test(text[position]||'')&&position<text.length)position++;};
 const token=()=>{if(++tokens>128)throw new Error('Expression has too many operations.');};
 function primary(depth){
  if(depth>16)throw new Error('Use fewer nested parentheses.');space();let node;
  if(text[position]==='('){token();position++;node=sum(depth+1);space();if(text[position]!==')')throw new Error('Close the parenthesis.');position++;}
  else{const match=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(text.slice(position));if(!match)throw new Error('Enter a number or parenthesized expression.');if(match[0].replace('.','').length>30)throw new Error('Use numbers with at most 30 digits.');position+=match[0].length;token();const [whole,fraction='']=match[0].split('.');node={type:'number',value:rational(BigInt((whole||'0')+fraction),10n**BigInt(fraction.length))};}
  space();if(text[position]==='%'){token();position++;node={type:'percent',value:node};space();if(text[position]==='%')throw new Error('Use one percent sign per value.');}return node;
 }
 function unary(depth){space();if(text[position]==='+'||text[position]==='-'){token();const op=text[position++];if(depth>16)throw new Error('Use fewer nested signs.');return {type:'unary',op,value:unary(depth+1)};}return primary(depth);}
 function product(depth){let node=unary(depth);space();while(text[position]==='*'||text[position]==='/'){token();const op=text[position++];node={type:'binary',op,left:node,right:unary(depth)};space();}return node;}
 function sum(depth){let node=product(depth);space();while(text[position]==='+'||text[position]==='-'){token();const op=text[position++];node={type:'binary',op,left:node,right:product(depth)};space();}return node;}
 const node=sum(0);space();if(position!==text.length)throw new Error('Only numbers, arithmetic, parentheses and percentages are supported.');return node;
}
function percentOperand(node){if(node.type==='percent')return calculate(node.value);if(node.type==='unary'){const value=percentOperand(node.value);return value?(node.op==='-'?negate(value):value):null;}return null;}
function calculate(node){if(node.result)return node.result;node.result=calculateNode(node);return node.result;}
function calculateNode(node){
 if(node.type==='number')return node.value;
 if(node.type==='unary'){const value=calculate(node.value);return node.op==='-'?negate(value):value;}
 if(node.type==='percent')return divide(calculate(node.value),hundred);
 const left=calculate(node.left),right=calculate(node.right),percent=percentOperand(node.right);
 if(node.op==='+')return add(left,percent?multiply(left,divide(percent,hundred)):right);
 if(node.op==='-')return add(left,negate(percent?multiply(left,divide(percent,hundred)):right));
 return node.op==='*'?multiply(left,right):divide(left,right);
}
export function evaluateExpression(source){
 const node=parse(source),value=calculate(node);let percentage=null;
 // Only the final operation supplies the secondary screen; edits cannot retain stale amounts.
 if(node.type==='binary'){
  const rightPercent=percentOperand(node.right),leftPercent=percentOperand(node.left);
  const percent=rightPercent||(node.op==='*'?leftPercent:null);
  if(percent){const base=calculate(rightPercent?node.left:node.right);percentage={percent:formatNumber(percent),base:formatNumber(base),amount:formatNumber(multiply(base,divide(percent,hundred)))};}
 }
 return {value:formatNumber(value),percentage};
}
export const storageKey=(environment,userId)=>`northgate:calculator:v1:${environment}:${userId}`;
export function emptySession(){return {expression:'',history:[],open:false,minimized:false,historyOpen:false,position:null};}
export function readSession(storage,key){
 try{const raw=storage?.getItem(key)||'null';if(raw.length>100000)return emptySession();const value=JSON.parse(raw);if(!value||typeof value.expression!=='string'||value.expression.length>MAX_EXPRESSION)return emptySession();
  const history=(Array.isArray(value.history)?value.history:[]).slice(0,MAX_HISTORY).flatMap(entry=>{try{const result=evaluateExpression(entry.expression);return result.value===entry.value?[{expression:entry.expression,...result}]:[];}catch{return [];}});
  return {...emptySession(),expression:value.expression,history,open:value.open===true,minimized:value.minimized===true,historyOpen:value.historyOpen===true,position:Number.isFinite(value.position?.x)&&Number.isFinite(value.position?.y)?{x:value.position.x,y:value.position.y}:null};
 }catch{return emptySession();}
}
export function addHistory(history,expression,result){const entry={expression,value:result.value,percentage:result.percentage};return [entry,...history.filter(row=>row.expression!==expression)].slice(0,MAX_HISTORY);}
export function clampPosition(position,width,height,viewportWidth,viewportHeight){return {x:Math.max(12,Math.min(position.x,Math.max(12,viewportWidth-width-12))),y:Math.max(12,Math.min(position.y,Math.max(12,viewportHeight-height-12)))};}
