-- Staging candidate. One continuing adjustment across approved revisions.
-- No historical Pay App rows are rewritten by this migration or these readers.
CREATE FUNCTION public.billing_contract_adjustments(p_job_id uuid)
RETURNS TABLE(root_id uuid,version_id uuid,co_number text,description text,
 approved_value numeric,previous_billed_amount numeric,version_snapshot jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE family record; selected public.change_orders; candidates integer; previous numeric;
BEGIN
 IF (WITH RECURSIVE tree AS (
  SELECT c.id,ARRAY[c.id] path FROM public.change_orders c WHERE c.job_id=p_job_id AND c.revision_of_id IS NULL
  UNION ALL SELECT c.id,t.path||c.id FROM public.change_orders c JOIN tree t ON c.revision_of_id=t.id
   WHERE c.job_id=p_job_id AND NOT c.id=ANY(t.path)
 ) SELECT count(*) FROM tree)<>(SELECT count(*) FROM public.change_orders WHERE job_id=p_job_id) THEN
  RAISE EXCEPTION 'Invalid or cross-project adjustment revision relationships require review before billing.'; END IF;
 FOR family IN
  WITH RECURSIVE tree AS (
   SELECT c.id,c.id root,ARRAY[c.id] path FROM public.change_orders c
    WHERE c.job_id=p_job_id AND c.revision_of_id IS NULL
   UNION ALL
   SELECT c.id,t.root,t.path||c.id FROM public.change_orders c JOIN tree t ON c.revision_of_id=t.id
    WHERE c.job_id=p_job_id AND NOT c.id=ANY(t.path)
  ) SELECT t.root,array_agg(t.id) members FROM tree t GROUP BY t.root
 LOOP
  -- An approved ancestor remains historical, not another contract commitment.
  WITH RECURSIVE descendants AS (
   SELECT c.id,c.revision_of_id,c.id ancestor FROM public.change_orders c WHERE c.id=ANY(family.members)
   UNION ALL
   SELECT c.id,c.revision_of_id,d.ancestor FROM public.change_orders c JOIN descendants d ON c.revision_of_id=d.id WHERE c.id=ANY(family.members)
  ) SELECT count(*) INTO candidates FROM public.change_orders c
   WHERE c.id=ANY(family.members) AND c.status='approved' AND c.voided_at IS NULL AND c.archived_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM descendants d JOIN public.change_orders child ON child.id=d.id
    WHERE d.ancestor=c.id AND d.id<>c.id AND child.status='approved' AND child.voided_at IS NULL AND child.archived_at IS NULL);
  IF candidates>1 THEN RAISE EXCEPTION 'Conflicting approved revisions exist for adjustment %. Resolve the revision branches before billing.',family.root; END IF;
  WITH RECURSIVE ranked AS (
   SELECT c.id,0 depth FROM public.change_orders c WHERE c.id=family.root
   UNION ALL SELECT c.id,r.depth+1 FROM public.change_orders c JOIN ranked r ON c.revision_of_id=r.id WHERE c.id=ANY(family.members)
  ) SELECT c.* INTO selected FROM public.change_orders c JOIN ranked r ON r.id=c.id
    WHERE c.status='approved' AND c.voided_at IS NULL AND c.archived_at IS NULL ORDER BY r.depth DESC LIMIT 1;
  SELECT coalesce(sum(l.final_current_amount),0) INTO previous FROM public.job_pay_application_change_orders l
   JOIN public.job_pay_applications app ON app.id=l.pay_application_id
   WHERE app.job_id=p_job_id AND app.status='billed' AND l.change_order_id=ANY(family.members);
  IF selected.id IS NULL AND previous=0 THEN CONTINUE; END IF;
  root_id:=family.root; approved_value:=coalesce(selected.price_amount,0); previous_billed_amount:=previous;
  IF EXISTS(SELECT 1 FROM public.change_order_financial_postings WHERE change_order_id=ANY(family.members))
   AND (SELECT sum(amount_delta) FROM public.change_order_financial_postings WHERE change_order_id=ANY(family.members)) IS DISTINCT FROM approved_value THEN
   RAISE EXCEPTION 'Adjustment % does not reconcile with its posted financial changes. Review revisions/reversals before billing.',family.root; END IF;
  IF selected.id IS NULL THEN SELECT * INTO selected FROM public.change_orders c WHERE c.id=family.root; END IF;
  version_id:=selected.id; co_number:=selected.co_number; description:=selected.title;
  version_snapshot:=jsonb_build_object('contract_adjustment_root_id',root_id,'version_id',version_id,
   'co_number',co_number,'title',description,'approved_value',approved_value,'record_type',selected.record_type,
   'revision_of_id',selected.revision_of_id,'revision_number',selected.revision_number,'status',selected.status);
  RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.billing_contract_adjustments(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_job_pay_application_change_orders(p_pay_app_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE app public.job_pay_applications; item record; old_line public.job_pay_application_change_orders;
 before_rows jsonb; keep_ids uuid[]:='{}'; line_id uuid; changed boolean; written integer:=0; total numeric:=0;
BEGIN
 PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.job_pay_applications WHERE id=p_pay_app_id) FOR UPDATE;
 SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;
 IF app.id IS NULL OR NOT public.job_billing_can_manage(app.job_id) OR app.status<>'draft' THEN
  RAISE EXCEPTION 'Only an authorized Draft Pay App can sync Change Orders' USING ERRCODE='42501'; END IF;
 IF app.pay_app_kind<>'standard' THEN RAISE EXCEPTION 'Correction/reversal snapshots cannot be replaced by a contract sync. Use the standard next Pay App for revised scope.'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') INTO before_rows FROM public.job_pay_application_change_orders l WHERE l.pay_application_id=app.id;
 FOR item IN SELECT * FROM public.billing_contract_adjustments(app.job_id) LOOP
  SELECT * INTO old_line FROM public.job_pay_application_change_orders l WHERE l.pay_application_id=app.id
    AND l.source_snapshot->>'contract_adjustment_root_id'=item.root_id::text ORDER BY l.created_at,l.id LIMIT 1;
  -- Pre-lineage drafts are rebuilt on explicit sync; billed snapshots are untouched.
  changed:=old_line.id IS NULL OR old_line.change_order_id<>item.version_id OR old_line.approved_value<>item.approved_value
    OR old_line.previous_billed_amount<>item.previous_billed_amount OR old_line.source_snapshot IS DISTINCT FROM item.version_snapshot;
  IF changed THEN
   DELETE FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id AND (id=old_line.id OR change_order_id=item.version_id);
   INSERT INTO public.job_pay_application_change_orders(pay_application_id,change_order_id,co_number,description,approved_value,
    previous_billed_amount,billed_to_date_amount,remaining_amount,additional_percent,source_snapshot)
   VALUES(app.id,item.version_id,item.co_number,item.description,item.approved_value,item.previous_billed_amount,item.previous_billed_amount,
    item.approved_value-item.previous_billed_amount,CASE WHEN item.approved_value=0 THEN 0 ELSE greatest(0,least(100,round(item.previous_billed_amount*100/item.approved_value,6))) END,item.version_snapshot)
   RETURNING id INTO line_id;
   written:=written+1;
  ELSE line_id:=old_line.id; END IF;
  keep_ids:=array_append(keep_ids,line_id); total:=total+item.approved_value;
 END LOOP;
 DELETE FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id AND NOT id=ANY(keep_ids);
 UPDATE public.job_pay_applications SET approved_change_order_value=total,current_contract_value=original_contract_value+total,
  updated_at=now(),updated_by=auth.jwt()->>'sub' WHERE id=app.id;
 INSERT INTO public.change_logs(user_id,table_name,record_id,action,before_data,after_data,note)
 VALUES(auth.jwt()->>'sub','job_pay_application_change_orders',app.id::text,'update',before_rows,
  (SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM public.job_pay_application_change_orders l WHERE l.pay_application_id=app.id),
  'Explicit contract sync. Changed revision/previous-billing rows reset for review; billed history preserved.');
 RETURN written;
END $$;

CREATE FUNCTION public.validate_pay_app_contract_basis(p_pay_app_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE app public.job_pay_applications;
BEGIN
 SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id;
 IF app.pay_app_kind<>'standard' THEN RETURN; END IF;
 IF EXISTS(
  SELECT 1 FROM public.billing_contract_adjustments(app.job_id) c FULL JOIN
    (SELECT * FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id) l
    ON l.source_snapshot->>'contract_adjustment_root_id'=c.root_id::text
  WHERE c.root_id IS NULL OR l.id IS NULL OR l.change_order_id<>c.version_id OR l.approved_value<>c.approved_value
   OR l.previous_billed_amount<>c.previous_billed_amount OR l.source_snapshot IS DISTINCT FROM c.version_snapshot
 ) OR EXISTS(SELECT 1 FROM public.job_pay_application_change_orders WHERE pay_application_id=app.id
   GROUP BY source_snapshot->>'contract_adjustment_root_id' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Contract adjustments changed. Return to Draft if needed, Sync approved COs, review reset amounts, and approve again.';
 END IF;
 IF app.current_contract_value IS DISTINCT FROM app.original_contract_value+(SELECT coalesce(sum(c.approved_value),0) FROM public.billing_contract_adjustments(app.job_id) c) THEN
  RAISE EXCEPTION 'Contract total changed. Sync approved COs and review the Draft.'; END IF;
 IF EXISTS(SELECT 1 FROM public.job_pay_application_lines l WHERE l.pay_application_id=app.id AND l.previous_billed_amount IS DISTINCT FROM
  (SELECT coalesce(sum(previous.final_current_amount),0) FROM public.job_pay_application_lines previous
   JOIN public.job_pay_applications h ON h.id=previous.pay_application_id WHERE h.job_id=app.job_id AND h.status='billed' AND previous.sov_line_id=l.sov_line_id)) THEN
  RAISE EXCEPTION 'Prior billing changed. Recreate this unbilled Pay App from current billed history before approval.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_pay_app_contract_basis(uuid) FROM PUBLIC,anon,authenticated;

-- Extend existing implementations in place; no parallel financial engine.
-- Exact anchors fail the migration if installed function shapes differ.
DO $patch$
DECLARE definition text; original text; start_at integer; end_at integer; sig regprocedure;
BEGIN
 sig:='public.create_job_pay_application(uuid,date,text,uuid)'::regprocedure;
 original:=pg_get_functiondef(sig); definition:=original;
 start_at:=strpos(definition,'  INSERT INTO public.job_pay_application_change_orders(');
 end_at:=strpos(definition,'  RETURN app_id;');
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Unexpected create Pay App definition'; END IF;
 definition:=substr(definition,1,start_at-1)||'  PERFORM public.sync_job_pay_application_change_orders(app_id);'||E'\n'||substr(definition,end_at);
 definition:=replace(definition,'  PERFORM pg_advisory_xact_lock(hashtext(p_job_id::TEXT));',
  '  PERFORM 1 FROM public.jobs WHERE id=p_job_id FOR UPDATE; PERFORM pg_advisory_xact_lock(hashtext(p_job_id::TEXT));');
 EXECUTE definition;
 FOREACH sig IN ARRAY ARRAY['public.set_job_pay_application_status(uuid,text,text)'::regprocedure,
  'public.finalize_job_pay_application(uuid,uuid,text)'::regprocedure] LOOP
  original:=pg_get_functiondef(sig); definition:=replace(original,
   '  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;',
   '  PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.job_pay_applications WHERE id=p_pay_app_id) FOR UPDATE;'||E'\n'||
   '  SELECT * INTO app FROM public.job_pay_applications WHERE id=p_pay_app_id FOR UPDATE;');
  IF definition=original THEN RAISE EXCEPTION 'Unexpected Pay App locking definition: %',sig; END IF;
  IF sig='public.set_job_pay_application_status(uuid,text,text)'::regprocedure THEN
   original:=definition; definition:=replace(definition,'  IF p_status=''approved'' AND app.status=''draft'' THEN',
    '  IF p_status=''approved'' THEN PERFORM public.validate_pay_app_contract_basis(app.id); END IF;'||E'\n'||'  IF p_status=''approved'' AND app.status=''draft'' THEN');
  ELSE
   original:=definition; definition:=replace(definition,'  IF EXISTS(SELECT 1 FROM public.job_pay_application_lines WHERE pay_application_id=app.id AND',
    '  PERFORM public.validate_pay_app_contract_basis(app.id);'||E'\n'||'  IF EXISTS(SELECT 1 FROM public.job_pay_application_lines WHERE pay_application_id=app.id AND');
  END IF;
  IF definition=original THEN RAISE EXCEPTION 'Unexpected Pay App validation definition: %',sig; END IF;
  EXECUTE definition;
 END LOOP;
 sig:='public.save_job_pay_application_change_order(uuid,numeric,numeric,text)'::regprocedure;
 original:=pg_get_functiondef(sig);
 definition:=replace(original,'  SELECT * INTO line FROM public.job_pay_application_change_orders WHERE id=p_line_id FOR UPDATE;',
  '  PERFORM 1 FROM public.job_pay_applications WHERE id=(SELECT pay_application_id FROM public.job_pay_application_change_orders WHERE id=p_line_id) FOR UPDATE;'||E'\n'||
  '  SELECT * INTO line FROM public.job_pay_application_change_orders WHERE id=p_line_id FOR UPDATE;');
 IF definition=original THEN RAISE EXCEPTION 'Unexpected CO billing line locking definition'; END IF;
 EXECUTE definition;
 sig:='public.void_approved_job_change_order(uuid,text,text)'::regprocedure;
 original:=pg_get_functiondef(sig);
 definition:=replace(original,'  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;',
  '  PERFORM 1 FROM public.jobs WHERE id=(SELECT job_id FROM public.change_orders WHERE id=p_change_order_id) FOR UPDATE;'||E'\n'||
  '  SELECT * INTO target FROM public.change_orders WHERE id=p_change_order_id AND archived_at IS NULL FOR UPDATE;');
 IF definition=original THEN RAISE EXCEPTION 'Unexpected CO void locking definition'; END IF;
 original:=definition;
 definition:=replace(definition,'  IF target.status=''voided'' THEN RETURN target; END IF;',
  '  IF EXISTS(WITH RECURSIVE children AS (SELECT id FROM public.change_orders WHERE revision_of_id=target.id UNION ALL SELECT c.id FROM public.change_orders c JOIN children p ON c.revision_of_id=p.id) SELECT 1 FROM children x JOIN public.change_orders c ON c.id=x.id WHERE c.status=''approved'' AND c.voided_at IS NULL) THEN RAISE EXCEPTION ''Void the latest approved revision first; an earlier version cannot be reversed beneath an active revision.''; END IF;'||E'\n'||
  '  IF target.status=''voided'' THEN RETURN target; END IF;');
 IF definition=original THEN RAISE EXCEPTION 'Unexpected CO void status definition'; END IF;
 EXECUTE definition;
END $patch$;
