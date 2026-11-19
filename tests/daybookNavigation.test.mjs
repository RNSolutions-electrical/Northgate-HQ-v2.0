import assert from 'node:assert/strict';
import test from 'node:test';
import { findModule, isModulePermitted, permittedNavigationGroups } from '../src/modules/registry.js';
const dev={canAccessDeveloper:true};
const section=permissions=>permittedNavigationGroups(permissions).find(g=>g.key==='developer-tools');
test('Daybook is under Developer Tools and not promoted to general navigation',()=>{
 assert.deepEqual(section(dev)?.items.map(item=>item.path),['/daybook']);
 assert.equal(section(dev)?.defaultTarget.path,'/daybook');
 assert.ok(!permittedNavigationGroups(dev).some(g=>g.key==='daybook'));
});
test('non-developers do not gain a shortcut or route access',()=>{
 for(const permissions of [{},{canTrackHqTime:true},{canAccessDeveloper:'true'}]){
  assert.equal(section(permissions),undefined);
  assert.equal(isModulePermitted(findModule('daybook'),permissions),false);
 }
});

test('explicit Daybook assignment exposes only Daybook, not Developer admin or HQ Time',()=>{
 const permissions={permissionSource:'server',canAccessAddon:key=>key==='daybook'};
 const groups=permittedNavigationGroups(permissions);
 assert.deepEqual(section(permissions)?.items.map(item=>item.key),['daybook']);
 assert.equal(isModulePermitted(findModule('daybook'),permissions),true);
 assert.equal(isModulePermitted(findModule('developer'),permissions),false);
 assert.equal(isModulePermitted(findModule('hq-time'),permissions),false);
 assert.ok(!groups.some(g=>g.key==='developer' || g.key==='daybook'));
});

test('no auth fallback, pay-only assignment, or string grant can open Daybook',()=>{
 for(const permissions of [
  {permissionSource:'default-deny',canAccessAddon:()=>true},
  {permissionSource:'server',canAccessAddon:key=>key==='daybook_pay'},
  {permissionSource:'server',canAccessAddon:()=> 'true'},
 ]){
  assert.equal(section(permissions),undefined);
  assert.equal(isModulePermitted(findModule('daybook'),permissions),false);
 }
});

test('a Daybook grant cannot override the staging tool availability switch',()=>{
 const permissionSource='server', canAccessAddon=key=>key==='daybook';
 const withSwitch=is_enabled=>({permissionSource,canAccessAddon,toolAvailability:{rows:[{module_key:'daybook',is_enabled}]}});
 assert.equal(section(withSwitch(false)),undefined);
 assert.deepEqual(section(withSwitch(true))?.items.map(item=>item.key),['daybook']);
});
