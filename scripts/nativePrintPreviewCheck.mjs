import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

/** Inspect the real Edge print UI, then click its Cancel control. Never submit a print job. */
export async function checkNativePrintPreview(browser,trigger,{pageCount,screenshot}){
 const session=await browser.newBrowserCDPSession(),clicking=trigger();let target;
 for(let i=0;i<100;i++){target=(await session.send('Target.getTargets')).targetInfos.find(info=>info.url==='edge://print/');if(target)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(target,'Native print preview must open');
 const {sessionId}=await session.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let id=0;
 const call=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;const timeout=setTimeout(()=>{session.off('Target.receivedMessageFromTarget',handler);reject(new Error('Print inspection timed out: '+method));},10000);const handler=event=>{if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);if(message.id!==request)return;clearTimeout(timeout);session.off('Target.receivedMessageFromTarget',handler);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result);};session.on('Target.receivedMessageFromTarget',handler);session.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:request,method,params})}).catch(reject);});
 await new Promise(resolve=>setTimeout(resolve,2500));const tree=await call('Accessibility.getFullAXTree');
 const total=tree.nodes.find(node=>/^Total: \d+ sheet/.test(node.name?.value||''))?.name.value;
 const controls=await call('Runtime.evaluate',{expression:'(()=>{const values=[];function visit(root){for(const e of root.querySelectorAll("*")){if(e.tagName==="BUTTON")values.push(e.innerText.trim());if(e.shadowRoot)visit(e.shadowRoot);}}visit(document);return values;})()',returnByValue:true});
 const duplex=controls.result.value.includes('Print on both sides');assert.equal(Number(total?.match(/\d+/)?.[0]),duplex?Math.ceil(pageCount/2):pageCount);
 const image=await call('Page.captureScreenshot',{format:'png'});await writeFile(screenshot,Buffer.from(image.data,'base64'));
 const cancel=tree.nodes.filter(node=>node.role?.value==='button'&&node.name?.value==='Cancel');assert.equal(cancel.length,1);const resolved=await call('DOM.resolveNode',{backendNodeId:cancel[0].backendDOMNodeId});
 await call('Runtime.callFunctionOn',{objectId:resolved.object.objectId,functionDeclaration:'function(){this.click();}',returnByValue:true});
 for(let i=0;i<50;i++){if(!(await session.send('Target.getTargets')).targetInfos.some(info=>info.targetId===target.targetId))break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(!(await session.send('Target.getTargets')).targetInfos.some(info=>info.targetId===target.targetId),'Native preview must close after Cancel');await clicking;await session.detach();
 return {pdfPages:pageCount,duplex,cancelled:true,physicalPrint:false};
}
