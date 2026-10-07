ALTER TABLE obra_orcamento_itens
  ADD COLUMN IF NOT EXISTS quantidade_original numeric(15,4),
  ADD COLUMN IF NOT EXISTS quantidade_tecnica numeric(15,4),
  ADD COLUMN IF NOT EXISTS quantidade_com_perda numeric(15,4),
  ADD COLUMN IF NOT EXISTS quantidade_compra numeric(15,4),
  ADD COLUMN IF NOT EXISTS unidade_compra text,
  ADD COLUMN IF NOT EXISTS origem_quantidade text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS nivel_precisao_quantidade text NOT NULL DEFAULT 'estimativo',
  ADD COLUMN IF NOT EXISTS memoria_calculo jsonb,
  ADD COLUMN IF NOT EXISTS projeto_referencia text,
  ADD COLUMN IF NOT EXISTS projeto_versao text,
  ADD COLUMN IF NOT EXISTS confianca_extracao numeric(5,2),
  ADD COLUMN IF NOT EXISTS revisado_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_ajuste_quantidade text,
  ADD COLUMN IF NOT EXISTS quantidade_atualizada_em timestamptz;

UPDATE obra_orcamento_itens
SET
  quantidade_original = COALESCE(quantidade_original, quantidade),
  quantidade_tecnica = COALESCE(quantidade_tecnica, quantidade),
  quantidade_atualizada_em = COALESCE(quantidade_atualizada_em, updated_at)
WHERE quantidade_original IS NULL
   OR quantidade_tecnica IS NULL
   OR quantidade_atualizada_em IS NULL;

CREATE TABLE IF NOT EXISTS obra_orcamento_item_quantitativos_historico (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES obra_orcamento_itens(id) ON DELETE CASCADE,
  quantidade_anterior numeric(15,4),
  quantidade_nova numeric(15,4),
  unidade text,
  origem_quantidade text,
  nivel_precisao_quantidade text,
  memoria_calculo jsonb,
  projeto_referencia text,
  projeto_versao text,
  confianca_extracao numeric(5,2),
  motivo text,
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obra_orc_item_quant_hist_item_created_idx
  ON obra_orcamento_item_quantitativos_historico(item_id, created_at);
