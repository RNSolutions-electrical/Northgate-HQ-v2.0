CREATE TABLE IF NOT EXISTS public.label_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avery_template TEXT NOT NULL,
  scope_level TEXT CHECK (scope_level IN ('unit', 'shelf', 'bay', 'bin')),
  include_qr BOOLEAN NOT NULL DEFAULT TRUE,
  layout JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

COMMENT ON TABLE public.label_templates IS
  'Saved reusable label layouts for Unit/Shelf/Bay placards and Bin labels. Archived templates are hidden instead of hard-deleted.';
COMMENT ON COLUMN public.label_templates.scope_level IS
  'NULL means the template may be used for any Unit/Shelf/Bay/Bin scope.';
COMMENT ON COLUMN public.label_templates.layout IS
  'JSONB layout definition for geometry, field include toggles, positions, and styling.';
COMMENT ON COLUMN public.label_templates.archived_at IS
  'Archive timestamp for hiding a template without deleting it.';

CREATE INDEX IF NOT EXISTS idx_label_templates_active_scope
  ON public.label_templates (scope_level, avery_template, name)
  WHERE archived_at IS NULL;

ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS label_templates_inventory_select ON public.label_templates;
CREATE POLICY label_templates_inventory_select
ON public.label_templates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_inventory'
      )::boolean, FALSE) IS TRUE
  )
);

DROP POLICY IF EXISTS label_templates_manager_insert ON public.label_templates;
CREATE POLICY label_templates_manager_insert
ON public.label_templates
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.jwt() ->> 'sub'
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.role IN ('Developer', 'Administrator', 'Admin')
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_inventory'
      )::boolean, FALSE) IS TRUE
  )
);

DROP POLICY IF EXISTS label_templates_manager_update ON public.label_templates;
CREATE POLICY label_templates_manager_update
ON public.label_templates
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.role IN ('Developer', 'Administrator', 'Admin')
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
      AND up.role IN ('Developer', 'Administrator', 'Admin')
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_inventory'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.label_templates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.label_templates TO authenticated;
