-- AB-04: mapa entre o catálogo de ESTOQUE do hotel e o INSUMO do motor preditivo.
--
-- Por que esta tabela existe:
--   hotel_stock_location_balances.quantity  → inventory_items → produtos_catalogo
--   motor preditivo (ab_estoque_saldos)     → insumos
-- São catálogos diferentes, SEM FK entre eles. Sem este mapa o job de
-- sincronização não tem como saber que o "ARROZ T1 5kg" do estoque é o insumo
-- "Arroz" — e adivinhar por nome erraria em silêncio (dois fornecedores, dois
-- nomes, mesmo insumo; ou o mesmo nome para coisas diferentes).
--
-- Um produto mapeia para UM insumo; um insumo pode agregar VÁRIOS produtos
-- (arroz tipo A e tipo B somam no mesmo saldo de "Arroz").

CREATE TABLE IF NOT EXISTS ab_insumo_produto (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id text NOT NULL,
  produto_catalogo_id text NOT NULL,
  -- Quantas unidades BASE do insumo (g/ml/un) há em 1 unidade de estoque.
  -- Necessário só quando a unidade NÃO é métrica: 1 saco = 50000 g, 1 caixa de
  -- 12 un = 12 un. Nulo = conversão puramente métrica (kg→g, l→ml).
  fator_embalagem numeric(15,6) CHECK (fator_embalagem IS NULL OR fator_embalagem > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_insumo_produto_produto_uq UNIQUE (tenant_id, produto_catalogo_id),
  FOREIGN KEY (tenant_id, insumo_id)
    REFERENCES insumos(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, produto_catalogo_id)
    REFERENCES produtos_catalogo(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ab_insumo_produto_tenant_insumo_idx
  ON ab_insumo_produto(tenant_id, insumo_id);

ALTER TABLE ab_insumo_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_insumo_produto_tenant_isolation ON ab_insumo_produto;
CREATE POLICY ab_insumo_produto_tenant_isolation ON ab_insumo_produto
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
