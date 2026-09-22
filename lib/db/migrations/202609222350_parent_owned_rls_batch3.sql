-- Parent-owned RLS batch 3: second-level ownership chains.
-- These children inherit tenant visibility from parents protected in earlier RLS batches.

BEGIN;

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_render_solicitacoes";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_render_solicitacoes" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_solicitacoes.cena_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_solicitacoes.cena_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_render_solicitacoes";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_render_solicitacoes" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_solicitacoes.cena_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_solicitacoes.cena_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_render_versoes";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_render_versoes" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_versoes.cena_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_versoes.cena_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_render_versoes";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_render_versoes" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_versoes.cena_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_render_versoes.cena_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."arch_renders";
CREATE POLICY vendorai_parent_tenant_access ON public."arch_renders" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_renders.cena_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_renders.cena_id)
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."arch_renders";
CREATE POLICY vendorai_parent_tenant_guard ON public."arch_renders" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_renders.cena_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.arch_cenas c WHERE c.id = arch_renders.cena_id)
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."obra_etapa_medicoes";
CREATE POLICY vendorai_parent_tenant_access ON public."obra_etapa_medicoes" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obra_etapas e WHERE e.id = obra_etapa_medicoes.etapa_id)
    AND (obra_etapa_medicoes.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_etapa_medicoes.responsavel_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obra_etapas e WHERE e.id = obra_etapa_medicoes.etapa_id)
    AND (obra_etapa_medicoes.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_etapa_medicoes.responsavel_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."obra_etapa_medicoes";
CREATE POLICY vendorai_parent_tenant_guard ON public."obra_etapa_medicoes" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obra_etapas e WHERE e.id = obra_etapa_medicoes.etapa_id)
    AND (obra_etapa_medicoes.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_etapa_medicoes.responsavel_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obra_etapas e WHERE e.id = obra_etapa_medicoes.etapa_id)
    AND (obra_etapa_medicoes.responsavel_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = obra_etapa_medicoes.responsavel_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."obra_orcamento_itens";
CREATE POLICY vendorai_parent_tenant_access ON public."obra_orcamento_itens" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obra_orcamento_etapas e WHERE e.id = obra_orcamento_itens.etapa_id)
    AND (obra_orcamento_itens.composicao_id IS NULL OR EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = obra_orcamento_itens.composicao_id))
    AND (obra_orcamento_itens.insumo_id IS NULL OR EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = obra_orcamento_itens.insumo_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obra_orcamento_etapas e WHERE e.id = obra_orcamento_itens.etapa_id)
    AND (obra_orcamento_itens.composicao_id IS NULL OR EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = obra_orcamento_itens.composicao_id))
    AND (obra_orcamento_itens.insumo_id IS NULL OR EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = obra_orcamento_itens.insumo_id))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."obra_orcamento_itens";
CREATE POLICY vendorai_parent_tenant_guard ON public."obra_orcamento_itens" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.obra_orcamento_etapas e WHERE e.id = obra_orcamento_itens.etapa_id)
    AND (obra_orcamento_itens.composicao_id IS NULL OR EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = obra_orcamento_itens.composicao_id))
    AND (obra_orcamento_itens.insumo_id IS NULL OR EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = obra_orcamento_itens.insumo_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.obra_orcamento_etapas e WHERE e.id = obra_orcamento_itens.etapa_id)
    AND (obra_orcamento_itens.composicao_id IS NULL OR EXISTS (SELECT 1 FROM public.composicoes c WHERE c.id = obra_orcamento_itens.composicao_id))
    AND (obra_orcamento_itens.insumo_id IS NULL OR EXISTS (SELECT 1 FROM public.insumos i WHERE i.id = obra_orcamento_itens.insumo_id))
  );

DROP POLICY IF EXISTS vendorai_parent_tenant_access ON public."render_surface_materials";
CREATE POLICY vendorai_parent_tenant_access ON public."render_surface_materials" AS PERMISSIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.render_surfaces s WHERE s.id = render_surface_materials.surface_id)
    AND (render_surface_materials.applied_by IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = render_surface_materials.applied_by))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.render_surfaces s WHERE s.id = render_surface_materials.surface_id)
    AND (render_surface_materials.applied_by IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = render_surface_materials.applied_by))
  );
DROP POLICY IF EXISTS vendorai_parent_tenant_guard ON public."render_surface_materials";
CREATE POLICY vendorai_parent_tenant_guard ON public."render_surface_materials" AS RESTRICTIVE FOR ALL TO vendorai_app USING (
    EXISTS (SELECT 1 FROM public.render_surfaces s WHERE s.id = render_surface_materials.surface_id)
    AND (render_surface_materials.applied_by IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = render_surface_materials.applied_by))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.render_surfaces s WHERE s.id = render_surface_materials.surface_id)
    AND (render_surface_materials.applied_by IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = render_surface_materials.applied_by))
  );

COMMIT;
