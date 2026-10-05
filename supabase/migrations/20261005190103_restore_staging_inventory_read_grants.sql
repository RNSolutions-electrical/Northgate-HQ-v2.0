-- Staging's baseline replay retained inventory RLS policies but omitted the
-- authenticated role's table-level SELECT grants. Production already has them.
-- Only restore reads for authenticated users; existing row policies remain
-- authoritative and anonymous access is not added.
DO $$
DECLARE
  missing_rls text;
BEGIN
  SELECT string_agg(t.name, ', ' ORDER BY t.name) INTO missing_rls
  FROM unnest(ARRAY[
    'items', 'storage_units', 'shelves', 'bays', 'bins', 'inventory_balances'
  ]) AS t(name)
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.name)
  WHERE c.oid IS NULL OR NOT c.relrowsecurity
    OR NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*')
        AND 'authenticated'::regrole::oid = ANY(p.polroles)
    );
  IF missing_rls IS NOT NULL THEN
    RAISE EXCEPTION 'Inventory SELECT grant requires authenticated RLS read policies on: %', missing_rls;
  END IF;
END $$;

GRANT SELECT ON TABLE
  public.items,
  public.storage_units,
  public.shelves,
  public.bays,
  public.bins,
  public.inventory_balances
TO authenticated;
