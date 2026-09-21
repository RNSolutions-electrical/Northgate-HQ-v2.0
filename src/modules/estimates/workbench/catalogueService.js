export const catalogueFields='id,material_code,name,description,unit_of_measure,division,price_per_unit,price_confirmed,estimating_price_per_unit,inventory_price_per_unit,effective_price_source,estimating_price_updated_at,inventory_price_updated_at,vendor_prices,neca_labor_input,catalogue_notes,catalogue_draft,labor_rate_hrs,labor_value_source,updated_at,broad_category,sub_category,sub_category_2,sub_category_3,sub_category_4,size,length,manufacturer,manufacturer_sub,item_aliases(id,alias,archived_at)';
export function catalogueMaterial(row){
 const source=row.effective_price_source||(row.price_confirmed||Number(row.price_per_unit)>0?'legacy_catalogue':'unverified');
 const sourceUpdatedAt=source==='inventory_explicit'?row.inventory_price_updated_at:source==='estimating_master'?row.estimating_price_updated_at:row.updated_at;
 return {...row,unit:row.unit_of_measure||'EA',price:row.price_confirmed||Number(row.price_per_unit)>0?Number(row.price_per_unit):null,
  priceSource:source,priceSourceUpdatedAt:sourceUpdatedAt||null,
  hours:row.labor_rate_hrs==null?null:Number(row.labor_rate_hrs),
  keywords:[row.material_code,row.description,row.broad_category,row.sub_category,row.sub_category_2,row.sub_category_3,row.sub_category_4,row.size,row.length,row.manufacturer,row.manufacturer_sub].filter(Boolean).join(' ')};
}
export function cataloguePriceSnapshot(material,at=new Date().toISOString()){
 return {priceSource:material?.priceSource||'unverified',priceSourceUpdatedAt:material?.priceSourceUpdatedAt||null,priceSnapshotAt:at};
}
export async function loadCatalogue(client){
 const rows=[];
 for(let from=0;;from+=1000){
  const {data,error}=await client.from('items').select(catalogueFields).eq('is_active',true).eq('is_archived',false).eq('estimating_enabled',true).order('name').order('id').range(from,from+999);
  if(error)throw error;rows.push(...data);
  if(data.length<1000)return rows.map(catalogueMaterial);
 }
}
export function catalogueChanges(lines,materials){
 const patches=new Map();
 for(const line of lines){
  if(!line.catalogueId)continue;
  const material=materials.find(m=>m.id===line.catalogueId);
  if(!material)throw new Error('Linked material is unavailable. Reload the catalogue before saving.');
  if(line.unit!==material.unit)throw new Error('Catalogue updates require the original material unit.');
  const changes={};
  for(const [field,key,changed] of [['price','price_per_unit',line.priceOverride],['hours','labor_rate_hrs',line.laborOverride]]){
   if(!changed||line[field]==null||line[field]==='')continue;
   const value=Number(line[field]);if(!Number.isFinite(value)||value<0)throw new Error('Enter a valid nonnegative price or labor value.');
   changes[key]=value;
  }
  if(!Object.keys(changes).length)continue;
  const prior=patches.get(material.id);
  if(prior&&Object.keys(changes).some(k=>k in prior.changes&&prior.changes[k]!==changes[k]))throw new Error('This material has conflicting values in the assembly. Save project-only or use matching catalogue values.');
  patches.set(material.id,{item_id:material.id,expected_updated_at:material.updated_at,changes:{...prior?.changes,...changes}});
 }
 return [...patches.values()];
}
export async function loadAssemblyLibrary(client){
 const rows=[];
 for(let from=0;;from+=500){
  const {data,error}=await client.from('assemblies')
   .select('id,name,division,unit,description,category,categories,component_groups,updated_at,assembly_items(id,item_id,description,quantity,waste_percent,unit,unit_cost_snapshot,unit_cost_source,unit_cost_source_updated_at,unit_cost_snapshotted_at,labor_rate_hrs_snapshot,note,archived_at,stage,fixed_quantity,price_missing,labor_missing,sort_order,component_group_id)')
   .eq('is_library_item',true).is('archived_at',null).order('id').range(from,from+499);
  if(error)throw error;rows.push(...data);
  if(data.length<500)break;
 }
 return rows.map(a=>({id:a.id,libraryId:a.id,division:a.division,components:a.component_groups||undefined,categories:a.categories??(a.category?[a.category]:[]),updatedAt:a.updated_at,name:a.name,notes:a.description||'',qty:1,kind:'Assembly',status:'Not started',lines:(a.assembly_items||[]).filter(l=>!l.archived_at).sort((a,b)=>a.sort_order-b.sort_order).map(l=>({
  id:l.id,componentId:l.component_group_id||undefined,libraryLineId:l.id,catalogueId:l.item_id||'',name:l.description,qty:Number(l.quantity)*(1+Number(l.waste_percent||0)/100),unit:l.unit||'EA',
  price:l.price_missing?null:Number(l.unit_cost_snapshot),priceSource:l.unit_cost_source||'legacy_snapshot',priceSourceUpdatedAt:l.unit_cost_source_updated_at||null,priceSnapshotAt:l.unit_cost_snapshotted_at||null,
  hours:l.labor_missing?null:Number(l.labor_rate_hrs_snapshot),stage:l.stage||'Rough-in',fixed:l.fixed_quantity||false,notes:l.note||''
 }))}));
}
