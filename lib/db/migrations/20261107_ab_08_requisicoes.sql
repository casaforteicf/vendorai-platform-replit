-- AB-08: requisição de estoque (saída) por setor.
--
-- Uma requisição é UM insumo com quantidade — o formulário da cozinha é
-- "quero X de Y". Por isso não existe tabela de itens: criar `ab_requisicao_itens`
-- agora seria normalizar uma lista que ninguém preenche, e a baixa ficaria
-- ambígua (baixar item a item ou a requisição inteira?). Se um dia a requisição
-- passar a ter vários itens, a tabela entra com migração de dados.

CREATE TABLE IF NOT EXISTS ab_requisicoes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setor text NOT NULL CHECK (length(btrim(setor)) > 0),
  insumo_id text NOT NULL,
  -- Sempre na unidade base (g/ml/un). A conversão para a unidade do estoque
  -- acontece na baixa, com o mesmo `converterDeBase` do recebimento.
  quantidade_base numeric(15,4) NOT NULL CHECK (quantidade_base > 0),
  unidade_base text NOT NULL CHECK (unidade_base IN ('g', 'ml', 'un')),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'entregue')),
  data_solicitacao date NOT NULL DEFAULT CURRENT_DATE,
  -- Idempotência da baixa: preenchido uma única vez (ver UPDATE condicional).
  baixa_aplicada_em timestamptz,
  baixa_inventory_item_id text,
  baixa_location_id text,
  baixa_motivo text,
  solicitado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, insumo_id) REFERENCES insumos(tenant_id, id),
  FOREIGN KEY (tenant_id, solicitado_por) REFERENCES users(tenant_id, id)
);

-- Fila da cozinha: o que está pendente, primeiro o mais antigo.
CREATE INDEX IF NOT EXISTS ab_requisicoes_pendentes_idx
  ON ab_requisicoes(tenant_id, status, data_solicitacao, created_at);
CREATE INDEX IF NOT EXISTS ab_requisicoes_tenant_insumo_idx
  ON ab_requisicoes(tenant_id, insumo_id, data_solicitacao DESC);

ALTER TABLE ab_requisicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_requisicoes_tenant_isolation ON ab_requisicoes;
CREATE POLICY ab_requisicoes_tenant_isolation ON ab_requisicoes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
