-- Parent-owned RLS batch 2: multi-parent / optional relationships.
-- Every mandatory parent must be visible to the current tenant context.
-- Optional parents, when present, must also be visible.

BEGIN;

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."ad_creatives";
CREATE POLICY vendorai_parent_tenant_access ON public."ad_creatives" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.ad_campaigns p WHERE p.id = ad_creatives.campaign_id)
    AND (ad_creatives.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = ad_creatives.aprovado_por_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.ad_campaigns p WHERE p.id = ad_creatives.campaign_id)
    AND (ad_creatives.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = ad_creatives.aprovado_por_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."ad_creatives";
CREATE POLICY vendorai_parent_tenant_guard ON public."ad_creatives" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.ad_campaigns p WHERE p.id = ad_creatives.campaign_id)
    AND (ad_creatives.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = ad_creatives.aprovado_por_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.ad_campaigns p WHERE p.id = ad_creatives.campaign_id)
    AND (ad_creatives.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = ad_creatives.aprovado_por_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."campaign_sent_logs";
CREATE POLICY vendorai_parent_tenant_access ON public."campaign_sent_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.campaigns p WHERE p.id = campaign_sent_logs.campaign_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = campaign_sent_logs.lead_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns p WHERE p.id = campaign_sent_logs.campaign_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = campaign_sent_logs.lead_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."campaign_sent_logs";
CREATE POLICY vendorai_parent_tenant_guard ON public."campaign_sent_logs" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.campaigns p WHERE p.id = campaign_sent_logs.campaign_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = campaign_sent_logs.lead_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns p WHERE p.id = campaign_sent_logs.campaign_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = campaign_sent_logs.lead_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."composicao_insumos";
CREATE POLICY vendorai_parent_tenant_access ON public."composicao_insumos" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = composicao_insumos.composicao_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = composicao_insumos.insumo_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = composicao_insumos.composicao_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = composicao_insumos.insumo_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."composicao_insumos";
CREATE POLICY vendorai_parent_tenant_guard ON public."composicao_insumos" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = composicao_insumos.composicao_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = composicao_insumos.insumo_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = composicao_insumos.composicao_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = composicao_insumos.insumo_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."estoque_obras";
CREATE POLICY vendorai_parent_tenant_access ON public."estoque_obras" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = estoque_obras.obra_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = estoque_obras.insumo_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = estoque_obras.obra_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = estoque_obras.insumo_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."estoque_obras";
CREATE POLICY vendorai_parent_tenant_guard ON public."estoque_obras" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = estoque_obras.obra_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = estoque_obras.insumo_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = estoque_obras.obra_id)
    AND EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = estoque_obras.insumo_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."food_pedido_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."food_pedido_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.food_pedidos p WHERE p.id = food_pedido_itens.pedido_id)
    AND (food_pedido_itens.cardapio_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_cardapio_itens c WHERE c.id = food_pedido_itens.cardapio_item_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.food_pedidos p WHERE p.id = food_pedido_itens.pedido_id)
    AND (food_pedido_itens.cardapio_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_cardapio_itens c WHERE c.id = food_pedido_itens.cardapio_item_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."food_pedido_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."food_pedido_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.food_pedidos p WHERE p.id = food_pedido_itens.pedido_id)
    AND (food_pedido_itens.cardapio_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_cardapio_itens c WHERE c.id = food_pedido_itens.cardapio_item_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.food_pedidos p WHERE p.id = food_pedido_itens.pedido_id)
    AND (food_pedido_itens.cardapio_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_cardapio_itens c WHERE c.id = food_pedido_itens.cardapio_item_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."lead_responsavel_historico";
CREATE POLICY vendorai_parent_tenant_access ON public."lead_responsavel_historico" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_responsavel_historico.lead_id)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_novo_id)
    AND (lead_responsavel_historico.alterado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.alterado_por_id))
    AND (lead_responsavel_historico.responsavel_anterior_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_anterior_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_responsavel_historico.lead_id)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_novo_id)
    AND (lead_responsavel_historico.alterado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.alterado_por_id))
    AND (lead_responsavel_historico.responsavel_anterior_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_anterior_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."lead_responsavel_historico";
CREATE POLICY vendorai_parent_tenant_guard ON public."lead_responsavel_historico" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_responsavel_historico.lead_id)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_novo_id)
    AND (lead_responsavel_historico.alterado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.alterado_por_id))
    AND (lead_responsavel_historico.responsavel_anterior_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_anterior_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_responsavel_historico.lead_id)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_novo_id)
    AND (lead_responsavel_historico.alterado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.alterado_por_id))
    AND (lead_responsavel_historico.responsavel_anterior_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = lead_responsavel_historico.responsavel_anterior_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."obra_diario";
CREATE POLICY vendorai_parent_tenant_access ON public."obra_diario" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_diario.obra_id)
    AND (obra_diario.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.aprovado_por_id))
    AND (obra_diario.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.responsavel_id))
    AND (obra_diario.executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.executor_id))
    AND (obra_diario.aprovado_por_executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.aprovado_por_executor_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_diario.obra_id)
    AND (obra_diario.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.aprovado_por_id))
    AND (obra_diario.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.responsavel_id))
    AND (obra_diario.executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.executor_id))
    AND (obra_diario.aprovado_por_executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.aprovado_por_executor_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."obra_diario";
CREATE POLICY vendorai_parent_tenant_guard ON public."obra_diario" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_diario.obra_id)
    AND (obra_diario.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.aprovado_por_id))
    AND (obra_diario.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.responsavel_id))
    AND (obra_diario.executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.executor_id))
    AND (obra_diario.aprovado_por_executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.aprovado_por_executor_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obras o WHERE o.id = obra_diario.obra_id)
    AND (obra_diario.aprovado_por_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.aprovado_por_id))
    AND (obra_diario.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_diario.responsavel_id))
    AND (obra_diario.executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.executor_id))
    AND (obra_diario.aprovado_por_executor_id IS NULL OR EXISTS (SELECT 1 FROM public.obra_executores e WHERE e.id = obra_diario.aprovado_por_executor_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."pacote_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."pacote_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.pacotes p WHERE p.id = pacote_itens.pacote_id)
    AND EXISTS (SELECT 1 FROM public.produtos_catalogo pr WHERE pr.id = pacote_itens.produto_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.pacotes p WHERE p.id = pacote_itens.pacote_id)
    AND EXISTS (SELECT 1 FROM public.produtos_catalogo pr WHERE pr.id = pacote_itens.produto_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."pacote_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."pacote_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.pacotes p WHERE p.id = pacote_itens.pacote_id)
    AND EXISTS (SELECT 1 FROM public.produtos_catalogo pr WHERE pr.id = pacote_itens.produto_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.pacotes p WHERE p.id = pacote_itens.pacote_id)
    AND EXISTS (SELECT 1 FROM public.produtos_catalogo pr WHERE pr.id = pacote_itens.produto_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."prospector_flow_executions";
CREATE POLICY vendorai_parent_tenant_access ON public."prospector_flow_executions" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.prospector_flows f WHERE f.id = prospector_flow_executions.flow_id)
    AND EXISTS (SELECT 1 FROM public.partner_leads l WHERE l.id = prospector_flow_executions.lead_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.prospector_flows f WHERE f.id = prospector_flow_executions.flow_id)
    AND EXISTS (SELECT 1 FROM public.partner_leads l WHERE l.id = prospector_flow_executions.lead_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."prospector_flow_executions";
CREATE POLICY vendorai_parent_tenant_guard ON public."prospector_flow_executions" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.prospector_flows f WHERE f.id = prospector_flow_executions.flow_id)
    AND EXISTS (SELECT 1 FROM public.partner_leads l WHERE l.id = prospector_flow_executions.lead_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.prospector_flows f WHERE f.id = prospector_flow_executions.flow_id)
    AND EXISTS (SELECT 1 FROM public.partner_leads l WHERE l.id = prospector_flow_executions.lead_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."supermercado_campanha_envios";
CREATE POLICY vendorai_parent_tenant_access ON public."supermercado_campanha_envios" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.supermercado_campanhas c WHERE c.id = supermercado_campanha_envios.campanha_id)
    AND (supermercado_campanha_envios.lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = supermercado_campanha_envios.lead_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.supermercado_campanhas c WHERE c.id = supermercado_campanha_envios.campanha_id)
    AND (supermercado_campanha_envios.lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = supermercado_campanha_envios.lead_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."supermercado_campanha_envios";
CREATE POLICY vendorai_parent_tenant_guard ON public."supermercado_campanha_envios" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.supermercado_campanhas c WHERE c.id = supermercado_campanha_envios.campanha_id)
    AND (supermercado_campanha_envios.lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = supermercado_campanha_envios.lead_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.supermercado_campanhas c WHERE c.id = supermercado_campanha_envios.campanha_id)
    AND (supermercado_campanha_envios.lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = supermercado_campanha_envios.lead_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."supermercado_pedido_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."supermercado_pedido_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.supermercado_pedidos p WHERE p.id = supermercado_pedido_itens.pedido_id)
    AND (supermercado_pedido_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.supermercado_produtos pr WHERE pr.id = supermercado_pedido_itens.produto_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.supermercado_pedidos p WHERE p.id = supermercado_pedido_itens.pedido_id)
    AND (supermercado_pedido_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.supermercado_produtos pr WHERE pr.id = supermercado_pedido_itens.produto_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."supermercado_pedido_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."supermercado_pedido_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.supermercado_pedidos p WHERE p.id = supermercado_pedido_itens.pedido_id)
    AND (supermercado_pedido_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.supermercado_produtos pr WHERE pr.id = supermercado_pedido_itens.produto_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.supermercado_pedidos p WHERE p.id = supermercado_pedido_itens.pedido_id)
    AND (supermercado_pedido_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.supermercado_produtos pr WHERE pr.id = supermercado_pedido_itens.produto_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."varejo_combo_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."varejo_combo_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.varejo_combos c WHERE c.id = varejo_combo_itens.combo_id)
    AND (varejo_combo_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_combo_itens.produto_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.varejo_combos c WHERE c.id = varejo_combo_itens.combo_id)
    AND (varejo_combo_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_combo_itens.produto_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."varejo_combo_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."varejo_combo_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.varejo_combos c WHERE c.id = varejo_combo_itens.combo_id)
    AND (varejo_combo_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_combo_itens.produto_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.varejo_combos c WHERE c.id = varejo_combo_itens.combo_id)
    AND (varejo_combo_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_combo_itens.produto_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."varejo_pedidos_compra_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."varejo_pedidos_compra_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.varejo_pedidos_compra p WHERE p.id = varejo_pedidos_compra_itens.pedido_id)
    AND (varejo_pedidos_compra_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_pedidos_compra_itens.produto_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.varejo_pedidos_compra p WHERE p.id = varejo_pedidos_compra_itens.pedido_id)
    AND (varejo_pedidos_compra_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_pedidos_compra_itens.produto_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."varejo_pedidos_compra_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."varejo_pedidos_compra_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.varejo_pedidos_compra p WHERE p.id = varejo_pedidos_compra_itens.pedido_id)
    AND (varejo_pedidos_compra_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_pedidos_compra_itens.produto_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.varejo_pedidos_compra p WHERE p.id = varejo_pedidos_compra_itens.pedido_id)
    AND (varejo_pedidos_compra_itens.produto_id IS NULL OR EXISTS (SELECT 1 FROM public.varejo_produtos pr WHERE pr.id = varejo_pedidos_compra_itens.produto_id))
  );

COMMIT;
