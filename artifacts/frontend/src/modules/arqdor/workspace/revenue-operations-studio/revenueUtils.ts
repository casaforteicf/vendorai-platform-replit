import type { DealStage, Priority, RevenueStatus } from "./revenueTypes";

export function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

export function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

export function projectTitle(project: any): string {
  return project?.titulo || project?.title || project?.name || "Projeto ARQDOR";
}

export function clientName(project: any): string {
  return project?.clienteNome || project?.clientName || "Cliente";
}

export function revenueStatusLabel(status: RevenueStatus) {
  const labels: Record<RevenueStatus, string> = {
    active: "Ativo",
    attention: "Atenção",
    blocked: "Bloqueado",
    completed: "Concluído",
    pending: "Pendente",
  };
  return labels[status];
}

export function revenueStatusClass(status: RevenueStatus) {
  const classes: Record<RevenueStatus, string> = {
    active: "bg-blue-50 text-blue-700",
    attention: "bg-amber-50 text-amber-700",
    blocked: "bg-rose-50 text-rose-700",
    completed: "bg-emerald-50 text-emerald-700",
    pending: "bg-slate-100 text-slate-600",
  };
  return classes[status];
}

export function priorityClass(priority: Priority) {
  const classes: Record<Priority, string> = {
    baixa: "bg-slate-100 text-slate-600",
    media: "bg-blue-50 text-blue-700",
    alta: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}

export function stageLabel(stage: DealStage) {
  const labels: Record<DealStage, string> = {
    lead: "Lead",
    qualified: "Qualificado",
    demo: "Demo",
    proposal: "Proposta",
    pilot: "Piloto",
    contract: "Contrato",
    won: "Ganho",
    lost: "Perdido",
  };
  return labels[stage];
}
