CREATE TABLE IF NOT EXISTS public.estimate_quote_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT,
  package_type TEXT NOT NULL DEFAULT 'vendor_quote',
  vendor_name TEXT NOT NULL,
  quote_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_at DATE,
  received_at DATE,
  expires_at DATE,
  quoted_cost NUMERIC NOT NULL DEFAULT 0,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  lead_time_days NUMERIC,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  pricing_line_id UUID REFERENCES public.estimate_pricing_lines(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT,
  CONSTRAINT estimate_quote_packages_package_type_check CHECK (package_type IN ('vendor_quote', 'gear_package', 'lighting_package', 'subcontract', 'allowance', 'other')),
  CONSTRAINT estimate_quote_packages_status_check CHECK (status IN ('requested', 'received', 'included', 'excluded', 'expired', 'revised')),
  CONSTRAINT estimate_quote_packages_amounts_check CHECK (quoted_cost >= 0 AND sell_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_estimate_quote_packages_estimate
  ON public.estimate_quote_packages (estimate_id, sort_order, created_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_quote_packages_status
  ON public.estimate_quote_packages (division, status, expires_at)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_estimate_quote_packages_updated_at ON public.estimate_quote_packages;
CREATE TRIGGER set_estimate_quote_packages_updated_at
BEFORE UPDATE ON public.estimate_quote_packages
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.estimate_quote_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_quote_packages_read ON public.estimate_quote_packages;
CREATE POLICY estimate_quote_packages_read
ON public.estimate_quote_packages
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_quote_packages.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_quote_packages.division
      AND (
        public.current_user_can_read_division(e.division, 'can_estimate')
        OR public.current_user_can_read_division(e.division, 'can_approve_estimates')
      )
  )
);

DROP POLICY IF EXISTS estimate_quote_packages_insert ON public.estimate_quote_packages;
CREATE POLICY estimate_quote_packages_insert
ON public.estimate_quote_packages
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_quote_packages.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_quote_packages.division
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

DROP POLICY IF EXISTS estimate_quote_packages_update ON public.estimate_quote_packages;
CREATE POLICY estimate_quote_packages_update
ON public.estimate_quote_packages
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_quote_packages.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_quote_packages.division
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.id = estimate_quote_packages.estimate_id
      AND e.archived_at IS NULL
      AND e.division = estimate_quote_packages.division
      AND public.current_user_can_edit_division(e.division, 'can_estimate')
  )
);

REVOKE ALL ON public.estimate_quote_packages FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estimate_quote_packages TO authenticated;

COMMENT ON TABLE public.estimate_quote_packages IS
  'Vendor quotes and estimate packages such as gear, lighting, subcontract, and allowance packages. Estimate pricing can reference or generate from these rows.';
