import test from 'node:test';
import assert from 'node:assert/strict';
import {toolIsEnabled,toolForPath,canPreviewDisabledTool} from '../src/modules/toolAvailability.js';
import {MODULES,permittedNavigationGroups} from '../src/modules/registry.js';
const rows=MODULES.map(m=>({module_key:m.key,is_enabled:!['inventory','estimates','daybook'].includes(m.key)}));
test('unknown and missing availability fail closed, recovery workspaces stay open',()=>{
 assert.equal(toolIsEnabled('jobs',[]),false);assert.equal(toolIsEnabled('future',rows),false);
 assert.equal(toolIsEnabled('developer',[]),true);assert.equal(toolIsEnabled('dashboard',[]),true);
});
test('route resolver covers nested and alternate entry points without prefix collisions',()=>{
 assert.equal(toolForPath('/estimates/assemblies',MODULES),'estimates');
 assert.equal(toolForPath('/scan/location/123',MODULES),'inventory');
 assert.equal(toolForPath('/service-performance/123',MODULES),'jobs');
 assert.equal(toolForPath('/jobs-other',MODULES),null);
 assert.equal(toolForPath('/ESTIMATES',MODULES),'estimates');
 assert.equal(toolForPath('/estima%74es/assemblies',MODULES),'estimates');
});
test('developer preview is explicit, server-verified, and scoped',()=>{
 const p={permissionSource:'server',canAccessDeveloper:true};
 assert.equal(canPreviewDisabledTool(p,{state:{developerToolPreview:'jobs'}},'jobs'),true);
 assert.equal(canPreviewDisabledTool(p,{state:{}},'jobs'),false);
 assert.equal(canPreviewDisabledTool({...p,canAccessDeveloper:false},{state:{developerToolPreview:'jobs'}},'jobs'),false);
 assert.equal(canPreviewDisabledTool({...p,permissionSource:'loading'},{state:{developerToolPreview:'jobs'}},'jobs'),false);
 assert.equal(canPreviewDisabledTool(p,{state:{developerToolPreview:'jobs'}},'daybook'),false);
});
test('disabled modules disappear from developer and ordinary navigation alike',()=>{
 const p={canAccessDeveloper:true,canEstimate:true,canSavePersonalWork:true,toolAvailability:{rows},canAccessAddon:()=>true};
 const nav=permittedNavigationGroups(p);const serialized=JSON.stringify(nav);
 for(const path of ['/inventory','/estimates','/daybook'])assert.equal(serialized.includes('"path":"'+path+'"'),false);
 assert.ok(nav.some(m=>m.key==='developer'));assert.ok(nav.some(m=>m.key==='jobs'));
});

import {dashboardSections} from '../src/modules/dashboard/dashboardNavigation.js';
test('dashboard sections do not point into disabled workspaces',()=>{ const p={permissionSource:'server',canEstimate:true,toolAvailability:{rows:[{module_key:'vehicles',is_enabled:true}]}};assert.deepEqual(dashboardSections(p).map(s=>s.key),['my-info','my-vehicles']); });
