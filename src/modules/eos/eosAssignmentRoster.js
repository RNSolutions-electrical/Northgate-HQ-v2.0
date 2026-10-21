import {eosRpc} from './eosRequest.js';
export const assignmentEligible = person => Boolean(person.is_active && (person.can_assign ?? person.is_member));
export const assignmentName = person => `${person.display_name}${person.pending ? ' (pending account)' : ''}`;
export function createAssignmentRosterStore(call) {
  const rpc=(name,args={})=>call(async(client,signal)=>{const {data,error}=await eosRpc(client,name,args,signal);if(error)throw Object.assign(new Error(error.message),{code:error.code});return data;});
  return {read:()=>rpc('eos_assignment_roster_read_v1'),save:(input,id)=>rpc('eos_assignment_roster_save_v1',{p_input:input,p_request_id:id})};
}
