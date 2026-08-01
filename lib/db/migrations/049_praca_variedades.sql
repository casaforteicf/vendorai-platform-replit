ALTER TYPE supermercado_campanha_tipo ADD VALUE IF NOT EXISTS 'lugar';
ALTER TYPE supermercado_campanha_tipo ADD VALUE IF NOT EXISTS 'historia';

ALTER TABLE supermercado_campanhas
  ADD COLUMN IF NOT EXISTS publicar_no_praca boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resumo_praca text,
  ADD COLUMN IF NOT EXISTS passos_praca jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS produto_ids_praca jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publicacao_praca_em timestamp,
  ADD COLUMN IF NOT EXISTS oferta_praca_em timestamp,
  ADD COLUMN IF NOT EXISTS oferta_titulo_praca text,
  ADD COLUMN IF NOT EXISTS oferta_resumo_praca text;

CREATE INDEX IF NOT EXISTS idx_supermercado_campanhas_praca_publicacao
  ON supermercado_campanhas (publicacao_praca_em)
  WHERE publicar_no_praca = true;

CREATE INDEX IF NOT EXISTS idx_supermercado_campanhas_praca_oferta
  ON supermercado_campanhas (oferta_praca_em)
  WHERE publicar_no_praca = true;
