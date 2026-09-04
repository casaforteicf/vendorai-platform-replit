ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS contexto jsonb;

COMMENT ON COLUMN campaigns.contexto IS
  'Contexto de origem e orquestração da campanha, incluindo Revenue Scout, produtos, prospects e handoffs de Marketing.';
