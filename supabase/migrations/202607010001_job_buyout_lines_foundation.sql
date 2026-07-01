create table public.job_buyout_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  division text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  archived_by text null,
  archive_reason text null,
  item_id uuid null references public.items(id),
  item_description text null,
  quantity_needed numeric not null default 1 check (quantity_needed > 0),
  quantity_ordered numeric null check (
    quantity_ordered is null
    or quantity_ordered >= 0
  ),
  status text not null default 'pending' check (
    status in ('pending', 'ordered', 'received', 'cancelled')
  ),
  vendor_note text null,
  lead_time_note text null,
  note text null,
  created_by text null
);

comment on table public.job_buyout_lines is
  'Buyout List planning rows only. No allocation, reservation, inventory movement, accounting, or purchase-order behavior.';

drop trigger if exists set_job_buyout_lines_updated_at on public.job_buyout_lines;
create trigger set_job_buyout_lines_updated_at
before update on public.job_buyout_lines
for each row execute function touch_user_permissions_updated_at();

alter table public.job_buyout_lines enable row level security;

drop policy if exists job_buyout_lines_read on public.job_buyout_lines;
create policy job_buyout_lines_read
on public.job_buyout_lines
for select
to authenticated
using (
  archived_at is null
  and exists (
    select 1
    from public.user_permissions up
    where up.clerk_user_id = auth.jwt() ->> 'sub'
      and up.is_active = true
      and (
        coalesce((
          public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
            ->> 'can_view_all_divisions'
        )::boolean, false) is true
        or up.division = job_buyout_lines.division
      )
  )
);

drop policy if exists job_buyout_lines_insert on public.job_buyout_lines;
create policy job_buyout_lines_insert
on public.job_buyout_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_permissions up
    where up.clerk_user_id = auth.jwt() ->> 'sub'
      and up.is_active = true
      and up.division = job_buyout_lines.division
      and coalesce((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, false) is true
  )
);

drop policy if exists job_buyout_lines_update on public.job_buyout_lines;
create policy job_buyout_lines_update
on public.job_buyout_lines
for update
to authenticated
using (
  archived_at is null
  and exists (
    select 1
    from public.user_permissions up
    where up.clerk_user_id = auth.jwt() ->> 'sub'
      and up.is_active = true
      and up.division = job_buyout_lines.division
      and coalesce((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, false) is true
  )
)
with check (
  exists (
    select 1
    from public.user_permissions up
    where up.clerk_user_id = auth.jwt() ->> 'sub'
      and up.is_active = true
      and up.division = job_buyout_lines.division
      and coalesce((
        public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)
          ->> 'can_manage_jobs'
      )::boolean, false) is true
  )
);

revoke all on public.job_buyout_lines from anon, authenticated;
grant select, insert, update on public.job_buyout_lines to authenticated;
