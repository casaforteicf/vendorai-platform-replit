import type {
  ProductionStatus,
  SupplierStatus,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderType,
} from "./productionTypes";

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

export function getProposalId(arqState: any): string {
  return String(arqState?.proposal?.id || arqState?.currentProposal?.id || arqState?.selectedProposal?.id || "");
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

export function dateShort(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

export function statusLabel(status: ProductionStatus) {
  const labels: Record<ProductionStatus, string> = {
    draft: "Rascunho",
    planned: "Planejado",
    "waiting-supplier": "Aguardando fornecedor",
    ordered: "Pedido feito",
    "in-production": "Em produção",
    ready: "Pronto",
    scheduled: "Agendado",
    installed: "Instalado",
    completed: "Concluído",
    blocked: "Bloqueado",
    cancelled: "Cancelado",
  };
  return labels[status];
}

export function statusClass(status: ProductionStatus) {
  const classes: Record<ProductionStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    planned: "bg-blue-50 text-blue-700",
    "waiting-supplier": "bg-amber-50 text-amber-700",
    ordered: "bg-violet-50 text-violet-700",
    "in-production": "bg-indigo-50 text-indigo-700",
    ready: "bg-emerald-50 text-emerald-700",
    scheduled: "bg-cyan-50 text-cyan-700",
    installed: "bg-teal-50 text-teal-700",
    completed: "bg-emerald-100 text-emerald-800",
    blocked: "bg-rose-50 text-rose-700",
    cancelled: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function supplierStatusLabel(status: SupplierStatus) {
  const labels: Record<SupplierStatus, string> = {
    "not-requested": "Não solicitado",
    "quote-requested": "Cotação solicitada",
    "quote-received": "Cotação recebida",
    approved: "Aprovado",
    ordered: "Pedido feito",
    delivered: "Entregue",
    delayed: "Atrasado",
    cancelled: "Cancelado",
  };
  return labels[status];
}

export function supplierStatusClass(status: SupplierStatus) {
  const classes: Record<SupplierStatus, string> = {
    "not-requested": "bg-slate-100 text-slate-600",
    "quote-requested": "bg-blue-50 text-blue-700",
    "quote-received": "bg-violet-50 text-violet-700",
    approved: "bg-emerald-50 text-emerald-700",
    ordered: "bg-indigo-50 text-indigo-700",
    delivered: "bg-emerald-100 text-emerald-800",
    delayed: "bg-rose-50 text-rose-700",
    cancelled: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function priorityClass(priority: WorkOrderPriority) {
  const classes: Record<WorkOrderPriority, string> = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}

export function typeLabel(type: WorkOrderType) {
  const labels: Record<WorkOrderType, string> = {
    production: "Produção",
    procurement: "Compra",
    installation: "Instalação",
    "site-service": "Serviço em obra",
    delivery: "Entrega",
    "quality-check": "Qualidade",
  };
  return labels[type];
}

export function normalizeWorkOrder(raw: any): WorkOrder {
  return {
    id: String(raw?.id || raw?._id || raw?.workOrderId || crypto.randomUUID()),
    tenantId: raw?.tenantId || raw?.tenant_id || null,
    projectId: String(raw?.projectId || raw?.project_id || raw?.projetoId || ""),
    proposalId: raw?.proposalId || raw?.proposal_id || null,
    proposalItemId: raw?.proposalItemId || raw?.proposal_item_id || null,
    budgetItemId: raw?.budgetItemId || raw?.budget_item_id || null,
    specObjectId: raw?.specObjectId || raw?.spec_object_id || null,
    title: raw?.title || raw?.titulo || raw?.item || "Ordem de execução",
    description: raw?.description || raw?.descricao || null,
    type: raw?.type || "production",
    priority: raw?.priority || "medium",
    status: raw?.status || "planned",
    item: raw?.item || null,
    quantity: Number(raw?.quantity ?? raw?.quantidade ?? 1),
    unit: raw?.unit || raw?.unidade || "un",
    materialName: raw?.materialName || raw?.material_name || null,
    productName: raw?.productName || raw?.product_name || null,
    supplierName: raw?.supplierName || raw?.supplier_name || null,
    manufacturerName: raw?.manufacturerName || raw?.manufacturer_name || null,
    plannedStart: raw?.plannedStart || raw?.planned_start || null,
    plannedEnd: raw?.plannedEnd || raw?.planned_end || null,
    actualStart: raw?.actualStart || raw?.actual_start || null,
    actualEnd: raw?.actualEnd || raw?.actual_end || null,
    estimatedCost: Number(raw?.estimatedCost ?? raw?.estimated_cost ?? 0),
    actualCost: Number(raw?.actualCost ?? raw?.actual_cost ?? 0),
    notes: raw?.notes || raw?.observacoes || null,
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}

export function normalizeSupplierOrder(raw: any) {
  return {
    id: String(raw?.id || raw?._id || raw?.supplierOrderId || crypto.randomUUID()),
    tenantId: raw?.tenantId || raw?.tenant_id || null,
    projectId: String(raw?.projectId || raw?.project_id || ""),
    workOrderId: raw?.workOrderId || raw?.work_order_id || null,
    supplierName: raw?.supplierName || raw?.supplier_name || raw?.fornecedorNome || "Fornecedor",
    contactName: raw?.contactName || raw?.contact_name || null,
    contactPhone: raw?.contactPhone || raw?.contact_phone || null,
    contactEmail: raw?.contactEmail || raw?.contact_email || null,
    item: raw?.item || raw?.name || "Item",
    quantity: Number(raw?.quantity ?? raw?.quantidade ?? 1),
    unit: raw?.unit || raw?.unidade || "un",
    estimatedValue: Number(raw?.estimatedValue ?? raw?.estimated_value ?? 0),
    confirmedValue: Number(raw?.confirmedValue ?? raw?.confirmed_value ?? 0),
    status: raw?.status || "not-requested",
    requestedAt: raw?.requestedAt || raw?.requested_at || null,
    expectedDelivery: raw?.expectedDelivery || raw?.expected_delivery || null,
    deliveredAt: raw?.deliveredAt || raw?.delivered_at || null,
    notes: raw?.notes || null,
  };
}

export function normalizeEvent(raw: any) {
  return {
    id: String(raw?.id || raw?._id || raw?.eventId || crypto.randomUUID()),
    projectId: String(raw?.projectId || raw?.project_id || ""),
    workOrderId: raw?.workOrderId || raw?.work_order_id || null,
    type: raw?.type || "comment",
    message: raw?.message || raw?.mensagem || "",
    actorType: raw?.actorType || raw?.actor_type || "system",
    actorName: raw?.actorName || raw?.actor_name || null,
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
  };
}
