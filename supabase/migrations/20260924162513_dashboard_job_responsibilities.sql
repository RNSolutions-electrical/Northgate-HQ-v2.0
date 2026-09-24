-- Dashboard ownership is informational. This self-scoped read does not grant
-- access to a Job; the existing Job access predicate remains authoritative.
CREATE FUNCTION public.read_my_job_responsibilities()
RETURNS TABLE (job_id uuid, responsibility text, assigned_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT r.job_id, r.responsibility, r.updated_at
  FROM public.job_responsibilities r
  JOIN public.jobs j ON j.id = r.job_id
  WHERE r.user_id = auth.jwt()->>'sub'
    AND EXISTS (
      SELECT 1 FROM public.user_permissions p
      WHERE p.clerk_user_id = r.user_id AND p.is_active
    )
    AND j.archived_at IS NULL
    AND public.current_user_can_access_job(r.job_id)
  ORDER BY r.updated_at DESC, r.job_id, r.responsibility;
$function$;

REVOKE ALL ON FUNCTION public.read_my_job_responsibilities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_my_job_responsibilities() TO authenticated;

COMMENT ON FUNCTION public.read_my_job_responsibilities() IS
  'Returns only the current active user''s informational responsibility slots on Jobs they can already access; does not confer access.';
