-- Módulo de anúncios (gerador de conteúdo + integração com plataformas de
-- mídia paga) — cross-vertical, não específico de nenhum segmento.
--
-- Um item anunciável pode vir de 3 tabelas diferentes (produto de catálogo,
-- veículo, imóvel) — em vez de FK direta pra cada uma (o que exigiria 3
-- colunas nullable + checagem), usamos referência polimórfica
-- (item_tipo + item_id), igual outros pontos do sistema já fazem.
CREATE TYPE ad_plataforma AS ENUM ('google', 'meta', 'tiktok', 'linkedin');
CREATE TYPE ad_tipo_anuncio AS ENUM ('shopping', 'rsa_pmax');
CREATE TYPE ad_item_tipo AS ENUM ('produto', 'veiculo', 'imovel');
CREATE TYPE ad_modo AS ENUM ('unico', 'carrossel');
CREATE TYPE ad_campanha_status AS ENUM (
  'rascunho', 'aguardando_conexao_plataforma', 'ativo', 'pausado', 'encerrado'
);
CREATE TYPE ad_criativo_status AS ENUM ('rascunho', 'aprovado');

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plataforma          ad_plataforma NOT NULL DEFAULT 'google',
  tipo_anuncio        ad_tipo_anuncio NOT NULL,
  vertical            text NOT NULL,
  item_tipo           ad_item_tipo NOT NULL,
  -- Nulo quando modo='carrossel' e o alvo é uma categoria inteira, não 1 item
  item_id             text,
  -- Usado só no modo carrossel: qual categoria/segmento puxar os itens
  -- relacionados (ex: "SUV", "Farmácia > Higiene")
  categoria_filtro    text,
  modo                ad_modo NOT NULL DEFAULT 'unico',
  orcamento_diario     numeric(10, 2) NOT NULL,
  status              ad_campanha_status NOT NULL DEFAULT 'rascunho',
  -- Preenchido só depois de publicar de verdade na plataforma (resource
  -- name/campaign id retornado pela API) — nulo enquanto for rascunho local
  external_campaign_id text,
  responsavel_id      text REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_campaigns_tenant_idx ON ad_campaigns (tenant_id, status);
CREATE INDEX IF NOT EXISTS ad_campaigns_item_idx ON ad_campaigns (item_tipo, item_id);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id   text NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  -- RSA do Google aceita até 15 títulos e 4 descrições — guardamos como
  -- array pra caber isso e as variações de outras plataformas depois
  headlines     jsonb NOT NULL DEFAULT '[]'::jsonb,
  descriptions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  imagens       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        ad_criativo_status NOT NULL DEFAULT 'rascunho',
  gerado_em     timestamp NOT NULL DEFAULT now(),
  aprovado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  aprovado_em   timestamp
);

CREATE INDEX IF NOT EXISTS ad_creatives_campaign_idx ON ad_creatives (campaign_id);
