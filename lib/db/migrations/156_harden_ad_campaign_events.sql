CREATE INDEX IF NOT EXISTS ad_campaign_events_campaign_idx
  ON ad_campaign_events (campaign_id);

CREATE INDEX IF NOT EXISTS ad_campaign_events_user_idx
  ON ad_campaign_events (user_id)
  WHERE user_id IS NOT NULL;

-- Eventos de campanha são dados internos. O frontend os acessa somente
-- pelas rotas autenticadas do backend, nunca pela Data API diretamente.
REVOKE ALL ON TABLE ad_campaign_events FROM anon, authenticated;
