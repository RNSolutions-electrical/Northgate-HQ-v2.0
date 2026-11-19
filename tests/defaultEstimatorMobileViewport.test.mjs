import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {estimateEditorHeight, NARROW_ESTIMATE_EDITOR} from '../src/modules/estimates/workbench/editorViewport.mjs';

const route=readFileSync(new URL('../src/modules/estimates/workbench/WorkbenchRoute.jsx',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/modules/estimates/workbench/workspace.css',import.meta.url),'utf8');
const shell={layoutHeight:844,top:192,bottom:16};

test('the phone editor frame stays the same size under keyboard and focus zoom',()=>{
 for(const visualHeight of [844,510,280,160]){
  assert.equal(estimateEditorHeight({...shell,visualHeight,narrow:true}),620);
 }
 assert.equal(estimateEditorHeight({...shell,layoutHeight:720,visualHeight:720,narrow:true}),496);
});

test('wider and older editors preserve existing visual viewport fit, fallbacks and limits',()=>{
 assert.equal(estimateEditorHeight({...shell,visualHeight:510,narrow:false}),286);
 assert.equal(estimateEditorHeight({...shell,narrow:false}),620);
 assert.equal(estimateEditorHeight({...shell,visualHeight:150,narrow:false}),1);
 assert.match(route,/const defaultEditor=document\.blankSlateVersion===1/);
 assert.match(route,/narrow:defaultEditor&&narrow\.matches/);
});

test('phone controls in the nested Default editor and dialogs use readable focus-sized text',()=>{
 assert.equal(NARROW_ESTIMATE_EDITOR,'(max-width: 768px)');
 assert.match(workspace,/@media\(max-width:768px\)\{\s*\.blank-slate :is\(input[^\n]+select,textarea\),\s*#editor:has\(\.blank-slate\) \.blank-work-dialog :is\(input[^\n]+select,textarea\)\{\s*font-size:16px;\s*min-height:44px;/);
 assert.doesNotMatch(route,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
});
