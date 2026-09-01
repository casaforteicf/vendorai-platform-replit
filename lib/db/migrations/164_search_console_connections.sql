-- 164_search_console_connections.sql
-- Conexão OAuth por tenant com Google Search Console. Mesmo padrão de
-- google_ads_connections: id gerado pela aplicação, FK cascade, tokens em
-- texto plano, timestamps de auditoria.
--
-- status "pending_verification" existe porque a propriedade só vira "active"
-- depois que a Site Verification API confirma a meta tag injetada no HTML
-- do site (verified=true) e o sitemap é submetido.

CREATE TABLE IF NOT EXISTS search_console_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_url text,
  refresh_token text,
  access_token text,
  token_expires_at timestamp,
  verified boolean NOT NULL DEFAULT false,
  verification_meta_token text,
  sitemap_submitted_at timestamp,
  status text NOT NULL DEFAULT 'pending_verification',
  connected_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  disconnected_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_search_console_connections_tenant_id
  ON search_console_connections (tenant_id);
