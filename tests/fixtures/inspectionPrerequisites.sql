-- Synthetic dependency schema for the isolated migration test. Permission
-- resolvers are loaded from their captured definitions, not permissive stubs.
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;CREATE SCHEMA storage;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',nullif(current_setting('test.actor',true),''))$$;
CREATE TABLE public.user_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clerk_user_id text UNIQUE,role text,division text,permission_overrides jsonb DEFAULT '{}',is_active boolean DEFAULT true,display_name text,email text);
CREATE TABLE public.permission_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),permissions jsonb,default_role text,default_division text);
CREATE TABLE public.user_permission_templates(user_id text PRIMARY KEY,template_id uuid);
CREATE TABLE public.user_permission_overrides(user_id text,permission_flag text,granted boolean,is_active boolean DEFAULT true,CONSTRAINT user_permission_overrides_permission_flag_check CHECK(permission_flag<>''));
CREATE TABLE public.tool_addons(addon_key text PRIMARY KEY,label text,category text,description text,is_active boolean);
CREATE TABLE public.tool_addon_access(addon_key text,clerk_user_id text,enabled boolean);
CREATE TABLE public.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,job_number text,service_call_number text,division text,job_type text DEFAULT 'job',archived_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE public.job_sub_divisions(job_id uuid,division text);
CREATE TABLE public.documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),division text,owner_type text,owner_id uuid,storage_path text,file_name text,document_type text,description text,file_size_bytes bigint,mime_type text,created_by text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),archived_at timestamptz,archived_by text,archive_reason text,change_order_id uuid,CONSTRAINT documents_owner_type_check CHECK(owner_type IN('job','estimate')));
CREATE TABLE public.change_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text,user_name text,table_name text,record_id text,action text,before_data jsonb,after_data jsonb,note text,created_at timestamptz DEFAULT now());
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));
CREATE TABLE public.change_orders(id uuid PRIMARY KEY,signed_document_id uuid,status text,archived_at timestamptz);
CREATE TABLE public.estimates(id uuid PRIMARY KEY,division text,archived_at timestamptz);
CREATE FUNCTION public.current_user_has_developer_access() RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub' AND coalesce((permission_overrides->>'can_access_developer')::boolean,role='Developer'))$$;
CREATE FUNCTION public.change_order_actor() RETURNS text LANGUAGE sql AS $$SELECT coalesce(display_name,clerk_user_id) FROM public.user_permissions WHERE clerk_user_id=auth.jwt()->>'sub'$$;
-- Service-call integration boundary: full canonical service workflow has its own
-- tests. This fixture checks transaction nesting, number reuse and rollback.
CREATE FUNCTION public.svc_save_call(p_id uuid,p_data jsonb,p_stamp timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$DECLARE saved uuid;BEGIN
 IF NOT public.current_user_can_edit_division(p_data->>'division','can_create_jobs') THEN RAISE EXCEPTION 'Service call creation denied';END IF;
 IF EXISTS(SELECT 1 FROM public.jobs WHERE coalesce(service_call_number,job_number)=p_data->>'service_call_number') THEN RAISE EXCEPTION 'Duplicate service call number';END IF;
 INSERT INTO public.jobs(name,service_call_number,division,job_type)VALUES(p_data->>'name',p_data->>'service_call_number',p_data->>'division','service_call')RETURNING id INTO saved;RETURN saved;END$$;
GRANT USAGE ON SCHEMA auth,storage TO authenticated;
GRANT SELECT ON public.user_permissions,public.jobs,public.job_sub_divisions TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.documents TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY existing_job_documents ON public.documents FOR ALL TO authenticated USING(owner_type='job')WITH CHECK(owner_type='job');
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY existing_job_storage ON storage.objects FOR ALL TO authenticated USING(name LIKE 'documents/job/%')WITH CHECK(name LIKE 'documents/job/%');
