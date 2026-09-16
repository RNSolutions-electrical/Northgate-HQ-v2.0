import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,calculate,feeder,transformer,segment} from '../src/modules/afc/engine.mjs';
import {evaluate,loopCurrent} from '../src/modules/afc/layers.mjs';
import {importStudy,releaseIssues,studyResults,blankStudy,reparent,comparison} from '../src/modules/afc/model.mjs';
const fixture=()=>{const d=importStudy(demo()).document;d.preparedBy='Fixture preparer';d.date='2026-09-15';return d;};
const close=(a,b,tolerance=0.002)=>assert.ok(Math.abs(a-b)/b<tolerance,a+' vs '+b);
test('AFC independent Eaton examples retain published rounding tolerance',()=>{
 // Eaton Electrical Formulas (2014), page 238 System B and page 240 System A.
 const i=transformer(1000,480,3,3.5,10);close(i,38184);
 const service=feeder(i,480,3,30,26706,4);close(service,36761);
 const primary=feeder(service,480,3,20,11424,2);close(primary,32937);
 const d=fixture();d.nodes=[{...d.nodes[0],method:'known',known:primary},{id:'xf',parent:'utility',kind:'transformer',name:'Test XF',fault:'Secondary',kva:225,voltage:208,z:1.2,tolerance:10,sourceReference:'Fixture nameplate',segments:[{...segment(),id:'run',length:0}]}];
 close(calculate(d).xf.i,32842);
 const ll=transformer(75,240,1,1.4,10);close(ll,24802);
 const ln=ll*1.5;close(ln,37202);close(loopCurrent(ln,120,25,22185,1,22185,1),21900);
});
test('AFC sibling topology, upstream propagation, reparenting and cycles',()=>{
 const d=fixture(),a=calculate(d);d.nodes.find(n=>n.id==='sub1').segments[0].length*=2;
 const b=calculate(d);assert.ok(b.sub1.i<a.sub1.i);assert.equal(b.sub2.i,a.sub2.i);assert.equal(b.sub3.i,a.sub3.i);
 d.nodes.find(n=>n.id==='main').segments[0].length*=2;const c=calculate(d);for(const key of ['sub1','sub2','sub3'])assert.ok(c[key].i<b[key].i);
 const moved=reparent(d,'sub1','sub2');assert.equal(moved.nodes.find(n=>n.id==='sub1').parent,'sub2');
 assert.throws(()=>reparent(moved,'sub2','sub1'),/outside this branch/);
 moved.nodes.find(n=>n.id==='main').parent='sub1';assert.match(releaseIssues(moved).join(' '),/cycle/);
});
test('AFC blank is not zero, invalid draft inputs remain visible and no implicit reference',()=>{
 assert.ok(studyResults(blankStudy()).errors.length);
 for(const value of ['',null,' ',false,-1]){const d=fixture();d.nodes[1].segments[0].length=value;assert.ok(releaseIssues(d).length);}
 const d=fixture();d.nodes[1].segments[0].length=0;assert.equal(releaseIssues(d).length,0);
 d.nodes[0].sourceReference='';assert.match(releaseIssues(d).join(' '),/reference/);
 d.nodes[0].sourceReference='Utility fixture';d.date='2026-99-99';assert.match(releaseIssues(d).join(' '),/calculation date/);
});
test('AFC parallel sets and serial segments retain unrounded values',()=>{
 const d=fixture();const a=calculate(d);d.nodes[1].segments[0].sets*=2;assert.ok(calculate(d).service.i>a.service.i);
 const first=d.nodes[1].segments[0],half={...first,length:first.length/2};d.nodes[1].segments=[{...half,id:'one'},{...half,id:'two'}];
 close(calculate(d).service.i,feeder(calculate(d).utility.i,480,3,first.length,16813,4),1e-12);
});
test('AFC generator cases energize only their subtree and use an independent feeder',()=>{
 const d=fixture();d.layers.generators=[{id:'gen',name:'Standby',bus:'sub1',method:'known',known:5000,reference:'Manufacturer fixture',feeder:{length:0}}];
 let r=evaluate(d);assert.equal(r.errors.length,0);assert.equal(r.cases[1].results.main,undefined);assert.equal(r.cases[1].results.sub2,undefined);assert.equal(r.cases[1].results.sub1.i,5000);
 d.layers.generators[0].feeder={length:20,c:15082,sets:1,reference:'Custom reference'};r=evaluate(d);assert.ok(r.cases[1].results.sub1.i<5000);
 d.layers.generators[0].lnVoltage=277;assert.ok(releaseIssues(d).length);
});
test('AFC optional motor pool is case-scoped and missing optional values do not invent rows',()=>{
 const d=fixture();d.layers.generators=[{id:'gen',name:'Standby',bus:'sub1',method:'known',known:5000,reference:'Manufacturer fixture',feeder:{length:0}}];
 d.layers.motors=[{id:'motor',name:'Induction group',bus:'sub2',fla:50,multiplier:4,operation:'both',reference:'Motor schedule'}];
 let r=evaluate(d);assert.equal(r.base.sub1.motor,200);assert.equal(r.cases[1].results.sub1.motor,undefined);
 d.layers.motors[0].fla='';d.layers.generators[0].known='';r=evaluate(d);assert.equal(r.cases.length,1);assert.equal(r.base.sub1.motor,undefined);
 d.layers.motors[0].fla=0;assert.ok(releaseIssues(d).length);
});
test('AFC L-N boundaries, custom neutral sensitivity and explicit external results',()=>{
 const d=fixture();d.nodes[0].ln={mode:'known',current:30000,voltage:277,reference:'Utility L-N study'};
 for(const n of d.nodes)for(const s of n.segments||[])s.neutral={mode:'same'};
 const base=evaluate(d);assert.ok(base.base.sub1.ln>0);
 d.nodes.find(n=>n.id==='sub1').segments[0].neutral={mode:'custom',c:5000,sets:1,reference:'Neutral impedance'};
 const next=evaluate(d);assert.ok(next.base.sub1.ln<base.base.sub1.ln);assert.equal(next.base.sub1.i,base.base.sub1.i);assert.equal(next.base.sub2.ln,base.base.sub2.ln);
 d.nodes[0].ln={mode:'center'};assert.ok(releaseIssues(d).length);
 d.nodes[0].ln={mode:'none'};d.nodes[1].external=[{id:'ext',amps:50000,fault:'Parallel sources',caseName:'External case',reference:'Engineering report rev 2'}];
 const ext=studyResults(d);assert.equal(ext.byNode.service.maximum.amps,50000);assert.equal(ext.byNode.service.maximum.external,true);
 assert.equal(comparison(d.nodes[1],ext.byNode.service).state,'exceeds');assert.equal(comparison({...d.nodes[1],rating:''},ext.byNode.service).state,'unknown');
});
test('AFC imported identity and original data preserved, prototype property IDs rejected',()=>{
 const original=demo(),saved=JSON.stringify(original);const imported=importStudy(original);
 assert.equal(JSON.stringify(original),saved);assert.deepEqual(imported.original,original);assert.equal(imported.document.nodes[0].id,'utility');
 assert.ok(imported.document.nodes[1].segments[0].id);
 imported.document.nodes[0].id='__proto__';assert.match(releaseIssues(imported.document).join(' '),/IDs/);
 for(const key of ['generators','motors']){const malformed=fixture();malformed.layers[key]=[{id:'bad-name',name:{unexpected:'object'}}];assert.throws(()=>importStudy(malformed),/names must be text/);}
});
