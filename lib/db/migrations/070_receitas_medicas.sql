-- Controle de receita/prescrição médica com validade — pedido do usuário
-- (item #13 do documento de Farmácia). Alimenta a nova regra do Scout
-- "receita_vencendo".

CREATE TABLE IF NOT EXISTS receitas_medicas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  produto_id text REFERENCES produtos_catalogo(id) ON DELETE SET NULL,
  medicamento_nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'comum' CHECK (tipo IN ('comum','controlado')),
  medico text,
  crm text,
  data_emissao timestamp NOT NULL,
  data_validade timestamp NOT NULL,
  quantidade_caixas integer,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','vencida','utilizada','renovada')),
  observacoes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receitas_medicas_tenant ON receitas_medicas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receitas_medicas_cliente ON receitas_medicas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_receitas_medicas_validade ON receitas_medicas(data_validade) WHERE status = 'ativa';
