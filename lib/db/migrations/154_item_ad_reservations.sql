-- Generaliza a lógica de "pausar campanha ao interesse + prazo do vendedor"
-- (D-006 do Marcos: já existia funcionando de verdade só pra veículos,
-- mas pausarAoInteresse/slaNegociacaoHoras já eram campos genéricos em
-- ad_campaigns -- só a implementação (vehicle-reservation.ts) que
-- rejeitava tudo que não fosse "veiculo"). Tabela aditiva, paralela à
-- vehicle_ad_reservations -- não mexe no fluxo de veículo já em produção.
CREATE TABLE IF NOT EXISTS item_ad_reservations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  item_tipo text NOT NULL,
  item_id text NOT NULL,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  seller_id text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'em_negociacao',
  reserved_at timestamp NOT NULL DEFAULT now(),
  justification_due_at timestamp NOT NULL,
  decision text,
  justification text,
  decided_by text REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_ad_reservations_item ON item_ad_reservations (item_tipo, item_id, status);
CREATE INDEX IF NOT EXISTS idx_item_ad_reservations_deal ON item_ad_reservations (deal_id);
