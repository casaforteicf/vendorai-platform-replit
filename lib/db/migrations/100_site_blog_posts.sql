-- Blog nativo do Vendor.ai — pré-requisito de infra pro Publicador (canal site_proprio)
-- do Content Autopilot. generated_sites não serve (1 HTML inteiro por linha, sem post
-- individual) — essa tabela é independente, servida via SSR nas rotas /sites/:siteSlug/blog*.
CREATE TABLE IF NOT EXISTS site_blog_posts (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id text REFERENCES content_autopilot_articles(id) ON DELETE SET NULL,
  slug text NOT NULL, titulo text NOT NULL, meta_description text, conteudo_md text NOT NULL,
  imagem_capa_url text, publicado boolean NOT NULL DEFAULT false, publicado_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS site_blog_posts_tenant_slug_unique ON site_blog_posts(tenant_id, slug);
CREATE INDEX IF NOT EXISTS site_blog_posts_tenant_publicado_idx ON site_blog_posts(tenant_id, publicado);
