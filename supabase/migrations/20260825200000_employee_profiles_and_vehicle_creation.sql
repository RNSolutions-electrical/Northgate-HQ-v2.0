CREATE TABLE IF NOT EXISTS public.employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'User',
  division TEXT,
  job_title TEXT,
  phone TEXT,
  notes TEXT,
  clerk_user_id TEXT UNIQUE,
  linked_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_profiles_email_lower_unique UNIQUE (email)
);
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_employee_profile(
  p_email TEXT, p_display_name TEXT, p_role TEXT, p_division TEXT,
  p_job_title TEXT, p_phone TEXT, p_notes TEXT, p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller public.user_permissions%ROWTYPE;
  normalized_email TEXT := lower(NULLIF(trim(COALESCE(p_email, '')), ''));
  normalized_name TEXT := NULLIF(trim(COALESCE(p_display_name, '')), '');
  normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  saved public.employee_profiles%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND is_active LIMIT 1;
  IF NOT FOUND OR COALESCE((public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides)->>'can_manage_employees')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_email IS NULL OR normalized_name IS NULL OR normalized_reason IS NULL THEN RAISE EXCEPTION 'email, name, and reason are required' USING ERRCODE = '22004'; END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'a valid email is required' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.employee_profiles (email, display_name, role, division, job_title, phone, notes, created_by)
  VALUES (normalized_email, normalized_name, COALESCE(NULLIF(trim(p_role), ''), 'User'), NULLIF(trim(p_division), ''), NULLIF(trim(p_job_title), ''), NULLIF(trim(p_phone), ''), NULLIF(trim(p_notes), ''), auth.jwt() ->> 'sub')
  ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, division = EXCLUDED.division, job_title = EXCLUDED.job_title, phone = EXCLUDED.phone, notes = EXCLUDED.notes, updated_at = NOW()
  RETURNING * INTO saved;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note)
  VALUES (auth.jwt() ->> 'sub', COALESCE(caller.display_name, caller.email, auth.jwt() ->> 'sub'), 'employee_profiles', saved.id::TEXT, 'update', to_jsonb(saved), normalized_reason);
  RETURN saved.id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_vehicle(
  p_vehicle_number TEXT, p_name TEXT, p_classification TEXT, p_description TEXT, p_holds_stock BOOLEAN, p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller public.user_permissions%ROWTYPE; saved public.vehicles%ROWTYPE; normalized_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), ''); BEGIN
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id = (auth.jwt() ->> 'sub') AND is_active LIMIT 1;
  IF NOT FOUND OR COALESCE((public.effective_permissions_for_user(caller.role, caller.division, caller.permission_overrides)->>'can_manage_vehicles')::BOOLEAN, FALSE) IS NOT TRUE THEN RAISE EXCEPTION 'vehicle management permission is required' USING ERRCODE = '42501'; END IF;
  IF normalized_reason IS NULL OR (NULLIF(trim(COALESCE(p_vehicle_number, '')), '') IS NULL AND NULLIF(trim(COALESCE(p_name, '')), '') IS NULL) THEN RAISE EXCEPTION 'vehicle unit or name and a reason are required' USING ERRCODE = '22004'; END IF;
  INSERT INTO public.vehicles (vehicle_number, name, display_name, classification, description, holds_stock, is_active)
  VALUES (NULLIF(trim(p_vehicle_number), ''), NULLIF(trim(p_name), ''), COALESCE(NULLIF(trim(p_vehicle_number), ''), NULLIF(trim(p_name), '')), NULLIF(trim(p_classification), ''), NULLIF(trim(p_description), ''), COALESCE(p_holds_stock, FALSE), TRUE)
  RETURNING * INTO saved;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note) VALUES (auth.jwt() ->> 'sub', COALESCE(caller.display_name, caller.email, auth.jwt() ->> 'sub'), 'vehicles', saved.id::TEXT, 'create', to_jsonb(saved), normalized_reason);
  RETURN saved.id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_or_create_user_permissions(p_clerk_user_id TEXT, p_display_name TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL)
RETURNS TABLE(clerk_user_id TEXT, display_name TEXT, email TEXT, role TEXT, division TEXT, effective_permissions JSONB, is_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE jwt_subject TEXT := auth.jwt() ->> 'sub'; profile public.employee_profiles%ROWTYPE; normalized_email TEXT := lower(NULLIF(trim(COALESCE(p_email, '')), '')); BEGIN
  IF jwt_subject IS NULL OR p_clerk_user_id IS NULL OR p_clerk_user_id <> jwt_subject THEN RAISE EXCEPTION 'authenticated Clerk JWT is required'; END IF;
  SELECT * INTO profile FROM public.employee_profiles AS ep WHERE ep.email = normalized_email AND ep.clerk_user_id IS NULL LIMIT 1;
  INSERT INTO public.user_permissions AS up (clerk_user_id, display_name, email, role, division, permission_overrides, is_active)
  VALUES (p_clerk_user_id, COALESCE(profile.display_name, p_display_name), COALESCE(profile.email, normalized_email), COALESCE(profile.role, 'User'), profile.division, '{}'::jsonb, TRUE)
  ON CONFLICT ON CONSTRAINT user_permissions_clerk_user_id_key DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, up.display_name), email = COALESCE(EXCLUDED.email, up.email), updated_at = NOW();
  IF profile.id IS NOT NULL THEN UPDATE public.employee_profiles SET clerk_user_id = p_clerk_user_id, linked_at = NOW(), updated_at = NOW() WHERE id = profile.id; END IF;
  RETURN QUERY SELECT up.clerk_user_id, up.display_name, up.email, up.role, up.division, public.effective_permissions_for_user(up.role, up.division, up.permission_overrides), up.is_active FROM public.user_permissions up WHERE up.clerk_user_id = p_clerk_user_id AND up.is_active;
END; $$;

REVOKE ALL ON FUNCTION public.save_employee_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_employee_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_employee_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.create_vehicle(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vehicle(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_vehicle(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM anon;
