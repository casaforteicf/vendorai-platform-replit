-- Composição de N itens pra cálculo de orçamento por área/m² (generaliza
-- o antigo modelo de "produto principal + 1 acessório de perímetro por
-- Coleção+Cor" pra qualquer número de itens, cada um calculado por área
-- ou por perímetro do ambiente). Ex: teto vinílico = manta (área) +
-- perfil F de acabamento (perímetro); pode crescer com fita, cola etc
-- sem mudar schema nenhum de novo.
CREATE TABLE IF NOT EXISTS produto_composicoes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_principal_id TEXT NOT NULL REFERENCES produtos_catalogo(id) ON DELETE CASCADE,
  item_produto_id TEXT NOT NULL REFERENCES produtos_catalogo(id) ON DELETE RESTRICT,
  base_calculo TEXT NOT NULL DEFAULT 'area', -- 'area' | 'perimetro'
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS produto_composicoes_principal_idx ON produto_composicoes (produto_principal_id);
CREATE INDEX IF NOT EXISTS produto_composicoes_tenant_idx ON produto_composicoes (tenant_id);
