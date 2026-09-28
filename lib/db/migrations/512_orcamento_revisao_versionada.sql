ALTER TABLE orcamento_revisoes
  ADD COLUMN IF NOT EXISTS base_proposta_id text REFERENCES propostas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposta_revisao_id text REFERENCES propostas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisao_numero text;

CREATE INDEX IF NOT EXISTS orcamento_revisoes_base_proposta_idx
  ON orcamento_revisoes (tenant_id, lead_id, base_proposta_id);

CREATE INDEX IF NOT EXISTS orcamento_revisoes_proposta_revisao_idx
  ON orcamento_revisoes (proposta_revisao_id);
