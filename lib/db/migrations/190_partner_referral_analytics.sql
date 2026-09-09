-- Funil de indicação de parceiros/influenciadores.
-- Guarda somente dados de atribuição necessários para métricas; não armazena IP.
CREATE TABLE IF NOT EXISTS partner_referral_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  partner_id text NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  coupon_code text NOT NULL,
  event_type text NOT NULL DEFAULT 'click' CHECK (event_type IN ('click')),
  session_id text NOT NULL,
  source text,
  landing_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Um clique qualificado por sessão/código; recarregar a página não infla a métrica.
CREATE UNIQUE INDEX IF NOT EXISTS partner_referral_events_session_uidx
  ON partner_referral_events(partner_id, session_id, event_type);
CREATE INDEX IF NOT EXISTS partner_referral_events_partner_created_idx
  ON partner_referral_events(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_referral_events_coupon_idx
  ON partner_referral_events(coupon_code);
