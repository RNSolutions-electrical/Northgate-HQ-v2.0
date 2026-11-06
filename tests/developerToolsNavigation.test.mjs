import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {activeNavigationGroup,findModule,isModulePermitted,permittedModules,permittedNavigationGroups} from '../src/modules/registry.js';
const tracker={canTrackHqTime:true,canAccessDeveloper:false,canAccessAddon:()=>false};
const addons={canTrackHqTime:false,canAccessDeveloper:false,canAccessAddon:()=>true};
test('tracker-only access exposes Developer Tools without ordinary add-ons or Developer admin',()=>{
 const groups=permittedNavigationGroups(tracker);
 const tools=groups.find(group=>group.key==='developer-tools');
 assert.equal(tools.label,'Developer Tools');assert.deepEqual(tools.items.map(item=>item.key),['hq-time']);assert.equal(tools.defaultTarget.path,'/hq-time');
 assert.ok(!groups.some(group=>['add-on-tools','developer'].includes(group.key)));
});
test('ordinary add-on users retain their tools and cannot see the tracker',()=>{
 const groups=permittedNavigationGroups(addons);assert.ok(!groups.some(group=>group.key==='developer-tools'));
 assert.deepEqual(groups.find(group=>group.key==='add-on-tools').items.map(item=>item.key),['panel-directory','electrical-inspections','afc']);
 assert.equal(groups.find(group=>group.key==='add-on-tools').defaultTarget.path,'/add-on-tools');
 assert.deepEqual(permittedModules({...addons,canTrackHqTime:true}).filter(module=>module.requiresAddon).map(module=>module.key).sort(),permittedModules(addons).filter(module=>module.requiresAddon).map(module=>module.key).sort());
 const source=readFileSync(new URL('../src/modules/addons/AddOnToolsWorkspace.jsx',import.meta.url),'utf8');assert.doesNotMatch(source,/personalAddon/);assert.match(source,/filter\(module=>module.requiresAddon\)/);
});
test('both groups coexist and HQ tracker is only in Developer Tools',()=>{
 const groups=permittedNavigationGroups({...addons,canTrackHqTime:true});assert.equal(groups.flatMap(group=>group.items||[]).filter(item=>item.key==='hq-time').length,1);
 assert.equal(activeNavigationGroup(groups,'hq-time').label,'Developer Tools');assert.equal(activeNavigationGroup(groups,'afc').label,'Add-On Tools');assert.equal(activeNavigationGroup(groups,'dashboard').label,'Dashboard');assert.equal(activeNavigationGroup(groups,'missing'),null);
});
test('tracker permissions remain strict and independent of Developer admin',()=>{
 for(const value of [false,undefined,'true'])assert.equal(isModulePermitted(findModule('hq-time'),{canTrackHqTime:value,canAccessDeveloper:true}),false);
 assert.equal(isModulePermitted(findModule('hq-time'),tracker),true);
});
