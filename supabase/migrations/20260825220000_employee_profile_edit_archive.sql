-- Adds audited edit and recoverable archive actions to pending Add User profiles.
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE OR REPLACE FUNCTION public.update_pending_employee_profile(
  p_profile_id UUID, p_email TEXT, p_display_name TEXT, p_role TEXT, p_division TEXT,
  p_job_title TEXT, p_phone TEXT, p_notes TEXT, p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  caller public.user_permissions%ROWTYPE;
  before_row public.employee_profiles%ROWTYPE;
  saved public.employee_profiles%ROWTYPE;
  normalized_email TEXT:=lower(NULLIF(BTRIM(COALESCE(p_email,'')),''));
  normalized_name TEXT:=NULLIF(BTRIM(COALESCE(p_display_name,'')),'');
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO caller FROM public.user_permissions
  WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active=TRUE LIMIT 1;
  IF caller.id IS NULL OR COALESCE((public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides)->>'can_manage_employees')::BOOLEAN,FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE='42501';
  END IF;
  IF p_profile_id IS NULL OR normalized_email IS NULL OR normalized_name IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'profile, email, name, and reason are required' USING ERRCODE='22004';
  END IF;
  IF normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'a valid email is required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO before_row FROM public.employee_profiles
  WHERE id=p_profile_id AND clerk_user_id IS NULL AND archived_at IS NULL FOR UPDATE;
  IF before_row.id IS NULL THEN
    RAISE EXCEPTION 'active pending employee profile not found' USING ERRCODE='P0002';
  END IF;
  UPDATE public.employee_profiles SET
    email=normalized_email, display_name=normalized_name,
    role=COALESCE(NULLIF(BTRIM(p_role),''),'User'), division=NULLIF(BTRIM(p_division),''),
    job_title=NULLIF(BTRIM(p_job_title),''), phone=NULLIF(BTRIM(p_phone),''),
    notes=NULLIF(BTRIM(p_notes),''), updated_at=NOW()
  WHERE id=before_row.id RETURNING * INTO saved;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(auth.jwt()->>'sub',COALESCE(caller.display_name,caller.email,auth.jwt()->>'sub'),'employee_profiles',saved.id::TEXT,'update',to_jsonb(before_row),to_jsonb(saved),normalized_reason);
  RETURN saved.id;
END $$;

CREATE OR REPLACE FUNCTION public.archive_pending_employee_profile(p_profile_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  caller public.user_permissions%ROWTYPE;
  target public.employee_profiles%ROWTYPE;
  normalized_reason TEXT:=NULLIF(BTRIM(COALESCE(p_reason,'')),'');
BEGIN
  SELECT * INTO caller FROM public.user_permissions
  WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active=TRUE LIMIT 1;
  IF caller.id IS NULL OR COALESCE((public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides)->>'can_manage_employees')::BOOLEAN,FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE='42501';
  END IF;
  IF p_profile_id IS NULL OR normalized_reason IS NULL THEN
    RAISE EXCEPTION 'profile and archive reason are required' USING ERRCODE='22004';
  END IF;
  SELECT * INTO target FROM public.employee_profiles
  WHERE id=p_profile_id AND clerk_user_id IS NULL AND archived_at IS NULL FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'active pending employee profile not found' USING ERRCODE='P0002';
  END IF;
  UPDATE public.employee_profiles SET archived_at=NOW(),archived_by=auth.jwt()->>'sub',archive_reason=normalized_reason,updated_at=NOW()
  WHERE id=target.id;
  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,after_data,note)
  VALUES(auth.jwt()->>'sub',COALESCE(caller.display_name,caller.email,auth.jwt()->>'sub'),'employee_profiles',target.id::TEXT,'archive',to_jsonb(target),to_jsonb(target)||jsonb_build_object('archived_at',NOW(),'archived_by',auth.jwt()->>'sub','archive_reason',normalized_reason),normalized_reason);
END $$;

DROP FUNCTION IF EXISTS public.read_pending_employee_profiles(INTEGER);
CREATE FUNCTION public.read_pending_employee_profiles(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(id UUID,display_name TEXT,email TEXT,role TEXT,division TEXT,job_title TEXT,phone TEXT,notes TEXT,created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE caller public.user_permissions%ROWTYPE;
BEGIN
  SELECT * INTO caller FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND is_active=TRUE LIMIT 1;
  IF caller.id IS NULL OR COALESCE((public.effective_permissions_for_user(caller.role,caller.division,caller.permission_overrides)->>'can_manage_employees')::BOOLEAN,FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'employee management permission is required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT ep.id,ep.display_name,ep.email,ep.role,ep.division,ep.job_title,ep.phone,ep.notes,ep.created_at
  FROM public.employee_profiles ep WHERE ep.clerk_user_id IS NULL AND ep.archived_at IS NULL
  ORDER BY ep.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,200),1),500);
END $$;

CREATE OR REPLACE FUNCTION public.get_or_create_user_permissions(p_clerk_user_id TEXT,p_display_name TEXT DEFAULT NULL,p_email TEXT DEFAULT NULL)
RETURNS TABLE(clerk_user_id TEXT,display_name TEXT,email TEXT,role TEXT,division TEXT,effective_permissions JSONB,is_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE jwt_subject TEXT:=auth.jwt()->>'sub'; profile public.employee_profiles%ROWTYPE; normalized_email TEXT:=lower(NULLIF(BTRIM(COALESCE(p_email,'')),''));
BEGIN
  IF jwt_subject IS NULL OR p_clerk_user_id IS NULL OR p_clerk_user_id<>jwt_subject THEN RAISE EXCEPTION 'authenticated Clerk JWT is required'; END IF;
  SELECT * INTO profile FROM public.employee_profiles ep WHERE ep.email=normalized_email AND ep.clerk_user_id IS NULL AND ep.archived_at IS NULL LIMIT 1;
  INSERT INTO public.user_permissions AS up(clerk_user_id,display_name,email,role,division,permission_overrides,is_active)
  VALUES(p_clerk_user_id,COALESCE(profile.display_name,p_display_name),COALESCE(profile.email,normalized_email),COALESCE(profile.role,'User'),profile.division,'{}'::JSONB,TRUE)
  ON CONFLICT ON CONSTRAINT user_permissions_clerk_user_id_key DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,up.display_name),email=COALESCE(EXCLUDED.email,up.email),updated_at=NOW();
  IF profile.id IS NOT NULL THEN UPDATE public.employee_profiles SET clerk_user_id=p_clerk_user_id,linked_at=NOW(),updated_at=NOW() WHERE id=profile.id; END IF;
  RETURN QUERY SELECT up.clerk_user_id,up.display_name,up.email,up.role,up.division,public.effective_permissions_for_user(up.role,up.division,up.permission_overrides),up.is_active FROM public.user_permissions up WHERE up.clerk_user_id=p_clerk_user_id AND up.is_active;
END $$;

REVOKE ALL ON FUNCTION public.update_pending_employee_profile(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_pending_employee_profile(UUID,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.read_pending_employee_profiles(INTEGER) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_pending_employee_profile(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_pending_employee_profile(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_pending_employee_profiles(INTEGER) TO authenticated;
