import source from './daybook-source.html?raw';
// Runs in an opaque-origin sandbox: no access to HQ cookies, tokens or browser storage.
export function daybookFrame(bridgeToken = "") {
  let html = source.replace(/try\{const s=localStorage.getItem\(KEY\);if\(s\)db=JSON.parse\(s\)\}catch\(e\)\{persistence=false\}/, '');
  html = html.replace(/function persist\(\)\{[^\n]+\}/, `function persist(){ parent.postMessage({channel:'hq-daybook',type:'changed',data:hqSafe(db)},'*'); $('saveStatus').textContent='Unsaved changes in HQ'; }`);
  html = html.replace("Import replaces this browser's planner after confirmation.", 'Import proposes replacement of this HQ workspace after a pre-restore snapshot. The original local planner is not changed.');
  html = html.replace(/Saved in this browser\.[\s\S]*?Copies do not sync\./, 'Use Save to HQ above to save across devices. Export JSON for a separate backup.');
  html=html.replace('</head>','<style>html,body{overflow-y:hidden}.layout{min-height:0}</style></head>');
  html=html.replace('</head>',`<script>
const hqBridgeToken=${JSON.stringify(bridgeToken)};
let hqAccess={canManageNorthgate:false,canViewPay:false};
function hqSafe(data){const x=structuredClone(data);if(!hqAccess.canViewPay){for(const w of x.workers||[]){for(const k of Object.keys(w))if(!['id','name','role','hours','active','contactId','phone','email','company','ptoPlans','ptoWeekdays','ptoExcludeHolidays'].includes(k))delete w[k];}delete x.privacy;}return x;}
</script></head>`);
  const bridge = `
let hqReady=false;
const originalValidate=validBackup;
validBackup=function(value){let x=hqSafe(value);for(const w of x.workers||[])w.rate??=0;return hqSafe(originalValidate(x));};
function redactPayHTML(html){if(hqAccess.canViewPay)return html;const root=document.createElement('div');root.innerHTML=html;root.querySelectorAll('.metric').forEach(el=>{if(/labor cost|hourly.*cost/i.test(el.textContent))el.remove()});root.querySelectorAll('h3').forEach(el=>{if(el.textContent==='Confidential information'){if(el.parentElement.classList.contains('full'))el.parentElement.remove();else{el.nextElementSibling?.remove();el.remove();}}});root.querySelectorAll('[name="rate"],[name="privateNotes"]').forEach(el=>el.closest('label')?.remove());return root.innerHTML;}
const hqWorkersHTML=workersHTML,hqProfileHTML=workerProfileHTML,hqJobsHTML=jobsHTML;
workersHTML=()=>redactPayHTML(hqWorkersHTML());workerProfileHTML=w=>redactPayHTML(hqProfileHTML(w));jobsHTML=()=>redactPayHTML(hqJobsHTML());
const hqWorkerEditor=workerEditor;
workerEditor=function(id){if(!hqAccess.canManageNorthgate)return;hqWorkerEditor(id);if(!hqAccess.canViewPay)$('modalBody').innerHTML=redactPayHTML($('modalBody').innerHTML);};
const hqPrivacyAction=privacyAction,hqPrivacyDialog=privacyDialog,hqSubmitPrivacy=submitPrivacy;
privacyAction=function(){if(hqAccess.canViewPay)hqPrivacyAction();};privacyDialog=function(setup){if(hqAccess.canViewPay)hqPrivacyDialog(setup);};submitPrivacy=function(ev,setup){if(!hqAccess.canViewPay){ev.preventDefault();return;}return hqSubmitPrivacy(ev,setup);};
privacyButton=function(){return hqAccess.canViewPay?'<button id="privacyButton" onclick="privacyAction()">'+(privacyUnlocked?'Lock confidential info':'Unlock confidential info')+'</button>':'';};
exportDialog=function(){priorExport();};
const hqRender=render;
render=function(){if(!hqAccess.canViewPay)privacyUnlocked=false;if(!hqAccess.canManageNorthgate&&['jobs','workers','schedule'].includes(page))page='calendar';hqRender();if(!hqAccess.canManageNorthgate){document.querySelectorAll('#nav button').forEach(el=>{if(/Jobs|Workers|Crew schedule/.test(el.textContent))el.remove();});}if(!hqAccess.canViewPay){db=hqSafe(db);$('privacyButton')?.remove();}};

document.body.style.visibility='hidden';
window.addEventListener('message', event => {
 if(event.source!==parent || event.data?.channel!=='hq-daybook'||event.data?.token!==hqBridgeToken)return;
 try {
  if(event.data.type==='access-blocked'){hqAccess={canManageNorthgate:false,canViewPay:false};privacyUnlocked=false;db=hqSafe(db);$('printArea').innerHTML='';$('modalBody').innerHTML='';closeModal();document.body.style.visibility='hidden';return;}
  if(event.data.type==='validate'){try{const data=validBackup(structuredClone(event.data.data));parent.postMessage({channel:'hq-daybook',type:'validated',id:event.data.id,data},'*');}catch(error){parent.postMessage({channel:'hq-daybook',type:'validated',id:event.data.id,error:error.message},'*');}return;}
  if(event.data.type==='load') {
   if(event.data.data){hqAccess={canManageNorthgate:event.data.data.access?.canManageNorthgate===true,canViewPay:event.data.data.access?.canViewPay===true};db=validBackup(structuredClone(event.data.data.workspace));}
   hidden.clear();contactId=null;$('printArea').innerHTML='';$('modalBody').innerHTML='';closeModal();render();hqReady=true;document.body.style.visibility='visible';
   $('saveStatus').textContent='HQ workspace loaded';
  }
  if(event.data.type==='saved') $('saveStatus').textContent='Saved to HQ';
 } catch(error){parent.postMessage({channel:'hq-daybook',type:'error',message:error.message},'*');}
});
$('importFile').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try {if(file.size>20000000)throw Error('Backup exceeds 20 MB.');
 const data=validBackup(JSON.parse(await file.text()));
 parent.postMessage({channel:'hq-daybook',type:'restore',data,filename:file.name},'*');
 }catch(error){toast('Import failed: '+error.message)}finally{event.target.value=''}
};
portableHTML=()=>toast('Use Export JSON. The original standalone app remains unchanged.');
const originalDownload=download;
const hqPrintView=printView;let printRequest=null,printScope=null;
printView=function(scope){printRequest=uid();printScope=scope;parent.postMessage({channel:'hq-daybook',type:'print-request',requestId:printRequest},'*');};
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='hq-daybook'||event.data?.token!==hqBridgeToken||event.data.type!=='print-approved'||event.data.data?.requestId!==printRequest)return;printRequest=null;hqPrintView(printScope);});
let exportRequest=null;
download=function(name,text,type){if(type!=='application/json')return;exportRequest=uid();parent.postMessage({channel:'hq-daybook',type:'export-request',requestId:exportRequest,filename:name,data:hqSafe(JSON.parse(text))},'*');};
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='hq-daybook'||event.data?.token!==hqBridgeToken||event.data.type!=='export-approved'||event.data.data?.requestId!==exportRequest)return;const reply=event.data.data;exportRequest=null;originalDownload(reply.filename,JSON.stringify(reply.data,null,2),'application/json');parent.postMessage({channel:'hq-daybook',type:'exported',filename:reply.filename},'*');});
let lastHeight=0;
const reportHeight=()=>{const height=Math.ceil(document.body.getBoundingClientRect().height);if(height!==lastHeight){lastHeight=height;parent.postMessage({channel:'hq-daybook',type:'resize',height},'*')}};
new ResizeObserver(reportHeight).observe(document.body);
reportHeight();
parent.postMessage({channel:'hq-daybook',type:'ready'},'*');
`;
  return html.replace('</body>', '<script>'+bridge+'</script></body>').replaceAll("{channel:'hq-daybook',","{channel:'hq-daybook',token:hqBridgeToken,").replaceAll("event.data?.channel!=='hq-daybook')","event.data?.channel!=='hq-daybook'||event.data?.token!==hqBridgeToken)");
}
