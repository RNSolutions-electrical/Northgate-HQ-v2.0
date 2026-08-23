ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS estimating_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS inventory_tracking_status TEXT NOT NULL DEFAULT 'not_stocked',
  ADD COLUMN IF NOT EXISTS neca_labor_unit TEXT NOT NULL DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS estimating_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'items_inventory_tracking_status_check'
      AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_inventory_tracking_status_check
      CHECK (inventory_tracking_status IN ('not_stocked', 'in_inventory', 'retired'));
  END IF;
END $$;

UPDATE public.items i
SET inventory_tracking_status = 'in_inventory'
WHERE EXISTS (
  SELECT 1
  FROM public.bin_items bi
  WHERE bi.item_id = i.id
    AND bi.archived_at IS NULL
);

UPDATE public.items
SET inventory_tracking_status = 'retired'
WHERE is_archived IS TRUE;

CREATE INDEX IF NOT EXISTS idx_items_estimating_catalog
  ON public.items (estimating_enabled, is_active, is_archived, name);

CREATE INDEX IF NOT EXISTS idx_items_inventory_tracking_status
  ON public.items (inventory_tracking_status, is_active, is_archived, name);

COMMENT ON COLUMN public.items.estimating_enabled IS
  'When true, this master catalog item can be searched and used by estimating, assemblies, and takeoffs.';
COMMENT ON COLUMN public.items.inventory_tracking_status IS
  'Inventory availability marker for the master catalog: not_stocked, in_inventory, or retired.';
COMMENT ON COLUMN public.items.neca_labor_unit IS
  'Unit label for labor_rate_hrs. NECA labor values are currently stored as hours per catalog unit.';
COMMENT ON COLUMN public.items.estimating_note IS
  'Estimating-only catalog note. Does not affect inventory balances.';

CREATE TABLE IF NOT EXISTS public.assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  assembly_code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  description TEXT,
  is_library_item BOOLEAN NOT NULL DEFAULT TRUE,
  source_estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS assemblies_division_code_unique
  ON public.assemblies (division, assembly_code)
  WHERE assembly_code IS NOT NULL
    AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assemblies_division_name
  ON public.assemblies (division, name)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_assemblies_updated_at ON public.assemblies;
CREATE TRIGGER set_assemblies_updated_at
BEFORE UPDATE ON public.assemblies
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assemblies_read ON public.assemblies;
CREATE POLICY assemblies_read
ON public.assemblies
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND (
    public.current_user_can_read_division(division, 'can_estimate')
    OR public.current_user_can_read_division(division, 'can_approve_estimates')
  )
);

DROP POLICY IF EXISTS assemblies_insert ON public.assemblies;
CREATE POLICY assemblies_insert
ON public.assemblies
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_estimate')
);

DROP POLICY IF EXISTS assemblies_update ON public.assemblies;
CREATE POLICY assemblies_update
ON public.assemblies
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND public.current_user_can_edit_division(division, 'can_estimate')
)
WITH CHECK (
  public.current_user_can_edit_division(division, 'can_estimate')
);

REVOKE ALL ON public.assemblies FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.assemblies TO authenticated;

