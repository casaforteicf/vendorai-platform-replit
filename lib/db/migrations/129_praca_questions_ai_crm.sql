-- Completa o fluxo de perguntas do Praça.ai: identidade, CRM e auditoria da IA.
ALTER TABLE praca_produto_perguntas
  ADD COLUMN IF NOT EXISTS cliente_email text,
  ADD COLUMN IF NOT EXISTS cliente_telefone text,
  ADD COLUMN IF NOT EXISTS lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'nao_tentada'
    CHECK (ai_status IN ('nao_tentada','respondida','escalada','erro')),
  ADD COLUMN IF NOT EXISTS ai_confianca numeric(5,4),
  ADD COLUMN IF NOT EXISTS ai_motivo text,
  ADD COLUMN IF NOT EXISTS ai_resposta text,
  ADD COLUMN IF NOT EXISTS ai_processada_em timestamptz;

CREATE INDEX IF NOT EXISTS praca_perguntas_tenant_status_idx
  ON praca_produto_perguntas (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS praca_perguntas_lead_idx
  ON praca_produto_perguntas (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS praca_perguntas_conversation_idx
  ON praca_produto_perguntas (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;
