// Exercise the same permission editor RPC used in production with distinct actors/targets.
export async function verifyReviewerManagement({db, query, one, actor, denied, assert}) {
 const flag='can_review_electrical_inspections';
 await db.exec("reset role;insert into user_permissions(clerk_user_id,role,division)values('grant-admin','Developer','Admin'),('grant-dev','Developer','Electrical'),('grant-manager','Manager','Electrical');insert into user_permission_overrides(user_id,permission_flag,granted,review_note)values('grant-dev','can_view_reports',false,'Preserve history')");
 const empty={template_id:null,overrides:{}}, existing={can_view_reports:false};
 const save=(target,overrides,expected=empty,template=null,reason='Reviewer access test')=>query('select save_user_permission_template($1,$2,$3,$4,$5)',[target,template,overrides,expected,reason]);
 await actor('grant-manager');await denied(()=>save('grant-dev',{[flag]:true}),/Developer access/);
 await actor('inactive');await denied(()=>save('grant-dev',{[flag]:true}),/Developer access/);
 await actor('grant-admin');
 await denied(()=>save('grant-manager',{[flag]:'yes'}),/boolean/);
 await denied(()=>save('grant-manager',{[flag]:true},empty,null,''),/audit reason/);
 await denied(()=>save('grant-manager',{can_access_developer:true}),/editable/);
 await denied(()=>save('grant-manager',{can_unknown:true}),/editable/);
 await denied(()=>save('grant-dev',{can_view_reports:true}, {template_id:null,overrides:existing}),/Only inspection reviewer/);
 await save('grant-manager',{[flag]:true});
 await save('grant-dev',{...existing,[flag]:true},{template_id:null,overrides:existing});
 await denied(()=>save('grant-dev',existing,{template_id:null,overrides:existing}),/changed since/);
 await db.exec('reset role');
 const history=await one("select review_note from user_permission_overrides where user_id='grant-dev' and permission_flag='can_view_reports' and is_active");
 assert.equal(history,'Preserve history');
 const audit=await one("select after_data from change_logs where record_id='grant-dev' order by created_at desc limit 1");
 assert.equal(audit.effective_permissions[flag],true);assert.equal(audit.effective_permissions.can_view_reports,false);
 const templateId=await one("insert into permission_templates(permissions)values('{}')returning id");
 await actor('grant-admin');await denied(()=>save('grant-dev',{...existing,[flag]:true},{template_id:null,overrides:{...existing,[flag]:true}},templateId),/Only inspection reviewer/);
 for(const [target,role,prior] of [['grant-dev','Developer',existing],['grant-manager','Manager',{}]]){
  await actor(target);
  assert.equal((await one("select effective_permissions_for_user($1,'Electrical','{}')",[role]))[flag],true);
  await actor('grant-admin');await save(target,{...prior,[flag]:false},{template_id:null,overrides:{...prior,[flag]:true}});
  await actor(target);assert.equal((await one("select effective_permissions_for_user($1,'Electrical','{}')",[role]))[flag],false);
  await actor('grant-admin');await save(target,prior,{template_id:null,overrides:{...prior,[flag]:false}});
  await actor(target);assert.equal((await one("select effective_permissions_for_user($1,'Electrical','{}')",[role]))[flag],false);
 }
 await db.exec('reset role');
 assert.equal(await one("select count(*)::int from user_permission_overrides where user_id='grant-dev' and permission_flag='can_view_reports'"),1);
 assert.equal(await one("select count(*)::int from user_permission_templates where user_id in ('grant-dev','grant-manager')"),0);
 assert.equal(await one("select has_function_privilege('anon','public.save_user_permission_template(text,uuid,jsonb,jsonb,text)','EXECUTE')"),false);
 console.log('PASS: reviewer grant, deny, default, target-scoped audit, preserved other overrides, stale-save and Developer protection.');
}