CREATE TABLE IF NOT EXISTS public.assembly_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  line_type TEXT NOT NULL DEFAULT 'material' CHECK (
    line_type IN ('material', 'labor', 'equipment', 'subcontract', 'other')
  ),
  description TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  waste_percent NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (waste_percent >= 0),
  unit TEXT,
  unit_cost_snapshot NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (unit_cost_snapshot >= 0),
  labor_rate_hrs_snapshot NUMERIC(14, 6) NOT NULL DEFAULT 0 CHECK (labor_rate_hrs_snapshot >= 0),
  labor_rate_per_hour_snapshot NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (labor_rate_per_hour_snapshot >= 0),
  material_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND((quantity * (1 + waste_percent / 100)) * unit_cost_snapshot, 2)
  ) STORED,
  labor_hours_total NUMERIC(14, 4) GENERATED ALWAYS AS (
    ROUND((quantity * (1 + waste_percent / 100)) * labor_rate_hrs_snapshot, 4)
  ) STORED,
  labor_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND((quantity * (1 + waste_percent / 100)) * labor_rate_hrs_snapshot * labor_rate_per_hour_snapshot, 2)
  ) STORED,
  line_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND(
      ((quantity * (1 + waste_percent / 100)) * unit_cost_snapshot)
      + ((quantity * (1 + waste_percent / 100)) * labor_rate_hrs_snapshot * labor_rate_per_hour_snapshot),
      2
    )
  ) STORED,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_assembly_items_assembly
  ON public.assembly_items (assembly_id, sort_order, created_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assembly_items_item
  ON public.assembly_items (item_id)
  WHERE item_id IS NOT NULL
    AND archived_at IS NULL;

DROP TRIGGER IF EXISTS set_assembly_items_updated_at ON public.assembly_items;
CREATE TRIGGER set_assembly_items_updated_at
BEFORE UPDATE ON public.assembly_items
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.assembly_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_items_read ON public.assembly_items;
CREATE POLICY assembly_items_read
ON public.assembly_items
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.assemblies a
    WHERE a.id = assembly_items.assembly_id
      AND a.archived_at IS NULL
      AND a.division = assembly_items.division
      AND (
        public.current_user_can_read_division(a.division, 'can_estimate')
        OR public.current_user_can_read_division(a.division, 'can_approve_estimates')
      )
  )
);

DROP POLICY IF EXISTS assembly_items_insert ON public.assembly_items;
CREATE POLICY assembly_items_insert
ON public.assembly_items
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.assemblies a
    WHERE a.id = assembly_items.assembly_id
      AND a.archived_at IS NULL
      AND a.division = assembly_items.division
      AND public.current_user_can_edit_division(a.division, 'can_estimate')
  )
);

DROP POLICY IF EXISTS assembly_items_update ON public.assembly_items;
CREATE POLICY assembly_items_update
ON public.assembly_items
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.assemblies a
    WHERE a.id = assembly_items.assembly_id
      AND a.archived_at IS NULL
      AND a.division = assembly_items.division
      AND public.current_user_can_edit_division(a.division, 'can_estimate')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.assemblies a
    WHERE a.id = assembly_items.assembly_id
      AND a.archived_at IS NULL
      AND a.division = assembly_items.division
      AND public.current_user_can_edit_division(a.division, 'can_estimate')
  )
);

REVOKE ALL ON public.assembly_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.assembly_items TO authenticated;

CREATE TABLE IF NOT EXISTS public.estimate_takeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  name TEXT NOT NULL,
  area TEXT,
  system TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_estimate_takeoffs_estimate
  ON public.estimate_takeoffs (estimate_id, sort_order, created_at)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_estimate_takeoffs_updated_at ON public.estimate_takeoffs;
CREATE TRIGGER set_estimate_takeoffs_updated_at
BEFORE UPDATE ON public.estimate_takeoffs
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.estimate_takeoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_takeoffs_read ON public.estimate_takeoffs;
CREATE POLICY estimate_takeoffs_read
ON public.estimate_takeoffs
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoffs.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoffs.division
      AND (
        public.current_user_can_read_division(e.division, 'can_estimate')
        OR public.current_user_can_read_division(e.division, 'can_approve_estimates')
      )
  )
);

DROP POLICY IF EXISTS estimate_takeoffs_insert ON public.estimate_takeoffs;
CREATE POLICY estimate_takeoffs_insert
ON public.estimate_takeoffs
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoffs.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoffs.division
      AND e.status <> 'archived'
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

DROP POLICY IF EXISTS estimate_takeoffs_update ON public.estimate_takeoffs;
CREATE POLICY estimate_takeoffs_update
ON public.estimate_takeoffs
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoffs.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoffs.division
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoffs.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoffs.division
      AND e.status <> 'archived'
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

REVOKE ALL ON public.estimate_takeoffs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estimate_takeoffs TO authenticated;

