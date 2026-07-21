-- Revenue Scout Seguros Corporativos: vínculo e governança da oportunidade de renovação.
ALTER TABLE scout_oportunidades
  ADD COLUMN IF NOT EXISTS insurance_position_id text REFERENCES insurance_account_product_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewal_window text,
  ADD COLUMN IF NOT EXISTS human_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS explanation jsonb;

CREATE INDEX IF NOT EXISTS scout_opportunities_insurance_position_idx
  ON scout_oportunidades(tenant_id, insurance_position_id);

CREATE UNIQUE INDEX IF NOT EXISTS scout_opportunities_open_insurance_position_uidx
  ON scout_oportunidades(tenant_id, insurance_position_id)
  WHERE insurance_position_id IS NOT NULL
    AND status NOT IN ('converteu', 'ignorado');
