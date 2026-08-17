ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS pausar_ao_interesse boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sla_negociacao_horas integer NOT NULL DEFAULT 48;
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS vehicle_reservation_due_at timestamp,
  ADD COLUMN IF NOT EXISTS vehicle_reservation_blocked boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE vehicle_reservation_status AS ENUM ('em_negociacao', 'justificativa_pendente', 'liberado', 'vendido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE vehicle_reservation_decision AS ENUM ('manter', 'avancar', 'perdido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vehicle_ad_reservations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES veiculos_estoque(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  seller_id text REFERENCES users(id) ON DELETE SET NULL,
  status vehicle_reservation_status NOT NULL DEFAULT 'em_negociacao',
  reserved_at timestamp NOT NULL DEFAULT now(),
  justification_due_at timestamp NOT NULL,
  decision vehicle_reservation_decision,
  justification text,
  decided_by text REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_ad_reservations_active_vehicle_idx
  ON vehicle_ad_reservations(vehicle_id)
  WHERE status IN ('em_negociacao', 'justificativa_pendente');
CREATE INDEX IF NOT EXISTS vehicle_ad_reservations_due_idx
  ON vehicle_ad_reservations(status, justification_due_at);
