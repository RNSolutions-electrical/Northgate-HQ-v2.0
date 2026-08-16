REVOKE ALL ON TABLE public.vehicle_assignments FROM anon, authenticated;
GRANT SELECT ON TABLE public.vehicle_assignments TO authenticated;

DROP POLICY IF EXISTS vehicle_assignments_manager_read ON public.vehicle_assignments;
CREATE POLICY vehicle_assignments_manager_read
ON public.vehicle_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
      AND up.is_active = TRUE
      AND COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) ->> 'can_manage_vehicles')::BOOLEAN, FALSE) IS TRUE
  )
);
