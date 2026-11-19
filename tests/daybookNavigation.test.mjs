import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { findModule, isModulePermitted, permittedNavigationGroups } from '../src/modules/registry.js';
const dev={canAccessDeveloper:true};
const section=permissions=>permittedNavigationGroups(permissions).find(g=>g.key==='developer-tools');
test('Daybook is under Developer Tools and not promoted to general navigation',()=>{
 assert.deepEqual(section(dev)?.items.map(item=>item.path),['/daybook']);
 assert.equal(section(dev)?.defaultTarget.path,'/daybook');
 assert.ok(!permittedNavigationGroups(dev).some(g=>g.key==='daybook'));
});
test('ungranted non-developers do not gain Daybook shortcut or route access',()=>{
 for(const permissions of [{},{canTrackHqTime:true},{canAccessDeveloper:'true'}]){
  assert.ok(!section(permissions)?.items.some(item=>item.key==='daybook'));
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
  assert.ok(!section(permissions)?.items.some(item=>item.key==='daybook'));
  assert.equal(isModulePermitted(findModule('daybook'),permissions),false);
 }
});

test('production Jobs adapter retains RLS without staging-only tool gateway',()=>{
 const ui=readFileSync(new URL('../src/modules/daybook/DaybookWorkspace.jsx',import.meta.url),'utf8');
 const jobs=readFileSync(new URL('../src/modules/daybook/daybookJobs.js',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/useToolAvailability/);assert.doesNotMatch(jobs,/read_tool_availability/);
 assert.match(ui,/permissions.permissionSource==='server' && permissions.canAccessDeveloper/);
});

test('existing HQ Time permission retains Developer Tools default with Daybook added',()=>{
 const group=section({canAccessDeveloper:true,canTrackHqTime:true});
 assert.deepEqual(group.items.map(item=>item.key),['hq-time','daybook']);
 assert.equal(group.defaultTarget.path,'/hq-time');
});
