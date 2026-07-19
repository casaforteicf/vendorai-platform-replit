-- Relatos Técnicos — checkpoint humano para bugs identificados pelo Suporte
CREATE TABLE IF NOT EXISTS relatos_tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lead_id UUID NULL,
  conversation_id UUID NULL,
  descricao_problema TEXT NOT NULL,
  transcript_relevante TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pendente_revisao',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relatos_tecnicos_status ON relatos_tecnicos (status);
CREATE INDEX IF NOT EXISTS idx_relatos_tecnicos_tenant ON relatos_tecnicos (tenant_id);
