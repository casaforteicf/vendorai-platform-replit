-- Permite usar o fluxo de cotações também em obras criadas fora de um projeto ARQDOR.
-- Quando houver projeto ARQDOR vinculado, project_id continua sendo preenchido normalmente.
ALTER TABLE public.arch_supplier_orders
  ALTER COLUMN project_id DROP NOT NULL;
