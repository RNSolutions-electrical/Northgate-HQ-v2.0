import test from 'node:test';
import assert from 'node:assert/strict';
import {canCorrectInventoryData,correctionOverrideEnabled} from '../src/modules/inventory/dataCorrectionAccess.js';
test('correction access requires explicit server grant, Developer role and technical access',()=>{
 const granted={permissionSource:'server',role:'Developer',canAccessDeveloper:true,canDeveloperDataCorrection:true};
 assert.equal(canCorrectInventoryData(granted),true);
 for(const patch of [{role:'Director'},{role:'Manager'},{permissionSource:'loading'},{canAccessDeveloper:false},{canDeveloperDataCorrection:false},{canDeveloperDataCorrection:undefined}])assert.equal(canCorrectInventoryData({...granted,...patch}),false);
 assert.equal(canCorrectInventoryData(null),false);
});
test('correction override is default denied and an active deny wins',()=>{
 const flag={permission_flag:'can_developer_data_correction',granted:true,is_active:true};
 assert.equal(correctionOverrideEnabled(),false);assert.equal(correctionOverrideEnabled([flag]),true);
 assert.equal(correctionOverrideEnabled([{...flag,is_active:false}]),false);
 assert.equal(correctionOverrideEnabled([flag,{...flag,granted:false}]),false);
 assert.equal(correctionOverrideEnabled([{...flag,permission_flag:'can_manage_inventory'}]),false);
});
