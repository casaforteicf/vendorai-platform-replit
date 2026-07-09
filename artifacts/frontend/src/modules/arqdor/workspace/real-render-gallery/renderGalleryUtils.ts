import type { AdjustmentMode, RenderGalleryItem, RenderStatus } from "./renderGalleryTypes";

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

export function getAuthHeaders(): HeadersInit {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("vendorai_token") ||
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function statusLabel(status: RenderStatus) {
  const labels: Record<RenderStatus, string> = {
    queued: "Na fila",
    processing: "Processando",
    completed: "Concluído",
    failed: "Falhou",
    approved: "Aprovado",
    archived: "Arquivado",
  };
  return labels[status];
}

export function statusClass(status: RenderStatus) {
  const classes: Record<RenderStatus, string> = {
    queued: "bg-slate-100 text-slate-600",
    processing: "bg-blue-50 text-blue-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
    approved: "bg-violet-50 text-violet-700",
    archived: "bg-slate-200 text-slate-600",
  };
  return classes[status];
}

export function adjustmentModeLabel(mode: AdjustmentMode) {
  const labels: Record<AdjustmentMode, string> = {
    improve: "Melhorar render",
    "change-material": "Alterar material",
    "change-lighting": "Alterar iluminação",
    "remove-object": "Remover objeto",
    "add-object": "Adicionar objeto",
    "preserve-and-refine": "Preservar e refinar",
  };
  return labels[mode];
}

export function groupRenderVersions(items: RenderGalleryItem[]) {
  const roots = items.filter((item) => !item.parentRenderId);
  const childrenByParent = new Map<string, RenderGalleryItem[]>();

  items.forEach((item) => {
    if (!item.parentRenderId) return;
    const list = childrenByParent.get(item.parentRenderId) || [];
    list.push(item);
    childrenByParent.set(item.parentRenderId, list);
  });

  return roots.map((root) => ({
    root,
    versions: [root, ...(childrenByParent.get(root.id) || [])].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }),
  }));
}

export function isUsableImage(item?: RenderGalleryItem | null) {
  return Boolean(item?.id && item?.imageUrl);
}
