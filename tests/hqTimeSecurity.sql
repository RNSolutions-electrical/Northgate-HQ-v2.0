-- Run as the database owner against a disposable/local DB after migration.
-- All fixtures, binding changes, and failure-injection triggers roll back.
BEGIN;
INSERT INTO public.user_permissions(clerk_user_id,email,role,division,is_active)
VALUES('__hq_time_owner','hq-time-owner@example.invalid','User','Admin',true),
('__hq_time_dev2','hq-time-dev2@example.invalid','User','Admin',true),
('__hq_time_legacy','hq-time-legacy@example.invalid','Developer','Admin',true),
('__hq_time_other','hq-time-other@example.invalid','User','Admin',true);
INSERT INTO public.user_technical_assignments(user_id,assignment_key,granted_by,grant_reason)
VALUES('__hq_time_owner','developer','__hq_time_owner','Isolated HQ time test'),
('__hq_time_dev2','developer','__hq_time_owner','Isolated HQ time test');
UPDATE public.protected_account_bindings SET user_id='__hq_time_owner' WHERE account_key='primary';
CREATE FUNCTION pg_temp.hq_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.hq_denied(stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE stmt;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Expected %, received %: % for %',expected,SQLSTATE,SQLERRM,stmt;
 END;
 RAISE EXCEPTION 'Unexpected success: %',stmt;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_owner","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(public.current_user_can_track_hq_time(),'technical developer gate');
SELECT public.save_hq_time_entry('11111111-1111-4111-8111-111111111111',NULL,
 '{"entry_date":"2026-11-06","activity":"Build HQ","started_at":"2026-11-06T23:30:00Z","ended_at":"2026-11-07T01:00:00Z","classification":"outside_hours","focused_minutes":60,"notes":"private note","time_zone":"America/Toronto","work_items":[{"id":"22222222-2222-4222-8222-222222222222","title":"Ship tool","status":"underway","notes":"private work"}]}');
SELECT pg_temp.hq_assert((SELECT elapsed_minutes=90 AND version=1 AND write_version IS NULL FROM public.hq_time_entries),'calculated duration/version');
SELECT pg_temp.hq_assert((SELECT count(*)=1 FROM public.hq_time_entry_audit),'create audit');
-- Matching replay is idempotent, does not create another audit.
SELECT public.save_hq_time_entry('11111111-1111-4111-8111-111111111111',NULL,
 '{"entry_date":"2026-11-06","activity":"Build HQ","started_at":"2026-11-06T23:30:00Z","ended_at":"2026-11-07T01:00:00Z","classification":"outside_hours","focused_minutes":60,"notes":"private note","time_zone":"America/Toronto","work_items":[{"id":"22222222-2222-4222-8222-222222222222","title":"Ship tool","status":"underway","notes":"private work"}]}');
SELECT pg_temp.hq_assert((SELECT count(*)=1 FROM public.hq_time_entry_audit),'replay audit count');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET performed_by='other'$q$,'42501');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET version=99$q$,'42501');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET created_at=now()$q$,'42501');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET notes='bypass'$q$,'40001');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET notes='stale',write_version=99$q$,'40001');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET focused_minutes=91,write_version=1$q$,'23514');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET ended_at=started_at,write_version=1$q$,'23514');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET time_zone='not/a/zone',write_version=1$q$,'22023');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET work_items='[]',write_version=1$q$,'22023');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET work_items='[{"id":"22222222-2222-4222-8222-222222222222","title":"a","status":"underway","hours":2}]',write_version=1$q$,'22023');
SELECT pg_temp.hq_denied($q$DELETE FROM public.hq_time_entries$q$,'42501');
SELECT pg_temp.hq_denied($q$INSERT INTO public.hq_time_entry_audit(entry_id,performed_by,actor_id,action,after_data) VALUES('11111111-1111-4111-8111-111111111111','__hq_time_owner','__hq_time_owner','backfill','{}')$q$,'42501');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entry_audit SET after_data='{}'$q$,'42501');
SELECT pg_temp.hq_denied($q$DELETE FROM public.hq_time_entry_audit$q$,'42501');
SELECT pg_temp.hq_denied($q$TRUNCATE public.hq_time_entry_audit$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT hq_time_private.audit_entry()$q$,'42501');
UPDATE public.hq_time_entries SET work_items='[{"id":"22222222-2222-4222-8222-222222222222","title":"Ship tool","status":"completed","notes":"done"}]',write_version=1;
SELECT pg_temp.hq_assert((SELECT version=2 AND write_version IS NULL FROM public.hq_time_entries),'direct CAS update');
SELECT pg_temp.hq_denied($q$SELECT public.set_hq_time_entry_archived('11111111-1111-4111-8111-111111111111',1,true)$q$,'40001');
SELECT public.set_hq_time_entry_archived('11111111-1111-4111-8111-111111111111',2,true);
SELECT pg_temp.hq_assert((SELECT count(*)=0 FROM public.list_hq_time_entries(false)),'archive hidden');
SELECT pg_temp.hq_assert((SELECT count(*)=1 FROM public.list_hq_time_entries(true)),'archive recoverable');
SELECT public.set_hq_time_entry_archived('11111111-1111-4111-8111-111111111111',3,false);
SELECT pg_temp.hq_assert((SELECT count(*)=4 FROM public.list_hq_time_entry_history('11111111-1111-4111-8111-111111111111')),'private history');
-- Ordinary user cannot read either table or mutate even their own subject.
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_other","role":"authenticated"}',true);
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'ordinary user gate');
SELECT pg_temp.hq_assert((SELECT count(*)=0 FROM public.hq_time_entries),'other entries hidden');
SELECT pg_temp.hq_assert((SELECT count(*)=0 FROM public.hq_time_entry_audit),'other audit hidden');
SELECT pg_temp.hq_denied($q$SELECT public.set_hq_time_entry_archived('11111111-1111-4111-8111-111111111111',4,true)$q$,'42501');
RESET ROLE;
-- Canonical assignment, not a legacy Developer label, defines access.
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_legacy","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'legacy Developer alone denied');
SELECT pg_temp.hq_denied($q$SELECT public.hq_time_default_performer()$q$,'42501');
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_dev2","role":"authenticated"}',true);
SELECT pg_temp.hq_assert(public.current_user_can_track_hq_time(),'second technical developer allowed');
SELECT pg_temp.hq_assert((SELECT count(*)=1 FROM public.list_hq_time_entries(true)),'second developer shared read');
SELECT pg_temp.hq_assert((SELECT count(*)=4 FROM public.list_hq_time_entry_history('11111111-1111-4111-8111-111111111111')),'second developer history');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET created_by='forged'$q$,'42501');
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET updated_by='forged'$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT * FROM public.protected_account_bindings$q$,'42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_owner","role":"authenticated","is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'anonymous sign-in gate');
SELECT pg_temp.hq_assert((SELECT count(*)=0 FROM public.hq_time_entries),'anonymous sign-in hidden');
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'missing subject gate');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.hq_denied($q$SELECT * FROM public.hq_time_entries$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT * FROM public.hq_time_entry_audit$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT public.list_hq_time_entries(true)$q$,'42501');
RESET ROLE;
-- Full RPC edit, validation, conflict and audit content checks.
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_dev2","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE original public.hq_time_entries; saved public.hq_time_entries; payload jsonb;
BEGIN
 SELECT * INTO STRICT original FROM public.hq_time_entries WHERE id='11111111-1111-4111-8111-111111111111';
 payload:=to_jsonb(original)-ARRAY['id','performed_by','created_by','updated_by','elapsed_minutes','archived_at','version','write_version','created_at','updated_at'];
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(%L,3,%L::jsonb)',original.id,payload),'40001');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(%L,NULL,%L::jsonb)',original.id,payload),'40001');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(NULL,NULL,%L::jsonb)',payload||'{"performed_by":"forged"}'),'22023');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(NULL,NULL,%L::jsonb)',payload||'{"elapsed_minutes":999}'),'22023');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(NULL,NULL,%L::jsonb)',payload||'{"classification":"payroll"}'),'23514');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(NULL,NULL,%L::jsonb)',payload||'{"focused_minutes":-1}'),'23514');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(NULL,NULL,%L::jsonb)',payload||'{"work_items":[{"id":"bad","title":"a","status":"underway"}]}'),'22P02');
 PERFORM pg_temp.hq_denied(format('SELECT public.save_hq_time_entry(NULL,NULL,%L::jsonb)',payload||jsonb_build_object('work_items',(payload->'work_items')||(payload->'work_items'))),'22023');
 payload:=payload||'{"accomplishments":"Shipped core","next_steps":"Review","work_items":[{"id":"22222222-2222-4222-8222-222222222222","title":"Ship tool","status":"discarded","notes":"kept in history"},{"id":"33333333-3333-4333-8333-333333333333","title":"Review","status":"underway"}]}';
 saved:=public.save_hq_time_entry(original.id,4,payload);
 PERFORM pg_temp.hq_assert(saved.created_by='__hq_time_owner' AND saved.updated_by='__hq_time_dev2' AND saved.performed_by='__hq_time_owner','performer vs editor attribution');
 PERFORM pg_temp.hq_assert(saved.version=5 AND saved.accomplishments='Shipped core' AND jsonb_array_length(saved.work_items)=2,'RPC save');
 PERFORM pg_temp.hq_assert(EXISTS(SELECT 1 FROM public.hq_time_entry_audit WHERE entry_id=original.id AND after_data->>'version'='5' AND before_data->>'version'='4' AND actor_id='__hq_time_dev2'),'full before/after/actor audit');
