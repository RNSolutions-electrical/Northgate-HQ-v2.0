-- Display numbers are derived from committed review requests, not save versions.
-- No data rewrite: saved draft locks and all existing review/audit rows stay intact.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION public.read_estimate_review_revisions(p_scope text,p_ids uuid[])
RETURNS TABLE(record_id uuid,review_revision integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH actor AS (
  SELECT clerk_user_id FROM public.user_permissions
  WHERE clerk_user_id=nullif(auth.jwt()->>'sub','') AND is_active
 ), requested AS (
  SELECT DISTINCT id FROM unnest(p_ids[1:200]) AS r(id) WHERE id IS NOT NULL
 )
 SELECT e.id,(SELECT count(*)::integer FROM public.estimates family
  JOIN public.estimate_review_requests prior ON prior.estimate_id=family.id
  WHERE family.division=e.division
   AND (family.id=coalesce(e.revision_root_id,e.id) OR family.revision_root_id=coalesce(e.revision_root_id,e.id))
   AND (prior.submitted_at,prior.id)<=(latest.submitted_at,latest.id))
 FROM requested q JOIN public.estimates e ON e.id=q.id CROSS JOIN actor
 LEFT JOIN LATERAL (
  SELECT r.submitted_at,r.id FROM public.estimate_review_requests r
  WHERE r.estimate_id=e.id ORDER BY r.submitted_at DESC,r.id DESC LIMIT 1
 ) latest ON true
 WHERE p_scope='official' AND
  (public.current_user_can_read_division(e.division,'can_estimate') IS TRUE
   OR public.current_user_can_read_division(e.division,'can_approve_estimates') IS TRUE)
 UNION ALL
 SELECT w.id,(SELECT count(*)::integer FROM public.v5_change_sets s
  JOIN public.v5_change_set_destinations d ON d.change_set_id=s.id AND d.destination_key='official_estimate'
  WHERE s.working_copy_id=w.id)
 FROM requested q JOIN public.v5_working_copies w ON w.id=q.id JOIN actor a ON w.owner_user_id=a.clerk_user_id
 WHERE p_scope='personal' AND w.module_key='estimating' AND w.work_type='estimate'
 UNION ALL
 SELECT r.id,(SELECT count(*)::integer FROM public.estimates family
  JOIN public.estimate_review_requests prior ON prior.estimate_id=family.id
  WHERE family.division=e.division
   AND (family.id=coalesce(e.revision_root_id,e.id) OR family.revision_root_id=coalesce(e.revision_root_id,e.id))
   AND (prior.submitted_at,prior.id)<=(r.submitted_at,r.id))
 FROM requested q JOIN public.estimate_review_requests r ON r.id=q.id
 JOIN public.estimates e ON e.id=r.estimate_id CROSS JOIN actor
 WHERE p_scope='official-review' AND r.status='pending' AND e.status='submitted' AND e.archived_at IS NULL
  AND public.current_user_can_edit_division(e.division,'can_approve_estimates') IS TRUE
 UNION ALL
 SELECT d.id,(SELECT count(*)::integer FROM public.v5_change_sets prior
  JOIN public.v5_change_set_destinations prior_destination ON prior_destination.change_set_id=prior.id
   AND prior_destination.destination_key='official_estimate'
  WHERE prior.working_copy_id=s.working_copy_id AND prior.working_copy_version<=s.working_copy_version)
 FROM requested q JOIN public.v5_change_set_destinations d ON d.id=q.id
 JOIN public.v5_change_sets s ON s.id=d.change_set_id CROSS JOIN actor
 WHERE p_scope='personal-review' AND d.status='pending' AND d.destination_key='official_estimate'
  AND coalesce((public.current_scoped_authorization_decision(d.action_id,d.scope_context)->>'allowed')::boolean,false);
$$;
REVOKE ALL ON FUNCTION public.read_estimate_review_revisions(text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_estimate_review_revisions(text,uuid[]) TO authenticated;
COMMENT ON FUNCTION public.read_estimate_review_revisions(text,uuid[]) IS
 'Returns only authorized estimate review ordinals, derived from immutable submitted snapshots. Never use as a draft-save concurrency token.';
