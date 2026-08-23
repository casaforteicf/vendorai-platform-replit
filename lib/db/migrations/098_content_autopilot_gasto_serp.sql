-- Content Autopilot: controle de gasto acumulado + cache de resultado SERP por keyword
ALTER TABLE content_autopilot_config
  ADD COLUMN IF NOT EXISTS gasto_acumulado numeric(10, 4) NOT NULL DEFAULT 0;

ALTER TABLE content_autopilot_keywords
  ADD COLUMN IF NOT EXISTS serp_top10 jsonb,
  ADD COLUMN IF NOT EXISTS serp_coletado_em timestamp;
