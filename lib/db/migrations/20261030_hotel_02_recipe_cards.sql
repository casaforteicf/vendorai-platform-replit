-- HOTEL-02: fichas técnicas gastronômicas multi-tenant.
-- Complementa catálogo e cardápio existentes; não altera preços nem saldos.
-- As quantidades seguem unidades de medida declaradas na ficha. Conversões
-- (kg/g, L/ml etc.) precisam ser validadas antes de calcular CMV.
CREATE UNIQUE INDEX IF NOT EXISTS hotel_recipe_product_tenant_fk_idx
  ON produtos_catalogo (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_recipe_menu_tenant_fk_idx
  ON restaurante_cardapio (tenant_id, id);

CREATE TABLE IF NOT EXISTS hotel_recipe_cards (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id text,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  instructions text,
  yield_quantity numeric(15,4) NOT NULL CHECK (yield_quantity > 0),
  yield_unit text NOT NULL,
  preparation_minutes integer CHECK (preparation_minutes >= 0),
  allergens text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, menu_item_id) REFERENCES restaurante_cardapio(tenant_id, id),
  FOREIGN KEY (tenant_id, approved_by) REFERENCES users(tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_recipe_one_active_per_menu
  ON hotel_recipe_cards(tenant_id, menu_item_id)
  WHERE menu_item_id IS NOT NULL AND status <> 'archived';

CREATE TABLE IF NOT EXISTS hotel_recipe_ingredients (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipe_id text NOT NULL,
  product_id text NOT NULL,
  quantity_gross numeric(15,4) NOT NULL CHECK (quantity_gross > 0),
  quantity_unit text NOT NULL,
  yield_factor numeric(8,6) NOT NULL DEFAULT 1 CHECK (yield_factor > 0 AND yield_factor <= 1),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, recipe_id) REFERENCES hotel_recipe_cards(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES produtos_catalogo(tenant_id, id),
  UNIQUE (tenant_id, recipe_id, product_id)
);

CREATE INDEX IF NOT EXISTS hotel_recipe_cards_tenant_status
  ON hotel_recipe_cards(tenant_id, status);
CREATE INDEX IF NOT EXISTS hotel_recipe_ingredients_tenant_product
  ON hotel_recipe_ingredients(tenant_id, product_id);

ALTER TABLE hotel_recipe_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_recipe_cards_tenant_isolation ON hotel_recipe_cards
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY hotel_recipe_ingredients_tenant_isolation ON hotel_recipe_ingredients
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Antes de produção: testar índices contra os dados reais, grants, RLS,
-- vínculo restaurante/food_service, aprovações e cálculo com unidades.
-- Custos precisam considerar preços de compra e conversão de unidades,
-- nunca presumir que o preço de venda do catálogo seja custo do ingrediente.
