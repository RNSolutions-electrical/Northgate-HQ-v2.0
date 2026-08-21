-- Recovered from the applied production migration ledger on 2026-08-21.
-- This migration establishes the audited, division-scoped change-order foundation.

CREATE TABLE IF NOT EXISTS public.change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id),
  division TEXT NOT NULL,
  co_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_amount NUMERIC NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
  cost_amount NUMERIC NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected')),
  submitted_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  archive_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS change_orders_active_number_unique
  ON public.change_orders (job_id, division, LOWER(co_number))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS change_orders_job_status_idx
  ON public.change_orders (job_id, status)
  WHERE archived_at IS NULL;

ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.change_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.change_orders TO authenticated;

DROP POLICY IF EXISTS change_orders_read ON public.change_orders;
CREATE POLICY change_orders_read
  ON public.change_orders
  FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND public.current_user_can_read_division(division, 'can_view_financials')
  );

CREATE OR REPLACE FUNCTION public.save_job_change_order(
  p_change_order_id UUID,
  p_job_id UUID,
  p_division TEXT,
  p_co_number TEXT,
  p_title TEXT,
  p_description TEXT,
  p_price_amount NUMERIC,
  p_cost_amount NUMERIC,
  p_status TEXT,
  p_reason TEXT
)
RETURNS public.change_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  target_job public.jobs%ROWTYPE;
  before_row public.change_orders%ROWTYPE;
  saved_row public.change_orders%ROWTYPE;
  normalized_division TEXT := NULLIF(BTRIM(COALESCE(p_division, '')), '');
  normalized_number TEXT := NULLIF(BTRIM(COALESCE(p_co_number, '')), '');
  normalized_title TEXT := NULLIF(BTRIM(COALESCE(p_title, '')), '');
  normalized_status TEXT := LOWER(NULLIF(BTRIM(COALESCE(p_status, '')), ''));
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  actor_label TEXT;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  IF jwt_subject IS NULL OR LENGTH(BTRIM(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;
  IF p_job_id IS NULL OR normalized_division IS NULL OR normalized_number IS NULL
    OR normalized_title IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'job, division, change order number, title, and reason are required'
      USING ERRCODE = '22004';
  END IF;
  IF normalized_status NOT IN ('proposed', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'change order status must be proposed, approved, or rejected'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_price_amount, 0) < 0 OR COALESCE(p_cost_amount, 0) < 0 THEN
    RAISE EXCEPTION 'change order price and cost cannot be negative' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO caller FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE LIMIT 1;
  IF caller.id IS NULL
    OR public.current_user_can_edit_division(normalized_division, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'can_approve_budget permission is required in this division' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_job FROM public.jobs j
  WHERE j.id = p_job_id AND j.archived_at IS NULL LIMIT 1;
  IF target_job.id IS NULL OR target_job.division <> normalized_division THEN
    RAISE EXCEPTION 'active job was not found in the selected division' USING ERRCODE = 'P0002';
  END IF;
  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);

  IF p_change_order_id IS NULL THEN
    INSERT INTO public.change_orders (
      job_id, division, co_number, title, description, price_amount, cost_amount,
      status, submitted_by, approved_by, approved_at, rejected_by, rejected_at
    ) VALUES (
      p_job_id, normalized_division, normalized_number, normalized_title,
      NULLIF(BTRIM(COALESCE(p_description, '')), ''), COALESCE(p_price_amount, 0),
      COALESCE(p_cost_amount, 0), normalized_status, jwt_subject,
      CASE WHEN normalized_status = 'approved' THEN jwt_subject ELSE NULL END,
      CASE WHEN normalized_status = 'approved' THEN now_stamp ELSE NULL END,
      CASE WHEN normalized_status = 'rejected' THEN jwt_subject ELSE NULL END,
      CASE WHEN normalized_status = 'rejected' THEN now_stamp ELSE NULL END
    ) RETURNING * INTO saved_row;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
    ) VALUES (
      jwt_subject, actor_label, 'change_orders', saved_row.id::TEXT, 'create', NULL,
      jsonb_strip_nulls(to_jsonb(saved_row)), normalized_reason, now_stamp
    );
  ELSE
    SELECT * INTO before_row FROM public.change_orders co
    WHERE co.id = p_change_order_id AND co.archived_at IS NULL FOR UPDATE;
    IF before_row.id IS NULL OR before_row.job_id <> p_job_id
      OR before_row.division <> normalized_division THEN
      RAISE EXCEPTION 'active change order not found for this job and division' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.change_orders
    SET co_number = normalized_number,
        title = normalized_title,
        description = NULLIF(BTRIM(COALESCE(p_description, '')), ''),
        price_amount = COALESCE(p_price_amount, 0),
        cost_amount = COALESCE(p_cost_amount, 0),
        status = normalized_status,
        approved_by = CASE
          WHEN normalized_status = 'approved' AND before_row.status <> 'approved' THEN jwt_subject
          WHEN normalized_status = 'approved' THEN before_row.approved_by ELSE NULL END,
        approved_at = CASE
          WHEN normalized_status = 'approved' AND before_row.status <> 'approved' THEN now_stamp
          WHEN normalized_status = 'approved' THEN before_row.approved_at ELSE NULL END,
        rejected_by = CASE
          WHEN normalized_status = 'rejected' AND before_row.status <> 'rejected' THEN jwt_subject
          WHEN normalized_status = 'rejected' THEN before_row.rejected_by ELSE NULL END,
        rejected_at = CASE
          WHEN normalized_status = 'rejected' AND before_row.status <> 'rejected' THEN now_stamp
          WHEN normalized_status = 'rejected' THEN before_row.rejected_at ELSE NULL END,
        updated_at = now_stamp
    WHERE id = before_row.id
    RETURNING * INTO saved_row;

    INSERT INTO public.change_logs (
      user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
    ) VALUES (
      jwt_subject, actor_label, 'change_orders', saved_row.id::TEXT, 'update',
      jsonb_strip_nulls(to_jsonb(before_row)), jsonb_strip_nulls(to_jsonb(saved_row)),
      normalized_reason, now_stamp
    );
  END IF;
  RETURN saved_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_job_change_order(p_change_order_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_subject TEXT := auth.jwt() ->> 'sub';
  caller public.user_permissions%ROWTYPE;
  before_row public.change_orders%ROWTYPE;
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  actor_label TEXT;
  now_stamp TIMESTAMPTZ := NOW();
BEGIN
  IF jwt_subject IS NULL OR LENGTH(BTRIM(jwt_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '28000';
  END IF;
  IF p_change_order_id IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'change order and archive reason are required' USING ERRCODE = '22004';
  END IF;
  SELECT * INTO before_row FROM public.change_orders co
  WHERE co.id = p_change_order_id AND co.archived_at IS NULL FOR UPDATE;
  IF before_row.id IS NULL THEN
    RAISE EXCEPTION 'active change order not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO caller FROM public.user_permissions up
  WHERE up.clerk_user_id = jwt_subject AND up.is_active = TRUE LIMIT 1;
  IF caller.id IS NULL
    OR public.current_user_can_edit_division(before_row.division, 'can_approve_budget') IS NOT TRUE THEN
    RAISE EXCEPTION 'can_approve_budget permission is required in this division' USING ERRCODE = '42501';
  END IF;
  actor_label := COALESCE(NULLIF(caller.display_name, ''), NULLIF(caller.email, ''), jwt_subject);
  UPDATE public.change_orders
  SET archived_at = now_stamp, archived_by = jwt_subject,
      archive_reason = normalized_reason, updated_at = now_stamp
  WHERE id = before_row.id;
  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note, created_at
  ) VALUES (
    jwt_subject, actor_label, 'change_orders', before_row.id::TEXT, 'update',
    jsonb_strip_nulls(to_jsonb(before_row)),
    jsonb_strip_nulls(to_jsonb(before_row) || jsonb_build_object(
      'archived_at', now_stamp, 'archived_by', jwt_subject,
      'archive_reason', normalized_reason, 'updated_at', now_stamp
    )), normalized_reason, now_stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_job_change_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_job_change_order(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.change_orders IS 'Audited job change orders with division-scoped financial access.';
COMMENT ON FUNCTION public.save_job_change_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT)
  IS 'Creates or updates a job change order and its audit entry.';
COMMENT ON FUNCTION public.archive_job_change_order(UUID, TEXT)
  IS 'Archives a job change order and records the audit entry.';
