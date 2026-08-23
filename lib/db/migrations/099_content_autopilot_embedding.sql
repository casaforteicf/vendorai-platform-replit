-- Content Autopilot: embedding do artigo pra linkagem interna por similaridade
-- (extensão vector já ativa no projeto, usada por prospect_approvals)
ALTER TABLE content_autopilot_articles
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
