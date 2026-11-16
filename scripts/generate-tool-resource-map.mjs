import fs from 'node:fs';
import path from 'node:path';
const migration='supabase/migrations/20261116112903_tool_availability_controls.sql';
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]);
const sources=walk('src').filter(p=>/\.(jsx?|mjs)$/.test(p)).map(file=>({file:file.replaceAll('\\','/'),text:fs.readFileSync(file,'utf8')}));
const declarations=new Map();
for(const f of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')&&!x.includes('tool_availability'))){
 const sql=fs.readFileSync('supabase/migrations/'+f,'utf8');
 for(const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z][a-z0-9_]*)\s*[\s(]/gi)){
  const kind=m[1].toLowerCase()==='function'?'rpc':'table',key=kind+':'+m[2];declarations.set(key,{kind,name:m[2],declaration:f});
 }
}
const protectedNames=/^(?:get_or_create_user_permissions|get_current_user_addons|current_user_|read_tool_availability|require_tool_available|set_tool_availability|hq_tool_pre_request|auth_|role_|effective_|has_|record_client_audit_event|read_my_review_task_inbox)/;
const moduleForName=name=>{
 if(/health_inspection|inspection_action_requests/.test(name))return'electrical-inspections';if(name==='transaction_items')return'inventory';if(name==='financial_division_catalogue')return'jobs';if(/daybook/.test(name))return'daybook';if(/hq_time/.test(name))return'hq-time';if(/^afc_|_afc_/.test(name))return'afc';if(/^hi_|electrical_inspection/.test(name))return'electrical-inspections';if(/panel_director/.test(name))return'panel-directory';if(/eos_/.test(name))return'eos';if(/silas/.test(name))return'silas';
 if(/inventory|catalogue_stock|material_alias|material_catalog|storage_location|bin_item|^items$|^bins$|^bays$|^shelves$|^storage_units$|^item_/.test(name))return'inventory';
 if(/estimate|assembly|assemblies|blank_slate/.test(name))return'estimates';if(/vehicle/.test(name))return'vehicles';if(/employee|profile_(?:note|todo)/.test(name))return'employees';if(/(^|_)tool(_|s$)/.test(name))return'tools';if(/document/.test(name))return'documents';if(/(^|_)job|^svc_|^change_order|^contract_adjustment|^financial_line/.test(name))return'jobs';return null;
};
const modules=new Set(['daybook','hq-time','afc','electrical-inspections','inventory','jobs','estimates','employees','vehicles','tools','documents','reports','accounting','eos','silas','panel-directory']);
let rows=[];
for(const r of declarations.values()){
 if(protectedNames.test(r.name)||['tool_addons','tool_addon_access','northgate_tool_reads'].includes(r.name))continue;
 const consumers=sources.filter(s=>s.text.includes("'"+r.name+"'")||s.text.includes('"'+r.name+'"')).map(s=>s.file);
 const candidates=[...new Set(consumers.map(f=>f.match(/^src\/modules\/([^/]+)\//)?.[1]).map(m=>['service-calls','service-performance'].includes(m)?'jobs':m).filter(m=>modules.has(m)))];
 const owner=moduleForName(r.name) || (candidates.length===1?candidates[0]:null);
 if(!owner)continue;
 rows.push({...r,module:owner,consumers});
}
rows.sort((a,b)=>(a.kind+':'+a.name).localeCompare(b.kind+':'+b.name));
fs.writeFileSync('tests/fixtures/toolAvailabilityResourceMap.json',JSON.stringify(rows,null,2)+'\n');
const sql='INSERT INTO hq_tool_private.resource_map(resource_kind,resource_name,module_key) VALUES\n'+rows.map(r=>` ('${r.kind}','${r.name}','${r.module}')`).join(',\n')+';';
let migrationSql=fs.readFileSync(migration,'utf8').replace(/-- RESOURCE_MAP_BEGIN:[\s\S]*?-- RESOURCE_MAP_END/,'-- RESOURCE_MAP_BEGIN: generated from source/migration inventory; verify hosted coverage before activation.\n'+sql+'\n-- RESOURCE_MAP_END');
fs.writeFileSync(migration,migrationSql);
console.log(JSON.stringify({resources:rows.length,rpcs:rows.filter(r=>r.kind==='rpc').length,tables:rows.filter(r=>r.kind==='table').length,byModule:Object.fromEntries([...modules].map(m=>[m,rows.filter(r=>r.module===m).length]))}));
