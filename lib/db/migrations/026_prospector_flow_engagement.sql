-- Flow execution engagement tracking: wamid + aberta_em + clicada_em + engajamento_adaptado
ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS wamid TEXT;
ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS aberta_em TIMESTAMPTZ;
ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS clicada_em TIMESTAMPTZ;
ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS engajamento_adaptado BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pfe_wamid ON prospector_flow_executions(wamid) WHERE wamid IS NOT NULL;
