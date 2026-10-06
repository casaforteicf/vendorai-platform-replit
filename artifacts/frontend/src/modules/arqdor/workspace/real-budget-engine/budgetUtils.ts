import type { Budget, BudgetItem, BudgetStatus, BudgetTotals } from "./budgetTypes";

export function getProjectId(arqState: any): string {
  const project =
    arqState?.currentProject ||
    arqState?.selectedProject ||
    arqState?.project ||
    arqState?.projects?.[0] ||
    arqState?.projetos?.[0];

  return String(project?.id || project?._id || project?.projectId || "");
}

export function getProjectTitle(arqState: any): string {
  const project =
    arqState?.currentProject ||
    arqState?.selectedProject ||
    arqState?.project ||
    arqState?.projects?.[0] ||
    arqState?.projetos?.[0];

  return project?.titulo || project?.title || project?.name || "Projeto ARQDOR";
}

export function getClientName(arqState: any): string {
  const project =
    arqState?.currentProject ||
    arqState?.selectedProject ||
    arqState?.project ||
    arqState?.projects?.[0] ||
    arqState?.projetos?.[0];

  return project?.clienteNome || project?.clientName || project?.cliente || "Cliente";
}

export function getAuthHeaders(): HeadersInit {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("vendorai_token") ||
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function money(value?: number | null) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function statusLabel(status: BudgetStatus) {
  const labels: Record<BudgetStatus, string> = {
    draft: "Rascunho",
    "in-review": "Em revisão",
    sent: "Enviado",
    approved: "Aprovado",
    rejected: "Rejeitado",
    archived: "Arquivado",
  };
  return labels[status];
}

export function statusClass(status: BudgetStatus) {
  const classes: Record<BudgetStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    "in-review": "bg-blue-50 text-blue-700",
    sent: "bg-violet-50 text-violet-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
    archived: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function calculateItemTotals(item: Pick<BudgetItem, "quantity" | "materialValue" | "laborValue">) {
  const quantity = Number(item.quantity || 1);
  const materialValue = Number(item.materialValue || 0);
  const laborValue = Number(item.laborValue || 0);

  return {
    unitTotal: materialValue + laborValue,
    totalMaterial: quantity * materialValue,
    totalLabor: quantity * laborValue,
    total: quantity * (materialValue + laborValue),
  };
}

export function calculateBudgetTotals(items: BudgetItem[], budget?: Budget | null): BudgetTotals {
  const subtotalMaterial = items.reduce((sum, item) => sum + Number(item.totalMaterial || 0), 0);
  const subtotalLabor = items.reduce((sum, item) => sum + Number(item.totalLabor || 0), 0);
  const subtotal = subtotalMaterial + subtotalLabor;

  const discountValue = Number(budget?.discountValue || 0);
  const discountTotal = budget?.discountType === "percent"
    ? subtotal * (discountValue / 100)
    : discountValue;

  const grandTotal = Math.max(0, subtotal - discountTotal);

  return {
    subtotalMaterial,
    subtotalLabor,
    subtotal,
    discountTotal,
    grandTotal,
  };
}

export function normalizeBudget(raw: any): Budget {
  return {
    id: String(raw?.id || raw?._id || raw?.budgetId || crypto.randomUUID()),
    tenantId: raw?.tenantId || raw?.tenant_id || null,
    projectId: String(raw?.projectId || raw?.project_id || raw?.projetoId || ""),
    ambienteId: raw?.ambienteId || raw?.ambiente_id || null,
    renderId: raw?.renderId || raw?.render_id || null,
    title: raw?.title || raw?.titulo || "Orçamento ARQDOR",
    clientName: raw?.clientName || raw?.client_name || raw?.clienteNome || null,
    status: raw?.status || "draft",
    version: Number(raw?.version || raw?.versao || 1),
    subtotalMaterial: Number(raw?.subtotalMaterial ?? raw?.subtotal_material ?? 0),
    subtotalLabor: Number(raw?.subtotalLabor ?? raw?.subtotal_labor ?? raw?.subtotalMaoDeObra ?? 0),
    subtotal: Number(raw?.subtotal ?? 0),
    discountType: raw?.discountType || raw?.discount_type || "fixed",
    discountValue: Number(raw?.discountValue ?? raw?.discount_value ?? 0),
    discountTotal: Number(raw?.discountTotal ?? raw?.discount_total ?? 0),
    grandTotal: Number(raw?.grandTotal ?? raw?.grand_total ?? raw?.total ?? 0),
    saleTotal: raw?.saleTotal ?? raw?.sale_total ?? null,
    saleSource: raw?.saleSource || raw?.sale_source || "manual",
    notes: raw?.notes || raw?.observacoes || null,
    clientNotes: raw?.clientNotes || raw?.client_notes || null,
    internalNotes: raw?.internalNotes || raw?.internal_notes || null,
    specificationOutdated: Boolean(raw?.specificationOutdated ?? raw?.specification_outdated ?? false),
    specificationRevision: raw?.specificationRevision || raw?.specification_revision || null,
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}

export function normalizeBudgetItem(raw: any): BudgetItem {
  const quantity = Number(raw?.quantity ?? raw?.quantidade ?? 1);
  const materialValue = Number(raw?.materialValue ?? raw?.material_value ?? raw?.valorMaterial ?? 0);
  const laborValue = Number(raw?.laborValue ?? raw?.labor_value ?? raw?.valorMaoDeObra ?? 0);
  const totals = calculateItemTotals({ quantity, materialValue, laborValue });

  return {
    id: String(raw?.id || raw?._id || raw?.budgetItemId || crypto.randomUUID()),
    budgetId: String(raw?.budgetId || raw?.budget_id || ""),
    specObjectId: raw?.specObjectId || raw?.spec_object_id || null,
    projectId: String(raw?.projectId || raw?.project_id || raw?.projetoId || ""),
    ambienteId: raw?.ambienteId || raw?.ambiente_id || null,
    renderId: raw?.renderId || raw?.render_id || null,
    item: raw?.item || raw?.name || raw?.nome || "Item",
    description: raw?.description || raw?.descricao || null,
    type: raw?.type || "product",
    quantity,
    unit: raw?.unit || raw?.unidade || "un",
    materialValue,
    laborValue,
    unitTotal: Number(raw?.unitTotal ?? raw?.unit_total ?? totals.unitTotal),
    totalMaterial: Number(raw?.totalMaterial ?? raw?.total_material ?? totals.totalMaterial),
    totalLabor: Number(raw?.totalLabor ?? raw?.total_labor ?? totals.totalLabor),
    total: Number(raw?.total ?? totals.total),
    saleTotal: raw?.saleTotal ?? raw?.sale_total ?? null,
    supplierName: raw?.supplierName || raw?.supplier_name || raw?.fornecedorNome || null,
    manufacturerName: raw?.manufacturerName || raw?.manufacturer_name || raw?.fabricanteNome || null,
    productName: raw?.productName || raw?.product_name || raw?.produtoNome || null,
    materialName: raw?.materialName || raw?.material_name || raw?.materialNome || null,
    specificationOutdated: Boolean(raw?.specificationOutdated ?? raw?.specification_outdated ?? false),
    specificationRevision: raw?.specificationRevision || raw?.specification_revision || null,
    specificationImpact: raw?.specificationImpact || raw?.specification_impact || null,
    visibleToClient: raw?.visibleToClient ?? raw?.visible_to_client ?? true,
    sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? 0),
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}
