import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Runs against the existing isolated AFC/inspection dependency fixture, never production.
export async function verifyDocumentTags(db){
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const actor=async name=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:name,role:'authenticated'})]);await db.exec('set role authenticated');};
 // Add real CO relationship columns omitted by the original minimal AFC fixture.
 await db.exec("reset role;alter table change_orders add column job_id uuid references jobs(id),add column division text;alter table documents drop constraint documents_owner_type_check;alter table documents add constraint documents_owner_type_check check(owner_type in('job','estimate','change_order','health_inspection','afc_study'))");
 const job=await one("insert into jobs(name,division)values('Tag test','Electrical')returning id");
 const co=crypto.randomUUID();await db.query("insert into change_orders(id,job_id,division,status)values($1,$2,'Electrical','approved')",[co,job]);
 await actor('reviewer');
 const plain=await one("insert into documents(owner_type,owner_id,division,file_name,storage_path,document_type,document_section)values('job',$1,'Electrical','legacy.pdf','documents/test/legacy.pdf','plans','electrical')returning to_jsonb(documents)",[job]);
 await db.exec('reset role');
 await db.exec(await readFile('supabase/migrations/20260916112115_document_organization_tags.sql','utf8'));
 let checks=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
 const denied=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
 const row=async id=>one('select to_jsonb(documents) from documents where id=$1',[id]);
 const tag=(d,depts=['construction','electrical'],tags=[' Client   Approval ','client approval'])=>one('select to_jsonb(set_document_tags($1,$2,$3,$4,$5))',[d.id,depts,tags,d.updated_at,d.organization_version]);
 await actor('reviewer');let d=await row(plain.id);
 check(d.document_section,'electrical');check(d.department_tags,null);check(d.updated_at,plain.updated_at);
 const signed=await one("insert into documents(owner_type,owner_id,division,file_name,storage_path,document_type,change_order_id)values('job',$1,'Electrical','signed.pdf','documents/test/signed.pdf','change_orders',$2)returning to_jsonb(documents)",[job,co]);
 await db.exec('reset role');await db.query('update change_orders set signed_document_id=$1 where id=$2',[signed.id,co]);
 const coBefore=await one('select to_jsonb(change_orders) from change_orders where id=$1',[co]);
 const coOwned=await one("insert into documents(owner_type,owner_id,division,file_name,storage_path,document_type)values('change_order',$1,'Electrical','export.pdf','documents/test/co.pdf','change_orders')returning to_jsonb(documents)",[co]);
 await actor('reviewer');const changed=await tag(d);
 check(changed.department_tags,['construction','electrical']);check(changed.custom_tags,['client approval']);check(changed.organization_version,2);
 check((await tag(changed)).organization_version,2); // unchanged save is a no-op
 await denied(()=>tag(d),/changed/);
 await denied(()=>one('select set_document_section($1,$2,$3)',[changed.id,'general',changed.updated_at]),/multiple department tags/);
 await denied(()=>tag(changed,['invalid']),/supported departments/);
 await denied(()=>tag(changed,[],['x'.repeat(49)]),/1–48/);
 await denied(()=>tag(changed,[],Array.from({length:21},(_,i)=>''+i)),/at most 20/);
 const signedAfter=await tag(signed);
 const stripTags=r=>Object.fromEntries(Object.entries(r).filter(([key])=>!['department_tags','custom_tags','organization_version','document_section','updated_at'].includes(key)));
 check(stripTags(signedAfter),stripTags(signed));
 const ownedAfter=await tag(coOwned);check(ownedAfter.department_tags,['construction','electrical']);
 await denied(()=>db.query("update documents set department_tags='{general}' where id=$1",[signed.id]),/section workflow/);
 await denied(()=>db.query("update documents set storage_path='tampered' where id=$1",[signed.id]),/identity, owner and stored file/);
 await denied(()=>one('select maintain_owner_document($1,$2,$3,$4,$5,$6,$7)',[signed.id,'job',job,'edit',{file_name:'modified.pdf'},'Attempt signed edit',signedAfter.updated_at]),/Change Order/);
 await actor('other');await denied(()=>tag(signedAfter),/management authority/);
 await actor('outside');await denied(()=>tag(signedAfter),/management authority/);
 await actor('inactive');await denied(()=>tag(signedAfter),/Active sign-in/);
 await actor('reviewer');
 const cleared=await tag(changed,[],[]);check(cleared.department_tags,[]);check(cleared.document_section,null);
 const legacy=await one('select to_jsonb(set_document_section($1,$2,$3))',[cleared.id,'general',cleared.updated_at]);check(legacy.department_tags,['general']);
 await db.exec('reset role');
 check(await one('select to_jsonb(change_orders) from change_orders where id=$1',[co]),coBefore);
 const logs=(await db.query("select * from change_logs where record_id=$1 and note='Document organization tags updated'",[signed.id])).rows;
 check(logs.length,1);check(logs[0].user_id,'reviewer');check(logs[0].user_name,'Reviewer');check(!!logs[0].created_at,true);check(logs[0].before_data.department_tags,null);check(logs[0].after_data.department_tags,['construction','electrical']);
 check(await one("select has_function_privilege('anon','set_document_tags(uuid,text[],text[],timestamptz,integer)','execute')"),false);
 const beforeRollback=await row(signed.id);
 await db.exec("alter table change_logs add constraint fixture_fail_audit check(note is distinct from 'Document organization tags updated') not valid");
 await actor('reviewer');await denied(()=>tag(beforeRollback,['general']),/fixture_fail_audit/);
 await db.exec('reset role');check(await row(signed.id),beforeRollback);await db.exec('alter table change_logs drop constraint fixture_fail_audit');
 console.log('PASS: '+checks+' document-tag database assertions (permissions, signed/CO-owned organization, immutable content, stale version, normalization, legacy compatibility, audit and rollback).');
 return checks;
}
