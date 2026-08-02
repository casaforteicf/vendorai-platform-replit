-- Stories do parceiro (Praça.ai) — foto/vídeo efêmero postado pelo lojista
-- no painel do Vendor.ai, exibido na home do Praça.ai tipo Instagram Stories.
-- Expira sozinho em 24h (expires_at), independente de remoção manual (ativo).
CREATE TABLE IF NOT EXISTS vendor_stories (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('foto', 'video')),
  media_url text NOT NULL,
  produto_id text REFERENCES produtos_catalogo(id) ON DELETE SET NULL,
  link_url text,
  caption text,
  views_count integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS vendor_stories_tenant_idx ON vendor_stories (tenant_id, created_at DESC);
-- Consulta pública do Praça.ai: stories ativos e não expirados de todos os tenants.
CREATE INDEX IF NOT EXISTS vendor_stories_ativos_idx ON vendor_stories (expires_at) WHERE ativo = true;
