-- Sistema de "Novidades" — changelog dentro do app, visível pra qualquer
-- tenant, com contador de não lidas por usuário.

CREATE TABLE IF NOT EXISTS changelog_entries (
  id text PRIMARY KEY,
  titulo text NOT NULL,
  descricao text NOT NULL,
  tipo text NOT NULL DEFAULT 'novidade' CHECK (tipo IN ('novidade','melhoria','correcao')),
  publicado_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS changelog_entries_publicado_idx ON changelog_entries(publicado_em);

ALTER TABLE users ADD COLUMN IF NOT EXISTS changelog_lido_em timestamp;
