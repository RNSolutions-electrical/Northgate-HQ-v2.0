import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {dwellingReport, dwellingReportCss} from './dwellingReport.js';
import {defaults} from './worksheetModel.js';
import {worksheetFrame} from './worksheetFrame.js';
const source=fs.readFileSync(new URL('./worksheet-source.html',import.meta.url),'utf8');
const engine=source.slice(source.indexOf('function calculate('),source.indexOf("if(typeof module"));
function calc(d){return vm.runInNewContext(engine+';calculate(data)',{data:d});}
test('report escapes every displayed user value and retains incomplete warnings',()=>{const d=defaults();d.project='<script>alert(1)</script>';d.notes='</article><img src=x onerror=alert(1)>';d.rows=[{label:'<svg/onload=alert(1)>',qty:'1',va:'100',cat:'fixed',model:'<b>x</b>',serial:'"&',provenance:{sourceType:'field',reference:'<script>',attributedTo:'Ryan',notes:'unverified'}}];const html=dwellingReport(d,calc(d),'2026-11-16');assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert.match(html,/INCOMPLETE/);assert.match(html,/Source|Provenance/);assert.match(html,/entered claim/);assert.match(html,/may contain unsaved edits/);assert.match(html,/Printing does not save, approve, submit or send/);assert.match(html,/No|not establish service sufficiency/);});
test('preview does not mutate data or replace unknown service rating',()=>{const d=defaults(),before=JSON.stringify(d);const html=dwellingReport(d,calc(d),'timestamp');assert.equal(JSON.stringify(d),before);assert.match(html,/Entered service rating \(A\).*?Not recorded/);assert(!html.includes('calculated demand does not exceed'));assert.match(html,/Standard method/);assert.match(html,/Optional method/);});
test('preview/close/escape/repeated open/new study flows stay isolated and print explicit',()=>{
 const html=worksheetFrame(source,'report-test');const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');const nodes=new Map(),listeners={},dialogs=[];let prints=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',style:{},remove(){},focus(){},value:'',dataset:{}});return nodes.get(id)};
 const parent={postMessage(){}};
 const document={body:{style:{},appendChild(dialog){dialogs.push(dialog)}},documentElement:{scrollHeight:900},querySelector:node,querySelectorAll:()=>[],addEventListener(){},createElement(type){assert.equal(type,'dialog');return {innerHTML:'',controls:{},events:{},setAttribute(){},querySelector(id){return this.controls[id]??=( {focus(){}} );},addEventListener(k,f){this.events[k]=f},showModal(){this.open=true},close(){this.open=false},remove(){this.removed=true}}}};
 const context=vm.createContext({document,parent,structuredClone,console,ResizeObserver:class{observe(){}},window:{addEventListener:(k,f)=>listeners[k]=f,print(){prints++}},alert(){},confirm:()=>true,Blob,URL,setTimeout,crypto});vm.runInContext(code,context);
 const load=generation=>listeners.message({source:parent,data:{channel:'hq-dwelling-load',nonce:'report-test',type:'load',data:{payload:defaults(),generation}}});load(1);
 node('#print').onclick();node('#print').onclick();assert.equal(dialogs.length,1);assert.equal(prints,0);assert.match(dialogs[0].innerHTML,/WORKING COPY/);
 dialogs[0].controls['#report-print'].onclick();assert.equal(prints,1);dialogs[0].controls['#report-close'].onclick();assert(dialogs[0].removed);
 node('#print').onclick();let prevented=false;dialogs[1].events.cancel({preventDefault(){prevented=true}});assert(prevented);assert(dialogs[1].removed);
 node('#print').onclick();load(2);assert(dialogs[2].removed);assert.equal(prints,1);
 assert.match(dwellingReportCss,/max-height:90vh/);assert.match(dwellingReportCss,/\.report-controls\{display:none!important\}/);
});
test('panels never silently omitted or shown as adequate without revision-bound assessment',()=>{const d=defaults();d.feederStudies={version:1,reviewSnapshot:'stale',panels:[{id:'p',label:'<Panel A>',parentId:null,loadIds:[]}],studies:[{panelId:'p',reviewedDemandVA:100,designCurrentA:[1,2],ratings:{panelBus:{amps:100,verified:true,source:'<field>'}},conditionRecommendation:'Replace obsolete equipment regardless of calculated demand'}]};const html=dwellingReport(d,calc(d),'timestamp');assert.match(html,/INCOMPLETE REPORT ASSESSMENT/);assert.match(html,/&lt;Panel A&gt;/);assert.match(html,/&lt;field&gt;/);assert.match(html,/Replace obsolete equipment/);assert.match(html,/No rating comparisons/);assert(!html.includes('no-calculated-exceedance'));assert.match(dwellingReport(defaults(),calc(defaults()),'timestamp'),/No individual panel or feeder study/);});
test('standalone HTTPS references link only by explicit click, without leaking opener or referrer',()=>{
 const helper=source.split('\n').find(line=>line.startsWith('function safeReferenceUrl('));
 const safe=vm.runInNewContext(helper+';safeReferenceUrl',{URL});
 const accepted=['https://www.dropbox.com/scl/fi/example/nameplate.pdf?rlkey=example&dl=0','https://example.com/photo%20one.jpg'];
 const rejected=['javascript:alert(1)','data:text/html,x','http://example.com','https://user:pass@example.com/x','https://user@example.com','https://example.com/a b',' https://example.com','see https://example.com','https://example.com\\@evil.com','https://example.com\n','https://example.com/<img>','https://example.com/" onclick="x','https:///','ftp://example.com'];
 for(const reference of [...accepted,...rejected]){
  const d=defaults();d.rows=[{label:'Nameplate',qty:'1',va:'100',cat:'fixed',provenance:{reference}}];const html=dwellingReport(d,calc(d),'time');const valid=accepted.includes(reference);assert.equal(Boolean(safe(reference)),valid,reference);assert.equal(html.includes('Open source reference</a>'),valid,reference);if(valid){assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert(!html.includes('<img'));}
 }
 assert.match(source,/data-reference-link=/);assert.match(source,/link.innerHTML=referenceLink\(el.value\)/);
 assert(!source.includes('rel="noopener"'));
});
