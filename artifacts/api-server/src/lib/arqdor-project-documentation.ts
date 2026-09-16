import { pool } from "@workspace/db";

type DocumentationParams = {
  tenantId: string | null;
  projectId: string;
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "a definir"): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function money(value: unknown): number {
  return Math.round(n(value) * 100) / 100;
}

export async function buildProjectDocumentationSnapshot({ tenantId, projectId }: DocumentationParams) {
  const projectValues: unknown[] = [projectId];
  let projectWhere = "id = $1";
  if (tenantId) {
    projectValues.push(tenantId);
    projectWhere += ` AND tenant_id = $${projectValues.length}`;
  }

  const projectResult = await pool.query(
    `SELECT * FROM arch_projetos WHERE ${projectWhere} LIMIT 1`,
    projectValues,
  );
  const project = projectResult.rows[0];
  if (!project) return null;

  const specValues: unknown[] = [projectId];
  let specWhere = "project_id = $1";
  if (tenantId) {
    specValues.push(tenantId);
    specWhere += ` AND tenant_id = $${specValues.length}`;
  }
  const specsResult = await pool.query(
    `SELECT * FROM arch_spec_objects WHERE ${specWhere} ORDER BY created_at ASC`,
    specValues,
  );
  const specs = specsResult.rows;

  const budgetValues: unknown[] = [projectId];
  let budgetWhere = "project_id = $1";
  if (tenantId) {
    budgetValues.push(tenantId);
    budgetWhere += ` AND tenant_id = $${budgetValues.length}`;
  }
  const budgetResult = await pool.query(
    `SELECT * FROM arch_budgets
     WHERE ${budgetWhere}
     ORDER BY CASE WHEN status IN ('draft','revision') THEN 0 ELSE 1 END, updated_at DESC, created_at DESC
     LIMIT 1`,
    budgetValues,
  );
  const budget = budgetResult.rows[0] ?? null;

  let budgetItems: any[] = [];
  if (budget?.id) {
    const itemsResult = await pool.query(
      `SELECT * FROM arch_budget_items WHERE budget_id = $1 ORDER BY created_at ASC`,
      [budget.id],
    );
    budgetItems = itemsResult.rows;
  }

  const materials = specs
    .filter((item: any) => item.material_name || item.product_name || item.catalog_material_id || item.catalog_product_id)
    .map((item: any) => ({
      id: item.id,
      ambienteId: item.ambiente_id ?? null,
      renderId: item.render_id ?? null,
      name: text(item.product_name || item.material_name || item.name),
      materialName: item.material_name ?? null,
      productName: item.product_name ?? null,
      category: item.category ?? null,
      region: item.region ?? null,
      manufacturer: item.manufacturer_name ?? null,
      supplier: item.supplier_name ?? null,
      quantity: n(item.quantity || 1),
      unit: text(item.unit, "un"),
      unitMaterialValue: money(item.material_value),
      unitLaborValue: money(item.labor_value),
      totalValue: money(item.total_value),
      status: item.status,
      notes: item.notes ?? null,
    }));

  const quantitative = specs.map((item: any) => ({
    id: item.id,
    ambienteId: item.ambiente_id ?? null,
    name: text(item.name),
    category: item.category ?? null,
    region: item.region ?? null,
    quantity: n(item.quantity || 1),
    unit: text(item.unit, "un"),
    materialName: item.material_name ?? null,
    productName: item.product_name ?? null,
    supplier: item.supplier_name ?? null,
    status: item.status,
  }));

  const shoppingList = specs
    .filter((item: any) => item.status === "sent-to-budget" || n(item.material_value) > 0 || item.supplier_name)
    .map((item: any) => ({
      specObjectId: item.id,
      name: text(item.product_name || item.material_name || item.name),
      quantity: n(item.quantity || 1),
      unit: text(item.unit, "un"),
      supplier: item.supplier_name ?? null,
      manufacturer: item.manufacturer_name ?? null,
      materialValue: money(item.material_value),
      laborValue: money(item.labor_value),
      totalValue: money(item.total_value),
      budgetItem: budgetItems.find((budgetItem: any) => budgetItem.spec_object_id === item.id) ?? null,
    }));

  const totals = {
    specifications: specs.length,
    materials: materials.length,
    shoppingItems: shoppingList.length,
    material: money(budget?.material_total ?? budget?.subtotal_material ?? specs.reduce((sum: number, item: any) => sum + n(item.material_value) * n(item.quantity || 1), 0)),
    labor: money(budget?.labor_total ?? budget?.subtotal_labor ?? specs.reduce((sum: number, item: any) => sum + n(item.labor_value) * n(item.quantity || 1), 0)),
    discount: money(budget?.discount_total ?? budget?.discount ?? 0),
    grandTotal: money(budget?.grand_total ?? budget?.total ?? budget?.total_value ?? specs.reduce((sum: number, item: any) => sum + n(item.total_value), 0)),
  };

  const memorialLines = [
    `MEMORIAL DESCRITIVO — ${text(project.titulo || project.title || project.nome, "Projeto ARQDOR")}`,
    "",
    `Cliente: ${text(project.cliente_nome || project.client_name)}`,
    `Tipo de obra: ${text(project.tipo_obra || project.type)}`,
    project.area_m2 ? `Área de referência: ${n(project.area_m2).toLocaleString("pt-BR")} m²` : "Área de referência: a definir",
    "",
    "ESPECIFICAÇÕES CONSOLIDADAS",
    ...(specs.length > 0
      ? specs.map((item: any, index: number) => {
          const itemName = text(item.product_name || item.material_name || item.name);
          const region = item.region ? ` — ${item.region}` : "";
          const qty = `${n(item.quantity || 1).toLocaleString("pt-BR")} ${text(item.unit, "un")}`;
          const supplier = item.supplier_name ? ` — fornecedor: ${item.supplier_name}` : "";
          return `${index + 1}. ${itemName}${region} — ${qty}${supplier}.`;
        })
      : ["Nenhuma especificação consolidada até o momento."]),
    "",
    "CRITÉRIOS DE EXECUÇÃO",
    "Executar conforme medidas validadas em obra, especificações aprovadas e instruções técnicas dos fabricantes. Divergências entre projeto, campo e fornecedor devem ser registradas e aprovadas antes da execução.",
    "",
    "CONTROLE",
    `Especificações registradas: ${specs.length}. Itens vinculados a orçamento/lista de compras: ${shoppingList.length}.`,
  ];

  return {
    project: {
      id: project.id,
      title: project.titulo ?? project.title ?? project.nome ?? "Projeto ARQDOR",
      clientName: project.cliente_nome ?? project.client_name ?? null,
      type: project.tipo_obra ?? project.type ?? null,
      areaM2: project.area_m2 ?? null,
      status: project.status ?? null,
    },
    generatedAt: new Date().toISOString(),
    source: "arch_spec_objects + arch_budgets + arch_budget_items",
    memorial: memorialLines.join("\n"),
    specifications: specs,
    materials,
    quantitative,
    shoppingList,
    budget: budget ? { ...budget, items: budgetItems } : null,
    totals,
    readiness: {
      memorial: specs.length > 0 ? "generated" : "pending",
      materials: materials.length > 0 ? "generated" : "pending",
      quantitative: specs.length > 0 ? "generated" : "pending",
      shoppingList: shoppingList.length > 0 ? "generated" : "pending",
      budget: budget ? "generated" : "pending",
    },
  };
}
