const catalog = [
  { id: 'i1', name: 'EMT connector', material_code: 'EMT34', size: '3/4', manufacturer: 'Acme', unit_of_measure: 'EA', price_per_unit: 2 },
  { id: 'i2', name: 'Lighting panel', material_code: 'LP1', unit_of_measure: 'EA' },
  { id: 'i3', name: 'Copper wire', material_code: 'CW', unit_of_measure: 'FT', price_per_unit: 1 },
];
const stock = [
  { bin_item_id: 's1', item_id: 'i1', bin_id: 'b1', bin_code: 'A1', bin_label: 'Storage room', item_name: 'EMT connector', material_code: 'EMT34', quantity_on_hand: 20, unit_of_measure: 'EA', price_per_unit: 2 },
  { bin_item_id: 's2', item_id: 'i1', bin_id: 'b2', bin_code: 'VAN1', bin_label: 'Van 1', item_name: 'EMT connector', quantity_on_hand: 5, unit_of_measure: 'EA', price_per_unit: 2 },
  { bin_item_id: 's3', item_id: 'i3', bin_id: 'b1', bin_code: 'A1', bin_label: 'Storage room', item_name: 'Copper wire', quantity_on_hand: 0, unit_of_measure: 'FT' },
];
if (new URLSearchParams(location.search).has('large')) for (let i = 0; i < 1001; i++) stock.push({ ...stock[0], bin_item_id: `large${i}`, item_id: `material${i}`, item_name: `Extra material ${i}` });
let cart = null, items = [];
const locationMode = new URLSearchParams(location.search).has('locations');
const fixtureRole=new URLSearchParams(location.search).get('role')||'Manager';
const phase1Mode=new URLSearchParams(location.search).has('phase1');
const hierarchy = {
 storage_units:[{id:'u1',unit_code:'SHOP',name:'Electrical shop',division:'Electrical'},{id:'u2',unit_code:'CON',name:'Construction shop',division:'Construction'}],
 shelves:[{id:'h1',unit_id:'u1',shelf_code:'S1',label:'Shelf 1'},{id:'h2',unit_id:'u2',shelf_code:'S1',label:'Shelf 1'}],
 bays:[{id:'a1',shelf_id:'h1',bay_code:'A',label:'Bay A'},{id:'a2',shelf_id:'h2',bay_code:'A',label:'Bay A'}],
 bins:[{id:'b1',bay_id:'a1',bin_code:'A1',label:'Storage room'},{id:'b2',bay_id:'a2',bin_code:'VAN1',label:'Construction stock'}],
};
if(locationMode) {
 for(let i=0;i<250;i++)catalog.push({id:`extra${i}`,name:`Extra material ${i}`,material_code:`ZZ${i}`});
 for(const item of catalog) {item.is_active=true;item.is_archived=false;item.division='Electrical';item.item_aliases=[];}
}
for(const rows of Object.values(hierarchy))for(const row of rows){row.revision=1;row.archived_at=null;}
if(new URLSearchParams(location.search).has('safeDelete'))hierarchy.shelves.push({id:'archivedShelf',unit_id:'u1',shelf_code:'OLD',label:'Archived empty shelf',revision:2,archived_at:'2026-09-15T00:00:00Z',archive_reason:'Unused'});
if(phase1Mode){catalog[0].item_aliases=[{id:'alias1',alias:'Greenfield',archived_at:null}];stock[2].quantity_recorded=false;}
if(new URLSearchParams(location.search).has('largeLocations'))for(let i=0;i<1001;i++)hierarchy.bins.push({id:`extraBin${i}`,bay_id:'a1',bin_code:`EXTRA${i}`,label:`Extra bin ${i}`});
window.inventoryFixture = { calls: [], failNext: false };
const getToken = async () => 'fixture-token';
const user = { fullName: 'Fixture Employee' };
export const useAuth = () => ({ getToken });
export const useUser = () => ({ user });
export const usePermissions = () => ({ permissionSource: 'server', canInventoryTransactions: true, canManageInventory: locationMode&&fixtureRole!=='User',canEditCatalog:locationMode&&fixtureRole==='Manager',canArchiveRecords:locationMode&&['Manager','Developer'].includes(fixtureRole),canAccessDeveloper:fixtureRole==='Developer'&&!new URLSearchParams(location.search).has('denyDeveloper'),role:fixtureRole,division:'Electrical' });
export function createSupabaseClient() { return {
  from(table) {
    let range = null, head = false, nullFields=[];
    const query = {
      select(columns, options) { head = options?.head; return this; }, eq() { return this; }, gt() { return this; }, order() { return this; }, limit() { return this; },
      is(field,value){if(value===null)nullFields.push(field);return this;},
      range(from, to) { range = [from, to]; window.inventoryFixture.calls.push({ table, range }); return this; },
      then(resolve) {
        const source = table === 'items' ? catalog : table === 'inventory_cart_candidates_view' ? stock : table === 'inventory_destination_vehicles_view' ? [{ id: 'van1', vehicle_number: 'Van 1', holds_stock: true }] : locationMode ? hierarchy[table] || [] : [];
        const data=source.filter(row=>nullFields.every(field=>row[field]==null));
        return Promise.resolve({ data: head ? null : structuredClone(range ? data.slice(range[0], range[1] + 1) : data), count: data.length, error: null }).then(resolve);
      },
    };
    return query;
  },
  async rpc(name, args) {
    window.inventoryFixture.calls.push({ name, args });
    if (window.inventoryFixture.failNext) { window.inventoryFixture.failNext = false; return { data: null, error: { message: 'Fixture stock changed. Retry.' } }; }
    if(name==='create_inventory_location') {
     await new Promise(resolve=>setTimeout(resolve,80));
     const [table,parent,code,label]={
      unit:['storage_units',null,'unit_code','name'],shelf:['shelves','unit_id','shelf_code','label'],bay:['bays','shelf_id','bay_code','label'],bin:['bins','bay_id','bin_code','label'],
     }[args.p_kind];
     if(hierarchy[table].some(row=>row[code]===args.p_code&&(!parent||row[parent]===args.p_parent_id)))return {error:{message:'That location code already exists under this parent.'}};
     hierarchy[table].push({id:args.p_request_id,[code]:args.p_code,[label]:args.p_label,...(parent?{[parent]:args.p_parent_id}:{division:args.p_division}),position:args.p_position,...args.p_details,revision:1,archived_at:null});
     return {data:{id:args.p_request_id,kind:args.p_kind,code:args.p_code,label:args.p_label,division:args.p_division}};
    }
    if(name==='prepare_storage_location_deletion'){
     if(window.inventoryFixture.blockDeletion)return {error:{message:'Cannot permanently delete: referenced by public.bin_items. Archived material links must be preserved.'}};
     const record=hierarchy.shelves.find(row=>row.id===args.p_id),backup={backup_id:crypto.randomUUID(),code:record.shelf_code,record:structuredClone(record),reason:args.p_reason,initials:args.p_initials};window.inventoryFixture.backup=backup;return {data:backup};
    }
    if(name==='permanently_delete_storage_location'){
     const id=window.inventoryFixture.backup.record.id;hierarchy.shelves=hierarchy.shelves.filter(row=>row.id!==id);return {data:{id,deleted:true}};
    }
    if(name==='save_material_alias'){
     const item=catalog.find(row=>row.id===args.p_item_id);
     let row=item.item_aliases.find(row=>row.alias.toLowerCase()===args.p_alias.toLowerCase());
     if(!row){row={id:crypto.randomUUID(),alias:args.p_alias};item.item_aliases.push(row);}
     row.archived_at=args.p_archived?new Date().toISOString():null;return {data:structuredClone(row)};
    }
    if(name==='edit_inventory_location'||name==='set_inventory_location_archived'){
     const [table,code,label]={unit:['storage_units','unit_code','name'],shelf:['shelves','shelf_code','label'],bay:['bays','bay_code','label'],bin:['bins','bin_code','label']}[args.p_kind];
     const row=hierarchy[table].find(row=>row.id===args.p_id);
     if(name==='edit_inventory_location'){
      if(row.revision!==args.p_expected_revision)return {error:{message:'Location changed. Refresh and review.'}};
      Object.assign(row,{[code]:args.p_code,[label]:args.p_label,position:args.p_position});
      Object.assign(row,args.p_details||{});
      if(args.p_parent_id)row[{shelf:'unit_id',bay:'shelf_id',bin:'bay_id'}[args.p_kind]]=args.p_parent_id;
     }else{
      if(args.p_archived&&args.p_kind==='bin'&&stock.some(s=>s.bin_id===row.id))return {error:{message:'Location has active child locations or material links.'}};
      row.archived_at=args.p_archived?new Date().toISOString():null;row.archive_reason=args.p_reason;
     }
     row.revision++;return {data:structuredClone(row)};
    }
    if(name==='map_material_to_inventory_bin'){
     const item=catalog.find(row=>row.id===args.p_item_id),bin=hierarchy.bins.find(row=>row.id===args.p_bin_id);
     const id=crypto.randomUUID();stock.push({bin_item_id:id,item_id:item.id,bin_id:bin.id,bin_code:bin.bin_code,item_name:item.name,material_code:item.material_code,quantity_on_hand:0,quantity_recorded:false,min_quantity:0,unit_of_measure:'EA'});
     return {data:{bin_item_id:id,created:true}};
    }
    if(name==='intake_inventory_count') {
     const item=catalog.find(row=>row.id===args.p_item_id),bin=hierarchy.bins.find(row=>row.id===args.p_bin_id);
     stock.push({bin_item_id:'intake1',item_id:item.id,bin_id:bin.id,bin_code:bin.bin_code,bin_label:bin.label,item_name:item.name,quantity_on_hand:args.p_counted_quantity,unit_of_measure:'EA'});
     return {data:[{bin_item_id:'intake1',quantity_on_hand:args.p_counted_quantity,counted_quantity:args.p_counted_quantity,variance:args.p_counted_quantity}]};
    }
    if(name==='set_inventory_count_quantity') {const row=stock.find(row=>row.bin_item_id===args.p_bin_item_id);row.quantity_on_hand=args.p_target_quantity;row.quantity_recorded=true;return {data:[{quantity_on_hand:args.p_target_quantity}]};}
    if (name === 'open_inventory_cart') { if (!cart || cart.status !== 'active') { cart = { cart_id: 'cart1', status: 'active' }; items = []; } return { data: cart }; }
    if (name === 'read_inventory_cart_items') return { data: [...items] };
    if (name === 'add_inventory_cart_item') {
      const row = stock.find(row => row.bin_item_id === args.p_bin_item_id);
      const existing = items.find(item => item.bin_item_id === row.bin_item_id);
      if (existing) existing.quantity += args.p_quantity;
      else items.push({ ...row, cart_item_id: `line${items.length}`, quantity: args.p_quantity });
      return { data: null };
    }
    if (name === 'remove_inventory_cart_item') { items = items.filter(item => item.cart_item_id !== args.p_cart_item_id); return { data: { removed: true } }; }
    if (name === 'finalize_inventory_cart') { cart = { ...cart, status: 'checked_out' }; const count = items.length; items = []; return { data: { status: 'checked_out', transaction_item_count: count } }; }
    return { data: [] };
  },
}; }
