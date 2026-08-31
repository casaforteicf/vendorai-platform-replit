create table if not exists public.tad_operating_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  profile text not null default 'CONSERVATIVE' check (profile in ('CONSERVATIVE','INTERMEDIATE','AGGRESSIVE')),
  daily_target_reference_pct double precision not null default 1.6 check (daily_target_reference_pct > 0 and daily_target_reference_pct <= 20),
  stop_after_daily_target boolean not null default false,
  primary_market text not null default 'CRYPTO' check (primary_market in ('CRYPTO','B3','US','FOREX','COMMODITIES')),
  enabled_markets text[] not null default array['CRYPTO']::text[],
  updated_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  constraint tad_operating_settings_enabled_markets_valid check (enabled_markets <@ array['CRYPTO','B3','US','FOREX','COMMODITIES']::text[])
);

alter table public.tad_operating_settings enable row level security;
revoke all on table public.tad_operating_settings from anon;
grant select, insert, update on table public.tad_operating_settings to authenticated;

drop policy if exists tad_operating_settings_select_own on public.tad_operating_settings;
create policy tad_operating_settings_select_own on public.tad_operating_settings for select to authenticated using (user_id = auth.uid());
drop policy if exists tad_operating_settings_insert_own on public.tad_operating_settings;
create policy tad_operating_settings_insert_own on public.tad_operating_settings for insert to authenticated with check (user_id = auth.uid());
drop policy if exists tad_operating_settings_update_own on public.tad_operating_settings;
create policy tad_operating_settings_update_own on public.tad_operating_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.tad_operating_settings(user_id)
select id from auth.users
on conflict (user_id) do nothing;
