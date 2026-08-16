alter table public.user_permissions
  drop constraint if exists user_permissions_role_check;

alter table public.user_permissions
  add constraint user_permissions_role_check
  check (role = any (array[
    'Developer'::text,
    'Administrator'::text,
    'Project Manager'::text,
    'Estimator'::text,
    'Field Supervisor'::text,
    'User'::text,
    'Supervisor'::text,
    'Manager'::text
  ]));
