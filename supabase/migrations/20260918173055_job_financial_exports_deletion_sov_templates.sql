-- Jobs financial cleanup and reusable Schedule of Values structures.
-- Existing job_budget_lines and job_revenue_lines remain authoritative.

CREATE TABLE public.job_sov_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  department text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE UNIQUE INDEX job_sov_templates_active_name_key
  ON public.job_sov_templates (lower(btrim(name)), lower(btrim(department)))
  WHERE is_active;

CREATE TABLE public.job_sov_template_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.job_sov_templates(id) ON DELETE CASCADE,
  line_code text,
  description text NOT NULL CHECK (btrim(description) <> ''),
  allocation_percent numeric(12,8) NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  is_protected_financial boolean NOT NULL DEFAULT false,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (template_id, sort_order)
);

CREATE INDEX job_sov_template_lines_template_idx
  ON public.job_sov_template_lines (template_id, sort_order);

ALTER TABLE public.job_sov_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sov_template_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.job_sov_templates, public.job_sov_template_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_sov_templates, public.job_sov_template_lines TO authenticated;

CREATE POLICY job_sov_templates_read ON public.job_sov_templates
  FOR SELECT TO authenticated
  USING (
    is_active
    AND public.current_user_can_edit_division(department, 'can_approve_budget')
  );

CREATE POLICY job_sov_template_lines_read ON public.job_sov_template_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_sov_templates t
      WHERE t.id = template_id
        AND t.is_active
        AND public.current_user_can_edit_division(t.department, 'can_approve_budget')
    )
  );

