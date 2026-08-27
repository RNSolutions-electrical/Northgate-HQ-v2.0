-- These legacy operational tables previously relied on broad authenticated
-- table grants with RLS disabled. Browser reads and writes now stay behind
-- scoped views or permission-checked RPCs, so deny direct table access.
ALTER TABLE public.change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_bin_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.change_logs,
  public.vehicles,
  public.inventory_transactions,
  public.transaction_items,
  public.vehicle_bins,
  public.vehicle_bin_items,
  public.notifications
FROM anon, authenticated;

-- Explicit deny policies document the RPC-only boundary and prevent later
-- privilege changes from silently reopening a direct PostgREST path.
DROP POLICY IF EXISTS change_logs_no_direct_client_access ON public.change_logs;
CREATE POLICY change_logs_no_direct_client_access ON public.change_logs
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS vehicles_no_direct_client_access ON public.vehicles;
CREATE POLICY vehicles_no_direct_client_access ON public.vehicles
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS inventory_transactions_no_direct_client_access ON public.inventory_transactions;
CREATE POLICY inventory_transactions_no_direct_client_access ON public.inventory_transactions
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS transaction_items_no_direct_client_access ON public.transaction_items;
CREATE POLICY transaction_items_no_direct_client_access ON public.transaction_items
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS vehicle_bins_no_direct_client_access ON public.vehicle_bins;
CREATE POLICY vehicle_bins_no_direct_client_access ON public.vehicle_bins
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS vehicle_bin_items_no_direct_client_access ON public.vehicle_bin_items;
CREATE POLICY vehicle_bin_items_no_direct_client_access ON public.vehicle_bin_items
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);
DROP POLICY IF EXISTS notifications_no_direct_client_access ON public.notifications;
CREATE POLICY notifications_no_direct_client_access ON public.notifications
  FOR ALL TO authenticated USING (FALSE) WITH CHECK (FALSE);

-- Legacy client-side audit calls are retained through this constrained RPC.
-- Identity comes from the signed JWT; callers cannot choose a user ID/name.
CREATE OR REPLACE FUNCTION public.record_client_audit_event(
  p_table_name TEXT,
  p_record_id TEXT,
  p_action TEXT,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  actor public.user_permissions%ROWTYPE;
  actor_permissions JSONB;
  normalized_table TEXT := NULLIF(BTRIM(COALESCE(p_table_name, '')), '');
  normalized_record TEXT := NULLIF(BTRIM(COALESCE(p_record_id, '')), '');
  normalized_action TEXT := NULLIF(BTRIM(COALESCE(p_action, '')), '');
  normalized_note TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  can_record BOOLEAN := FALSE;
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO actor FROM public.user_permissions up
  WHERE up.clerk_user_id = actor_id AND up.is_active = TRUE
  LIMIT 1;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_table IS NULL OR normalized_record IS NULL OR length(normalized_record) > 255 THEN
    RAISE EXCEPTION 'audit table name and record id are required' USING ERRCODE = '22023';
  END IF;
  IF normalized_action IS NULL OR normalized_action <> ALL (ARRAY['create','update','delete','restore','archive','import','permission_change','physical_count_correction','certify','deny']) THEN
    RAISE EXCEPTION 'audit action is not supported' USING ERRCODE = '22023';
  END IF;
  IF normalized_note IS NOT NULL AND length(normalized_note) > 4000 THEN
    RAISE EXCEPTION 'audit note must be 4000 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(COALESCE(p_before_data, '{}'::jsonb)) > 131072
     OR pg_column_size(COALESCE(p_after_data, '{}'::jsonb)) > 131072 THEN
    RAISE EXCEPTION 'audit payload is too large' USING ERRCODE = '22023';
  END IF;

  actor_permissions := public.effective_permissions_for_user(actor.role, actor.division, actor.permission_overrides);
  IF normalized_table = 'tools' THEN
    can_record := COALESCE((actor_permissions ->> 'can_manage_tools')::BOOLEAN, FALSE);
  ELSIF normalized_table = ANY (ARRAY['estimates','estimate_pricing_lines','assembly_items','items','assemblies','documents','estimate_quote_packages']) THEN
    can_record := COALESCE((actor_permissions ->> 'can_estimate')::BOOLEAN, FALSE)
      OR COALESCE((actor_permissions ->> 'can_edit_catalog')::BOOLEAN, FALSE);
  ELSIF normalized_table = ANY (ARRAY['jobs','job_buyout_vendor_quotes']) THEN
    can_record := COALESCE((actor_permissions ->> 'can_manage_jobs')::BOOLEAN, FALSE)
      OR COALESCE((actor_permissions ->> 'can_approve_budget')::BOOLEAN, FALSE);
  END IF;
  IF can_record IS NOT TRUE THEN
    RAISE EXCEPTION 'permission is required to record this audit event' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.change_logs (
    user_id, user_name, table_name, record_id, action, before_data, after_data, note
  ) VALUES (
    actor_id,
    COALESCE(NULLIF(actor.display_name, ''), NULLIF(actor.email, ''), actor_id),
    normalized_table,
    normalized_record,
    normalized_action,
    p_before_data,
    p_after_data,
    normalized_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_client_audit_event(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_client_audit_event(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;
