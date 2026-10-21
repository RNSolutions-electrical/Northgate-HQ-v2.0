import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import '../../src/styles/tokens.css';import '../../src/styles/base.css';import '../../src/styles/primitives.css';
import {EosWorkspaceContent} from '../../src/modules/eos/EosWorkspaceContent.jsx';
const cat='11111111-1111-4111-8111-111111111111',metric='22222222-2222-4222-8222-222222222222';
const readonly=new URLSearchParams(location.search).has('readonly');let version=1,first=true,notify=()=>{};const receipts=new Map(),log=[];
const roster={rows:[{user_id:'technical',display_name:'Technical Developer',is_active:true,is_member:true,can_assign:false,protected:true,kind:'account',revision:0,enabled:true},{user_id:'work',display_name:'Work manager',is_active:true,is_member:true,can_assign:true,kind:'account',revision:0,enabled:true}],can_manage:!readonly,accounts:[{user_id:'known-account',display_name:'Known existing account',email:'known@example.invalid'}],profiles:[],pursuit_people:[]};
const state={metrics:[{id:metric,revision:1,retired:false}],definitions:[{id:metric+':v1',metric_id:metric,name:'Synthetic metric',context:'Synthetic fixture only',category_id:cat,category_label:'Synthetic',owner_id:'work',owner_label:'Work manager',goal:null,unit:'number',window:'point-in-time',carry:'none',aggregation:'none',effective_from:'2026-01-05',revision:1}],categories:[{id:cat,name:'Synthetic',revision:1}],periods:[{id:'2026-10-19',anchor:'2026-10-19',meeting_date:'2026-10-21',revision:1}],observations:[],members:roster.rows,audit:[],requests:{},next_cursor:null};let pursuits=[];
function handler(name,args={}) {
 if(name==='eos_assignment_roster_read_v1')return {...roster,snapshot:version};
 if(name==='eos_assignment_roster_save_v1'){
  if(receipts.has(args.p_request_id))return receipts.get(args.p_request_id);
  const input=args.p_input;if(readonly)throw Object.assign(new Error('Employee management permission required'),{code:'42501'});
  const saved={...input,revision:input.expected_revision+1};roster.rows.push({user_id:'person:'+input.id,display_name:input.display_name,contact_email:input.contact_email,employee_profile_id:input.employee_profile_id,enabled:input.enabled,is_active:input.enabled,is_member:false,can_assign:input.enabled,kind:'person',pending:true,revision:saved.revision});receipts.set(args.p_request_id,saved);version++;log.push({name,request:args.p_request_id});notify();if(first){first=false;throw new Error('Synthetic lost response after commit');}return saved;
 }
 if(name==='eos_scorecard_read_v1'||name==='eos_scorecard_history_v1')return {...state,snapshot:version};
 if(name==='eos_scorecard_quarters_read_v1')return {revision:0,cycles:[],reporting_dates:[]};
 if(name==='eos_scorecard_save_metric_v1'){const d=args.p_input.definition;state.metrics[0].revision++;state.definitions.push({...d,metric_id:metric,id:metric+':v'+state.metrics[0].revision,revision:state.metrics[0].revision,category_label:'Synthetic',owner_label:roster.rows.find(r=>r.user_id===d.owner_id)?.display_name});version++;log.push({name,owner_id:d.owner_id});notify();return state.metrics[0];}
 if(name==='eos_save_pursuit_v2'){const id='33333333-3333-4333-8333-333333333333';pursuits=[{...args.p_data,id,updated_at:'2026-10-21T00:00:00Z',eos_pursuit_managers:[]}];roster.pursuit_people=args.p_manager_ids.map(user_id=>({pursuit_id:id,user_id}));version++;log.push({name,managers:args.p_manager_ids});notify();return id;}
 throw new Error('Unexpected synthetic RPC '+name);
}
const client={from(table){const b={select(){return b;},is(){return b;},order(){return Promise.resolve({data:table==='eos_pursuits'?pursuits:table==='eos_leadership_reminders'?[{id:'synthetic',text:'Synthetic leadership reminder',enabled:true,reminder_type:'original',source_label:'Synthetic QA'}]:[],error:null});}};return b;},rpc(name,args){const p=Promise.resolve().then(()=>({data:structuredClone(handler(name,args)),error:null}));return{then:p.then.bind(p),abortSignal(){return this;}};}};
const call=async operation=>operation(client,new AbortController().signal);
function Harness(){const [,setTick]=useState(0);notify=()=>setTick(v=>v+1);return <><main className="ng-shell"><header className="ng-shell__header">Synthetic navigation</header><div className="ng-shell__body"><aside className="ng-shell__rail">Synthetic navigation rail</aside><div className="ng-shell__content"><section className="ng-page-scope"><EosWorkspaceContent call={call} navigate={()=>{}} permissions={{canManageEos:true}}/></section></div></div></main><output hidden data-testid="write-summary">{JSON.stringify(log)}</output></>;}
createRoot(document.getElementById('root')).render(<Harness/>);
