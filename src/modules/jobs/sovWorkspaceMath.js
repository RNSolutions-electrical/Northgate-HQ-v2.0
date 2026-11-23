const DECIMAL=/^\d+(?:\.\d{1,2})?$/;
export function cents(value,max=999999999999) {
  const s=String(value??'').trim();
  if(!DECIMAL.test(s))return null;
  const [a,b='']=s.split('.');
  const n=Number(a)*100+Number(b.padEnd(2,'0'));
  return Number.isSafeInteger(n)&&n<=max?n:null;
}
export const dollars=n=>(n/100).toFixed(2);
const percent=(top,bottom)=>bottom>0?100*top/bottom:null;
export function sovMetrics(target,line,posted) {
  const amount=line.basis==='percent'
    ? cents(line.value,10000)==null||target==null?null:Number((BigInt(cents(line.value,10000))*BigInt(target)+5000n)/10000n)
    : cents(line.value);
  const progress=cents(line.complete,10000);
  const earned=amount==null||progress==null?null:Number((BigInt(amount)*BigInt(progress)+5000n)/10000n);
  const billingBase=posted==null?null:Math.round(Number(posted.scheduled_value_amount)*100);
  const billed=posted==null?null:Math.round(Number(posted.billed_to_date_amount)*100);
  return {amount,share:amount==null?null:percent(amount,target),progress:progress==null?null:progress/100,
    earned,workLeft:amount==null||earned==null?null:amount-earned,
    billed,unbilled:billingBase==null||billed==null?null:billingBase-billed,
    unbilledPercent:billingBase==null||billed==null?null:percent(billingBase-billed,billingBase),
    billingBase,earnedUnbilled:amount===billingBase&&earned!=null&&billed!=null?earned-billed:null};
}
export function divisionSources(divisions,budget) {
  return (divisions??[]).map(d=>{
    const lines=(budget??[]).filter(b=>b.project_division_id===d.id);
    const total=lines.reduce((n,b)=>n+Math.round(Number(b.budget_amount??0)*100),0);
    return {...d,total:lines.length&&total>0?total:null};
  }).filter(d=>d.total!=null&&d.code!=null);
}
export function validatePlan(plan) {
  const issues=[], keys=new Set(), links=new Set();
  if(!plan.groups.length) issues.push('Add a division or start from scratch.');
  for(const g of plan.groups) {
    const target=cents(g.target);
    if(!g.name.trim()||!g.code.trim()||!target) issues.push('Each division needs a name, code and positive target.');
    const divKey='division:'+g.code.trim().toUpperCase();
    if(keys.has(divKey))issues.push('Division codes must be unique.');
    keys.add(divKey);
    for(const l of g.lines) {
      if(!l.description.trim()||!l.code.trim()||sovMetrics(target,l).amount==null||cents(l.complete,10000)==null) issues.push('Each line needs a code, name, valid amount or share, and completion of 0–100%.');
      const k='line:'+l.code.trim().toUpperCase();
      if(keys.has(k))issues.push('SOV line codes must be unique.');
      keys.add(k);
      if(l.link&&links.has(l.link))issues.push('A Legacy billing line can be linked only once.');
      if(l.link)links.add(l.link);
    }
  }
  return [...new Set(issues)];
}
export function packPlan(plan) {
  return {groups:plan.groups.map(g=>({id:g.id,code:g.code.trim(),name:g.name.trim(),target:g.target,divisionId:g.divisionId||null,
    lines:g.lines.map(l=>({id:l.id,code:l.code.trim(),description:l.description.trim(),basis:l.basis,value:l.value,complete:l.complete,link:l.link||null}))}))};
}
