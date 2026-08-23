-- Conexão OAuth com a API de Marketing da Meta (Facebook Ads), pro módulo
-- de Anúncios (ver ad_campaigns.plataforma='meta') publicar campanhas de
-- verdade. Mesmo desenho de lifecycle do google_ads_connections
-- (pending_account_selection -> active -> disconnected).
CREATE TABLE IF NOT EXISTS meta_ads_connections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Ad Account escolhida, formato "act_1234567890" (com o prefixo act_,
  -- exigido pela Marketing API em toda chamada). Nula entre o callback
  -- OAuth e a seleção de conta, quando há mais de uma acessível.
  ad_account_id TEXT,
  ad_account_name TEXT,
  business_id TEXT,
  currency TEXT,
  -- Token de usuário de longa duração (~60 dias, sem refresh_token
  -- separado como o Google -- renovado trocando o próprio token ainda
  -- válido por um novo antes de expirar).
  access_token TEXT,
  token_expires_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending_account_selection',
  connected_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS meta_ads_connections_tenant_idx ON meta_ads_connections (tenant_id);
