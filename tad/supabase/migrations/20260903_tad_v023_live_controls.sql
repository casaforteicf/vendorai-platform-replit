create table if not exists public.tad_live_controls (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  armed boolean not null default false,
  kill_switch boolean not null default true,
  last_readiness_at bigint,
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

alter table public.tad_live_controls enable row level security;
revoke all on table public.tad_live_controls from anon;
grant select, insert, update on table public.tad_live_controls to authenticated;

drop policy if exists tad_live_controls_select_own on public.tad_live_controls;
create policy tad_live_controls_select_own on public.tad_live_controls
for select to authenticated using (user_id = auth.uid());

drop policy if exists tad_live_controls_insert_admin_own on public.tad_live_controls;
create policy tad_live_controls_insert_admin_own on public.tad_live_controls
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.tad_user_profiles p
    where p.user_id = auth.uid() and p.role = 'ADMIN'
  )
);

drop policy if exists tad_live_controls_update_admin_own on public.tad_live_controls;
create policy tad_live_controls_update_admin_own on public.tad_live_controls
for update to authenticated using (
  user_id = auth.uid()
  and exists (
    select 1 from public.tad_user_profiles p
    where p.user_id = auth.uid() and p.role = 'ADMIN'
  )
) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.tad_user_profiles p
    where p.user_id = auth.uid() and p.role = 'ADMIN'
  )
);

insert into public.tad_live_controls(user_id)
select id from auth.users
on conflict (user_id) do nothing;
