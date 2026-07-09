import type {
  ChecklistCategory,
  DeliveryStatus,
  DocumentType,
  FutureOpportunity,
  OpportunityStatus,
  OpportunityType,
} from "./postSaleTypes";

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

export function deliveryStatusLabel(status: DeliveryStatus) {
  const labels: Record<DeliveryStatus, string> = {
    "not-started": "Não iniciado",
    "in-progress": "Em andamento",
    "ready-for-review": "Pronto para revisão",
    delivered: "Entregue",
    accepted: "Aceito",
    "revision-requested": "Revisão solicitada",
    closed: "Encerrado",
  };
  return labels[status];
}

export function deliveryStatusClass(status: DeliveryStatus) {
  const classes: Record<DeliveryStatus, string> = {
    "not-started": "bg-slate-100 text-slate-600",
    "in-progress": "bg-blue-50 text-blue-700",
    "ready-for-review": "bg-amber-50 text-amber-700",
    delivered: "bg-violet-50 text-violet-700",
    accepted: "bg-emerald-50 text-emerald-700",
    "revision-requested": "bg-rose-50 text-rose-700",
    closed: "bg-slate-950 text-white",
  };
  return classes[status];
}

export function checklistCategoryLabel(category: ChecklistCategory) {
  const labels: Record<ChecklistCategory, string> = {
    execution: "Execução",
    quality: "Qualidade",
    cleaning: "Limpeza",
    documentation: "Documentação",
    "client-approval": "Aprovação cliente",
    warranty: "Garantia",
  };
  return labels[category];
}

export function documentTypeLabel(type: DocumentType) {
  const labels: Record<DocumentType, string> = {
    photo: "Foto",
    video: "Vídeo",
    manual: "Manual",
    warranty: "Garantia",
    invoice: "Nota fiscal",
    "as-built": "As built",
    "delivery-term": "Termo de entrega",
    other: "Outro",
  };
  return labels[type];
}

export function opportunityTypeLabel(type: OpportunityType) {
  const labels: Record<OpportunityType, string> = {
    "new-room": "Novo ambiente",
    maintenance: "Manutenção",
    complement: "Complemento",
    "supplier-upsell": "Upsell fornecedor",
    referral: "Indicação",
    "recurring-service": "Serviço recorrente",
    "new-project": "Novo projeto",
  };
  return labels[type];
}

export function opportunityStatusLabel(status: OpportunityStatus) {
  const labels: Record<OpportunityStatus, string> = {
    identified: "Identificada",
    "contact-pending": "Contato pendente",
    "in-nurturing": "Nutrição",
    proposal: "Proposta",
    won: "Ganha",
    lost: "Perdida",
    archived: "Arquivada",
  };
  return labels[status];
}

export function opportunityStatusClass(status: OpportunityStatus) {
  const classes: Record<OpportunityStatus, string> = {
    identified: "bg-blue-50 text-blue-700",
    "contact-pending": "bg-amber-50 text-amber-700",
    "in-nurturing": "bg-violet-50 text-violet-700",
    proposal: "bg-indigo-50 text-indigo-700",
    won: "bg-emerald-50 text-emerald-700",
    lost: "bg-rose-50 text-rose-700",
    archived: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function normalizeDelivery(raw: any) {
  return {
    id: String(raw?.id || raw?._id || raw?.deliveryId || crypto.randomUUID()),
    tenantId: raw?.tenantId || raw?.tenant_id || null,
    projectId: String(raw?.projectId || raw?.project_id || raw?.projetoId || ""),
    proposalId: raw?.proposalId || raw?.proposal_id || null,
    clientName: raw?.clientName || raw?.client_name || raw?.clienteNome || null,
    clientEmail: raw?.clientEmail || raw?.client_email || null,
    clientPhone: raw?.clientPhone || raw?.client_phone || null,
    status: raw?.status || "not-started",
    deliveryDate: raw?.deliveryDate || raw?.delivery_date || null,
    acceptedAt: raw?.acceptedAt || raw?.accepted_at || null,
    closedAt: raw?.closedAt || raw?.closed_at || null,
    nps: raw?.nps ?? null,
    satisfactionScore: raw?.satisfactionScore ?? raw?.satisfaction_score ?? null,
    summary: raw?.summary || raw?.resumo || null,
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}

export function normalizeChecklistItem(raw: any) {
  return {
    id: String(raw?.id || raw?._id || raw?.checklistItemId || crypto.randomUUID()),
    deliveryId: String(raw?.deliveryId || raw?.delivery_id || ""),
    projectId: String(raw?.projectId || raw?.project_id || ""),
    category: raw?.category || "execution",
    label: raw?.label || raw?.title || "Item de checklist",
    done: Boolean(raw?.done ?? raw?.completed ?? false),
    required: Boolean(raw?.required ?? true),
    responsible: raw?.responsible || raw?.responsavel || null,
    notes: raw?.notes || raw?.observacoes || null,
    completedAt: raw?.completedAt || raw?.completed_at || null,
    sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? 0),
  };
}

export function normalizeDocument(raw: any) {
  return {
    id: String(raw?.id || raw?._id || raw?.documentId || crypto.randomUUID()),
    deliveryId: String(raw?.deliveryId || raw?.delivery_id || ""),
    projectId: String(raw?.projectId || raw?.project_id || ""),
    type: raw?.type || "other",
    title: raw?.title || raw?.titulo || "Documento",
    description: raw?.description || raw?.descricao || null,
    fileUrl: raw?.fileUrl || raw?.file_url || raw?.url || null,
    thumbnailUrl: raw?.thumbnailUrl || raw?.thumbnail_url || null,
    visibleToClient: raw?.visibleToClient ?? raw?.visible_to_client ?? true,
    createdAt: raw?.createdAt || raw?.created_at || null,
  };
}

export function normalizeOpportunity(raw: any): FutureOpportunity {
  return {
    id: String(raw?.id || raw?._id || raw?.opportunityId || crypto.randomUUID()),
    deliveryId: String(raw?.deliveryId || raw?.delivery_id || ""),
    projectId: String(raw?.projectId || raw?.project_id || ""),
    type: raw?.type || "new-project",
    status: raw?.status || "identified",
    title: raw?.title || raw?.titulo || "Nova oportunidade",
    description: raw?.description || raw?.descricao || null,
    estimatedValue: Number(raw?.estimatedValue ?? raw?.estimated_value ?? 0),
    nextAction: raw?.nextAction || raw?.next_action || null,
    dueDate: raw?.dueDate || raw?.due_date || null,
    ownerName: raw?.ownerName || raw?.owner_name || null,
    createdAt: raw?.createdAt || raw?.created_at || null,
    updatedAt: raw?.updatedAt || raw?.updated_at || null,
  };
}

export function normalizeEvent(raw: any) {
  return {
    id: String(raw?.id || raw?._id || raw?.eventId || crypto.randomUUID()),
    deliveryId: raw?.deliveryId || raw?.delivery_id || null,
    projectId: String(raw?.projectId || raw?.project_id || ""),
    type: raw?.type || "comment",
    message: raw?.message || raw?.mensagem || "",
    actorType: raw?.actorType || raw?.actor_type || "system",
    actorName: raw?.actorName || raw?.actor_name || null,
    metadata: raw?.metadata || {},
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
  };
}
