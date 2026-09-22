-- Arqdor marketplace RLS.
-- Active marketplace items are browseable across tenants.
-- Mutations remain seller-owned; orders are shared only between buyer and seller.

BEGIN;

-- Items: cross-tenant read for active listings, seller-owned mutations.
DROP POLICY IF EXISTS vendorai_marketplace_item_select ON public.arch_marketplace_items;
CREATE POLICY vendorai_marketplace_item_select
  ON public.arch_marketplace_items
  FOR SELECT
  TO vendorai_app
  USING (
    (select app_security.is_super_admin())
    OR vendedor_tenant_id = (select app_security.current_tenant_id())
    OR coalesce(ativo, true) = true
  );

DROP POLICY IF EXISTS vendorai_marketplace_item_insert ON public.arch_marketplace_items;
CREATE POLICY vendorai_marketplace_item_insert
  ON public.arch_marketplace_items
  FOR INSERT
  TO vendorai_app
  WITH CHECK (
    (select app_security.is_super_admin())
    OR vendedor_tenant_id = (select app_security.current_tenant_id())
  );

DROP POLICY IF EXISTS vendorai_marketplace_item_update ON public.arch_marketplace_items;
CREATE POLICY vendorai_marketplace_item_update
  ON public.arch_marketplace_items
  FOR UPDATE
  TO vendorai_app
  USING (
    (select app_security.is_super_admin())
    OR vendedor_tenant_id = (select app_security.current_tenant_id())
  )
  WITH CHECK (
    (select app_security.is_super_admin())
    OR vendedor_tenant_id = (select app_security.current_tenant_id())
  );

DROP POLICY IF EXISTS vendorai_marketplace_item_delete ON public.arch_marketplace_items;
CREATE POLICY vendorai_marketplace_item_delete
  ON public.arch_marketplace_items
  FOR DELETE
  TO vendorai_app
  USING (
    (select app_security.is_super_admin())
    OR vendedor_tenant_id = (select app_security.current_tenant_id())
  );

-- Orders: buyer and seller share read/update visibility.
DROP POLICY IF EXISTS vendorai_marketplace_order_select ON public.arch_marketplace_pedidos;
CREATE POLICY vendorai_marketplace_order_select
  ON public.arch_marketplace_pedidos
  FOR SELECT
  TO vendorai_app
  USING (
    (select app_security.is_super_admin())
    OR comprador_tenant_id = (select app_security.current_tenant_id())
    OR EXISTS (
      SELECT 1
      FROM public.arch_marketplace_items item
      WHERE item.id = arch_marketplace_pedidos.item_id
        AND item.vendedor_tenant_id = (select app_security.current_tenant_id())
    )
  );

DROP POLICY IF EXISTS vendorai_marketplace_order_insert ON public.arch_marketplace_pedidos;
CREATE POLICY vendorai_marketplace_order_insert
  ON public.arch_marketplace_pedidos
  FOR INSERT
  TO vendorai_app
  WITH CHECK (
    (
      (select app_security.is_super_admin())
      OR comprador_tenant_id = (select app_security.current_tenant_id())
    )
    AND EXISTS (
      SELECT 1
      FROM public.arch_marketplace_items item
      WHERE item.id = arch_marketplace_pedidos.item_id
        AND coalesce(item.ativo, true) = true
    )
  );

DROP POLICY IF EXISTS vendorai_marketplace_order_update ON public.arch_marketplace_pedidos;
CREATE POLICY vendorai_marketplace_order_update
  ON public.arch_marketplace_pedidos
  FOR UPDATE
  TO vendorai_app
  USING (
    (select app_security.is_super_admin())
    OR comprador_tenant_id = (select app_security.current_tenant_id())
    OR EXISTS (
      SELECT 1
      FROM public.arch_marketplace_items item
      WHERE item.id = arch_marketplace_pedidos.item_id
        AND item.vendedor_tenant_id = (select app_security.current_tenant_id())
    )
  )
  WITH CHECK (
    (select app_security.is_super_admin())
    OR comprador_tenant_id = (select app_security.current_tenant_id())
    OR EXISTS (
      SELECT 1
      FROM public.arch_marketplace_items item
      WHERE item.id = arch_marketplace_pedidos.item_id
        AND item.vendedor_tenant_id = (select app_security.current_tenant_id())
    )
  );

DROP POLICY IF EXISTS vendorai_marketplace_order_delete ON public.arch_marketplace_pedidos;
CREATE POLICY vendorai_marketplace_order_delete
  ON public.arch_marketplace_pedidos
  FOR DELETE
  TO vendorai_app
  USING (
    (select app_security.is_super_admin())
    OR comprador_tenant_id = (select app_security.current_tenant_id())
    OR EXISTS (
      SELECT 1
      FROM public.arch_marketplace_items item
      WHERE item.id = arch_marketplace_pedidos.item_id
        AND item.vendedor_tenant_id = (select app_security.current_tenant_id())
    )
  );

COMMIT;