CREATE TABLE IF NOT EXISTS public.estimate_takeoff_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  takeoff_id UUID REFERENCES public.estimate_takeoffs(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  source_assembly_id UUID REFERENCES public.assemblies(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  line_type TEXT NOT NULL DEFAULT 'material' CHECK (
    line_type IN ('assembly', 'material', 'labor', 'equipment', 'subcontract', 'other')
  ),
  description TEXT NOT NULL,
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  waste_percent NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (waste_percent >= 0),
  unit TEXT,
  unit_cost_snapshot NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (unit_cost_snapshot >= 0),
  labor_rate_hrs_snapshot NUMERIC(14, 6) NOT NULL DEFAULT 0 CHECK (labor_rate_hrs_snapshot >= 0),
  labor_rate_per_hour_snapshot NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (labor_rate_per_hour_snapshot >= 0),
  material_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND((quantity * (1 + waste_percent / 100)) * unit_cost_snapshot, 2)
  ) STORED,
  labor_hours_total NUMERIC(14, 4) GENERATED ALWAYS AS (
    ROUND((quantity * (1 + waste_percent / 100)) * labor_rate_hrs_snapshot, 4)
  ) STORED,
  labor_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND((quantity * (1 + waste_percent / 100)) * labor_rate_hrs_snapshot * labor_rate_per_hour_snapshot, 2)
  ) STORED,
  line_total NUMERIC(14, 2) GENERATED ALWAYS AS (
    ROUND(
      ((quantity * (1 + waste_percent / 100)) * unit_cost_snapshot)
      + ((quantity * (1 + waste_percent / 100)) * labor_rate_hrs_snapshot * labor_rate_per_hour_snapshot),
      2
    )
  ) STORED,
  sort_order INTEGER NOT NULL DEFAULT 0,
  one_time_use BOOLEAN NOT NULL DEFAULT FALSE,
  save_to_library BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_estimate_takeoff_lines_estimate
  ON public.estimate_takeoff_lines (estimate_id, sort_order, created_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_takeoff_lines_takeoff
  ON public.estimate_takeoff_lines (takeoff_id, sort_order, created_at)
  WHERE takeoff_id IS NOT NULL
    AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_takeoff_lines_item
  ON public.estimate_takeoff_lines (item_id)
  WHERE item_id IS NOT NULL
    AND archived_at IS NULL;

DROP TRIGGER IF EXISTS set_estimate_takeoff_lines_updated_at ON public.estimate_takeoff_lines;
CREATE TRIGGER set_estimate_takeoff_lines_updated_at
BEFORE UPDATE ON public.estimate_takeoff_lines
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.estimate_takeoff_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_takeoff_lines_read ON public.estimate_takeoff_lines;
CREATE POLICY estimate_takeoff_lines_read
ON public.estimate_takeoff_lines
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoff_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoff_lines.division
      AND (
        public.current_user_can_read_division(e.division, 'can_estimate')
        OR public.current_user_can_read_division(e.division, 'can_approve_estimates')
      )
  )
);

DROP POLICY IF EXISTS estimate_takeoff_lines_insert ON public.estimate_takeoff_lines;
CREATE POLICY estimate_takeoff_lines_insert
ON public.estimate_takeoff_lines
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoff_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoff_lines.division
      AND e.status <> 'archived'
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

DROP POLICY IF EXISTS estimate_takeoff_lines_update ON public.estimate_takeoff_lines;
CREATE POLICY estimate_takeoff_lines_update
ON public.estimate_takeoff_lines
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoff_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoff_lines.division
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_takeoff_lines.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_takeoff_lines.division
      AND e.status <> 'archived'
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

REVOKE ALL ON public.estimate_takeoff_lines FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estimate_takeoff_lines TO authenticated;

COMMENT ON TABLE public.assemblies IS
  'Reusable and estimate-origin assembly headers for estimating. Assembly lines snapshot catalog pricing/labor values.';
COMMENT ON TABLE public.assembly_items IS
  'Reusable assembly material/labor/equipment lines. Lines can reference master catalog items but retain pricing and labor snapshots.';
COMMENT ON TABLE public.estimate_takeoffs IS
  'Estimate-owned takeoff groups such as areas, systems, rooms, or scopes.';
COMMENT ON TABLE public.estimate_takeoff_lines IS
  'Estimate-owned takeoff lines created from catalog items, assemblies, or one-time entries. Totals are snapshots for bid integrity.';
