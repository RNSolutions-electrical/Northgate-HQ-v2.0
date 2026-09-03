-- Northgate HQ Panel Directory add-on.
-- This intentionally stays independent from jobs, documents, financials, and approvals.

INSERT INTO public.tool_addons (addon_key, label, category, description, is_active)
VALUES ('panel_directory', 'Panel Directory', 'electrical', 'Electrical panel schedules, print directories, and audit history.', TRUE)
ON CONFLICT (addon_key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_active = TRUE,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.panel_directories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation TEXT NOT NULL CHECK (length(BTRIM(designation)) BETWEEN 1 AND 120),
  phase_type TEXT NOT NULL DEFAULT 'three_phase' CHECK (phase_type IN ('single_phase', 'three_phase')),
  system_voltage TEXT NOT NULL DEFAULT '120208' CHECK (system_voltage IN ('120208', '277480', 'other')),
  circuit_count INTEGER NOT NULL DEFAULT 42 CHECK (circuit_count IN (12, 18, 24, 30, 36, 42, 54, 60, 72, 84)),
  phase_color_coding BOOLEAN NOT NULL DEFAULT TRUE,
  circuits JSONB NOT NULL DEFAULT '{"schema_version":1,"items":{}}'::jsonb,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_number TEXT,
  project_name TEXT,
  client_name TEXT,
  project_address TEXT,
  panel_location TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(circuits) = 'object')
);

CREATE INDEX IF NOT EXISTS panel_directories_designation_idx ON public.panel_directories (designation);
CREATE INDEX IF NOT EXISTS panel_directories_job_number_idx ON public.panel_directories (job_number) WHERE job_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS panel_directories_project_name_idx ON public.panel_directories (project_name) WHERE project_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS panel_directories_updated_at_idx ON public.panel_directories (updated_at DESC);

DROP TRIGGER IF EXISTS set_panel_directories_updated_at ON public.panel_directories;
CREATE TRIGGER set_panel_directories_updated_at
BEFORE UPDATE ON public.panel_directories
FOR EACH ROW EXECUTE FUNCTION public.touch_user_permissions_updated_at();

ALTER TABLE public.panel_directories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panel_directories FROM PUBLIC, anon, authenticated;

