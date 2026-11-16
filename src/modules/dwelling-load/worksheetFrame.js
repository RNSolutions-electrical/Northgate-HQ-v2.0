// Source transforms are exact-count checked: changing the source cannot silently restore local persistence.
export function worksheetFrame(source, nonce) {
 if(!/^[a-zA-Z0-9-]+$/.test(nonce))throw Error('Invalid frame nonce');
 let html=source;
 const line=(prefix,replacement)=>{const lines=html.split('\n'),hits=lines.filter(s=>s.startsWith(prefix));if(hits.length!==1)throw Error('Worksheet integration target changed: '+prefix);html=lines.map(s=>s.startsWith(prefix)?replacement:s).join('\n');};
 line('try{const saved=', '');
 line('function save(){',`function save(){data.updatedAt=new Date().toISOString();send('changed',data);status();}`);
 line('function status(){',`function status(){$('#saveStatus').textContent='HQ worksheet: use Save to HQ above. Last exported: '+(data.lastBackup||'none')+' • Imported: '+(data.lastImport||'none');}`);
 line("$('#snapshot').onclick=", "$('#snapshot').remove();");
 line("$('#file').onchange=",`$('#file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2000000)throw Error('Backup exceeds 2 MB');const next=validate(JSON.parse(await f.text()));send('import',{payload:next,filename:f.name});}catch(err){alert(err.message);}finally{e.target.value='';}};`);
 html=html.replace('Restore JSON','Import JSON as new study').replace('Save a JSON backup before changing devices or browsers. Browser storage is local to this browser and file location, not Dropbox or HQ synchronization. Changing the HTML file location may change access to saved browser data.','Save to HQ before changing devices. This owner-private cloud study is accessible from your own HQ account. Export JSON for a separate backup.').replace('Local-only worksheet • No telemetry, network dependencies or automatic uploading.','HQ staging pilot • Save explicitly to your private HQ study.');
 const bridge=`
const channel='hq-dwelling-load',nonce=${JSON.stringify(nonce)};
let generation=null;
function send(type,data){parent.postMessage({channel,nonce,generation,type,data},'*');}
document.body.style.visibility='hidden';
window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==channel||e.data?.nonce!==nonce)return;try{if(e.data.type==='load'){const next=validate(structuredClone(e.data.data.payload));if(!Number.isSafeInteger(e.data.data.generation))throw Error('Invalid worksheet generation');generation=e.data.data.generation;data=next;render();document.body.style.visibility='visible';}if(e.data.type==='export'){download(data,'Dwelling-Load-Unsaved-Backup.json');}}catch(err){send('error',err.message);}});
new ResizeObserver(()=>send('resize',document.documentElement.scrollHeight)).observe(document.body);
send('ready');
`;
 // Announce readiness only after the source UI and state are initialized.
 if(html.split('</script></html>').length!==2)throw Error('Worksheet closing script changed');
 html=html.replace('</script></html>',bridge+'</script></html>');
 return html.replace('</style>', 'html,body{overflow-y:hidden}button{min-height:44px}</style>');
}
