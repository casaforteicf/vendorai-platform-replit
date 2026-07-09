import type { ConsolidationStatus, Effort, Priority } from "./consolidationTypes";

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

export function statusLabel(status: ConsolidationStatus) {
  const labels: Record<ConsolidationStatus, string> = {
    real: "Real",
    partial: "Parcial",
    mock: "Mock",
    blocked: "Bloqueado",
    ready: "Pronto",
  };
  return labels[status];
}

export function statusClass(status: ConsolidationStatus) {
  const classes: Record<ConsolidationStatus, string> = {
    real: "bg-emerald-50 text-emerald-700",
    partial: "bg-amber-50 text-amber-700",
    mock: "bg-slate-100 text-slate-600",
    blocked: "bg-rose-50 text-rose-700",
    ready: "bg-blue-50 text-blue-700",
  };
  return classes[status];
}

export function priorityClass(priority: Priority) {
  const classes: Record<Priority, string> = {
    baixa: "bg-slate-100 text-slate-600",
    media: "bg-blue-50 text-blue-700",
    alta: "bg-amber-50 text-amber-700",
    critica: "bg-rose-50 text-rose-700",
  };
  return classes[priority];
}

export function effortClass(effort: Effort) {
  const classes: Record<Effort, string> = {
    baixo: "bg-emerald-50 text-emerald-700",
    medio: "bg-amber-50 text-amber-700",
    alto: "bg-rose-50 text-rose-700",
  };
  return classes[effort];
}
