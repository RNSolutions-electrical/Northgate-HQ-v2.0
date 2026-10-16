import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=await createServer({root,server:{host:'127.0.0.1',port:5347,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:false,channel:'msedge',ignoreDefaultArgs:['--disable-print-preview']});
const evidence=root+'/.temp/proposal-final-windows';await mkdir(evidence,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const browserSession=await browser.newBrowserCDPSession();
 for(const variant of ['total-only','long-priced']){
  await page.goto('http://127.0.0.1:5347/northgate/tests/browser/labor-rates.html');
  await page.evaluate(variant=>{
   const doc=structuredClone(window.rateFixture.document),entry=doc.entries[0],item=entry.items[0];
   doc.name='Synthetic generator installation';doc.customer='Example customer';
   entry.items=Array.from({length:variant==='total-only'?4:24},(_,index)=>({...structuredClone(item),id:'item-'+index,number:index+1,name:index===1?'Grounding and gas bonding required by code':'Synthetic work '+(index+1)}));
   doc.proposal={...doc.proposal,scopeMode:'grouped',showLinePrices:variant==='long-priced',contact:'Example attention',serviceCall:'SC-QA-456',proposalDate:'2026-10-16',salesTaxPercent:7.25,creditCardPercent:3,exclusions:'Utility company charges excluded.',scopeGroups:[{text:variant==='total-only'?'Provide complete generator installation and commissioning.':('Long scope for pagination and print review. ').repeat(130)+'FINAL GROUP TEXT',lineKeys:entry.items.map(item=>JSON.stringify([entry.id,item.id]))}]};
   sessionStorage.setItem('rates-document',JSON.stringify(doc));
  },variant);
  await page.reload();await page.getByRole('button',{name:'Proposal',exact:true}).click();
  await page.getByRole('button',{name:'Export Proposal',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('.pdf-preview-actions button:nth-child(3)')?.disabled===false);
  const overlay=page.getByRole('dialog',{name:'Draft proposal preview'}),pageCount=await overlay.locator('canvas').count();
  await page.screenshot({path:evidence+'/'+variant+'-overlay.png'});
  const clicking=overlay.getByRole('button',{name:'Print',exact:true}).click({timeout:20000});
  let target;for(let i=0;i<100;i++){target=(await browserSession.send('Target.getTargets')).targetInfos.find(target=>target.url==='edge://print/');if(target)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(target,'Native Edge print preview must open');
  const {sessionId}=await browserSession.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let id=0;
  const call=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;const handler=event=>{if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);if(message.id!==request)return;browserSession.off('Target.receivedMessageFromTarget',handler);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result);};browserSession.on('Target.receivedMessageFromTarget',handler);browserSession.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:request,method,params})}).catch(reject);});
  await new Promise(resolve=>setTimeout(resolve,2500));
  const tree=await call('Accessibility.getFullAXTree');await writeFile(evidence+'/'+variant+'-print-accessibility.json',JSON.stringify(tree,null,2));
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(evidence+'/'+variant+'-native-print.png',Buffer.from(shot.data,'base64'));
  const total=tree.nodes.find(node=>/^Total: \d+ sheet/.test(node.name?.value||''))?.name.value;
  const controls=await call('Runtime.evaluate',{expression:'(()=>{const values=[];function visit(root){for(const e of root.querySelectorAll("*")){if(e.tagName==="BUTTON")values.push(e.innerText.trim());if(e.shadowRoot)visit(e.shadowRoot);}}visit(document);return values;})()',returnByValue:true});
  const duplex=controls.result.value.includes('Print on both sides');
  assert.equal(Number(total?.match(/\d+/)?.[0]),duplex?Math.ceil(pageCount/2):pageCount,'Native print sheet count must match PDF pages and observed duplex setting');
  const cancel=tree.nodes.filter(node=>node.role?.value==='button'&&node.name?.value==='Cancel');assert.equal(cancel.length,1);
  const resolved=await call('DOM.resolveNode',{backendNodeId:cancel[0].backendDOMNodeId});
  await call('Runtime.callFunctionOn',{objectId:resolved.object.objectId,functionDeclaration:'function(){this.click();}',returnByValue:true});
  for(let i=0;i<50;i++){if(!(await browserSession.send('Target.getTargets')).targetInfos.some(info=>info.targetId===target.targetId))break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(!(await browserSession.send('Target.getTargets')).targetInfos.some(info=>info.targetId===target.targetId),'Print preview must close after Cancel');
  await clicking;await overlay.waitFor();await overlay.getByRole('button',{name:'Back to edit',exact:true}).click();
  console.log(JSON.stringify({variant,pdfPages:pageCount,nativePrintPreview:true,cancelled:true,physicalPrint:false}));
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await server.close();}
