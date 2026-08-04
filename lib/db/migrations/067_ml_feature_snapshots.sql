-- Feature store — primeiro passo real de ML (captura de histórico, antes
-- de qualquer modelo treinado). Ver lib/mlFeatureStore.ts.

CREATE TABLE IF NOT EXISTS ml_feature_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  evento_tipo text NOT NULL,
  captured_at timestamp NOT NULL DEFAULT now(),
  features jsonb NOT NULL,
  resultado text CHECK (resultado IN ('ganho','perdido')),
  resultado_registrado_em timestamp
);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_tenant ON ml_feature_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_lead ON ml_feature_snapshots(lead_id);
CREATE INDEX IF NOT EXISTS idx_ml_snapshots_resultado ON ml_feature_snapshots(resultado) WHERE resultado IS NOT NULL;
