-- Atribuição: liga um lead à campanha de anúncio que o gerou (quando
-- souber — depende de captura de UTM/parâmetro na origem, ainda não
-- implementada em todos os pontos de entrada). Coluna separada do campo
-- leads.source (que já é usado como rótulo livre de canal: whatsapp,
-- instagram, manual etc) — aqui é referência de verdade pra métrica.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ad_campaign_id text REFERENCES ad_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_ad_campaign_idx ON leads (ad_campaign_id) WHERE ad_campaign_id IS NOT NULL;

-- Snapshot diário de métricas puxadas da própria plataforma (impressões,
-- cliques, custo) — populado por um job que ainda depende do developer
-- token do Google Ads (ou API equivalente de cada plataforma) estar
-- aprovado. Guardar por dia (não só acumulado) permite ver tendência e
-- recalcular CPA/ROAS pra qualquer janela de tempo depois.
CREATE TABLE IF NOT EXISTS ad_performance_snapshots (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id   text NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  data          date NOT NULL,
  impressoes    integer NOT NULL DEFAULT 0,
  cliques       integer NOT NULL DEFAULT 0,
  custo         numeric(10, 2) NOT NULL DEFAULT 0,
  -- Preenchido pela plataforma, quando ela souber informar (nem toda
  -- plataforma reporta conversão de volta pra nós automaticamente)
  conversoes_plataforma integer,
  created_at    timestamp NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, data)
);

CREATE INDEX IF NOT EXISTS ad_performance_campaign_idx ON ad_performance_snapshots (campaign_id, data DESC);