CREATE OR REPLACE FUNCTION public.delete_empty_job_budget_line(p_budget_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  actor_name text;
  target public.job_budget_lines%rowtype;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated Clerk JWT is required' USING ERRCODE='28000';
  END IF;

  SELECT * INTO target
  FROM public.job_budget_lines
  WHERE id = p_budget_line_id AND archived_at IS NULL
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Active financial line not found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.current_user_can_edit_job(target.job_id, 'can_approve_budget') THEN
    RAISE EXCEPTION 'Budget approval permission is required' USING ERRCODE='42501';
  END IF;
  IF COALESCE(target.budget_amount,0) <> 0
    OR COALESCE(target.current_budget_override_amount,0) <> 0
    OR COALESCE(target.budget_change_amount,0) <> 0
    OR COALESCE(target.actual_cost_amount,0) <> 0
    OR COALESCE(target.committed_cost_amount,0) <> 0
    OR COALESCE(target.forecast_to_complete_amount,0) <> 0
    OR COALESCE(target.forecast_final_amount,0) <> 0
    OR COALESCE(target.schedule_of_values_amount,0) <> 0 THEN
    RAISE EXCEPTION 'Only a financial line with no values can be deleted.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.change_orders WHERE budget_line_id=target.id)
    OR EXISTS (SELECT 1 FROM public.change_order_allocations WHERE budget_line_id=target.id)
    OR EXISTS (SELECT 1 FROM public.change_order_lines WHERE job_budget_line_id=target.id)
    OR EXISTS (SELECT 1 FROM public.change_order_financial_postings WHERE job_budget_line_id=target.id)
    OR EXISTS (SELECT 1 FROM public.job_revenue_lines WHERE source_budget_line_id=target.id)
    OR EXISTS (SELECT 1 FROM public.job_pay_application_lines WHERE source_budget_line_id=target.id) THEN
    RAISE EXCEPTION 'This financial line is referenced by Change Orders, Billing, or financial history and cannot be deleted.' USING ERRCODE='23503';
  END IF;

  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor)
  INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;

  DELETE FROM public.job_budget_lines WHERE id=target.id;

  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,note)
  VALUES(actor,actor_name,'job_budget_lines',target.id::text,'update',to_jsonb(target),
    'Deleted unused zero-value financial line.');

  RETURN jsonb_build_object('deleted',true,'id',target.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_empty_job_sov_line(p_revenue_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  actor_name text;
  target public.job_revenue_lines%rowtype;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated Clerk JWT is required' USING ERRCODE='28000';
  END IF;

  SELECT * INTO target
  FROM public.job_revenue_lines
  WHERE id=p_revenue_line_id AND archived_at IS NULL
  FOR UPDATE;

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Active SOV line not found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.current_user_can_edit_job(target.job_id, 'can_approve_budget') THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF COALESCE(target.scheduled_value_amount,0) <> 0
    OR COALESCE(target.approved_change_amount,0) <> 0
    OR COALESCE(target.billed_to_date_amount,0) <> 0
    OR COALESCE(target.source_original_budget_amount,0) <> 0
    OR COALESCE(target.allocated_fee_amount,0) <> 0 THEN
    RAISE EXCEPTION 'Only an SOV line with no values can be deleted.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.change_order_sov_allocations WHERE revenue_line_id=target.id)
    OR EXISTS (SELECT 1 FROM public.job_pay_application_lines WHERE sov_line_id=target.id) THEN
    RAISE EXCEPTION 'This SOV line is referenced by Change Orders or Pay App history and cannot be deleted.' USING ERRCODE='23503';
  END IF;

  SELECT COALESCE(NULLIF(display_name,''),NULLIF(email,''),actor)
  INTO actor_name FROM public.user_permissions WHERE clerk_user_id=actor LIMIT 1;

  DELETE FROM public.job_revenue_lines WHERE id=target.id;

  INSERT INTO public.change_logs(user_id,user_name,table_name,record_id,action,before_data,note)
  VALUES(actor,actor_name,'job_revenue_lines',target.id::text,'update',to_jsonb(target),
    'Deleted unused zero-value SOV line.');

  RETURN jsonb_build_object('deleted',true,'id',target.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_job_sov_template(p_job_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  department_name text;
  template_id uuid;
  total numeric(14,2);
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated Clerk JWT is required' USING ERRCODE='28000';
  END IF;
  IF NOT public.current_user_can_edit_job(p_job_id, 'can_approve_budget') THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Enter a template name.' USING ERRCODE='22023';
  END IF;

  SELECT division INTO STRICT department_name FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL;
  SELECT round(COALESCE(sum(scheduled_value_amount),0),2) INTO total
  FROM public.job_revenue_lines WHERE job_id=p_job_id AND archived_at IS NULL;
  IF total <= 0 THEN
    RAISE EXCEPTION 'Add positive SOV values before saving a template.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.job_sov_templates(name,department,created_by)
  VALUES(btrim(p_name),department_name,actor)
  RETURNING id INTO template_id;

  INSERT INTO public.job_sov_template_lines(template_id,line_code,description,allocation_percent,is_protected_financial,note,sort_order)
  SELECT template_id,sov_line,description,
    CASE WHEN row_number() OVER (ORDER BY COALESCE(sov_line,''),created_at,id)
      = count(*) OVER ()
      THEN 100 - COALESCE(sum(round(scheduled_value_amount*100/total,8))
        OVER (ORDER BY COALESCE(sov_line,''),created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
      ELSE round(scheduled_value_amount*100/total,8) END,
    is_protected_financial,note,
    row_number() OVER (ORDER BY COALESCE(sov_line,''),created_at,id)
  FROM public.job_revenue_lines
  WHERE job_id=p_job_id AND archived_at IS NULL
  ORDER BY COALESCE(sov_line,''),created_at,id;

  INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note)
  VALUES(actor,'job_sov_templates',template_id::text,'create',
    jsonb_build_object('name',btrim(p_name),'source_job_id',p_job_id,'source_total',total),
    'Created reusable SOV template.');

  RETURN template_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_job_sov_template(p_job_id uuid, p_template_id uuid, p_contract_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  target_job public.jobs%rowtype;
  target_template public.job_sov_templates%rowtype;
  target_total numeric(14,2);
  written integer := 0;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated Clerk JWT is required' USING ERRCODE='28000';
  END IF;
  SELECT * INTO target_job FROM public.jobs WHERE id=p_job_id AND archived_at IS NULL FOR UPDATE;
  IF target_job.id IS NULL OR NOT public.current_user_can_edit_job(p_job_id,'can_approve_budget') THEN
    RAISE EXCEPTION 'Billing management permission is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO target_template FROM public.job_sov_templates
  WHERE id=p_template_id AND is_active FOR SHARE;
  IF target_template.id IS NULL
    OR lower(btrim(target_template.department)) <> lower(btrim(target_job.division)) THEN
    RAISE EXCEPTION 'An active SOV template for this Department is required.' USING ERRCODE='22023';
  END IF;
  IF p_contract_amount IS NULL OR p_contract_amount <= 0 OR p_contract_amount IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN
    RAISE EXCEPTION 'Enter a positive contract amount.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_revenue_lines WHERE job_id=p_job_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Templates can only be applied when the job has no active SOV lines.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_pay_applications WHERE job_id=p_job_id) THEN
    RAISE EXCEPTION 'A template cannot be applied after Pay App history exists.' USING ERRCODE='22023';
  END IF;

  target_total:=round(p_contract_amount,2);
  INSERT INTO public.job_revenue_lines(job_id,division,sov_line,description,scheduled_value_amount,
    approved_change_amount,billed_to_date_amount,note,created_by,is_protected_financial,allocation_percent)
  SELECT p_job_id,target_job.division,l.line_code,l.description,
    CASE WHEN row_number() OVER (ORDER BY l.sort_order,l.id)=count(*) OVER ()
      THEN target_total-COALESCE(sum(round(target_total*l.allocation_percent/100,2))
        OVER (ORDER BY l.sort_order,l.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
      ELSE round(target_total*l.allocation_percent/100,2) END,
    0,0,l.note,actor,l.is_protected_financial,l.allocation_percent
  FROM public.job_sov_template_lines l
  WHERE l.template_id=p_template_id
  ORDER BY l.sort_order,l.id;
  GET DIAGNOSTICS written=ROW_COUNT;
  IF written=0 THEN RAISE EXCEPTION 'The selected template has no lines.' USING ERRCODE='22023'; END IF;

  INSERT INTO public.change_logs(user_id,table_name,record_id,action,after_data,note)
  VALUES(actor,'job_revenue_lines',p_job_id::text,'create',
    jsonb_build_object('template_id',p_template_id,'contract_amount',target_total,'lines_created',written),
    'Applied reusable SOV template.');

  RETURN jsonb_build_object('lines_created',written,'contract_amount',target_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_empty_job_budget_line(uuid),
  public.delete_empty_job_sov_line(uuid),
  public.save_job_sov_template(uuid,text),
  public.apply_job_sov_template(uuid,uuid,numeric)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.delete_empty_job_budget_line(uuid),
  public.delete_empty_job_sov_line(uuid),
  public.save_job_sov_template(uuid,text),
  public.apply_job_sov_template(uuid,uuid,numeric)
TO authenticated;