END $$;
RESET ROLE;
-- Atomic audit failure: row change must not survive a failed audit insert.
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_owner","role":"authenticated"}',true);
CREATE FUNCTION pg_temp.reject_hq_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected audit failure' USING ERRCODE='23514'; END $$;
CREATE TRIGGER test_reject_hq_audit BEFORE INSERT ON public.hq_time_entry_audit FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_hq_audit();
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entries SET notes='must roll back',write_version=5$q$,'23514');
SELECT pg_temp.hq_assert((SELECT version=5 AND notes='private note' FROM public.hq_time_entries),'failed audit rolled back row');
SELECT pg_temp.hq_assert((SELECT count(*)=5 FROM public.hq_time_entry_audit),'failed audit no partial history');
RESET ROLE;
-- Immutability also protects accidental privileged modifications.
SELECT pg_temp.hq_denied($q$UPDATE public.hq_time_entry_audit SET after_data='{}'$q$,'42501');
SELECT pg_temp.hq_denied($q$TRUNCATE public.hq_time_entry_audit$q$,'42501');
DROP TRIGGER test_reject_hq_audit ON public.hq_time_entry_audit;
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_dev2","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE active public.hq_time_entries; replay public.hq_time_entries; stopped public.hq_time_entries; audit_count integer; payload jsonb;
BEGIN
 active:=public.clock_in_hq_time_entry('44444444-4444-4444-8444-444444444444');
 PERFORM pg_temp.hq_assert(active.ended_at IS NULL AND active.classification IS NULL AND active.elapsed_minutes IS NULL,'running session');
 PERFORM pg_temp.hq_assert(active.performed_by='__hq_time_owner' AND active.created_by='__hq_time_dev2' AND active.updated_by='__hq_time_dev2','timer performer and actual editor');
 PERFORM pg_temp.hq_assert(abs(extract(epoch FROM (clock_timestamp()-active.started_at)))<5,'server start timestamp');
 SELECT count(*) INTO audit_count FROM public.hq_time_entry_audit;
 replay:=public.clock_in_hq_time_entry('44444444-4444-4444-8444-444444444444');
 PERFORM pg_temp.hq_assert(replay.id=active.id AND replay.version=1,'same-ID start replay');
 replay:=public.clock_in_hq_time_entry('55555555-5555-4555-8555-555555555555');
 PERFORM pg_temp.hq_assert(replay.id=active.id,'different-click start returns active session');
 PERFORM pg_temp.hq_assert((SELECT count(*)=audit_count FROM public.hq_time_entry_audit),'start retries do not add audit');
 PERFORM pg_temp.hq_assert((SELECT count(*)=1 FROM public.list_hq_time_entries(false) WHERE ended_at IS NULL),'reload sees active session');
 PERFORM pg_temp.hq_denied(format('SELECT public.set_hq_time_entry_archived(%L,1,true)',active.id),'23514');
 PERFORM pg_temp.hq_denied($q$INSERT INTO public.hq_time_entries(entry_date,activity,started_at) VALUES(current_date,'duplicate active',now())$q$,'23505');
 PERFORM pg_temp.hq_denied(format('SELECT public.clock_out_hq_time_entry(%L,99)',active.id),'40001');
 payload:=to_jsonb(active)-ARRAY['id','performed_by','created_by','updated_by','elapsed_minutes','archived_at','version','write_version','created_at','updated_at'];
 replay:=public.save_hq_time_entry(active.id,1,payload||'{"notes":"notes while running"}');
 PERFORM pg_temp.hq_assert(replay.ended_at IS NULL AND replay.version=2,'can save running notes');
 PERFORM pg_temp.hq_denied(format('SELECT public.clock_out_hq_time_entry(%L,1)',active.id),'40001');
 PERFORM set_config('request.jwt.claims','{"sub":"__hq_time_owner","role":"authenticated"}',true);
 stopped:=public.clock_out_hq_time_entry(active.id,2);
 PERFORM pg_temp.hq_assert(stopped.ended_at>stopped.started_at AND stopped.elapsed_minutes>0 AND stopped.version=3 AND stopped.classification IS NULL,'stop unclassified safely');
 PERFORM pg_temp.hq_assert(stopped.created_by='__hq_time_dev2' AND stopped.updated_by='__hq_time_owner' AND stopped.performed_by='__hq_time_owner','stop actor separate');
 SELECT count(*) INTO audit_count FROM public.hq_time_entry_audit;
 replay:=public.clock_out_hq_time_entry(active.id,2);
 PERFORM pg_temp.hq_assert(replay.version=3 AND replay.ended_at=stopped.ended_at,'stop idempotent');
 replay:=public.clock_in_hq_time_entry(active.id);
 PERFORM pg_temp.hq_assert(replay.ended_at=stopped.ended_at,'delayed start retry does not reopen');
 PERFORM pg_temp.hq_assert((SELECT count(*)=audit_count FROM public.hq_time_entry_audit),'stop/start retries no extra audit');
 PERFORM pg_temp.hq_denied(format('UPDATE public.hq_time_entries SET ended_at=NULL,write_version=3 WHERE id=%L',active.id),'22023');
 payload:=to_jsonb(stopped)-ARRAY['id','performed_by','created_by','updated_by','elapsed_minutes','archived_at','version','write_version','created_at','updated_at'];
 replay:=public.save_hq_time_entry(active.id,3,payload||jsonb_build_object('started_at',stopped.started_at-interval '8 days','classification','outside_hours'));
 PERFORM pg_temp.hq_assert(replay.elapsed_minutes>11520,'forgotten timer has no trapping duration cap');
 PERFORM pg_temp.hq_assert(EXISTS(SELECT 1 FROM public.hq_time_entry_audit WHERE entry_id=active.id AND action='correction'),'manual time correction audited');
 PERFORM pg_temp.hq_assert(EXISTS(SELECT 1 FROM public.hq_time_entry_audit WHERE entry_id=active.id AND action='clock_in') AND EXISTS(SELECT 1 FROM public.hq_time_entry_audit WHERE entry_id=active.id AND action='clock_out'),'timer transitions audited');
