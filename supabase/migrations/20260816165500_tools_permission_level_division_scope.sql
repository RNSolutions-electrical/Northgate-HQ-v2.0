DROP POLICY IF EXISTS tools_division_select ON public.tools;
CREATE POLICY tools_division_select
ON public.tools
FOR SELECT
TO authenticated
USING (
  public.current_user_can_read_division(division)
);

DROP POLICY IF EXISTS tools_inventory_manager_insert ON public.tools;
CREATE POLICY tools_inventory_manager_insert
ON public.tools
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_inventory')
);

DROP POLICY IF EXISTS tools_inventory_manager_update ON public.tools;
CREATE POLICY tools_inventory_manager_update
ON public.tools
FOR UPDATE
TO authenticated
USING (
  public.current_user_can_edit_division(division, 'can_manage_inventory')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_manage_inventory')
);
