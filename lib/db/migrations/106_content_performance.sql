-- Loop de aprendizado com métricas dos próprios posts — 3ª e última
-- lacuna identificada contra o Dalea AI ("metrics turn into learning:
-- what worked, where to improve, what's worth trying again").
--
-- content_published_posts: registra cada post publicado via
-- publish-instagram (o postId retornado pela API do Instagram nunca
-- era salvo antes disso — só aparecia na resposta e se perdia). Guarda
-- métricas em cache, atualizadas sob demanda (Insights do Instagram só
-- fica estável ~24h depois de publicado).
CREATE TABLE IF NOT EXISTS content_published_posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content_generation_id TEXT REFERENCES content_generations(id) ON DELETE SET NULL,
  variation_index INTEGER NOT NULL DEFAULT 0,
  instagram_media_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  theme TEXT,
  caption_ou_texto TEXT,
  metricas JSONB,
  ultima_coleta_em TIMESTAMP,
  ultimo_erro_metricas TEXT,
  published_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_published_posts_tenant_idx ON content_published_posts (tenant_id);

-- content_performance_insights: 1 linha por tenant com o resultado mais
-- recente da análise por IA em cima dos posts com métricas coletadas —
-- comparando os que performaram melhor vs pior pra extrair o que
-- funciona (tema, formato, gancho) especificamente pra audiência real
-- desse tenant.
CREATE TABLE IF NOT EXISTS content_performance_insights (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  aprendizados JSONB,
  baseado_em_posts INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
