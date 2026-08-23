-- no-transaction
-- Módulo de Anúncios — generalização em 4 eixos independentes (plataforma
-- já vinha modelada desde o início; aqui expande os outros 3).
--
-- Formato do criativo: Imagem e Vídeo além de texto (RSA)/shopping já
-- existentes. Reaproveita content_generations (feed/stories/reels, já com
-- imageUrl/videoUrl) como fonte de mídia em vez de pipeline novo.
ALTER TYPE ad_tipo_anuncio ADD VALUE IF NOT EXISTS 'imagem';
ALTER TYPE ad_tipo_anuncio ADD VALUE IF NOT EXISTS 'video';

-- Origem do conteúdo: Landing Page gerada (generated_sites) e Livre (sem
-- vínculo com item específico — institucional/campanha de marca), além
-- de produto/veículo/imóvel já existentes.
ALTER TYPE ad_item_tipo ADD VALUE IF NOT EXISTS 'landing_page';
ALTER TYPE ad_item_tipo ADD VALUE IF NOT EXISTS 'livre';

-- Destino do clique — 4º eixo, não existia nenhuma modelagem antes.
CREATE TYPE ad_destino_clique AS ENUM ('landing_page', 'whatsapp', 'produto', 'formulario_lead');

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS destino_clique ad_destino_clique,
  -- Preenchido só quando item_tipo='landing_page' (aponta pra generated_sites.id)
  ADD COLUMN IF NOT EXISTS landing_page_id text REFERENCES generated_sites(id) ON DELETE SET NULL,
  -- Preenchido só quando formato usa mídia gerada (imagem/vídeo) e a
  -- origem foi o Content Studio — referência solta, sem FK (content_
  -- generations não tem índice único de propósito geral pra isso ainda)
  ADD COLUMN IF NOT EXISTS content_generation_id text;

-- Backfill: campanhas existentes (todas rsa_pmax ou shopping, sempre com
-- destino implícito = página do próprio item) ganham destino_clique
-- explícito equivalente ao comportamento atual, pra não deixar campanha
-- antiga com o campo novo nulo.
UPDATE ad_campaigns SET destino_clique = 'produto' WHERE destino_clique IS NULL;

ALTER TABLE ad_campaigns ALTER COLUMN destino_clique SET NOT NULL;
