-- Código curto e único por campanha, gerado na criação, pra usar como
-- valor de utm_campaign em qualquer landing page/link que apontar pra
-- essa campanha. Existe separado de external_campaign_id porque esse só
-- é preenchido depois de publicar de verdade na plataforma — o código de
-- atribuição precisa existir desde o rascunho, pra já poder ser usado em
-- material de divulgação criado antes da campanha ir ao ar.
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS utm_code text;

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaigns_utm_code_idx ON ad_campaigns (utm_code) WHERE utm_code IS NOT NULL;
