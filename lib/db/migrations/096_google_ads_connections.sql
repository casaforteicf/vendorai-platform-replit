-- 096_google_ads_connections.sql
-- Conexão OAuth por tenant com Google Ads (Fase 4). Segue exatamente o
-- mesmo padrão de whatsapp_connections: id gerado pela aplicação
-- (crypto.randomUUID(), não por default do banco), FK para tenants com
-- cascade, tokens em texto plano (convenção já usada nas conexões
-- existentes), timestamps de auditoria.
--
-- status "pending_account_selection" existe porque, ao contrário do
-- WhatsApp (que auto-seleciona phones[0]), o usuário pode ter acesso a
-- mais de uma conta Google Ads pelo mesmo refresh token — a escolha da
-- conta é uma etapa explícita depois do callback OAuth.

CREATE TABLE IF NOT EXISTS google_ads_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id text,
  descriptive_name text,
  currency_code text,
  time_zone text,
  refresh_token text,
  access_token text,
  token_expires_at timestamp,
  status text NOT NULL DEFAULT 'pending_account_selection',
  connected_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  disconnected_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_google_ads_connections_tenant_id
  ON google_ads_connections (tenant_id);
