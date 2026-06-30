CREATE TABLE public.job_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  item_id UUID NOT NULL REFERENCES public.items(id),
  requested_quantity NUMERIC NOT NULL CHECK (requested_quantity > 0),
  note TEXT,
  material_name_snapshot TEXT,
  material_code_snapshot TEXT,
  created_by TEXT
);

COMMENT ON TABLE public.job_materials IS
  'Job Material List planning/demand rows only. No inventory reservation, issue, transaction, or balance behavior.';
COMMENT ON COLUMN public.job_materials.requested_quantity IS
  'Planning-only requested quantity. Fulfillment is derived later from ledger activity and is not stored here.';
COMMENT ON COLUMN public.job_materials.material_name_snapshot IS
  'Display-only material name snapshot copied from the catalog item.';
COMMENT ON COLUMN public.job_materials.material_code_snapshot IS
  'Display-only material code snapshot copied from the catalog item.';

CREATE TRIGGER set_job_materials_updated_at
BEFORE UPDATE ON public.job_materials
FOR EACH ROW
EXECUTE FUNCTION touch_user_permissions_updated_at();

ALTER TABLE public.job_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_materials_read
ON public.job_materials
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND (
        COALESCE((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, FALSE) IS TRUE
        OR up.division = job_materials.division
      )
  )
);

CREATE POLICY job_materials_insert
ON public.job_materials
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_materials.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

CREATE POLICY job_materials_update
ON public.job_materials
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_materials.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.clerk_user_id = auth.jwt() ->> 'sub'
      AND up.is_active = TRUE
      AND up.division = job_materials.division
      AND COALESCE((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, FALSE) IS TRUE
  )
);

REVOKE ALL ON public.job_materials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_materials TO authenticated;
