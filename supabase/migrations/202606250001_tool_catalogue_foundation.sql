CREATE TABLE IF NOT EXISTS public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  tool_number TEXT,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  description TEXT,
  condition TEXT CHECK (
    condition IS NULL
    OR condition IN ('good', 'fair', 'poor', 'damaged', 'unknown')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'inactive', 'retired', 'missing')
  ),
  home_location TEXT,
  current_location TEXT,
  assigned_to TEXT,
  purchase_date DATE,
  notes TEXT
);

COMMENT ON TABLE public.tools IS
  'Catalogue-only foundation for company tools. Checkout, assignment history, QR labels, vehicle storage, and tracking history are reserved.';
COMMENT ON COLUMN public.tools.division IS
  'Text division scope matching user_permissions.division and items.division. No divisions table or UUID division normalization in this phase.';
COMMENT ON COLUMN public.tools.home_location IS
  'Plain-text catalogue placeholder only; does not create storage linkage or transfer behavior.';
COMMENT ON COLUMN public.tools.current_location IS
  'Plain-text catalogue placeholder only; does not create tracking history or custody behavior.';
COMMENT ON COLUMN public.tools.assigned_to IS
  'Plain-text catalogue placeholder only; does not create employee assignment or custody behavior.';

CREATE UNIQUE INDEX IF NOT EXISTS tools_tool_number_unique
  ON public.tools(tool_number)
  WHERE tool_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tools_serial_number_unique
  ON public.tools(serial_number)
  WHERE serial_number IS NOT NULL;

DROP TRIGGER IF EXISTS trg_touch_tools_updated_at ON public.tools;
CREATE TRIGGER trg_touch_tools_updated_at
BEFORE UPDATE ON public.tools
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tools_division_select ON public.tools;
CREATE POLICY tools_division_select
ON public.tools
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND (
        COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, FALSE) IS TRUE
        OR up.division = tools.division
      )
  )
);

DROP POLICY IF EXISTS tools_inventory_manager_insert ON public.tools;
CREATE POLICY tools_inventory_manager_insert
ON public.tools
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = tools.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_inventory'
      )::boolean, FALSE) IS TRUE
  )
);

DROP POLICY IF EXISTS tools_inventory_manager_update ON public.tools;
CREATE POLICY tools_inventory_manager_update
ON public.tools
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = tools.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_inventory'
      )::boolean, FALSE) IS TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = tools.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_inventory'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.tools FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tools TO authenticated;
