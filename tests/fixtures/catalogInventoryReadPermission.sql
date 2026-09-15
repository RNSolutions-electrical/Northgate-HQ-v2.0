-- Captured read-only from the deployed helper; used only by isolated tests.
CREATE OR REPLACE FUNCTION public.current_user_can_read_catalog(p_division text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT public.current_user_can_read_division(p_division, 'can_manage_inventory') OR EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.clerk_user_id = (auth.jwt() ->> 'sub') AND up.is_active IS TRUE AND (COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) ->> 'can_estimate')::BOOLEAN, FALSE) IS TRUE OR COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) ->> 'can_manage_inventory')::BOOLEAN, FALSE) IS TRUE)); $function$
