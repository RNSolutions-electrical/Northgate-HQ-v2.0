import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function checkStorageDeletion(db){
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
 const actor=async name=>{await db.exec('reset role');await q("select set_config('test.actor',$1,false)",[name]);await db.exec('set role authenticated');};
 const create=(kind,parent,code)=>one('select create_inventory_location($1,$2,$3,$4,$5,$6,0,$7)',[crypto.randomUUID(),kind,parent,code,'Delete test','Electrical','Synthetic only']);
 const archive=(kind,id)=>one('select set_inventory_location_archived($1,$2,true,$3)',[kind,id,'Synthetic archive']);
 const prepare=(kind,id,reason='Remove unused fixture',initials='RN')=>one('select prepare_storage_location_deletion($1,$2,$3,$4)',[kind,id,reason,initials]);
 const remove=(backup,code=backup.code,confirmed=true)=>one('select permanently_delete_storage_location($1,$2,$3)',[backup.backup_id,code,confirmed]);
 await db.exec('reset role;drop trigger fail_phase1_audit on change_logs');
 await db.exec('CREATE TABLE inventory_cart_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bin_item_id uuid REFERENCES bin_items,destination_id text)');
 await db.exec(await readFile('supabase/migrations/20260915161130_inventory_storage_safe_delete.sql','utf8'));
 await q("insert into user_permissions(clerk_user_id,role,division)values('deleter','Developer','Electrical'),('otherdev','Developer','Electrical'),('director','Director','Electrical')");
 await actor('deleter');
 const root=await create('unit',null,'DELETE-ROOT');
 await assert.rejects(()=>prepare('unit',root.id),/Archive this location/);await archive('unit',root.id);
 for(const who of ['manager','super','director','user','inactive']){await actor(who);await assert.rejects(()=>prepare('unit',root.id),/Active Developer/);}
 await actor('deleter');
 await db.exec('reset role');await q("update user_permissions set permission_overrides='{\"can_access_developer\":false}' where clerk_user_id='deleter'");await actor('deleter');await assert.rejects(()=>prepare('unit',root.id),/Active Developer/);await db.exec('reset role');await q("update user_permissions set permission_overrides='{}' where clerk_user_id='deleter'");await actor('deleter');
 for(const args of [['','RN'],['Reason',''],['Reason','123'],['x'.repeat(2001),'RN']])await assert.rejects(()=>prepare('unit',root.id,...args),/reason.*initials/);
 const backup=await prepare('unit',root.id);assert.equal(backup.record.id,root.id);assert.equal(backup.prepared_by,'deleter');assert.equal(backup.initials,'RN');assert.ok(backup.audit_history.length>=2);
 await assert.rejects(()=>remove(backup,'WRONG'),/exact location code/);await assert.rejects(()=>remove(backup,backup.code,false),/saved the backup/);
 await actor('otherdev');await assert.rejects(()=>remove(backup),/fresh backup using this Developer/);
 await actor('manager');await assert.rejects(()=>remove(backup),/Active Developer/);
 await actor('deleter');await assert.rejects(()=>q('delete from storage_units where id=$1',[root.id]),/permission denied/);
 assert.equal((await remove(backup)).deleted,true);assert.equal((await remove(backup)).replayed,true);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from storage_units where id=$1',[root.id]),0);
 assert.equal(await one("select count(*)::int from change_logs where record_id=$1 and action='delete'",[root.id]),1);
 assert.equal((await one('select after_data from change_logs where id=$1',[backup.backup_id])).record.id,root.id);
 await actor('deleter');const reused=await create('unit',null,'DELETE-ROOT');assert.notEqual(reused.id,root.id);
 // Every hierarchy level, without cascading to parents; archived children still block.
 const shelf=await create('shelf',reused.id,'S'),bay=await create('bay',shelf.id,'B'),bin=await create('bin',bay.id,'N');
 await archive('bin',bin.id);await archive('bay',bay.id);await archive('shelf',shelf.id);await archive('unit',reused.id);
 for(const [kind,id] of [['unit',reused.id],['shelf',shelf.id],['bay',bay.id]])await assert.rejects(()=>prepare(kind,id),/referenced by/);
 for(const [kind,id] of [['bin',bin.id],['bay',bay.id],['shelf',shelf.id]]){const b=await prepare(kind,id);assert.ok(b.ancestors.length);await remove(b);}
 const stale=await prepare('unit',reused.id);
 await db.exec('reset role');await q('update storage_units set revision=revision+1 where id=$1',[reused.id]);await actor('deleter');await assert.rejects(()=>remove(stale),/changed since backup/);
 const fresh=await prepare('unit',reused.id);
 await db.exec("reset role;CREATE FUNCTION fail_storage_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='delete' THEN RAISE EXCEPTION 'Synthetic delete audit failure';END IF;RETURN NEW;END$$;CREATE TRIGGER fail_storage_delete_audit BEFORE INSERT ON change_logs FOR EACH ROW EXECUTE FUNCTION fail_storage_delete_audit()");
 await actor('deleter');await assert.rejects(()=>remove(fresh),/Synthetic delete audit failure/);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from storage_units where id=$1',[reused.id]),1);await db.exec('drop trigger fail_storage_delete_audit on change_logs');await actor('deleter');await remove(fresh);
 // Archived zero-quantity material binding is still a hard block.
 const u=await create('unit',null,'DELETE-BLOCK'),s=await create('shelf',u.id,'S'),b=await create('bay',s.id,'B'),n=await create('bin',b.id,'N');
 await db.exec('reset role');const item=await one('select id from items limit 1');const binding=await one('insert into bin_items(bin_id,item_id,min_quantity,archived_at)values($1,$2,0,now())returning id',[n.id,item]);
 await q('insert into inventory_balances(bin_item_id,quantity)values($1,0)',[binding]);await actor('deleter');await archive('bin',n.id);await assert.rejects(()=>prepare('bin',n.id),/referenced by public.bin_items/);
 // A newly introduced FK is blocked too; even ON DELETE CASCADE cannot bypass the guard.
 const lone=await create('unit',null,'FUTURE-REF');await archive('unit',lone.id);
 await db.exec('reset role;CREATE TABLE future_location_ref(id uuid PRIMARY KEY,unit_id uuid REFERENCES storage_units ON DELETE CASCADE)');await q('insert into future_location_ref values($1,$2)',[crypto.randomUUID(),lone.id]);await actor('deleter');await assert.rejects(()=>prepare('unit',lone.id),/referenced by public.future_location_ref/);
 // Legacy polymorphic cart/history and retained audit snapshots block deletion.
 const soft=await create('unit',null,'SOFT-REF');await archive('unit',soft.id);const softBackup=await prepare('unit',soft.id);
 await db.exec('reset role');await q('insert into inventory_cart_items(destination_id)values($1)',[soft.id]);await actor('deleter');await assert.rejects(()=>remove(softBackup),/transaction, cart or material history/);
 await db.exec('reset role');await q('delete from inventory_cart_items where destination_id=$1',[soft.id]);await q("insert into change_logs(table_name,record_id,action,after_data)values('transaction_items',$1,'create',$2)",[crypto.randomUUID(),{destination_id:soft.id}]);await actor('deleter');await assert.rejects(()=>prepare('unit',soft.id),/history/);
 await db.exec('reset role');
 for(const signature of ['prepare_storage_location_deletion(text,uuid,text,text)','permanently_delete_storage_location(uuid,text,boolean)','storage_location_deletion_snapshot(text,uuid)'])assert.equal(await one("select has_function_privilege('anon',$1,'execute')",['public.'+signature]),false);
 assert.equal(await one("select has_function_privilege('authenticated','public.storage_location_deletion_snapshot(text,uuid)','execute')"),false);
 await actor('deleter');await assert.rejects(()=>q('select * from change_logs'),/permission denied/);
 console.log('PASS: safe deletion role/active/reason/initial/code/download/backup-owner gates; all hierarchy levels; archive-only; archived children/materials/zero stock/new FK/cart/audit history blockers; stale backup; no cascade; backup/audit survival; code reuse with new UUID; retry idempotency; audit-failure rollback; anonymous/direct-delete/direct-audit denial.');
}
