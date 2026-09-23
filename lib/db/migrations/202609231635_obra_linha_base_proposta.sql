-- A proposta aceita passa a ser a origem canônica da execução da obra.
-- A linha de base é versionada em obra_orcamentos e as etapas preservam o ID
-- comercial que as originou para alimentar cronograma, compras, diário,
-- medições, financeiro e portal do cliente.

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS proposta_origem_id text,
  ADD COLUMN IF NOT EXISTS deal_origem_id text,
  ADD COLUMN IF NOT EXISTS lead_origem_id text;

ALTER TABLE obra_etapas
  ADD COLUMN IF NOT EXISTS origem_etapa_id text;

ALTER TABLE obra_orcamentos
  ADD COLUMN IF NOT EXISTS proposta_origem_id text,
  ADD COLUMN IF NOT EXISTS linha_base_snapshot jsonb;

ALTER TABLE obra_orcamento_etapas
  ADD COLUMN IF NOT EXISTS origem_etapa_id text;

CREATE UNIQUE INDEX IF NOT EXISTS obras_proposta_origem_id_uidx
  ON obras(proposta_origem_id)
  WHERE proposta_origem_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS obras_deal_origem_id_uidx
  ON obras(deal_origem_id)
  WHERE deal_origem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS obras_lead_origem_id_idx
  ON obras(lead_origem_id)
  WHERE lead_origem_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS obra_orcamentos_proposta_origem_id_uidx
  ON obra_orcamentos(proposta_origem_id)
  WHERE proposta_origem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS obra_etapas_obra_origem_etapa_idx
  ON obra_etapas(obra_id, origem_etapa_id);

CREATE INDEX IF NOT EXISTS obra_orcamento_etapas_origem_idx
  ON obra_orcamento_etapas(orcamento_id, origem_etapa_id);

DO $$
BEGIN
  ALTER TABLE obras
    ADD CONSTRAINT obras_proposta_origem_id_fkey
    FOREIGN KEY (proposta_origem_id) REFERENCES propostas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE obra_orcamentos
    ADD CONSTRAINT obra_orcamentos_proposta_origem_id_fkey
    FOREIGN KEY (proposta_origem_id) REFERENCES propostas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE obras
    ADD CONSTRAINT obras_deal_origem_id_fkey
    FOREIGN KEY (deal_origem_id) REFERENCES deals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE obras
    ADD CONSTRAINT obras_lead_origem_id_fkey
    FOREIGN KEY (lead_origem_id) REFERENCES leads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
