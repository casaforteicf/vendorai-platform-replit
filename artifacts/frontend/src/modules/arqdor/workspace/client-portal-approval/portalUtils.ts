import type { ApprovalStatus, Proposal, ProposalEvent, ProposalItem, ProposalStatus } from "./portalTypes";

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

export function getBudgetId(arqState: any): string {
  return String(arqState?.budget?.id || arqState?.currentBudget?.id || arqState?.selectedBudget?.id || "");
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

export function proposalStatusLabel(status: ProposalStatus) {
  const labels: Record<ProposalStatus, string> = {
    draft: "Rascunho",
    ready: "Pronta",
    sent: "Enviada",
    viewed: "Visualizada",
    "partially-approved": "Parcialmente aprovada",
    approved: "Aprovada",
    rejected: "Rejeitada",
    expired: "Expirada",
    archived: "Arquivada",
  };
  return labels[status];
}

export function proposalStatusClass(status: ProposalStatus) {
  const classes: Record<ProposalStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    ready: "bg-blue-50 text-blue-700",
    sent: "bg-violet-50 text-violet-700",
    viewed: "bg-amber-50 text-amber-700",
    "partially-approved": "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
    expired: "bg-slate-200 text-slate-600",
    archived: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function approvalStatusLabel(status: ApprovalStatus) {
  const labels: Record<ApprovalStatus, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
    commented: "Comentado",
    "revision-requested": "Revisão solicitada",
  };
  return labels[status];
}

export function approvalStatusClass(status: ApprovalStatus) {
  const classes: Record<ApprovalStatus, string> = {
    pending: "bg-slate-100 text-slate-600",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
    commented: "bg-blue-50 text-blue-700",
    "revision-requested": "bg-amber-50 text-amber-700",
  };
  return classes[status];
}

export function publicProposalUrl(token?: string | null) {
  if (!token) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/arch/proposta/${token}`;
}

export function normalizeProposal(raw: any): Proposal {
  const token = raw?.portalToken || raw?.portal_token || raw?.token || null;

  return {
    id: String(raw?.id || raw?._id || raw?.proposalId || crypto.randomUUID()),
    tenantId: raw?.tenantId || raw?.tenant_id || null,
    projectId: String(raw?.projectId || raw?.project_id || raw?.projetoId || ""),
    budgetId: String(raw?.budgetId || raw?.budget_id || raw?.orcamentoId || ""),
    portalToken: token,
    title: raw?.title || raw?.titulo || "Proposta ARQDOR",
    clientName: raw?.clientName || raw?.client_name || raw?.clienteNome || null,
    clientEmail: raw?.clientEmail || raw?.client_email || null,
    clientPhone: raw?.clientPhone || raw?.client_phone || null,
    status: raw?.status || "draft",
    version: Number(raw?.version || raw?.versao || 1),
    subtotalMaterial: Number(raw?.subtotalMaterial ?? raw?.subtotal_material ?? 0),
    subtotalLabor: Number(raw?.subtotalLabor ?? raw?.subtotal_labor ?? 0),
    subtotal: Number(raw?.subtotal ?? 0),
    discountTotal: Number(raw?.discountTotal ?? raw?.discount_total ?? 0),
    grandTotal: Number(raw?.grandTotal ?? raw?.grand_total ?? raw?.total ?? 0),
    expiresAt: raw?.expiresAt || raw?.expires_at || null,
    sentAt: raw?.sentAt || raw?.sent_at || null,
    viewedAt: raw?.viewedAt || raw?.viewed_at || null,
    approvedAt: raw?.approvedAt || raw?.approved_at || null,
    rejectedAt: raw?.rejectedAt || raw?.rejected_at || null,
    clientNotes: raw?.clientNotes || raw?.client_notes || null,
    internalNotes: raw?.internalNotes || raw?.internal_notes || null,
    publicUrl: raw?.publicUrl || raw?.public_url || publicProposalUrl(token),
    publicView: Boolean(raw?.publicView ?? raw?.public_view ?? false),
    tenantName: raw?.tenantName || raw?.tenant_name || null,
    tenantLogoUrl: raw?.tenantLogoUrl || raw?.tenant_logo_url || null,
    tenantPrimaryColor: raw?.tenantPrimaryColor || raw?.tenant_primary_color || null,
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}

export function normalizeProposalItem(raw: any): ProposalItem {
  return {
    id: String(raw?.id || raw?._id || raw?.proposalItemId || crypto.randomUUID()),
    proposalId: String(raw?.proposalId || raw?.proposal_id || ""),
    budgetItemId: raw?.budgetItemId || raw?.budget_item_id || null,
    specObjectId: raw?.specObjectId || raw?.spec_object_id || null,
    item: raw?.item || raw?.name || raw?.nome || "Item",
    description: raw?.description || raw?.descricao || null,
    quantity: Number(raw?.quantity ?? raw?.quantidade ?? 1),
    unit: raw?.unit || raw?.unidade || "un",
    materialValue: Number(raw?.materialValue ?? raw?.material_value ?? 0),
    laborValue: Number(raw?.laborValue ?? raw?.labor_value ?? 0),
    total: Number(raw?.total ?? 0),
    visibleToClient: raw?.visibleToClient ?? raw?.visible_to_client ?? true,
    approvalStatus: raw?.approvalStatus || raw?.approval_status || "pending",
    clientComment: raw?.clientComment || raw?.client_comment || null,
    approvedAt: raw?.approvedAt || raw?.approved_at || null,
    rejectedAt: raw?.rejectedAt || raw?.rejected_at || null,
    sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? 0),
    productName: raw?.productName || raw?.product_name || null,
    materialName: raw?.materialName || raw?.material_name || null,
    manufacturerName: raw?.manufacturerName || raw?.manufacturer_name || null,
    widthMm: raw?.widthMm == null && raw?.width_mm == null ? null : Number(raw?.widthMm ?? raw?.width_mm),
    heightMm: raw?.heightMm == null && raw?.height_mm == null ? null : Number(raw?.heightMm ?? raw?.height_mm),
    depthMm: raw?.depthMm == null && raw?.depth_mm == null ? null : Number(raw?.depthMm ?? raw?.depth_mm),
    lengthMm: raw?.lengthMm == null && raw?.length_mm == null ? null : Number(raw?.lengthMm ?? raw?.length_mm),
    areaM2: raw?.areaM2 == null && raw?.area_m2 == null ? null : Number(raw?.areaM2 ?? raw?.area_m2),
    perimeterM: raw?.perimeterM == null && raw?.perimeter_m == null ? null : Number(raw?.perimeterM ?? raw?.perimeter_m),
    volumeM3: raw?.volumeM3 == null && raw?.volume_m3 == null ? null : Number(raw?.volumeM3 ?? raw?.volume_m3),
    projectRevision: raw?.projectRevision || raw?.project_revision || null,
    measurementSource: raw?.measurementSource || raw?.measurement_source || null,
    measurementRevision: raw?.measurementRevision || raw?.measurement_revision || null,
  };
}

export function normalizeProposalEvent(raw: any): ProposalEvent {
  return {
    id: String(raw?.id || raw?._id || raw?.eventId || crypto.randomUUID()),
    proposalId: String(raw?.proposalId || raw?.proposal_id || ""),
    type: raw?.type || "comment",
    actorType: raw?.actorType || raw?.actor_type || "system",
    actorName: raw?.actorName || raw?.actor_name || null,
    message: raw?.message || raw?.mensagem || "",
    metadata: raw?.metadata || {},
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
  };
}
