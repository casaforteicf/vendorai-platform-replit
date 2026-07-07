import type { ArqdorProject } from "../types/arqdor.types";

export const statusLabels: Record<string, string> = {
  briefing: "Briefing",
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  entregue: "Entregue",
  cancelado: "Cancelado",
  em_conceito: "Em conceito",
  em_desenvolvimento: "Em desenvolvimento",
  em_aprovacao: "Em aprovação",
  em_especificacao: "Em especificação",
  em_producao: "Em produção",
  em_execucao_tecnica: "Execução técnica",
};

export const statusTone: Record<string, string> = {
  briefing: "bg-slate-100 text-slate-700",
  orcamento: "bg-amber-50 text-amber-700",
  aprovado: "bg-emerald-50 text-emerald-700",
  em_execucao: "bg-blue-50 text-blue-700",
  entregue: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-rose-50 text-rose-700",
  em_conceito: "bg-violet-50 text-violet-700",
  em_desenvolvimento: "bg-blue-50 text-blue-700",
  em_aprovacao: "bg-amber-50 text-amber-700",
  em_especificacao: "bg-indigo-50 text-indigo-700",
  em_producao: "bg-orange-50 text-orange-700",
  em_execucao_tecnica: "bg-cyan-50 text-cyan-700",
};

export function getProjectTitle(project?: ArqdorProject | null): string {
  return String(project?.titulo || project?.name || project?.title || "Projeto sem título");
}

export function getClientName(project?: ArqdorProject | null): string {
  return String(project?.clienteNome || (project as any)?.clientName || (project as any)?.cliente?.nome || "Cliente não informado");
}

export function getProjectStatus(project?: ArqdorProject | null): string {
  const status = String(project?.status || "briefing");
  return statusLabels[status] || status;
}

export function getProjectStatusClass(project?: ArqdorProject | null): string {
  const status = String(project?.status || "briefing");
  return statusTone[status] || "bg-slate-100 text-slate-700";
}

export function getProjectProgress(project?: ArqdorProject | null): number {
  const raw = project?.project_progress ?? project?.progress;
  if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
    return clamp(Number(raw), 0, 100);
  }

  const status = String(project?.status || "briefing");
  const map: Record<string, number> = {
    briefing: 15,
    orcamento: 30,
    aprovado: 45,
    em_execucao: 70,
    entregue: 100,
    cancelado: 0,
    em_conceito: 25,
    em_desenvolvimento: 45,
    em_aprovacao: 55,
    em_especificacao: 68,
    em_producao: 78,
    em_execucao_tecnica: 88,
  };

  return map[status] ?? 20;
}

export function getNextStep(project?: ArqdorProject | null): string {
  if (!project) return "Criar primeiro projeto";
  if (!project.totalAmbientes && !project.ambientes?.length) return "Adicionar primeiro ambiente";
  if (!project.totalRenders && !project.renders?.length) return "Gerar primeiro render";
  if (project.status === "entregue") return "Revisar entrega";
  if (project.status === "orcamento") return "Finalizar proposta";
  if (project.status === "aprovado") return "Iniciar desenvolvimento";
  return "Continuar desenvolvimento";
}

export function formatProjectDate(value?: string): string {
  if (!value) return "Sem atualização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atualização";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getProjectArea(project?: ArqdorProject | null): string {
  if (!project?.areaM2) return "—";
  return `${Number(project.areaM2).toLocaleString("pt-BR")} m²`;
}

export function getProjectCover(project?: ArqdorProject | null): string | undefined {
  return project?.coverImageUrl || project?.capaUrl || project?.imageUrl;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
