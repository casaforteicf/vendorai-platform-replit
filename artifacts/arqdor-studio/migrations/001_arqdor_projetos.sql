-- Arqdor Studio 2.0 — projetos (Supabase/Postgres)
-- O documento inteiro vai em jsonb: o motor versiona o schema (`versao`) e a UI não lê colunas.

create table if not exists arqdor_projetos (
  id            text primary key,
  dados         jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists arqdor_projetos_atualizado_em_idx
  on arqdor_projetos (atualizado_em desc);

-- Busca por projeto é sempre por id; a lista do dashboard ordena por atualizado_em.
