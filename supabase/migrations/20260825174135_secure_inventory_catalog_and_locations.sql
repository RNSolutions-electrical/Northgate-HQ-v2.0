CREATE OR REPLACE FUNCTION public.current_user_can_read_catalog(p_division TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.current_user_can_read_division(p_division, 'can_manage_inventory')
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.clerk_user_id = (auth.jwt() ->> 'sub')
        AND up.is_active IS TRUE
        AND (
          COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) ->> 'can_estimate')::BOOLEAN, FALSE) IS TRUE
          OR COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) ->> 'can_manage_inventory')::BOOLEAN, FALSE) IS TRUE
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_catalog()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = (auth.jwt() ->> 'sub')
      AND up.is_active IS TRUE
      AND COALESCE((public.effective_permissions_for_user(up.role, up.division, up.permission_overrides) ->> 'can_edit_catalog')::BOOLEAN, FALSE) IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_can_read_catalog(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_catalog(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_can_manage_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_catalog() TO authenticated;

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bin_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY items_catalog_read ON public.items FOR SELECT TO authenticated
  USING (public.current_user_can_read_catalog(division));
CREATE POLICY items_catalog_write ON public.items FOR ALL TO authenticated
  USING (public.current_user_can_edit_division(division, 'can_edit_catalog'))
  WITH CHECK (public.current_user_can_edit_division(division, 'can_edit_catalog'));

CREATE POLICY cost_codes_catalog_read ON public.cost_codes FOR SELECT TO authenticated
  USING (public.current_user_can_read_catalog(division));
CREATE POLICY cost_codes_catalog_write ON public.cost_codes FOR ALL TO authenticated
  USING (public.current_user_can_edit_division(division, 'can_edit_catalog'))
  WITH CHECK (public.current_user_can_edit_division(division, 'can_edit_catalog'));

CREATE POLICY vendors_catalog_read ON public.vendors FOR SELECT TO authenticated
  USING (public.current_user_can_read_catalog(NULL));
CREATE POLICY vendors_catalog_write ON public.vendors FOR ALL TO authenticated
  USING (public.current_user_can_manage_catalog())
  WITH CHECK (public.current_user_can_manage_catalog());

CREATE POLICY storage_units_inventory_read ON public.storage_units FOR SELECT TO authenticated
  USING (public.current_user_can_read_division(division, 'can_manage_inventory'));
CREATE POLICY shelves_inventory_read ON public.shelves FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.storage_units u WHERE u.id = shelves.unit_id AND public.current_user_can_read_division(u.division, 'can_manage_inventory')));
CREATE POLICY bays_inventory_read ON public.bays FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shelves s JOIN public.storage_units u ON u.id = s.unit_id WHERE s.id = bays.shelf_id AND public.current_user_can_read_division(u.division, 'can_manage_inventory')));
CREATE POLICY bins_inventory_read ON public.bins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bays b JOIN public.shelves s ON s.id = b.shelf_id JOIN public.storage_units u ON u.id = s.unit_id WHERE b.id = bins.bay_id AND public.current_user_can_read_division(u.division, 'can_manage_inventory')));
CREATE POLICY bin_items_inventory_read ON public.bin_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bins b JOIN public.bays ba ON ba.id = b.bay_id JOIN public.shelves s ON s.id = ba.shelf_id JOIN public.storage_units u ON u.id = s.unit_id WHERE b.id = bin_items.bin_id AND public.current_user_can_read_division(u.division, 'can_manage_inventory')));
CREATE POLICY inventory_balances_inventory_read ON public.inventory_balances FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bin_items bi JOIN public.bins b ON b.id = bi.bin_id JOIN public.bays ba ON ba.id = b.bay_id JOIN public.shelves s ON s.id = ba.shelf_id JOIN public.storage_units u ON u.id = s.unit_id WHERE bi.id = inventory_balances.bin_item_id AND public.current_user_can_read_division(u.division, 'can_manage_inventory')));

ALTER VIEW public.grand_master_inventory_view SET (security_invoker = true);
