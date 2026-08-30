-- Plano de mídia automático: pega o perfil do negócio (segmento, público-
-- alvo, concorrentes, Instagram, diferenciais) + dados reais de busca
-- (volume de keyword, quem aparece no Google pros termos do negócio) e
-- gera um plano estratégico (quais canais priorizar, tipo de campanha
-- por canal, mix de orçamento, ações imediatas pra "vitalizar" a
-- presença online).
CREATE TABLE IF NOT EXISTS media_plans (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conteudo jsonb NOT NULL,
  contexto_usado jsonb,
  custo_usd numeric(10,4) NOT NULL DEFAULT 0,
  gerado_por text REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_plans_tenant ON media_plans (tenant_id, created_at DESC);
