-- Módulo Content Autopilot: pesquisa, gera e publica conteúdo SEO automaticamente (sempre como rascunho)
CREATE TABLE IF NOT EXISTS content_autopilot_config (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_url text, brand_tone jsonb,
  canal_publicacao text NOT NULL DEFAULT 'wordpress',
  wp_url text, wp_app_user text, wp_app_password text,
  idiomas jsonb NOT NULL DEFAULT '["pt-BR"]'::jsonb,
  artigos_por_dia integer NOT NULL DEFAULT 1,
  teto_gasto_mensal numeric(10, 2),
  ativo boolean NOT NULL DEFAULT false,
  ultima_analise_site_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS content_autopilot_config_tenant_unique ON content_autopilot_config(tenant_id);

CREATE TABLE IF NOT EXISTS content_autopilot_keywords (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  termo text NOT NULL, volume_busca integer, dificuldade numeric(5, 2),
  tipo text, status text NOT NULL DEFAULT 'descoberta',
  fonte text NOT NULL DEFAULT 'dataforseo',
  coletado_em timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_autopilot_keywords_tenant_status_idx ON content_autopilot_keywords(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS content_autopilot_keywords_tenant_termo_unique ON content_autopilot_keywords(tenant_id, termo);

CREATE TABLE IF NOT EXISTS content_autopilot_articles (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  keyword_id text REFERENCES content_autopilot_keywords(id) ON DELETE SET NULL,
  titulo text, slug text, conteudo_md text, meta_description text,
  imagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  links_internos jsonb NOT NULL DEFAULT '[]'::jsonb,
  links_externos jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_score integer, seo_checklist jsonb,
  wp_post_id text, wp_status text,
  status text NOT NULL DEFAULT 'pesquisando',
  custo_gerado numeric(10, 4) NOT NULL DEFAULT 0,
  erro_detalhe text,
  created_at timestamp NOT NULL DEFAULT now(), publicado_em timestamp
);
CREATE INDEX IF NOT EXISTS content_autopilot_articles_tenant_status_idx ON content_autopilot_articles(tenant_id, status);

CREATE TABLE IF NOT EXISTS content_autopilot_runs (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  iniciado_em timestamp NOT NULL DEFAULT now(), finalizado_em timestamp,
  artigos_gerados integer NOT NULL DEFAULT 0,
  erros jsonb NOT NULL DEFAULT '[]'::jsonb,
  custo_total numeric(10, 4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS content_autopilot_runs_tenant_iniciado_idx ON content_autopilot_runs(tenant_id, iniciado_em);
