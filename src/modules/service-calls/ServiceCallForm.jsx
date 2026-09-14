import {BILLING_METHODS} from './serviceCallModel.js';
export const EMPTY_SERVICE_CALL={service_call_number:'',name:'',division:'Electrical',work_stage:'upcoming',billing_method:'time_and_materials',related_job_id:'',business_name:'',first_name:'',last_name:'',contact_name:'',phone:'',billing_email:'',address_line1:'',city:'',state:'NC',postal_code:'',description:'',notes:'',service_date:'',lead_name:''};

/** Shared by the service-call workspace and inspection create-and-link workflow. */
export function ServiceCallFields({form,change,stages,calls=[],call=null,creating=true}){
 const field=(key,label,type='text',required=false)=><label key={key}>{label}<input type={type} value={form[key]??''} onChange={e=>change(key,e.target.value)} required={required}/></label>;
 const select=(key,label,options)=><label>{label}<select value={form[key]||''} onChange={e=>change(key,e.target.value)}>{Object.entries(options).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>;
 return <><section className="svc-section"><h2>Work details</h2><div className="svc-grid">
  {field('service_call_number','Service call / job number','text',true)}{field('name','Call name / customer','text',true)}
  {creating?select('division','Department',{Electrical:'Electrical',Construction:'Construction',Admin:'Admin'}):<p>Department: {call?.division}</p>}
  {select('work_stage','Work stage',Object.fromEntries(stages.filter(s=>s.kind==='work').map(s=>[s.key,s.label])))}{select('billing_method','Billing method',BILLING_METHODS)}
  {field('service_date','Date of service','date')}{field('lead_name','Employee / lead')}
  <label>Related service call<select value={form.related_job_id||''} onChange={e=>change('related_job_id',e.target.value)}><option value="">No related call</option>{calls.filter(c=>c.id!==call?.id).map(c=><option key={c.id} value={c.id}>{c.service_call_number} — {c.name}</option>)}</select><small>Links do not combine financial values.</small></label>
  <label className="svc-wide">Scope<textarea rows={3} value={form.description||''} onChange={e=>change('description',e.target.value)}/></label>
 </div></section><section className="svc-section"><h2>Customer & location</h2><div className="svc-grid">
  {field('business_name','Business name')}{field('first_name','First name')}{field('last_name','Last name')}{field('contact_name','Contact / homeowner')}{field('phone','Phone','tel')}{field('billing_email','Billing email','email')}{field('address_line1','Service address')}{field('city','City')}{field('state','State')}{field('postal_code','ZIP')}
  <label className="svc-wide">Notes<textarea rows={3} value={form.notes||''} onChange={e=>change('notes',e.target.value)}/></label>
 </div></section></>;
}
