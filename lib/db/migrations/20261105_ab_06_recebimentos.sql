-- AB-06: recebimento de mercadorias com lote e sanidade (FEFO).
--
-- Registra a entrada física declarada pelo recebedor: nota fiscal, fornecedor,
-- lote, validade, temperatura e quantidade. A etiqueta FEFO e o status
-- (aprovado/bloqueado) NÃO são digitados: são calculados pela API e gravados
-- junto, para o registro ficar auditável mesmo se a regra mudar depois.

CREATE TABLE IF NOT EXISTS ab_recebimentos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_catalogo_id text NOT NULL,
  nota_fiscal text NOT NULL CHECK (length(btrim(nota_fiscal)) > 0),
  fornecedor text,
  lote text NOT NULL CHECK (length(btrim(lote)) > 0),
  data_validade date NOT NULL,
  -- Nulo quando o produto não é perecível refrigerado (a regra só exige
  -- temperatura para carnes). numeric(6,2) cobre de -99,99 a 9999,99 °C.
  temperatura_c numeric(6,2),
  quantidade numeric(15,4) NOT NULL CHECK (quantidade > 0),
  -- Mesma disciplina do resto do módulo: quantidade SEMPRE na unidade base.
  -- Aceitar "kg" aqui reabriria o problema de conversão que o AB-04 resolveu.
  unidade text NOT NULL CHECK (unidade IN ('g', 'ml', 'un')),
  etiqueta_fefo text NOT NULL CHECK (etiqueta_fefo IN ('verde', 'amarelo', 'vermelho')),
  status text NOT NULL CHECK (status IN ('aprovado', 'bloqueado')),
  -- Por que bloqueou (ex.: temperatura acima do limite). Fica gravado: um
  -- recebimento bloqueado sem motivo não se sustenta em auditoria sanitária.
  motivo_bloqueio text,
  recebido_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_recebimentos_tenant_produto_fk
    FOREIGN KEY (tenant_id, produto_catalogo_id)
    REFERENCES produtos_catalogo(tenant_id, id),
  CONSTRAINT ab_recebimentos_recebedor_fk
    FOREIGN KEY (tenant_id, recebido_por) REFERENCES users(tenant_id, id)
);

-- Fila FEFO: "o que vence primeiro neste hotel?".
CREATE INDEX IF NOT EXISTS ab_recebimentos_fefo_idx
  ON ab_recebimentos(tenant_id, data_validade, produto_catalogo_id);
CREATE INDEX IF NOT EXISTS ab_recebimentos_tenant_created_idx
  ON ab_recebimentos(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ab_recebimentos_tenant_status_idx
  ON ab_recebimentos(tenant_id, status, created_at DESC);
-- Lote é rastreável por fornecedor/produto (recolhimento de lote).
CREATE INDEX IF NOT EXISTS ab_recebimentos_lote_idx
  ON ab_recebimentos(tenant_id, produto_catalogo_id, lote);

ALTER TABLE ab_recebimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_recebimentos_tenant_isolation ON ab_recebimentos;
CREATE POLICY ab_recebimentos_tenant_isolation ON ab_recebimentos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
