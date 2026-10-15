-- Manual data-preserving forward recovery, not applied. Freeze/drain EOS writers first.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.eos_pursuits,public.eos_pursuit_managers IN SHARE ROW EXCLUSIVE MODE;
DO $$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'eos_scorecard_%_v1' OR p.proname IN ('eos_member_directory_v1','eos_save_pursuit_v1')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_eos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.eos_access_grants g
    JOIN public.user_permissions u ON u.clerk_user_id = g.user_id
    WHERE g.user_id = auth.jwt()->>'sub' AND u.is_active
      AND u.business_role IN ('Manager', 'Director')
  );
$function$
;
GRANT EXECUTE ON FUNCTION public.eos_save_pursuit(uuid,jsonb,text[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Additive tables/observations/audit retained; never rewind data. Restore client through Git fix-forward.
