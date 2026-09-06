const getToken = async () => 'fixture';
const user = { fullName: 'Fixture' };
export const useAuth = () => ({ getToken });
export const useUser = () => ({ user });
let rows = [
  { id:'t1',tool_number:'T-001', name:'Hammer drill', category:'Drills', model:'DCD999', brand:'DeWalt', serial_number:'SERIAL1', division:'Electrical', status:'active', condition:'good' },
  { id:'t2',tool_number:'T-002', name:'Long model tool', category:'Testing equipment', model:'VeryLongModelIdentifier12345678901234567890',division:'Electrical',status:'missing',condition:'fair' },
];
rows = rows.map(row => ({...row,updated_at:'2026-09-06T00:00:00Z'}));
window.toolsFixture = { failNext: false, calls: [] };
export function createSupabaseClient() { return {
  from(table) {
    let payload, action, id;
    const q = {
      select() {return this;},order(){return this;},eq(key,value){if(key==='id')id=value;return this;},single(){return this;},
      insert(value){payload=value;action='insert';return this;},update(value){payload=value;action='update';return this;},
      then(resolve) {
        if (!action) return Promise.resolve({data:[...rows]}).then(resolve);
        window.toolsFixture.calls.push({table,action,payload,id});
        if(window.toolsFixture.failNext){window.toolsFixture.failNext=false;return Promise.resolve({error:{message:'Fixture save rejected'}}).then(resolve);}
        const row=action==='insert'?{id:`t${rows.length+1}`,...payload}:{...rows.find(row=>row.id===id),...payload};
        rows=action==='insert'?[...rows,row]:rows.map(item=>item.id===id?row:item);
        return Promise.resolve({data:row}).then(resolve);
      },
    }; return q;
  },
  async rpc(name,args){
    window.toolsFixture.calls.push({name,args});
    if(name!=='save_tool_catalogue') return {data:[]};
    if(window.toolsFixture.failNext){window.toolsFixture.failNext=false;return {error:{message:'Fixture save rejected'}};}
    const old=rows.find(row=>row.id===args.p_tool_id);
    const row={...(old||{id:`t${rows.length+1}`,division:args.p_division}),...args.p_changes,updated_at:new Date().toISOString()};
    if(args.p_action==='archive') row.archived_at=new Date().toISOString();
    if(args.p_action==='restore') row.archived_at=null;
    rows=old?rows.map(item=>item.id===row.id?row:item):[...rows,row];
    return {data:row};
  },
}; }
