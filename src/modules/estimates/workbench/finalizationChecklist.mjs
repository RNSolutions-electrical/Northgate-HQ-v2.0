/**
 * @typedef {{value:string,label:string}} ChecklistOption
 * @typedef {{key:string,label:string,unit:string,statuses:string[],default?:number,suggestion?:string,suggested_status?:string,adjusted_status?:string}} ChecklistNumberField
 * @typedef {{key:string,label:string,description:string,enabled:boolean,version:number,sort_order:number,parent_key:string|null,parent_statuses:string[],options:ChecklistOption[],numeric_fields:ChecklistNumberField[]}} ChecklistDefinition
 * @typedef {{status:string,version:number,values:Record<string,string|number>}} ChecklistAnswer
 * @typedef {{answers:Record<string,ChecklistAnswer>,definitions?:ChecklistDefinition[],completedAt?:string}} FinalizationChecklist
 */
const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
export const checklistNumber=value=>['number','string'].includes(typeof value)&&present(value)&&String(value).trim().length<=100&&/^(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)$/.test(String(value).trim())&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1e100;
export function checklistDefinitions(document,configured,{locked=false}={}){
 return locked?(document.finalizationChecklist?.definitions||[]):configured;
}
export function activeConsiderations(definitions,answers={}){
 return (definitions||[]).filter(d=>d.enabled&&(!d.parent_key||definitions.some(p=>p.key===d.parent_key&&p.enabled&&d.parent_statuses.includes(answers[p.key]?.status)))).sort((a,b)=>a.sort_order-b.sort_order||a.key.localeCompare(b.key));
}
export function checklistIssues(document,definitions){
 if(!Array.isArray(definitions))return [{key:'configuration',label:'Checklist could not be loaded. Reload before finalizing.'}];
 const answers=document.finalizationChecklist?.answers||{};
 const issues=[];
 for(const d of activeConsiderations(definitions,answers)){
  const a=answers[d.key];
  if(!a||!d.options.some(o=>o.value===a.status)){issues.push({key:d.key,label:d.label,message:'Choose a response.'});continue;}
  if(a.version!==d.version){issues.push({key:d.key,label:d.label,message:'This consideration changed. Confirm your response again.'});continue;}
  for(const f of d.numeric_fields||[]){
   if(f.statuses.includes(a.status)&&!checklistNumber(a.values?.[f.key]))issues.push({key:d.key,field:f.key,label:f.label,message:'Enter zero or a positive number; blank is unanswered.'});
  }
 }
 return issues;
}
export function pricedLaborHours(document){
 let total=0;
 for(const e of document.entries||[])for(const i of e.items||[]){
  if(i.quoteId)continue;
  for(const line of i.lines||[]){
   if(!checklistNumber(line.qty)||!checklistNumber(line.hours)||(!line.fixed&&!checklistNumber(i.qty)))return null;
   total+=Number(line.qty)*Number(line.hours)*(line.fixed?1:Number(i.qty));
  }
 }
 return Number.isFinite(total)?Math.round(total*100)/100:null;
}
export function suggestedNumber(field,values,document){
 if(field.suggestion==='priced_labor_hours')return pricedLaborHours(document)??'';
 if(field.suggestion==='percentage_of_field_hours')return checklistNumber(values.fieldHours)&&checklistNumber(values.percent)?Math.round(Number(values.fieldHours)*Number(values.percent))/100:'';
 return field.default??'';
}
export function answerConsideration(document,definition,status){
 const next=structuredClone(document),checklist=next.finalizationChecklist||{answers:{}};
 const prior=checklist.answers?.[definition.key]||{},values={...prior.values};
 for(const f of definition.numeric_fields||[])if(f.statuses.includes(status)&&!Object.hasOwn(values,f.key))values[f.key]=suggestedNumber(f,values,next);
 // The suggested choice is explicit; use the current basis and recommended percentage.
 const calculated=(definition.numeric_fields||[]).find(f=>f.suggested_status===status);
 if(calculated){for(const f of definition.numeric_fields)if(f.default!==undefined)values[f.key]=f.default;values[calculated.key]=suggestedNumber(calculated,values,next);}
 next.finalizationChecklist={answers:{...checklist.answers,[definition.key]:{...prior,status,version:definition.version,values}}};
 return next;
}
export function answerNumber(document,definition,key,value){
 const next=structuredClone(document),checklist=next.finalizationChecklist||{answers:{}},prior=checklist.answers?.[definition.key]||{};
 const values={...prior.values,[key]:value};
 const calculated=(definition.numeric_fields||[]).find(f=>f.suggestion==='percentage_of_field_hours');
 let status=prior.status;
 if(calculated){
  if(key!==calculated.key)values[calculated.key]=suggestedNumber(calculated,values,next);
  if(key==='percent'||key===calculated.key)status=calculated.adjusted_status||status;
 }
 next.finalizationChecklist={answers:{...checklist.answers,[definition.key]:{...prior,status,version:definition.version,values}}};
 return next;
}
