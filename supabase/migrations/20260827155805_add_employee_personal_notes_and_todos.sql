-- Private, employee-owned profile notes and work items. Management-controlled
-- employee_profiles.notes remains separate from this personal workspace.
CREATE TABLE public.employee_profile_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES public.user_permissions(clerk_user_id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(BTRIM(body)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX employee_profile_notes_active_owner_updated_idx
  ON public.employee_profile_notes (clerk_user_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE public.employee_profile_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES public.user_permissions(clerk_user_id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(BTRIM(title)) BETWEEN 1 AND 250),
  details TEXT CHECK (details IS NULL OR length(BTRIM(details)) <= 5000),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX employee_profile_todos_active_owner_due_idx
  ON public.employee_profile_todos (clerk_user_id, due_date ASC NULLS LAST, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.employee_profile_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profile_todos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_profile_notes FROM anon, authenticated;
REVOKE ALL ON public.employee_profile_todos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_current_employee_profile_notes(
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  bounded_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT note.id, note.body, note.created_at, note.updated_at
  FROM public.employee_profile_notes note
  WHERE note.clerk_user_id = actor_id
    AND note.archived_at IS NULL
  ORDER BY note.updated_at DESC, note.id DESC
  LIMIT bounded_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_current_employee_profile_note(
  p_note_id UUID DEFAULT NULL,
  p_body TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  normalized_body TEXT := NULLIF(BTRIM(COALESCE(p_body, '')), '');
  saved public.employee_profile_notes%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  IF normalized_body IS NULL OR length(normalized_body) > 5000 THEN
    RAISE EXCEPTION 'note must be between 1 and 5000 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501';
  END IF;

  IF p_note_id IS NULL THEN
    INSERT INTO public.employee_profile_notes (clerk_user_id, body)
    VALUES (actor_id, normalized_body)
    RETURNING * INTO saved;
  ELSE
    UPDATE public.employee_profile_notes
    SET body = normalized_body, updated_at = NOW()
    WHERE id = p_note_id
      AND clerk_user_id = actor_id
      AND archived_at IS NULL
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'personal note was not found' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Do not write note content to the shared legacy audit table.
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note)
  VALUES (actor_id, actor_id, 'employee_profile_notes', saved.id::TEXT,
    CASE WHEN p_note_id IS NULL THEN 'insert' ELSE 'update' END,
    jsonb_build_object('content_length', length(saved.body)), 'Employee updated a private profile note.');

  RETURN saved.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_current_employee_profile_note(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  saved_id UUID;
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN
    RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.employee_profile_notes
  SET archived_at = NOW(), updated_at = NOW()
  WHERE id = p_note_id AND clerk_user_id = actor_id AND archived_at IS NULL
  RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'personal note was not found' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, note)
  VALUES (actor_id, actor_id, 'employee_profile_notes', saved_id::TEXT, 'archive', 'Employee archived a private profile note.');
END;
$$;

CREATE OR REPLACE FUNCTION public.read_current_employee_profile_todos(
  p_include_completed BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  details TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  bounded_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active = TRUE) THEN RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT todo.id, todo.title, todo.details, todo.due_date, todo.completed_at, todo.created_at, todo.updated_at
  FROM public.employee_profile_todos todo
  WHERE todo.clerk_user_id = actor_id
    AND todo.archived_at IS NULL
    AND (p_include_completed OR todo.completed_at IS NULL)
  ORDER BY todo.completed_at NULLS FIRST, todo.due_date ASC NULLS LAST, todo.updated_at DESC, todo.id DESC
  LIMIT bounded_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_current_employee_profile_todo(
  p_todo_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_details TEXT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id TEXT := auth.jwt() ->> 'sub';
  normalized_title TEXT := NULLIF(BTRIM(COALESCE(p_title, '')), '');
  normalized_details TEXT := NULLIF(BTRIM(COALESCE(p_details, '')), '');
  saved public.employee_profile_todos%ROWTYPE;
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501'; END IF;
  IF normalized_title IS NULL OR length(normalized_title) > 250 THEN RAISE EXCEPTION 'to-do title must be between 1 and 250 characters' USING ERRCODE = '22023'; END IF;
  IF normalized_details IS NOT NULL AND length(normalized_details) > 5000 THEN RAISE EXCEPTION 'to-do details must be 5000 characters or fewer' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active = TRUE) THEN RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501'; END IF;
  IF p_todo_id IS NULL THEN
    INSERT INTO public.employee_profile_todos (clerk_user_id, title, details, due_date)
    VALUES (actor_id, normalized_title, normalized_details, p_due_date)
    RETURNING * INTO saved;
  ELSE
    UPDATE public.employee_profile_todos
    SET title = normalized_title, details = normalized_details, due_date = p_due_date, updated_at = NOW()
    WHERE id = p_todo_id AND clerk_user_id = actor_id AND archived_at IS NULL
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN RAISE EXCEPTION 'to-do item was not found' USING ERRCODE = '42501'; END IF;
  END IF;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note)
  VALUES (actor_id, actor_id, 'employee_profile_todos', saved.id::TEXT,
    CASE WHEN p_todo_id IS NULL THEN 'insert' ELSE 'update' END,
    jsonb_build_object('has_due_date', saved.due_date IS NOT NULL, 'is_complete', saved.completed_at IS NOT NULL),
    'Employee saved a private to-do item.');
  RETURN saved.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_current_employee_profile_todo_complete(
  p_todo_id UUID,
  p_completed BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id TEXT := auth.jwt() ->> 'sub'; saved_id UUID;
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501'; END IF;
  UPDATE public.employee_profile_todos
  SET completed_at = CASE WHEN p_completed THEN NOW() ELSE NULL END, updated_at = NOW()
  WHERE id = p_todo_id AND clerk_user_id = actor_id AND archived_at IS NULL
  RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'to-do item was not found' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, note)
  VALUES (actor_id, actor_id, 'employee_profile_todos', saved_id::TEXT,
    CASE WHEN p_completed THEN 'complete' ELSE 'reopen' END, 'Employee updated a private to-do item status.');
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_current_employee_profile_todo(p_todo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id TEXT := auth.jwt() ->> 'sub'; saved_id UUID;
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501'; END IF;
  UPDATE public.employee_profile_todos SET archived_at = NOW(), updated_at = NOW()
  WHERE id = p_todo_id AND clerk_user_id = actor_id AND archived_at IS NULL RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'to-do item was not found' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, note)
  VALUES (actor_id, actor_id, 'employee_profile_todos', saved_id::TEXT, 'archive', 'Employee archived a private to-do item.');
END;
$$;

CREATE OR REPLACE FUNCTION public.read_current_employee_dashboard_todo_reminders()
RETURNS TABLE (
  id UUID,
  title TEXT,
  due_date DATE,
  reminder_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actor_id TEXT := auth.jwt() ->> 'sub';
BEGIN
  IF actor_id IS NULL OR length(BTRIM(actor_id)) = 0 THEN RAISE EXCEPTION 'authenticated Clerk JWT is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE clerk_user_id = actor_id AND is_active = TRUE) THEN RAISE EXCEPTION 'active user permission record is required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT todo.id, todo.title, todo.due_date,
    CASE WHEN todo.due_date < CURRENT_DATE THEN 'overdue'
         WHEN todo.due_date = CURRENT_DATE THEN 'due_today'
         ELSE 'due_soon' END
  FROM public.employee_profile_todos todo
  WHERE todo.clerk_user_id = actor_id
    AND todo.archived_at IS NULL
    AND todo.completed_at IS NULL
    AND todo.due_date IS NOT NULL
    AND todo.due_date <= CURRENT_DATE + 7
  ORDER BY todo.due_date ASC, todo.updated_at DESC, todo.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.read_current_employee_profile_notes(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_current_employee_profile_note(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_current_employee_profile_note(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_current_employee_profile_todos(BOOLEAN, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_current_employee_profile_todo(UUID, TEXT, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_current_employee_profile_todo_complete(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_current_employee_profile_todo(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_current_employee_dashboard_todo_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_current_employee_profile_notes(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_current_employee_profile_note(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_current_employee_profile_note(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_current_employee_profile_todos(BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_current_employee_profile_todo(UUID, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_employee_profile_todo_complete(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_current_employee_profile_todo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_current_employee_dashboard_todo_reminders() TO authenticated;
