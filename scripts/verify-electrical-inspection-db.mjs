import {PGlite} from '../.temp/inspection-checks/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {verifyReviewerManagement} from './verify-inspection-reviewer-management.mjs';
import {blankInspection,blankEquipment,blankReading,blankFinding} from '../src/modules/electrical-inspections/inspectionModel.js';
const db=new PGlite();let checks=0;
const query=async(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
const actor=async(name)=>{await db.exec('reset role');await query("select set_config('test.actor',$1,false)",[name]);await db.exec('set role authenticated');};
const denied=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
try{
 await db.exec(await readFile('tests/fixtures/inspectionPrerequisites.sql','utf8'));
 // SQL language function bodies have dependencies on definitions later in this snapshot.
 await db.exec('set check_function_bodies=off');await db.exec(await readFile('tests/fixtures/inspectionAuthFunctions.sql','utf8'));await db.exec('set check_function_bodies=on');
 await db.exec(await readFile('supabase/migrations/20260912134038_document_edit_restore.sql','utf8'));
 await db.exec('CREATE TRIGGER guard_document_audit_mutation BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_document_audit_mutation()');
 await db.exec(await readFile('supabase/migrations/20260914235450_electrical_inspection_workflow.sql','utf8'));checks++;
 await db.exec(await readFile('tests/fixtures/inspectionPermissionManagement.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260915000120_inspection_reviewer_permission_management.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260915000719_inspection_list_alias.sql','utf8'));
 await db.exec("insert into user_permissions(clerk_user_id,role,division,display_name)values('tech','User','Electrical','Test Technician'),('other','User','Electrical','Other Technician'),('reviewer','Manager','Electrical','Test Reviewer'),('outside','User','Construction','Outside User'),('inactive','Developer','Electrical','Inactive');update user_permissions set is_active=false where clerk_user_id='inactive';insert into tool_addon_access values('electrical_inspection','tech',true),('electrical_inspection','other',true),('electrical_inspection','reviewer',true),('electrical_inspection','outside',true);insert into user_permission_overrides(user_id,permission_flag,granted)values('reviewer','can_review_electrical_inspections',true);");
 await verifyReviewerManagement({db,query,one,actor,denied,assert});
 const job=await one("insert into jobs(name,job_number,division)values('Test Job','TEST-001','Electrical')returning id"),outsideJob=await one("insert into jobs(name,job_number,division)values('Outside','OTHER-001','Construction')returning id");
 const doc=blankInspection();doc.client.clientName='Example Facility';doc.client.siteAddress='100 Example Way';doc.visitDate='2026-09-14';doc.equipment=[blankEquipment()];doc.equipment[0].designator='P-1';doc.equipment[0].unassessedReason='No readings collected in this synthetic fixture';doc.assessment='Further assessment needed';doc.reviewSummary='Field observations reviewed.';
 const save=(id=null,version=null,document=doc,request=crypto.randomUUID(),extra=null)=>one('select hi_save($1,$2,$3,$4,$5,$6,false,$7)',[request,id,version,document,'Electrical',extra,'']);
 await actor('tech');assert.deepEqual(await one('select hi_read()'),[]);checks++;
 let saved=await save();const id=saved.id;assert.equal(saved.version,1);checks++;
 assert.equal((await one('select hi_read()'))[0].id,id);
 assert.equal((await one("select hi_read(NULL,'Example')")).length,1);
 assert.deepEqual(await one("select hi_read(NULL,'not-a-match')"),[]);
 assert.deepEqual(await one("select hi_read(NULL,'',true)"),[]);
 assert.deepEqual(await one("select hi_read(NULL,'',false,1)"),[]);
 await actor('other');assert.deepEqual(await one('select hi_read()'),[]);await actor('tech');checks+=6;
 const replay=crypto.randomUUID();saved=await save(id,1,doc,replay);assert.deepEqual(await save(id,1,doc,replay),saved);checks++;
 await denied(()=>save(id,1),/changed/);await denied(()=>save(id,2,{...doc,scope:'Changed'},replay),/replay differs/);
 await denied(()=>query('update health_inspections set division=$1 where id=$2',['Construction',id]),/permission denied/);
 const action=(type,data={},reason='Test reason',request=crypto.randomUUID())=>one('select hi_action($1,$2,$3,$4,$5,$6)',[request,id,saved.version,type,data,reason]);
 await actor('other');await denied(()=>one('select hi_read($1)',[id]),/unavailable/);await actor('outside');await denied(()=>one('select hi_read($1)',[id]),/unavailable/);await actor('inactive');await denied(()=>save(),/Active sign-in/);await actor('');await denied(()=>save(),/Active sign-in/);
 await actor('tech');await denied(()=>action('link',{job_id:outsideJob,confirmed_snapshot:true}),/outside authorized/);saved=await action('link',{job_id:job,confirmed_snapshot:true});checks++;
 const reading=blankReading('voltage');reading.value='0';reading.state='measured';doc.equipment[0].readings=[reading];saved=await save(id,saved.version);saved=await action('submit',{},'');await denied(()=>save(id,saved.version),/not editable/);await denied(()=>action('issue',{assessment:doc.assessment,reviewSummary:doc.reviewSummary}),/Reviewer/);
 await actor('reviewer');await denied(()=>action('issue',{assessment:doc.assessment,reviewSummary:doc.reviewSummary}),/conductor pair/);saved=await action('return');doc.equipment[0].readings[0].conductor='A-N';saved=await save(id,saved.version);
 // Evidence reservation survives retries and cannot be finalized without a real object.
 const fileId=crypto.randomUUID(),hash='a'.repeat(64),metadata={kind:'photo',file_name:'test.png',mime_type:'image/png',file_size_bytes:20,sha256:hash,equipment_id:doc.equipment[0].id,caption:'Test evidence'};
 const reserve=()=>one('select hi_file_reserve($1,$2,$3,$4)',[fileId,id,saved.version,metadata]);const file=await reserve();assert.deepEqual(await reserve(),file);checks++;
 await denied(()=>one('select hi_file_finish($1,$2)',[fileId,hash]),/missing/);
 saved=await action('submit',{},'');await denied(()=>action('issue',{assessment:doc.assessment,reviewSummary:doc.reviewSummary}),/pending uploads/);saved=await action('return');
 await query('insert into storage.objects(bucket_id,name,metadata)values($1,$2,$3)',['northgate-files',file.storage_path,{size:20,mimetype:'image/png'}]);await one('select hi_file_finish($1,$2)',[fileId,hash]);checks++;
 saved=await action('submit',{},'');saved=await action('issue',{assessment:doc.assessment,reviewSummary:doc.reviewSummary});const revision=saved.revision_id;assert.ok(revision);checks++;
 await denied(()=>query('delete from storage.objects where name=$1 returning name',[file.storage_path]).then(r=>{if(r.rows.length===0)throw Error('Protected');}),/Protected/);
 await denied(()=>one('select hi_file_archive($1,$2)',[fileId,'Remove evidence']),/unissued draft/);
 const before=await one('select hi_read($1)',[id]);saved=await action('revise');doc.conditions='Updated after issue';saved=await save(id,saved.version);const after=await one('select hi_read($1)',[id]);assert.deepEqual(before.revisions,after.revisions);checks++;
 // Actual metadata is visible to the linked job, while draft source remains scoped.
 const failedReportId=crypto.randomUUID();await one('select hi_file_reserve($1,$2,$3,$4)',[failedReportId,id,saved.version,{kind:'report',revision_id:revision,file_name:'failed.pdf',mime_type:'application/pdf',file_size_bytes:40,sha256:'e'.repeat(64)}]);await one('select hi_file_archive($1,$2)',[failedReportId,'Cancel incomplete upload']);checks++;
 const reportId=crypto.randomUUID(),report=await one('select hi_file_reserve($1,$2,$3,$4)',[reportId,id,saved.version,{kind:'report',revision_id:revision,file_name:'issued.pdf',mime_type:'application/pdf',file_size_bytes:50,sha256:'b'.repeat(64)}]);await query('insert into storage.objects(bucket_id,name,metadata)values($1,$2,$3)',['northgate-files',report.storage_path,{size:50,mimetype:'application/pdf'}]);await one('select hi_file_finish($1,$2)',[reportId,'b'.repeat(64)]);await denied(()=>one('select hi_file_archive($1,$2)',[reportId,'Cannot cancel published bytes']),/pending report/);
 await actor('other');assert.equal((await query('select id from documents where id=$1',[reportId])).rows.length,1);assert.equal((await query('select id from documents where id=$1',[fileId])).rows.length,0);checks++;
 await actor('reviewer');await denied(async()=>one('select maintain_owner_document($1,$2,$3,$4,$5,$6,$7)',[reportId,'job',job,'edit',{file_name:'changed.pdf',document_type:'misc'},'Try generic maintenance',await one('select updated_at from documents where id=$1',[reportId])]),/immutable/);
 await actor('reviewer');const register=(type,row=null,data={},action='save',requestId=crypto.randomUUID())=>one('select hi_job_register_save($1,$2,$3,$4,$5,$6,$7,$8)',[requestId,job,type,row?.id||null,row?.version||null,data,action,'Test register change']);
 let permit=await register('permit',null,{permit_number:'ELEC-001',portal_url:'https://example.com/permit'});await denied(()=>register('permit',permit,{permit_number:'BAD',portal_url:'javascript:alert(1)'}),/check constraint/);
 let attempt=await register('inspection',null,{name:'Rough inspection',permit_id:permit.id,status:'Completed',completed_date:'2026-09-14',result:'Failed'});let recheck=await register('inspection',null,{name:'Reinspection',permit_id:permit.id,previous_attempt_id:attempt.id});assert.equal(recheck.previous_attempt_id,attempt.id);checks++;
 await denied(()=>register('inspection',recheck,{name:'Invalid',permit_id:permit.id,previous_attempt_id:recheck.id}),/prior failed|preserve/);await denied(()=>register('permit',{...permit,version:0},{permit_number:'STALE'}),/changed/);
 const linked=await one('select hi_job_register($1)',[job]);assert.equal(linked.permits[0].status,'');assert.equal(linked.health.length,1);checks++;
 // A failed audit rolls back both canonical service-call creation and inspection link.
 await db.exec("reset role;create function fail_hi_audit()returns trigger language plpgsql as $$begin raise exception 'Forced audit failure';end$$;create trigger fail_hi_audit before insert on change_logs for each row execute function fail_hi_audit();set role authenticated");
 await denied(()=>action('create_call',{call:{division:'Electrical',name:'Rollback call',service_call_number:'TEST-ROLLBACK'}}),/Forced audit/);
 await db.exec('reset role');assert.equal(await one("select count(*)::int from jobs where service_call_number='TEST-ROLLBACK'"),0);await db.exec('drop trigger fail_hi_audit on change_logs;set role authenticated');checks++;
 const requestId=crypto.randomUUID();const oldVersion=saved.version;saved=await action('create_call',{call:{division:'Electrical',name:'Follow-up',service_call_number:'TEST-FOLLOWUP'}},'Create call',requestId);
 const replayCall=await one('select hi_action($1,$2,$3,$4,$5,$6)',[requestId,id,oldVersion,'create_call',{call:{division:'Electrical',name:'Follow-up',service_call_number:'TEST-FOLLOWUP'}},'Create call']);assert.deepEqual(replayCall,saved);checks++;
 await actor('tech');await denied(()=>register('permit',null,{permit_number:'DENIED'}),/edit authority/);
 const imported={source:{format:'synthetic source'},filename:'fixture.json',sourceHash:'c'.repeat(64),fileHash:'d'.repeat(64)},importRequest=crypto.randomUUID();
 const importedRow=await save(null,null,doc,importRequest,imported);assert.deepEqual(await save(null,null,doc,importRequest,imported),importedRow);checks++;
 await denied(()=>save(null,null,doc,crypto.randomUUID(),imported),/already has an inspection/);
 const duplicate=await one('select hi_save($1,NULL,NULL,$2,$3,$4,true,$5)',[crypto.randomUUID(),doc,'Electrical',imported,'Separate visit confirmed']);assert.notEqual(duplicate.id,importedRow.id);checks++;
 // Revoking the add-on or the reviewer capability takes effect on the next call.
 await db.exec("reset role;update tool_addon_access set enabled=false where clerk_user_id='tech';set role authenticated");await denied(()=>one('select hi_read($1)',[importedRow.id]),/access required/);
 await actor('reviewer');await db.exec("reset role;update user_permission_overrides set granted=false where user_id='reviewer' and permission_flag='can_review_electrical_inspections';set role authenticated");
 saved=await action('submit',{},'');await denied(()=>action('issue',{assessment:doc.assessment,reviewSummary:doc.reviewSummary}),/Reviewer/);
 await db.exec('reset role');assert.equal(await one("select count(*)::int from jobs where service_call_number='TEST-FOLLOWUP'"),1);
 assert.equal(await one("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hi_%' and has_function_privilege('anon',p.oid,'EXECUTE')"),0);checks++;
 console.log(`PASS: ${checks} local PostgreSQL migration, permissions, draft/issue, evidence, immutable revisions, permits, retries, stale saves and rollback checks.`);
}catch(e){console.error('Inspection DB check failed:',e.message,e.detail||'',e.where||'');process.exitCode=1;}finally{await db.close();}
