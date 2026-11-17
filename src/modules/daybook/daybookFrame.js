import source from './daybook-source.html?raw';
// Runs in an opaque-origin sandbox: no access to HQ cookies, tokens or browser storage.
export function daybookFrame() {
  let html = source.replace(/try\{const s=localStorage.getItem\(KEY\);if\(s\)db=JSON.parse\(s\)\}catch\(e\)\{persistence=false\}/, '');
  html = html.replace(/function persist\(\)\{[^\n]+\}/, `function persist(){ parent.postMessage({channel:'hq-daybook',type:'changed',data:db},'*'); $('saveStatus').textContent='Unsaved changes in HQ'; }`);
  html = html.replace("Import replaces this browser's planner after confirmation.", 'Import proposes replacement of this HQ workspace after a pre-restore snapshot. The original local planner is not changed.');
  html = html.replace(/Saved in this browser\.[\s\S]*?Copies do not sync\./, 'Use Save to HQ above to save across devices. Export JSON for a separate backup.');
  html=html.replace('</head>','<style>html,body{overflow-y:hidden}.layout{min-height:0}</style></head>');
  const bridge = `
let hqReady=false;
document.body.style.visibility='hidden';
window.addEventListener('message', event => {
 if(event.source!==parent || event.data?.channel!=='hq-daybook')return;
 try {
  if(event.data.type==='validate'){try{const data=validBackup(structuredClone(event.data.data));parent.postMessage({channel:'hq-daybook',type:'validated',id:event.data.id,data},'*');}catch(error){parent.postMessage({channel:'hq-daybook',type:'validated',id:event.data.id,error:error.message},'*');}return;}
  if(event.data.type==='load') {
   if(event.data.data) db=validBackup(structuredClone(event.data.data));
   hidden.clear();contactId=null;closeModal();render();hqReady=true;document.body.style.visibility='visible';
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
download=function(name,text,type){originalDownload(name,text,type);if(type==='application/json')parent.postMessage({channel:'hq-daybook',type:'exported',filename:name},'*')};
let lastHeight=0;
const reportHeight=()=>{const height=Math.ceil(document.body.getBoundingClientRect().height);if(height!==lastHeight){lastHeight=height;parent.postMessage({channel:'hq-daybook',type:'resize',height},'*')}};
new ResizeObserver(reportHeight).observe(document.body);
reportHeight();
parent.postMessage({channel:'hq-daybook',type:'ready'},'*');
`;
  return html.replace('</body>', '<script>'+bridge+'</script></body>');
}
