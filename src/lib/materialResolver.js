// Shared catalogue resolver. It returns candidates, never a write or implicit selection.
// Keep punctuation in exact matching: fractional sizes / catalogue identifiers matter.
export const materialAliases = item => (item.item_aliases ?? []).filter(a => !a.archived_at).map(a => a.alias);
const exact = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeMaterialText = value => exact(value).normalize('NFKC').replace(/[“”]/g, '"').replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}/.]+/gu, ' ').trim().replace(/\s+/g, ' ');
const identifiers = item => [item.id, item.item_id, item.material_code, item.catalogue_number, item.catalog_number, item.manufacturer_part_number, item.mpn, item.vendor_sku].filter(Boolean);
const searchable = item => [...identifiers(item), item.name, item.item_name, item.description, item.keywords, item.unit, item.unit_of_measure, item.size, item.length, item.manufacturer, item.manufacturer_sub, item.broad_category, item.sub_category, item.sub_category_2, item.sub_category_3, item.sub_category_4, item.division, item.locationText, ...materialAliases(item)].filter(Boolean);
function distance(a, b) {
 if (Math.abs(a.length-b.length)>2) return 3;
 let prior=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));prior=next;}
 return prior[b.length];
}
export function resolveMaterials(items, query, {fuzzy=true}={}) {
 const raw=exact(query), normalized=normalizeMaterialText(query), tokens=normalized.split(' ').filter(Boolean);
 const candidates=[];
 for(const item of items){
  const aliases=materialAliases(item), name=item.name||item.item_name||'';
  let rank=-1,match='';
  if(!raw){rank=5;match='browse';}
  else if(identifiers(item).some(value=>exact(value)===raw)){rank=0;match='identifier';}
  else if(exact(name)===raw){rank=1;match='name';}
  else if(aliases.some(value=>exact(value)===raw)){rank=2;match='alias';}
  else if(normalized){
   const haystack=searchable(item).map(normalizeMaterialText).join(' ');
   if(tokens.every(token=>haystack.includes(token))){rank=3;match='normalized';}
   else if(fuzzy && tokens.every(token=>haystack.includes(token)||token.length>=5&&/^[a-z]+$/.test(token)&&haystack.split(' ').some(word=>distance(token,word)<= (token.length>=8?2:1)))){rank=4;match='suggestion';}
  }
  if(rank>=0)candidates.push({item,rank,match});
 }
 candidates.sort((a,b)=>a.rank-b.rank||String(a.item.name||a.item.item_name||'').localeCompare(String(b.item.name||b.item.item_name||''))||String(a.item.id).localeCompare(String(b.item.id)));
 const best=candidates[0]?.rank;
 return {candidates,ambiguous:best!=null&&candidates.filter(c=>c.rank===best).length>1,requiresConfirmation:Boolean(raw&&candidates.length)};
}
export const searchMaterials = (items, query, options) => resolveMaterials(items,query,options).candidates.map(c=>c.item);

export function canEditMaterialAliases(permissions, department) {
 return permissions?.permissionSource==='server' && permissions.canEditCatalog===true && Boolean(department)
  && (['Developer','Director','Manager'].includes(permissions.role)||(permissions.department||permissions.division)===department);
}
