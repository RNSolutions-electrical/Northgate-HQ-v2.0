import test from 'node:test';import assert from 'node:assert/strict';
import {assignmentEligible,assignmentName} from '../src/modules/eos/eosAssignmentRoster.js';
import {canManageEos,eligibleMembers} from '../src/modules/eos/scorecardLogic.js';
test('pending assignment is not an EOS access grant; protected account stays unassignable',()=>{
 const people=[{user_id:'person:synthetic',display_name:'Pending',pending:true,is_active:true,is_member:false,can_assign:true},{user_id:'technical',display_name:'Technical',is_active:true,is_member:true,can_assign:false},{user_id:'work',display_name:'Work',is_active:true,is_member:true,can_assign:true}];
 assert.deepEqual(eligibleMembers(people).map(p=>p.user_id),['person:synthetic','work']);assert.equal(canManageEos({id:'person:synthetic',active:true},people),false);assert.equal(canManageEos({id:'technical',active:true},people),true);assert.equal(assignmentName(people[0]),'Pending (pending account)');assert.equal(assignmentEligible({...people[0],is_active:false}),false);
});
