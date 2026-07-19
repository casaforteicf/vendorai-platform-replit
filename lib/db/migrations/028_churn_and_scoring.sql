-- Scout scoring + leads churn columns + churn_actions + campaign_sent_logs.converted_at
ALTER TABLE scout_oportunidades ADD COLUMN IF NOT EXISTS score_oportunidade NUMERIC(5,2);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_churned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS churned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_is_churned ON leads(tenant_id) WHERE is_churned = FALSE;

CREATE TABLE IF NOT EXISTS churn_actions (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id              TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  action_type          TEXT NOT NULL,
  message_sent         TEXT,
  churn_risk_at_action REAL,
  action_successful    BOOLEAN,
  executed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_actions_lead   ON churn_actions(lead_id);
CREATE INDEX IF NOT EXISTS idx_churn_actions_tenant ON churn_actions(tenant_id);

ALTER TABLE campaign_sent_logs ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
