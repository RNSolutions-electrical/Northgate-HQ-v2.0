import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {seed} from '../src/modules/estimates/workbench/model.mjs';
import {makeReport,reportHTML} from '../src/modules/estimates/workbench/reports.mjs';
import {exportDraftProposalPdf} from '../src/modules/estimates/workbench/proposalPdf.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Ryan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='.temp/estimates-integration/pdf';await mkdir(dir,{recursive:true});
const d={...seed('Office electrical improvements','Example customer'),proposal:{contact:'Project manager',siteAddress:'123 Example Street',introduction:'Thank you for the opportunity to provide this proposal.',scope:'Install new receptacles and lighting in the renovated office.',inclusions:'Raceways, conductors and devices listed in the scope.',exclusions:'',terms:'',schedule:''},entries:Array.from({length:3},(_,e)=>({id:'e'+e,number:e+1,name:['Install receptacles','Install lighting','Test and commission'][e],description:'Coordinate final locations with the project manager.',section:'Electrical',location:'Office',drawing:'E1',items:Array.from({length:2},(_,i)=>({id:'i'+e+i,number:i+1,name:i?'Pull and terminate conductors':'Install raceways',qty:2,status:'In progress',notes:'INTERNAL PRIVATE NOTE',components:[{id:'g'+e+i,name:'Raceway and wiring'}],lines:Array.from({length:3},(_,l)=>({id:'l'+e+i+l,componentId:'g'+e+i,name:['EMT conduit','Copper conductors','Device box'][l],unit:'EA',qty:5,price:7.8,hours:0.15,notes:'INTERNAL PRIVATE NOTE'}))}))}))};
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 for(const kind of ['detail','field','summary','rfq']){
  const html=reportHTML(makeReport(d,kind));
  if(['field','rfq'].includes(kind)){assert.ok(!html.includes('INTERNAL PRIVATE NOTE'));assert.ok(!html.includes('$'));}
  await page.setContent(html);await page.pdf({path:dir+'/'+kind+'.pdf',format:'Letter',printBackground:true,preferCSSPageSize:true});
 }
 await writeFile(dir+'/proposal.pdf',await exportDraftProposalPdf(d));
 console.log('Created five synthetic report PDFs for visual inspection: '+dir);
}finally{await browser.close();}
