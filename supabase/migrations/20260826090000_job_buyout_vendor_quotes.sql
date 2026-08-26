CREATE TABLE public.job_buyout_vendor_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyout_line_id UUID NOT NULL REFERENCES public.job_buyout_lines(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  request_status TEXT NOT NULL DEFAULT 'draft' CHECK (request_status IN ('draft', 'requested', 'quoted', 'declined')),
  requested_at TIMESTAMPTZ,
  quote_number TEXT,
  quoted_amount NUMERIC NOT NULL DEFAULT 0 CHECK (quoted_amount >= 0),
  original_lead_time_days INTEGER CHECK (original_lead_time_days IS NULL OR original_lead_time_days >= 0),
  current_lead_time_days INTEGER CHECK (current_lead_time_days IS NULL OR current_lead_time_days >= 0),
  valid_until DATE,
  note TEXT,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ,
  awarded_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX job_buyout_vendor_quotes_one_award_per_line
ON public.job_buyout_vendor_quotes (buyout_line_id)
WHERE awarded_at IS NOT NULL;

CREATE INDEX job_buyout_vendor_quotes_buyout_line_id_idx
ON public.job_buyout_vendor_quotes (buyout_line_id, created_at DESC);

ALTER TABLE public.job_buyout_vendor_quotes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.job_buyout_vendor_quotes TO authenticated;

CREATE POLICY job_buyout_vendor_quotes_read
ON public.job_buyout_vendor_quotes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_buyout_lines AS line
    WHERE line.id = buyout_line_id
      AND public.current_user_can_read_division(line.division, 'can_manage_jobs')
  )
);

CREATE POLICY job_buyout_vendor_quotes_insert
ON public.job_buyout_vendor_quotes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_buyout_lines AS line
    WHERE line.id = buyout_line_id
      AND public.current_user_can_edit_division(line.division, 'can_manage_jobs')
  )
);

CREATE POLICY job_buyout_vendor_quotes_update
ON public.job_buyout_vendor_quotes FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_buyout_lines AS line
    WHERE line.id = buyout_line_id
      AND public.current_user_can_edit_division(line.division, 'can_manage_jobs')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_buyout_lines AS line
    WHERE line.id = buyout_line_id
      AND public.current_user_can_edit_division(line.division, 'can_manage_jobs')
  )
);

CREATE OR REPLACE FUNCTION public.award_job_buyout_quote(p_quote_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller public.user_permissions%ROWTYPE;
  quote_row public.job_buyout_vendor_quotes%ROWTYPE;
  line_row public.job_buyout_lines%ROWTYPE;
  actor TEXT := auth.jwt() ->> 'sub';
  normalized_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
BEGIN
  SELECT * INTO caller FROM public.user_permissions AS up WHERE up.clerk_user_id = actor AND up.is_active LIMIT 1;
  SELECT * INTO quote_row FROM public.job_buyout_vendor_quotes AS quote WHERE quote.id = p_quote_id FOR UPDATE;
  SELECT * INTO line_row FROM public.job_buyout_lines AS line WHERE line.id = quote_row.buyout_line_id FOR UPDATE;
  IF actor IS NULL OR quote_row.id IS NULL OR line_row.id IS NULL OR normalized_reason IS NULL
    OR public.current_user_can_edit_division(line_row.division, 'can_manage_jobs') IS NOT TRUE THEN
    RAISE EXCEPTION 'buyout award permission and reason are required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.job_buyout_vendor_quotes
  SET awarded_at = NOW(), awarded_by = actor, updated_at = NOW()
  WHERE id = quote_row.id
  RETURNING * INTO quote_row;
  UPDATE public.job_buyout_lines
  SET status = 'ordered', vendor_note = quote_row.vendor_name, actual_value = quote_row.quoted_amount,
      initial_lead_time_days = COALESCE(quote_row.original_lead_time_days, initial_lead_time_days),
      actual_lead_time_days = COALESCE(quote_row.current_lead_time_days, actual_lead_time_days), updated_at = NOW()
  WHERE id = line_row.id;
  INSERT INTO public.change_logs (user_id, user_name, table_name, record_id, action, after_data, note)
  VALUES (actor, COALESCE(caller.display_name, caller.email, actor), 'job_buyout_vendor_quotes', quote_row.id::TEXT, 'award', to_jsonb(quote_row), normalized_reason);
  RETURN quote_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.award_job_buyout_quote(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_job_buyout_quote(UUID, TEXT) TO authenticated;