-- Direct table access is deliberately omitted. These narrow RPCs validate the
-- caller, the circuit geometry, and audit every mutation.
CREATE OR REPLACE FUNCTION public.list_panel_directories(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID, designation TEXT, phase_type TEXT, system_voltage TEXT, circuit_count INTEGER,
  phase_color_coding BOOLEAN, circuits JSONB, job_id UUID, job_number TEXT, project_name TEXT,
  client_name TEXT, project_address TEXT, panel_location TEXT, notes TEXT, created_by TEXT,
  updated_by TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE search_text TEXT := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF auth.jwt() ->> 'sub' IS NULL OR public.current_user_can_access_addon('panel_directory') IS NOT TRUE THEN
    RAISE EXCEPTION 'Panel Directory access is required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pd.id, pd.designation, pd.phase_type, pd.system_voltage, pd.circuit_count,
    pd.phase_color_coding, pd.circuits, pd.job_id, pd.job_number, pd.project_name,
    pd.client_name, pd.project_address, pd.panel_location, pd.notes, pd.created_by,
    pd.updated_by, pd.created_at, pd.updated_at
  FROM public.panel_directories pd
  WHERE search_text IS NULL OR concat_ws(' ', pd.designation, pd.job_number, pd.project_name, pd.client_name, pd.project_address, pd.panel_location) ILIKE '%' || search_text || '%'
  ORDER BY pd.updated_at DESC, pd.designation;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_panel_directory(p_id UUID DEFAULT NULL, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS public.panel_directories
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  prior public.panel_directories%ROWTYPE;
  saved public.panel_directories%ROWTYPE;
  item_key TEXT;
  item JSONB;
  start_position INTEGER;
  pole_count INTEGER;
  occupied INTEGER[] := ARRAY[]::INTEGER[];
  circuit_limit INTEGER;
  phase_value TEXT;
  action_value TEXT;
BEGIN
  IF actor_id IS NULL OR public.current_user_can_access_addon('panel_directory') IS NOT TRUE THEN
    RAISE EXCEPTION 'Panel Directory access is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' OR length(BTRIM(COALESCE(p_payload->>'designation',''))) = 0 THEN
    RAISE EXCEPTION 'Panel designation is required' USING ERRCODE = '22023';
  END IF;
  phase_value := COALESCE(p_payload->>'phase_type', 'three_phase');
  circuit_limit := COALESCE(NULLIF(p_payload->>'circuit_count','')::INTEGER, 42);
  IF phase_value NOT IN ('single_phase','three_phase') OR COALESCE(p_payload->>'system_voltage','120208') NOT IN ('120208','277480','other') OR circuit_limit NOT IN (12,18,24,30,36,42,54,60,72,84) THEN
    RAISE EXCEPTION 'Panel electrical configuration is invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_payload->'circuits', '{"schema_version":1,"items":{}}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_payload->'circuits'->'items', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Circuit data is invalid' USING ERRCODE = '22023';
  END IF;
  FOR item_key, item IN SELECT key, value FROM jsonb_each(COALESCE(p_payload->'circuits'->'items', '{}'::jsonb)) LOOP
    BEGIN start_position := item_key::INTEGER; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Circuit position is invalid' USING ERRCODE = '22023'; END;
    pole_count := COALESCE(NULLIF(item->>'poles','')::INTEGER, 1);
    IF start_position < 1 OR start_position > circuit_limit OR pole_count NOT IN (1,2,3) OR (phase_value = 'single_phase' AND pole_count > 2) THEN
      RAISE EXCEPTION 'Circuit position or pole count is invalid' USING ERRCODE = '22023';
    END IF;
    IF start_position + (pole_count - 1) * 2 > circuit_limit THEN
      RAISE EXCEPTION 'A multi-pole load extends beyond the panel circuit count' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM generate_series(0, pole_count - 1) g WHERE start_position + g * 2 = ANY(occupied)) THEN
      RAISE EXCEPTION 'Circuit assignments overlap' USING ERRCODE = '22023';
    END IF;
    occupied := occupied || ARRAY(SELECT start_position + g * 2 FROM generate_series(0, pole_count - 1) g);
  END LOOP;
  IF NULLIF(p_payload->>'job_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = (p_payload->>'job_id')::UUID) THEN
    RAISE EXCEPTION 'Selected job was not found' USING ERRCODE = '23503';
  END IF;
  IF p_id IS NOT NULL THEN SELECT * INTO prior FROM public.panel_directories WHERE id = p_id FOR UPDATE; IF prior.id IS NULL THEN RAISE EXCEPTION 'Panel directory was not found' USING ERRCODE = 'P0002'; END IF; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.panel_directories (designation,phase_type,system_voltage,circuit_count,phase_color_coding,circuits,job_id,job_number,project_name,client_name,project_address,panel_location,notes,created_by,updated_by)
    VALUES (BTRIM(p_payload->>'designation'),phase_value,COALESCE(p_payload->>'system_voltage','120208'),circuit_limit,COALESCE((p_payload->>'phase_color_coding')::BOOLEAN,TRUE),COALESCE(p_payload->'circuits','{"schema_version":1,"items":{}}'::jsonb),NULLIF(p_payload->>'job_id','')::UUID,NULLIF(BTRIM(p_payload->>'job_number'),''),NULLIF(BTRIM(p_payload->>'project_name'),''),NULLIF(BTRIM(p_payload->>'client_name'),''),NULLIF(BTRIM(p_payload->>'project_address'),''),NULLIF(BTRIM(p_payload->>'panel_location'),''),NULLIF(BTRIM(p_payload->>'notes'),''),actor_id,actor_id) RETURNING * INTO saved;
    action_value := 'create';
  ELSE
    UPDATE public.panel_directories SET designation=BTRIM(p_payload->>'designation'),phase_type=phase_value,system_voltage=COALESCE(p_payload->>'system_voltage','120208'),circuit_count=circuit_limit,phase_color_coding=COALESCE((p_payload->>'phase_color_coding')::BOOLEAN,TRUE),circuits=COALESCE(p_payload->'circuits','{"schema_version":1,"items":{}}'::jsonb),job_id=NULLIF(p_payload->>'job_id','')::UUID,job_number=NULLIF(BTRIM(p_payload->>'job_number'),''),project_name=NULLIF(BTRIM(p_payload->>'project_name'),''),client_name=NULLIF(BTRIM(p_payload->>'client_name'),''),project_address=NULLIF(BTRIM(p_payload->>'project_address'),''),panel_location=NULLIF(BTRIM(p_payload->>'panel_location'),''),notes=NULLIF(BTRIM(p_payload->>'notes'),''),updated_by=actor_id WHERE id=p_id RETURNING * INTO saved;
    action_value := 'update';
  END IF;
  INSERT INTO public.change_logs (user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES (actor_id,actor_id,'panel_directories',saved.id::TEXT,action_value,CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(prior) END,to_jsonb(saved),format('%s panel directory %s.',initcap(action_value),saved.designation));
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_panel_directory(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor_id TEXT := auth.jwt() ->> 'sub'; prior public.panel_directories%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR public.current_user_can_access_addon('panel_directory') IS NOT TRUE THEN RAISE EXCEPTION 'Panel Directory access is required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO prior FROM public.panel_directories WHERE id=p_id FOR UPDATE;
  IF prior.id IS NULL THEN RAISE EXCEPTION 'Panel directory was not found' USING ERRCODE = 'P0002'; END IF;
  DELETE FROM public.panel_directories WHERE id=p_id;
  INSERT INTO public.change_logs (user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES (actor_id,actor_id,'panel_directories',p_id::TEXT,'delete',to_jsonb(prior),NULL,format('Deleted panel directory %s.',prior.designation));
END;
$$;

REVOKE ALL ON FUNCTION public.list_panel_directories(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_panel_directory(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_panel_directory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_panel_directories(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_panel_directory(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_panel_directory(UUID) TO authenticated;
