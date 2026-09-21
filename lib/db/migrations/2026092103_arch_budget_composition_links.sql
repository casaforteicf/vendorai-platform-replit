-- Liga itens do orçamento Arqdor às composições canônicas da construção.
-- O vínculo por código permite que o Concept nasça antes de o catálogo padrão
-- ter sido aplicado ao tenant; quando a composição existir, o ID é resolvido.

ALTER TABLE arch_budget_items
  ADD COLUMN IF NOT EXISTS composition_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS composition_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_arch_budget_items_composition_id
  ON arch_budget_items (composition_id);

CREATE INDEX IF NOT EXISTS idx_arch_budget_items_composition_code
  ON arch_budget_items (tenant_id, composition_code);
