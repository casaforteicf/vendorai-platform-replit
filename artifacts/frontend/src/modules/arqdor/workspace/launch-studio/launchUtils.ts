import type { LaunchStatus, Priority } from "./launchTypes";

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

export function launchStatusLabel(status: LaunchStatus) {
  const labels: Record<LaunchStatus, string> = {
    ready: "Pronto",
    attention: "Atenção",
    pending: "Pendente",
    blocked: "Bloqueado",
  };
  return labels[status];
}

export function launchStatusClass(status: LaunchStatus) {
  const classes: Record<LaunchStatus, string> = {
    ready: "bg-emerald-50 text-emerald-700",
    attention: "bg-amber-50 text-amber-700",
    pending: "bg-slate-100 text-slate-600",
    blocked: "bg-rose-50 text-rose-700",
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
