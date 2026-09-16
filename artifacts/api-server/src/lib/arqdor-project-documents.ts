import { pool } from "@workspace/db";

export type ArqdorDocumentKind = "memorial" | "materials-book" | "shopping-list";

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function buildArqdorProjectDocuments(params: {
  tenantId: string;
  projectId: string;
}) {
  const { tenantId, projectId } = params;

  const projectResult = await pool.query(
    `SELECT id, titulo, cliente_nome, tipo_obra, area_m2, status
       FROM arch_projetos
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1`,
    [projectId, tenantId],
  );
  const project = projectResult.rows[0];
  if (!project) return null;

  const [specResult, budgetResult, renderResult] = await Promise.all([
    pool.query(
      `SELECT *
         FROM arch_spec_objects
        WHERE project_id = $1 AND tenant_id = $2 AND status <> 'archived'
        ORDER BY ambiente_id NULLS LAST, category NULLS LAST, name, created_at`,
      [projectId, tenantId],
    ),
    pool.query(
      `SELECT b.id AS budget_id, b.status AS budget_status, b.subtotal_material,
              b.subtotal_labor, b.discount_value, b.total_value,
              bi.id AS item_id, bi.spec_object_id, bi.description, bi.category,
              bi.quantity, bi.unit, bi.material_value, bi.labor_value, bi.total_value AS item_total
         FROM arch_budgets b
         LEFT JOIN arch_budget_items bi ON bi.budget_id = b.id
        WHERE b.project_id = $1 AND b.tenant_id = $2
        ORDER BY CASE WHEN b.status IN ('draft','review') THEN 0 ELSE 1 END, b.updated_at DESC NULLS LAST`,
      [projectId, tenantId],
    ),
    pool.query(
      `SELECT id, ambiente, material_name, operation_type, version_tag, approved_at, created_at
         FROM arch_ai_renders
        WHERE project_id = $1 AND tenant_id = $2 AND status = 'concluido'
        ORDER BY created_at`,
      [projectId, tenantId],
    ),
  ]);

  const specs = specResult.rows;
  const renderHistory = renderResult.rows;
  const approvedRenders = renderHistory.filter((r: any) => r.approved_at || r.operation_type === "approved");

  const memorialSections = specs.map((s: any) => ({
    id: s.id,
    ambienteId: s.ambiente_id,
    category: s.category,
    region: s.region,
    title: s.product_name || s.material_name || s.name,
    description: s.description,
    material: s.material_name,
    product: s.product_name,
    manufacturer: s.manufacturer_name,
    supplier: s.supplier_name,
    quantity: n(s.quantity),
    unit: s.unit || "un",
    notes: s.notes,
    sourceRenderId: s.render_id,
    status: s.status,
  }));

  const materials = specs
    .filter((s: any) => s.material_name || s.product_name || s.catalog_material_id || s.catalog_product_id)
    .map((s: any) => ({
      specObjectId: s.id,
      ambienteId: s.ambiente_id,
      category: s.category,
      region: s.region,
      material: s.material_name,
      product: s.product_name,
      manufacturer: s.manufacturer_name,
      supplier: s.supplier_name,
      catalogMaterialId: s.catalog_material_id,
      catalogProductId: s.catalog_product_id,
      quantity: n(s.quantity),
      unit: s.unit || "un",
      materialValue: n(s.material_value),
      sourceRenderId: s.render_id,
    }));

  const shoppingList = specs
    .filter((s: any) => n(s.quantity) > 0)
    .map((s: any) => ({
      specObjectId: s.id,
      description: s.product_name || s.material_name || s.name,
      category: s.category,
      supplier: s.supplier_name,
      manufacturer: s.manufacturer_name,
      quantity: n(s.quantity),
      unit: s.unit || "un",
      unitMaterialValue: n(s.material_value),
      laborValue: n(s.labor_value),
      estimatedTotal: n(s.total_value),
      budgetStatus: s.status === "sent-to-budget" ? "linked" : "pending",
    }));

  const firstBudgetId = budgetResult.rows.find((r: any) => r.budget_id)?.budget_id ?? null;
  const activeBudgetRows = firstBudgetId
    ? budgetResult.rows.filter((r: any) => r.budget_id === firstBudgetId)
    : [];
  const budgetHead = activeBudgetRows[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.titulo,
      clientName: project.cliente_nome,
      workType: project.tipo_obra,
      areaM2: project.area_m2,
      status: project.status,
    },
    sources: {
      specifications: specs.length,
      renders: renderHistory.length,
      approvedRenders: approvedRenders.length,
      budgetId: firstBudgetId,
    },
    memorial: {
      title: `Memorial descritivo — ${project.titulo}`,
      sections: memorialSections,
      approvedRenderIds: approvedRenders.map((r: any) => r.id),
    },
    materialsBook: {
      title: `Caderno de materiais — ${project.titulo}`,
      items: materials,
    },
    shoppingList: {
      title: `Lista de compras — ${project.titulo}`,
      items: shoppingList,
      summary: budgetHead ? {
        budgetId: firstBudgetId,
        status: budgetHead.budget_status,
        subtotalMaterial: n(budgetHead.subtotal_material),
        subtotalLabor: n(budgetHead.subtotal_labor),
        discountValue: n(budgetHead.discount_value),
        totalValue: n(budgetHead.total_value),
      } : null,
    },
  };
}
