-- Oportunidade futura PREVISTA pelo vendedor por lead — pedido do
-- usuário, referência extra pra IA na extração SPIN e no
-- desenvolvimento dos estágios de venda.

CREATE TABLE IF NOT EXISTS lead_oportunidades_previstas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  valor_estimado numeric(12,2),
  previsao_data timestamp,
  criado_por text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberta',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_oport_previstas_lead ON lead_oportunidades_previstas(lead_id);