END $$;
RESET ROLE;
-- Optional narrow grant is private, active-user-only, and does not alter canonical
-- technical privileges. These synthetic grants are rolled back, never deployed.
SELECT set_config('request.jwt.claims','{"sub":"__hq_time_other","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'ordinary user still denied');
SELECT pg_temp.hq_denied($q$SELECT * FROM hq_time_private.access_grants$q$,'42501');
SELECT pg_temp.hq_denied($q$INSERT INTO hq_time_private.access_grants(subject) VALUES('__hq_time_other')$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT public.clock_in_hq_time_entry('66666666-6666-4666-8666-666666666666')$q$,'42501');
RESET ROLE;
INSERT INTO hq_time_private.access_grants(subject) VALUES('__hq_time_other');
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(public.current_user_can_track_hq_time(),'narrow tracker grant allowed');
SELECT pg_temp.hq_assert(NOT public.current_user_has_developer_access(),'narrow tracker grant does not expand HQ developer privilege');
SELECT pg_temp.hq_assert((SELECT count(*)=2 FROM public.list_hq_time_entries(true)),'narrow grant shared read');
UPDATE public.hq_time_entries SET notes='tracker-only editor',write_version=5 WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.hq_assert((SELECT updated_by='__hq_time_other' AND performed_by='__hq_time_owner' AND created_by='__hq_time_owner' FROM public.hq_time_entries WHERE id='11111111-1111-4111-8111-111111111111'),'narrow grant write actor');
RESET ROLE;
UPDATE public.user_permissions SET is_active=false WHERE clerk_user_id='__hq_time_other';
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'inactive narrow-grant subject denied');
SELECT pg_temp.hq_assert((SELECT count(*)=0 FROM public.hq_time_entries),'inactive grant data hidden');
RESET ROLE;
DELETE FROM hq_time_private.access_grants WHERE subject='__hq_time_other';
UPDATE public.user_permissions SET is_active=true WHERE clerk_user_id='__hq_time_other';
SET LOCAL ROLE authenticated;
SELECT pg_temp.hq_assert(NOT public.current_user_can_track_hq_time(),'grant removal revokes tracker access');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.hq_denied($q$SELECT public.clock_in_hq_time_entry('66666666-6666-4666-8666-666666666666')$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT public.clock_out_hq_time_entry('44444444-4444-4444-8444-444444444444',4)$q$,'42501');
SELECT pg_temp.hq_denied($q$SELECT hq_time_private.can_track()$q$,'42501');
RESET ROLE;
ROLLBACK;
