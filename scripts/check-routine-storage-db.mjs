import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function checkRoutineStorage(db){
 const q=(sql,args=[])=>db.query(sql,args);
 const one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
 const actor=async(name)=>{await db.exec('reset role');await q("select set_config('test.actor',$1,false)",[name]);await db.exec('set role authenticated');};
 await db.exec('reset role');
 const protectedNames=['prepare_storage_location_deletion','permanently_delete_storage_location','restore_retired_bin_assignment','set_developer_data_correction'];
 const definitions=await q('select proname,pg_get_functiondef(oid) definition from pg_proc where proname=any($1::text[]) order by proname',[protectedNames]);
 await db.exec(await readFile('supabase/migrations/20260916125643_inventory_creation_details.sql','utf8'));
 // This isolated inventory fixture intentionally lacks the other application modules.
 // Execute the production transformation unchanged, selecting its inventory entries only.
 let sql=(await readFile('supabase/migrations/20260916125644_routine_audit_notes.sql','utf8')).split('-- Linking/assigning')[0];
 const names=['edit_inventory_location','set_inventory_location_archived','save_material_alias','map_material_to_inventory_bin','retire_bin_item'];
 sql=sql.replace(/  \('([^']+)'[^\n]+\n/g,(line,name)=>names.includes(name)?line:'').replace(/,\s*\) AS functions/, '\n ) AS functions');
 // retirement is a legacy RPC absent from the minimal fixture; exercise declaration
 // initialization with its actual production function in the generic compatibility test.
 sql=sql.replace(/  \('retire_bin_item'[^\n]+\n/,'').replace(/,\s*\) AS functions/,'\n ) AS functions');
 await db.exec(sql);
 assert.deepEqual((await q('select proname,pg_get_functiondef(oid) definition from pg_proc where proname=any($1::text[]) order by proname',[protectedNames])).rows,definitions.rows);
 await actor('manager');
 const request=crypto.randomUUID();
 const create=(id,kind,parent,code,details={})=>one('select create_inventory_location($1,$2,$3,$4,$5,$6,0,NULL,$7)',[id,kind,parent,code,'Routine fixture','Electrical',details]);
 const unit=await create(request,'unit',null,'ROUTINE',{physical_location:'North wall',materials_summary:'Fittings'});
 assert.equal((await create(request,'unit',null,'ROUTINE',{physical_location:'North wall',materials_summary:'Fittings'})).replayed,true);
 await assert.rejects(()=>create(request,'unit',null,'ROUTINE',{physical_location:'Changed'}),/different location details/);
 const shelf=await create(crypto.randomUUID(),'shelf',unit.id,'S');
 const raw=await one('select to_jsonb(s) from shelves s where id=$1',[shelf.id]);
 assert.equal(raw.physical_location,null);
 const updated=await one("select edit_inventory_location('shelf',$1,'S','New name',0,1,NULL,$2,$3)",[shelf.id,{physical_location:null,materials_summary:'Tools'},unit.id]);
 assert.equal(updated.materials_summary,'Tools');
 await one("select set_inventory_location_archived('shelf',$1,true,NULL)",[shelf.id]);
 await one("select set_inventory_location_archived('shelf',$1,false,NULL)",[shelf.id]);
 await assert.rejects(()=>one("select edit_inventory_location('shelf',$1,'S','Stale',0,1,NULL,'{}',NULL)",[shelf.id]),/changed/);
 await db.exec('reset role');
 const item=await one("insert into items(material_code,name,price_per_unit,division)values('ROUTINE-MATERIAL','Routine material',2,'Electrical')returning id");
 await actor('manager');
 const alias=await one('select save_material_alias($1,$2,false,NULL)',[item,'routine alias']);
 assert.ok(alias.id);
 const bay=await create(crypto.randomUUID(),'bay',shelf.id,'B');
 const bin=await create(crypto.randomUUID(),'bin',bay.id,'N');
 const mapped=await one('select map_material_to_inventory_bin($1,$2,NULL)',[bin.id,item]);
 assert.ok(mapped.bin_item_id);
 await db.exec('reset role');
 assert.equal(await one('select count(*)::int from transaction_items where bin_item_id=$1',[mapped.bin_item_id]),0);
 assert.equal(await one('select count(*)::int from inventory_balances where bin_item_id=$1',[mapped.bin_item_id]),0);
 const audits=(await q('select * from change_logs where record_id=any($1::text[]) order by created_at',[[unit.id,shelf.id]])).rows;
 assert.equal(audits.filter(a=>a.record_id===unit.id&&a.action==='create').length,1);
 assert.ok(audits.every(a=>a.user_id==='manager'&&a.note.startsWith('Automatic audit:')));
 assert.equal(audits.find(a=>a.record_id===unit.id).after_data.physical_location,'North wall');
 assert.equal(await one("select has_function_privilege('anon','public.create_inventory_location(uuid,text,uuid,text,text,text,integer,text,jsonb)','execute')"),false);
 await actor('denied');await assert.rejects(()=>create(crypto.randomUUID(),'unit',null,'DENIED'),/permission/i);
 await actor('manager');await assert.rejects(()=>create(crypto.randomUUID(),'unit',null,'BAD',{bad:'x'}),/details/);
 // No partial location insert can survive an audit failure.
 await db.exec('reset role;CREATE TRIGGER fail_routine_audit BEFORE INSERT ON change_logs FOR EACH ROW EXECUTE FUNCTION fail_phase1_audit()');
 await actor('manager');const failed=crypto.randomUUID();
 await assert.rejects(()=>create(failed,'unit',null,'ROLLBACK-ROUTINE'),/Synthetic audit failure/);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from storage_units where id=$1',[failed]),0);
 await db.exec('DROP TRIGGER fail_routine_audit ON change_logs');
 console.log('PASS: routine storage details, inheritance marker, reason-free edit/archive/restore, audit actor/snapshots, replay/conflict, stale/permission/validation checks, rollback, unchanged protected RPCs.');
}
