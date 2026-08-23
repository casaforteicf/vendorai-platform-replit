-- Criadores de referência (até 3 por tenant) pra análise de padrões de
-- conteúdo no Instagram — inspirado no fluxo do Dalea AI ("point to up
-- to 3 reference creators, Dalea starts learning your world").
--
-- padroes_detectados guarda o resultado da última análise por IA em cima
-- dos posts públicos recentes do criador (tom, formato, hashtags,
-- cadência) — reprocessado sob demanda, não em tempo real.
CREATE TABLE IF NOT EXISTS content_reference_creators (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instagram_username TEXT NOT NULL,
  padroes_detectados JSONB,
  ultima_analise_em TIMESTAMP,
  ultimo_erro TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_reference_creators_tenant_idx ON content_reference_creators (tenant_id);
