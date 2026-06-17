-- ===========================================================
-- Vendor.ai — Módulo Site Generator
-- Rodar no Supabase SQL Editor do projeto vendorai-core
-- ===========================================================

create table if not exists generated_sites (
  id          uuid default gen_random_uuid() primary key,
  tenant_id   uuid references tenants(id) on delete cascade,
  name        text not null,
  site_type   text not null check (site_type in ('landing', 'ecommerce', 'institutional')),
  config      jsonb not null default '{}',
  html        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- índice para busca rápida por tenant
create index if not exists idx_generated_sites_tenant
  on generated_sites(tenant_id, created_at desc);

-- trigger updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger generated_sites_updated_at
  before update on generated_sites
  for each row execute function update_updated_at();

-- RLS: cada tenant só vê os próprios sites
alter table generated_sites enable row level security;

create policy "tenant isolado" on generated_sites
  using (tenant_id = (current_setting('app.tenant_id', true))::uuid);
