-- CANDIDATE ONLY: not a numbered migration and not approved for execution.
-- It is intentionally outside supabase/migrations so staging db push cannot
-- replay a Production-specific reconciliation. Move into a CLI-created
-- migration only after final live schema comparison and owner approval.
-- Preserve Production's current save_job_change_order_draft function.
BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='change_order_lines'
      AND column_name='job_budget_line_id' AND is_nullable='NO'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='change_orders'
      AND column_name='guided_state'
  ) OR to_regprocedure(
    'public.save_guided_change_order_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb)'
  ) IS NOT NULL OR to_regprocedure(
    'public.save_job_change_order_draft(uuid,uuid,text,text,text,text,date,text,jsonb,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Unexpected Change Order schema; stop and re-review target';
  END IF;
END $preflight$;

ALTER TABLE public.change_order_lines ALTER COLUMN job_budget_line_id DROP NOT NULL;
ALTER TABLE public.change_orders ADD COLUMN guided_state jsonb;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_guided_state_object_check
  CHECK (guided_state IS NULL OR jsonb_typeof(guided_state) = 'object');

-- Final stale-write guard from Staging, calling Production's authoritative
-- draft-save RPC. The older uncoded-draft migration must not be replayed.
CREATE FUNCTION public.save_guided_change_order_draft(
  p_change_order_id uuid, p_job_id uuid, p_division text, p_co_number text,
  p_title text, p_description text, p_internal_notes text, p_lines jsonb,
  p_guided_state jsonb
) RETURNS public.change_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  saved public.change_orders%ROWTYPE;
  previous_state jsonb;
  previous_updated_at timestamptz;
  actor_id text := auth.jwt()->>'sub';
  stored_state jsonb;
BEGIN
  IF jsonb_typeof(p_guided_state) IS DISTINCT FROM 'object'
    OR p_guided_state->>'workflow' IS DISTINCT FROM 'change_order'
    OR pg_column_size(p_guided_state) > 100000 THEN
    RAISE EXCEPTION 'A valid guided Change Order state under 100 KB is required' USING ERRCODE='22023';
  END IF;
  IF p_change_order_id IS NOT NULL THEN
    SELECT guided_state,updated_at INTO previous_state,previous_updated_at
      FROM public.change_orders WHERE id=p_change_order_id FOR UPDATE;
    IF previous_updated_at IS NULL OR NULLIF(p_guided_state->>'lastSavedAt','') IS NULL
      OR previous_updated_at IS DISTINCT FROM (p_guided_state->>'lastSavedAt')::timestamptz THEN
      RAISE EXCEPTION 'This Change Order changed since Silas last saved it. Reopen the current draft before editing to avoid overwriting newer work.' USING ERRCODE='40001';
    END IF;
  END IF;
  -- Existing RPC owns the ordinary draft permissions, calculations, and audit.
  saved := public.save_job_change_order_draft(
    p_change_order_id,p_job_id,p_division,p_co_number,p_title,p_description,
    CURRENT_DATE,p_internal_notes,p_lines,'Guided Change Order draft autosave'
  );
  stored_state := p_guided_state || jsonb_build_object('lastSavedAt',saved.updated_at);
  UPDATE public.change_orders SET guided_state=stored_state
    WHERE id=saved.id AND status='draft' RETURNING * INTO saved;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Guidance can only modify a draft Change Order'; END IF;
  IF previous_state IS DISTINCT FROM stored_state THEN
    INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
    VALUES(actor_id,public.change_order_actor(),'change_orders',saved.id::text,'update',
      jsonb_build_object('guided_state',previous_state),
      jsonb_build_object('guided_state',stored_state),'Guided workflow state saved');
  END IF;
  RETURN saved;
END $$;

-- CREATE FUNCTION defaults EXECUTE to PUBLIC. Close it in the same unit.
REVOKE ALL ON FUNCTION public.save_guided_change_order_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_guided_change_order_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb)
  TO authenticated;

DO $postflight$
BEGIN
  IF has_function_privilege(
    'anon','public.save_guided_change_order_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb)','EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated','public.save_guided_change_order_draft(uuid,uuid,text,text,text,text,text,jsonb,jsonb)','EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Guided Change Order execute grants failed';
  END IF;
END $postflight$;
COMMIT;
